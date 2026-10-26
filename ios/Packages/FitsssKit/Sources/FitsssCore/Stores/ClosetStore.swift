import Foundation
import Observation

/// The user's pieces, active and archived, and every write to them.
///
/// Writes go to the server first and update the local lists from its answer,
/// so what is shown is always what was stored (with the server's derived
/// fields), never an optimistic guess.
@MainActor
@Observable
public final class ClosetStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    /// Active pieces, in the server's order (category, then newest first).
    public private(set) var blocks: [Block] = []
    public private(set) var archived: [Block] = []
    public private(set) var phase: Phase = .idle

    private let api: APIClient

    public init(api: APIClient) {
        self.api = api
    }

    /// Total pieces, counting each block's quantity.
    public var pieceCount: Int { blocks.reduce(0) { $0 + $1.quantity } }

    public func block(_ id: String) -> Block? {
        blocks.first { $0.id == id } ?? archived.first { $0.id == id }
    }

    /// Loads both lists in one request. Keeps showing the old lists while it
    /// runs. Concurrent callers share one request, and a caller that stops
    /// waiting (pull to refresh on a screen that went away) does not cancel it.
    public func load() async {
        // Shared only within one session: after a sign-out or server switch
        // the old request answers nothing useful, so a new one starts.
        if let loading, loading.generation == api.generation { return await loading.task.value }
        let task = Task { await performLoad() }
        let generation = api.generation
        loading = (task, generation)
        await task.value
        if loading?.generation == generation { loading = nil }
    }

    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?

    private func performLoad() async {
        if blocks.isEmpty && archived.isEmpty { phase = .loading }
        do {
            let all: [Block] = try await api.call(
                .get, "api/v1/blocks", query: [URLQueryItem(name: "includeArchived", value: "true")]
            )
            blocks = all.filter { !$0.isArchived }
            archived = all.filter(\.isArchived).sorted { ($0.archivedAt ?? .distantPast) > ($1.archivedAt ?? .distantPast) }
            phase = .loaded
        } catch APIError.superseded {
            // Signed out or switched while loading: these lists belong to nobody.
            return
        } catch is CancellationError {
            if phase == .loading { phase = .idle }
        } catch let error as APIError {
            phase = .failed(error)
        } catch {
            phase = .failed(.network(error.localizedDescription))
        }
    }

    /// Saves a batch (the cart). Inputs that fail validation come back in
    /// `failed` by index while the rest are saved. Throws `.invalid` only when
    /// nothing could be saved.
    ///
    /// Pass an `idempotencyKey` (a fresh UUID per save, persisted with the
    /// exact inputs) and resend the *same* inputs with the *same* key when the
    /// outcome is unknown (network error, timeout, `.superseded`, app killed):
    /// the server then answers with the first result instead of saving twice.
    /// Reusing a key for different inputs throws `.invalid`.
    @discardableResult
    public func create(_ inputs: [BlockInput], idempotencyKey: String? = nil) async throws -> CreateBlocksResult {
        let result: CreateBlocksResult = try await api.call(
            .post, "api/v1/blocks", body: inputs,
            headers: idempotencyKey.map { ["Idempotency-Key": $0] } ?? [:]
        )
        await load()
        return result
    }

    /// Settles a save whose answer was lost, for good: what it stored, or
    /// nil, and then the server refuses any later send with that key. Only
    /// then is it safe to put the pieces back and save them under a new key
    /// (a plain lookup can't promise that: a request still on its way might
    /// store after it). Throws when the server can't be asked.
    public func abandonSave(idempotencyKey: String) async throws -> CreateBlocksResult? {
        let answer: AbandonAnswer = try await api.call(.post, "api/v1/blocks/saves/\(idempotencyKey)/abandon")
        if answer.stored != nil { await load() }
        return answer.stored
    }

    /// Replaces a piece's attributes with a whole new input.
    @discardableResult
    public func update(_ id: String, with input: BlockInput) async throws -> Block {
        let block: Block = try await api.call(.patch, "api/v1/blocks/\(id)", body: input)
        replace(block)
        return block
    }

    public func archive(_ id: String) async throws {
        let block: Block = try await api.call(.post, "api/v1/blocks/\(id)/archive")
        replace(block)
    }

    public func restore(_ id: String) async throws {
        let block: Block = try await api.call(.delete, "api/v1/blocks/\(id)/archive")
        replace(block)
    }

    /// Permanent. The web app only offers this for archived pieces.
    public func delete(_ id: String) async throws {
        try await api.callVoid(.delete, "api/v1/blocks/\(id)")
        blocks.removeAll { $0.id == id }
        archived.removeAll { $0.id == id }
    }

    /// Clears everything (sign-out, server switch).
    public func reset() {
        blocks = []
        archived = []
        phase = .idle
        loading = nil
    }

    private func replace(_ block: Block) {
        // An edit that keeps the piece where it was stays in place.
        if !block.isArchived, let index = blocks.firstIndex(where: { $0.id == block.id }),
           blocks[index].category == block.category {
            blocks[index] = block
            return
        }
        blocks.removeAll { $0.id == block.id }
        archived.removeAll { $0.id == block.id }
        if block.isArchived {
            archived.insert(block, at: 0)
        } else if let index = blocks.firstIndex(where: { $0.category == block.category }) {
            // Keep category grouping; a piece coming back from the archive goes
            // to the front of its group, like a new one would.
            blocks.insert(block, at: index)
        } else {
            blocks.append(block)
        }
    }
}

nonisolated private struct AbandonAnswer: Decodable {
    var stored: CreateBlocksResult?
}
