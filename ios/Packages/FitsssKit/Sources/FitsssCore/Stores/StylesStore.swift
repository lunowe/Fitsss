import Foundation
import Observation

/// The user's styles, in their order. Today's style chips and the Styles tab
/// both read this.
@MainActor
@Observable
public final class StylesStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    /// At most six, in the order the user arranged them. The first is the
    /// one Today reaches for by default.
    public private(set) var styles: [Style] = []
    public private(set) var phase: Phase = .idle

    /// The server allows this many active styles.
    public static let maxStyles = 6

    private let api: APIClient
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?
    /// Bumped by every local change; see `LooksStore.revision`.
    @ObservationIgnored private var revision = 0

    public init(api: APIClient) {
        self.api = api
    }

    public func style(_ id: String) -> Style? { styles.first { $0.id == id } }

    public var canAddMore: Bool { styles.count < Self.maxStyles }

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
        if styles.isEmpty { phase = .loading }
        do {
            var fetched: [Style]
            var attempts = 0
            repeat {
                let started = revision
                fetched = try await api.call(.get, "api/v1/styles")
                attempts += 1
                if started == revision { break }
            } while attempts < 3
            styles = fetched
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

    /// Throws `.invalid` with the server's messages (name missing, too long,
    /// six styles already).
    @discardableResult
    public func create(_ input: StyleInput) async throws -> Style {
        do {
            let style: Style = try await api.call(.post, "api/v1/styles", body: input)
            revision &+= 1
            styles.append(style)
            return style
        } catch let error as APIError {
            // Refused, often because another device already added the sixth:
            // show the list as the server has it.
            if case .invalid = error { Task { await load() } }
            throw error
        }
    }

    @discardableResult
    public func update(_ id: String, with input: StyleInput) async throws -> Style {
        let style: Style = try await api.call(.patch, "api/v1/styles/\(id)", body: input)
        revision &+= 1
        if let index = styles.firstIndex(where: { $0.id == id }) { styles[index] = style }
        return style
    }

    public func delete(_ id: String) async throws {
        try await api.callVoid(.delete, "api/v1/styles/\(id)")
        revision &+= 1
        styles.removeAll { $0.id == id }
    }

    /// Saves a new order. Shown at once; put back if the server refuses,
    /// but only the order, and only if nothing else changed the list
    /// meanwhile. After a sign-out or server switch (`.superseded`) the list
    /// belongs to someone else: leave it alone.
    public func reorder(_ ids: [String]) async throws {
        let before = styles
        revision &+= 1
        styles = ids.compactMap { id in before.first { $0.id == id } } + before.filter { !ids.contains($0.id) }
        let optimistic = revision
        do {
            let saved: [Style] = try await api.call(.put, "api/v1/styles/order", body: ["ids": ids])
            if revision == optimistic { styles = saved }
        } catch APIError.superseded {
            throw APIError.superseded
        } catch {
            if revision == optimistic {
                // Restore the old order of the styles as they are now.
                styles = styles.sorted { lhs, rhs in
                    (before.firstIndex { $0.id == lhs.id } ?? .max) < (before.firstIndex { $0.id == rhs.id } ?? .max)
                }
            }
            throw error
        }
    }

    public func reset() {
        styles = []
        phase = .idle
        loading = nil
        revision &+= 1
    }
}
