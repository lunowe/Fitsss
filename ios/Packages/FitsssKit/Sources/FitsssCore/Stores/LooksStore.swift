import Foundation
import Observation

/// Saved looks, newest first. Today saves into it; the Looks tab shows it.
@MainActor
@Observable
public final class LooksStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    public private(set) var looks: [Look] = []
    public private(set) var phase: Phase = .idle

    private let api: APIClient
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?
    /// Bumped by every confirmed write. A refresh that started before one
    /// would bring back the list as it was then (a removed look, a lower worn
    /// count), so its answer is dropped and the list is fetched again.
    @ObservationIgnored private var revision = 0

    public init(api: APIClient) {
        self.api = api
    }

    public func look(_ id: String) -> Look? { looks.first { $0.id == id } }

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
        if looks.isEmpty { phase = .loading }
        do {
            var fetched: [Look]
            var attempts = 0
            repeat {
                let started = revision
                fetched = try await api.call(.get, "api/v1/looks")
                attempts += 1
                if started == revision { break }
            } while attempts < 3
            looks = fetched
            phase = .loaded
        } catch APIError.superseded {
            return
        } catch is CancellationError {
            if phase == .loading { phase = .idle }
        } catch let error as APIError {
            phase = .failed(error)
        } catch {
            phase = .failed(.network(error.localizedDescription))
        }
    }

    /// Saves an outfit as a look. The server records a "saved" event for
    /// taste learning, so don't send one yourself.
    @discardableResult
    public func save(
        _ outfit: Outfit, styleId: String?, occasion: String?, weather: WeatherSnapshot?, generationId: String?
    ) async throws -> Look {
        let look: Look = try await api.call(.post, "api/v1/looks", body: SaveLook(
            outfit: outfit, styleId: styleId, occasion: occasion, weather: weather, generationId: generationId
        ))
        revision &+= 1
        if let index = looks.firstIndex(where: { $0.id == look.id }) {
            looks[index] = look // the server returned the look already saved
        } else {
            looks.insert(look, at: 0)
        }
        return look
    }

    @discardableResult
    public func rename(_ id: String, to name: String) async throws -> Look {
        let look: Look = try await goneAware(id) { try await self.api.call(.patch, "api/v1/looks/\(id)", body: ["name": name]) }
        replace(look)
        return look
    }

    /// Worn today: bumps the count (the server records a "worn" event).
    @discardableResult
    public func markWorn(_ id: String) async throws -> Look {
        let look: Look = try await goneAware(id) { try await self.api.call(.post, "api/v1/looks/\(id)/wear") }
        replace(look)
        return look
    }

    /// Removes the look (the server records an "unsaved" event). A look
    /// that was already removed (on another device) counts as removed.
    public func remove(_ id: String) async throws {
        do {
            try await api.callVoid(.delete, "api/v1/looks/\(id)")
        } catch APIError.notFound {
            // Already gone: the outcome the user asked for.
        }
        revision &+= 1
        looks.removeAll { $0.id == id }
    }

    /// Thrown by `rename` and `markWorn` when the look no longer exists on
    /// the server; it has been dropped from `looks` too.
    public static let goneMessage = "That look was already removed."

    /// Runs `call`; on a 404 drops the look locally (so screens showing it
    /// close) and rethrows with `goneMessage`.
    private func goneAware<T>(_ id: String, _ call: () async throws -> T) async throws -> T {
        do {
            return try await call()
        } catch APIError.notFound {
            revision &+= 1
            looks.removeAll { $0.id == id }
            throw APIError.notFound(Self.goneMessage)
        }
    }

    public func reset() {
        looks = []
        phase = .idle
        loading = nil
    }

    private func replace(_ look: Look) {
        revision &+= 1
        if let index = looks.firstIndex(where: { $0.id == look.id }) { looks[index] = look }
    }
}

nonisolated private struct SaveLook: Encodable {
    var outfit: Outfit
    var styleId: String?
    var occasion: String?
    var weather: WeatherSnapshot?
    var generationId: String?
}
