import FitsssCore
import Foundation
import Observation

/// The add flow's cart, the native `cartStore.ts`: one per server and user,
/// mirrored into `UserDefaults` on every change so it survives closing the
/// flow, switching tabs and the app being killed. Restored when the flow opens.
///
/// It also owns saving. A save moves the cart's lines into a `PendingSave`
/// with a fresh idempotency key, in the same write that empties the cart, so
/// a crash can never leave the same lines in both. The pending save is only
/// cleared by an answer: confirmed (gone, rejected lines back in the cart),
/// refused (all lines back), or unknown (kept, and resent as-is with the same
/// key, which the server answers with the first result instead of saving twice).
@MainActor
@Observable
final class CartStore {
    /// What a save request does: `ClosetStore.create(_:idempotencyKey:)`.
    typealias Create = @MainActor (_ inputs: [BlockInput], _ idempotencyKey: String) async throws -> CreateBlocksResult
    /// Settles a key for good: `ClosetStore.abandonSave(idempotencyKey:)`.
    /// Nil means nothing was stored and nothing ever will be under that key.
    typealias Lookup = @MainActor (_ idempotencyKey: String) async throws -> CreateBlocksResult?

    enum SaveOutcome: Equatable {
        /// The server answered. `rejected` lines are back in the cart with their reasons.
        case saved(added: Int, rejected: Int)
        /// No answer about this batch (offline, a server error, the session
        /// ended); it stays pending and is resent under the same key.
        case unconfirmed(String)
        /// The server said no to the whole batch; it is back in the cart.
        case refused(String)
        case nothingToSend
    }

    /// The cart and the save in flight, persisted together in one write.
    private struct State: Equatable {
        var cart = Cart()
        var pending: PendingSave?
    }

    private var state: State {
        didSet { if state != oldValue { persist() } }
    }

    /// Bumped on every add, for the add haptic.
    private(set) var addCount = 0

    /// True while a save request is out.
    private(set) var isSending = false

    @ObservationIgnored private let storageKey: String?
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var sending: Task<SaveOutcome, Never>?

    /// `storageKey` nil keeps the cart in memory only (no user yet).
    init(storageKey: String?, defaults: UserDefaults = .standard) {
        self.storageKey = storageKey
        self.defaults = defaults
        self.state = Self.read(storageKey, from: defaults)
    }

    /// `fitsss.cart.<server>.<user id>`.
    static func storageKey(server: URL, userId: String) -> String {
        "fitsss.cart.\(server.absoluteString).\(userId)"
    }

    var cart: Cart { state.cart }
    /// A save that was sent but not answered; resent by the next `save`.
    var pendingSave: PendingSave? { state.pending }

    /// Pieces in the cart, not counting a save in flight.
    var count: Int { state.cart.count }
    var isEmpty: Bool { state.cart.isEmpty }
    /// Pieces in the cart plus those in an unanswered save: what the pill shows.
    var totalCount: Int { count + (pendingSave?.count ?? 0) }
    /// Nothing in the cart and nothing being saved.
    var isCompletelyEmpty: Bool { isEmpty && pendingSave == nil }

    /// Adds the inputs and returns how many pieces that actually added
    /// (fewer when lines are already at 99).
    @discardableResult
    func add(_ inputs: [CartInput]) -> Int {
        guard !inputs.isEmpty else { return 0 }
        let before = state.cart.count
        state.cart.add(inputs)
        addCount += 1
        return state.cart.count - before
    }

    func setQuantity(_ quantity: Int, forLine key: String) {
        state.cart.setQuantity(quantity, forLine: key)
    }

    func remove(_ key: String) {
        state.cart.remove(key)
    }

    /// Empties the cart. A save in flight is not touched.
    func clear() {
        state.cart.clear()
    }

    /// Drops lines for types the catalog no longer has. Only call with a
    /// catalog the server just confirmed (`CatalogStore.isRevalidated`): a
    /// stale cached one may lack a type the user still has.
    func prune(using catalog: Catalog) {
        var next = state.cart
        if next.prune(using: catalog) { state.cart = next }
    }

    // MARK: - Saving

    /// Sends the unanswered save if there is one, otherwise the cart (unless
    /// `onlyPending`). Concurrent callers share one request.
    func save(onlyPending: Bool = false, skippingRejected: Bool = false, using create: @escaping Create) async -> SaveOutcome {
        if let sending { return await sending.value }

        if state.pending == nil {
            guard !onlyPending else { return .nothingToSend }
            var next = state
            // At most `Cart.maxLines` per batch (the server's cap); a bigger
            // cart (put-back lines on top of new ones) goes in several.
            guard let submitted = next.cart.submit(limit: Cart.maxLines, skippingRejected: skippingRejected) else {
                return .nothingToSend
            }
            next.pending = submitted
            state = next
        }
        guard let batch = state.pending else { return .nothingToSend }

        let task = Task { await send(batch, using: create) }
        sending = task
        isSending = true
        let outcome = await task.value
        sending = nil
        isSending = false
        return outcome
    }

    private func send(_ batch: PendingSave, using create: Create) async -> SaveOutcome {
        do {
            let result = try await create(batch.inputs, batch.key)
            settle(batch, putBack: batch.rejectedLines(result.failed))
            let added = result.created.reduce(0) { $0 + $1.quantity }
            return .saved(added: added, rejected: result.failed.count)
        } catch let error as APIError where error.outcomeUnknown {
            return .unconfirmed(error.errorDescription ?? "")
        } catch is CancellationError {
            // The request may already have reached the server.
            return .unconfirmed("")
        } catch {
            settle(batch, putBack: batch.cartLines)
            return .refused((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    enum PutBackOutcome: Equatable {
        /// The server had stored it after all: settled as saved.
        case wasSaved(added: Int, rejected: Int)
        /// The server has no save with that key: the lines are back in the cart.
        case putBack
        /// The server couldn't be asked; still pending.
        case stillUnknown(String)
        case nothingPending
    }

    /// The way out of an unanswered save that keeps failing: has the server
    /// settle the batch's key for good. Only a definite "never" puts the
    /// lines back in the cart (where the next save sends them under a new
    /// key); a stored save is settled as saved. Never guesses.
    func putBackPending(using lookup: @escaping Lookup) async -> PutBackOutcome {
        guard sending == nil, let batch = state.pending else { return .nothingPending }
        isSending = true
        defer { isSending = false }
        do {
            if let result = try await lookup(batch.key) {
                settle(batch, putBack: batch.rejectedLines(result.failed))
                return .wasSaved(added: result.created.reduce(0) { $0 + $1.quantity }, rejected: result.failed.count)
            }
            settle(batch, putBack: batch.cartLines)
            return .putBack
        } catch {
            return .stillUnknown((error as? APIError)?.errorDescription ?? error.localizedDescription)
        }
    }

    /// The answer for `batch` arrived: it is no longer pending, and whatever
    /// was not stored goes back into the cart, in one write.
    private func settle(_ batch: PendingSave, putBack lines: [CartLine]) {
        guard state.pending?.key == batch.key else { return }
        var next = state
        next.pending = nil
        next.cart.putBack(lines)
        state = next
    }

    // MARK: - Storage

    private nonisolated struct Stored: Codable {
        var cart: Data
        var pending: PendingSave?
    }

    private static func read(_ storageKey: String?, from defaults: UserDefaults) -> State {
        guard let storageKey else { return State() }
        if let data = defaults.data(forKey: storageKey + ".v2"),
           let stored = try? JSONDecoder().decode(Stored.self, from: data) {
            return State(cart: Cart.restore(from: stored.cart), pending: stored.pending)
        }
        // Before saves carried a key, only the cart was stored here (and an
        // unkeyed in-flight record that can't be resent, so it is dropped).
        let legacy = defaults.data(forKey: storageKey).map { Cart.restore(from: $0) } ?? Cart()
        return State(cart: legacy, pending: nil)
    }

    private func persist() {
        guard let storageKey else { return }
        defaults.removeObject(forKey: storageKey)
        defaults.removeObject(forKey: storageKey + ".pending")
        if state.cart.isEmpty && state.pending == nil {
            defaults.removeObject(forKey: storageKey + ".v2")
        } else if let data = try? JSONEncoder().encode(Stored(cart: state.cart.encoded(), pending: state.pending)) {
            defaults.set(data, forKey: storageKey + ".v2")
        }
    }
}

extension APIError {
    /// Whether this answer leaves open that the batch was stored.
    ///
    /// Only a validation answer (`.invalid`, a 400 or 422) settles it as "not
    /// stored": the server looks a key up before validating, so a batch that
    /// had been stored is replayed instead. Everything else says nothing
    /// about an earlier send of the same batch: a 401 (the session ended,
    /// and the server never looked), a 404 (no such route), a 5xx, no answer.
    var outcomeUnknown: Bool {
        switch self {
        case .invalid: false
        case .network, .decoding, .superseded, .unauthorized, .notFound, .server: true
        }
    }
}
