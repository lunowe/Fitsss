import Foundation
import Observation

/// Trips: planning one (place search, create), packing it (a slow model
/// call), and the edits after (ticks, counts, swapping a day's piece).
@MainActor
@Observable
public final class TripsStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    /// Latest start first, as the server sends them.
    public private(set) var trips: [Trip] = []
    public private(set) var phase: Phase = .idle
    /// Trips being packed right now. Their edits wait; the screen should say so.
    public private(set) var packing: Set<String> = []

    /// Packing is one model call, sometimes two; the server allows each 180 s.
    public static let packTimeout: TimeInterval = 400

    private let api: APIClient
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?
    /// See `LooksStore.revision`.
    @ObservationIgnored private var revision = 0
    @ObservationIgnored private var packTasks: [String: Task<Trip, any Error>] = [:]
    /// The last edit queued per trip; see `write`.
    @ObservationIgnored private var writes: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var writesInFlight: [String: Int] = [:]
    /// The last trip the server answered with, per id: what a failed edit falls back to.
    @ObservationIgnored private var confirmed: [String: Trip] = [:]
    /// Bumped by `reset()`.
    @ObservationIgnored private var epoch = 0
    /// Bumped per trip whenever it changes here, so a read started before
    /// (a recovery fetch) cannot put an older copy back.
    @ObservationIgnored private var tripRevisions: [String: Int] = [:]
    /// Trips deleted in this session: an answer still on its way for one
    /// (a tick, a packing) must not bring it back.
    @ObservationIgnored private var deleted: Set<String> = []

    public init(api: APIClient) {
        self.api = api
    }

    public func trip(_ id: String) -> Trip? { trips.first { $0.id == id } }

    /// Not over yet, soonest first.
    public func upcoming(today: String = TripDay.today()) -> [Trip] {
        trips.filter { !$0.isPast(today: today) }.sorted { $0.startDate < $1.startDate }
    }

    /// Over, most recent first.
    public func past(today: String = TripDay.today()) -> [Trip] {
        trips.filter { $0.isPast(today: today) }.sorted { $0.startDate > $1.startDate }
    }

    // MARK: - Read

    /// Concurrent callers share one request; see `ClosetStore.load`.
    public func load() async {
        if let loading, loading.generation == api.generation { return await loading.task.value }
        let task = Task { await performLoad() }
        let generation = api.generation
        loading = (task, generation)
        await task.value
        if loading?.generation == generation { loading = nil }
    }

    private func performLoad() async {
        if trips.isEmpty { phase = .loading }
        do {
            for _ in 0..<3 {
                let started = revision
                let fetched: [Trip] = try await api.call(.get, "api/v1/trips")
                guard started == revision else { continue }
                // A trip with an edit still on its way keeps what is shown
                // (its answer will settle it); deleted ones stay gone.
                trips = fetched.compactMap { trip in
                    if deleted.contains(trip.id) { return nil }
                    if writesInFlight[trip.id, default: 0] > 0 || packTasks[trip.id] != nil {
                        return self.trip(trip.id) ?? trip
                    }
                    confirmed[trip.id] = trip
                    return trip
                }
                phase = .loaded
                return
            }
        } catch APIError.superseded {
            return
        } catch is CancellationError {
            if phase == .loading { phase = .idle }
        } catch let error as APIError {
            if trips.isEmpty || phase != .loaded { phase = .failed(error) }
        } catch {
            phase = .failed(.network(error.localizedDescription))
        }
    }

    /// Places matching a name, with their time zones. Fewer than two
    /// characters answers nothing.
    public func searchPlaces(_ query: String) async throws -> [TripPlace] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.count >= 2 else { return [] }
        return try await api.call(.get, "api/v1/places", query: [URLQueryItem(name: "q", value: trimmed)])
    }

    // MARK: - Create and pack

    /// Stores the trip with its weather, unpacked; `pack` next. Throws
    /// `.invalid` (dates, place), `.server(503, …)` no weather for the dates,
    /// `.server(409, …)` too many trips.
    public func create(_ draft: TripDraft) async throws -> Trip {
        let generation = api.generation
        let epoch = self.epoch
        let trip: Trip = try await api.call(.post, "api/v1/trips", body: draft)
        guard generation == api.generation, epoch == self.epoch else { throw APIError.superseded }
        put(trip)
        return trip
    }

    /// Packs the trip: the suitcase and an outfit a day. Slow. `steer`
    /// replaces the trip's note. Packing again replaces the plan (ticks on
    /// pieces still packed stay). Edits queued before it go first; concurrent
    /// calls share one request. Throws `.server(409, …)` empty closet or
    /// nothing for some day's weather, `.server(502, …)` the model failed,
    /// `.server(503, …)` not set up or no weather, `.notFound`.
    @discardableResult
    public func pack(_ id: String, steer: String? = nil) async throws -> Trip {
        if let running = packTasks[id] { return try await running.value }
        let generation = api.generation
        let epoch = self.epoch
        let pending = writes[id]
        packing.insert(id)
        let task = Task { () async throws -> Trip in
            await pending?.value
            guard generation == self.api.generation, epoch == self.epoch else { throw APIError.superseded }
            let trip: Trip = try await self.api.call(
                .post, "api/v1/trips/\(id)/plan", body: PackBody(steer: steer), timeout: Self.packTimeout
            )
            guard epoch == self.epoch else { throw APIError.superseded }
            self.put(trip)
            return trip
        }
        packTasks[id] = task
        defer {
            if self.epoch == epoch {
                packTasks[id] = nil
                packing.remove(id)
            }
        }
        do {
            return try await task.value
        } catch APIError.notFound {
            drop(id)
            throw APIError.notFound("That trip is gone.")
        }
    }

    // MARK: - Edit

    /// Name and options (kept for the next packing). Throws `.invalid`.
    @discardableResult
    public func update(_ id: String, _ patch: TripPatch) async throws -> Trip {
        try await write(id) { try await self.api.call(.patch, "api/v1/trips/\(id)", body: patch) }
    }

    /// Ticks a piece in the suitcase. Shown at once.
    public func setPacked(_ id: String, blockId: String, packed: Bool) async throws {
        edit(id) { trip in
            guard let index = trip.plan?.packing.firstIndex(where: { $0.blockId == blockId }) else { return }
            trip.plan?.packing[index].packed = packed
        }
        _ = try await write(id) {
            try await self.api.call(.patch, "api/v1/trips/\(id)", body: TripPatch(packed: [blockId: packed]))
        }
    }

    /// How many of a piece to bring; 0 takes a spare out. Throws `.invalid`
    /// below what the days wear or above what is owned.
    @discardableResult
    public func setCount(_ id: String, blockId: String, count: Int) async throws -> Trip {
        try await write(id) {
            try await self.api.call(.patch, "api/v1/trips/\(id)", body: TripPatch(counts: [blockId: count]))
        }
    }

    /// Puts another piece in one slot of one day (`slot`: `top`, `layer`,
    /// `outerwear`, `bottom`, `fullbody`, `footwear` or `accessories`, where
    /// `fromBlockId` is replaced, or the piece added). The suitcase follows.
    @discardableResult
    public func swap(_ id: String, date: String, slot: String, to blockId: String, from fromBlockId: String? = nil) async throws -> Trip {
        try await write(id) {
            try await self.api.call(
                .post, "api/v1/trips/\(id)/swap",
                body: SwapBody(date: date, slot: slot, toBlockId: blockId, fromBlockId: fromBlockId)
            )
        }
    }

    /// Takes a piece off one day: `slot` is `layer` or `outerwear`, or
    /// `accessories` with `fromBlockId` naming the accessory. The suitcase
    /// follows. Throws `.invalid` when the day has nothing there.
    @discardableResult
    public func takeOff(_ id: String, date: String, slot: String, from fromBlockId: String? = nil) async throws -> Trip {
        try await write(id) {
            try await self.api.call(
                .post, "api/v1/trips/\(id)/swap",
                body: TakeOffBody(date: date, slot: slot, fromBlockId: fromBlockId)
            )
        }
    }

    /// Replaces a day's full-body piece with a top and a bottom. The
    /// suitcase follows. Throws `.invalid` when the day wears no full-body
    /// piece or a piece is not of the right kind.
    @discardableResult
    public func swapToSeparates(_ id: String, date: String, top: String, bottom: String) async throws -> Trip {
        try await write(id) {
            try await self.api.call(
                .post, "api/v1/trips/\(id)/swap",
                body: SeparatesBody(date: date, top: top, bottom: bottom)
            )
        }
    }

    /// Deletes the trip. One already gone counts as deleted.
    public func remove(_ id: String) async throws {
        do {
            try await api.callVoid(.delete, "api/v1/trips/\(id)")
        } catch APIError.notFound {
            // Already gone: the outcome asked for.
        }
        drop(id)
    }

    public func reset() {
        trips = []
        phase = .idle
        packing = []
        loading = nil
        packTasks = [:]
        writes = [:]
        writesInFlight = [:]
        confirmed = [:]
        tripRevisions = [:]
        deleted = []
        epoch &+= 1
        revision &+= 1
    }

    // MARK: - Internals

    /// Edits to one trip go out one at a time, in order. Every answer is the
    /// whole trip; only the last one queued is shown, so an earlier answer
    /// cannot undo a tick made since. When the last fails, the trip goes back
    /// to what the server last confirmed and is fetched again.
    private func write(_ id: String, _ send: @escaping () async throws -> Trip) async throws -> Trip {
        let previous = writes[id]
        let generation = api.generation
        let epoch = self.epoch
        writesInFlight[id, default: 0] += 1
        let task = Task { () async throws -> Trip in
            await previous?.value
            var answered = false
            defer {
                if self.epoch == epoch {
                    self.writesInFlight[id, default: 1] -= 1
                    if !answered, self.writesInFlight[id] == 0 {
                        if let confirmed = self.confirmed[id] { self.put(confirmed) }
                        if generation == self.api.generation { Task { await self.refetch(id) } }
                    }
                }
            }
            guard generation == self.api.generation, epoch == self.epoch else { throw APIError.superseded }
            let trip: Trip
            do {
                trip = try await send()
            } catch APIError.notFound {
                self.drop(id)
                answered = true
                throw APIError.notFound("That trip is gone.")
            }
            guard epoch == self.epoch else { throw APIError.superseded }
            if !self.deleted.contains(id) {
                self.confirmed[id] = trip
                if self.writesInFlight[id] == 1 { self.put(trip) }
            }
            answered = true
            return trip
        }
        writes[id] = Task { _ = try? await task.value }
        return try await task.value
    }

    /// A local change shown before the server answers.
    private func edit(_ id: String, _ change: (inout Trip) -> Void) {
        guard let index = trips.firstIndex(where: { $0.id == id }) else { return }
        change(&trips[index])
        revision &+= 1
        tripRevisions[id, default: 0] &+= 1
    }

    /// After a failed edit: the trip as the server has it, unless anything
    /// changed it here meanwhile (a later edit's answer is newer).
    private func refetch(_ id: String) async {
        let before = tripRevisions[id, default: 0]
        let generation = api.generation
        let epoch = self.epoch
        do {
            let trip: Trip = try await api.call(.get, "api/v1/trips/\(id)")
            guard epoch == self.epoch, generation == api.generation, tripRevisions[id, default: 0] == before,
                  writesInFlight[id, default: 0] == 0 else { return }
            put(trip)
        } catch APIError.notFound {
            guard epoch == self.epoch, generation == api.generation else { return }
            drop(id)
        } catch {
            // The confirmed copy is already showing.
        }
    }

    private func put(_ trip: Trip) {
        guard !deleted.contains(trip.id) else { return }
        revision &+= 1
        tripRevisions[trip.id, default: 0] &+= 1
        confirmed[trip.id] = trip
        if let index = trips.firstIndex(where: { $0.id == trip.id }) {
            trips[index] = trip
        } else {
            trips.append(trip)
            trips.sort { $0.startDate > $1.startDate }
        }
        if phase != .loaded { phase = .loaded }
    }

    /// Forgets a deleted trip for the rest of the session.
    private func drop(_ id: String) {
        revision &+= 1
        tripRevisions[id, default: 0] &+= 1
        deleted.insert(id)
        trips.removeAll { $0.id == id }
        confirmed[id] = nil
    }
}

nonisolated private struct PackBody: Encodable {
    var steer: String?
}

nonisolated private struct SwapBody: Encodable {
    var date: String
    var slot: String
    var toBlockId: String
    var fromBlockId: String?
}

/// `toBlockId: null` is what tells the server to take the piece off, so it
/// is written out, not left out.
nonisolated private struct TakeOffBody: Encodable {
    var date: String
    var slot: String
    var fromBlockId: String?

    enum CodingKeys: String, CodingKey { case date, slot, toBlockId, fromBlockId }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(date, forKey: .date)
        try container.encode(slot, forKey: .slot)
        try container.encodeNil(forKey: .toBlockId)
        try container.encodeIfPresent(fromBlockId, forKey: .fromBlockId)
    }
}

nonisolated private struct SeparatesBody: Encodable {
    var date: String
    var slot = "separates"
    var top: String
    var bottom: String
}
