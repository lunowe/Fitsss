import Foundation
import Observation

/// What Fitsss has learned about the person's taste, overall and per style,
/// and the edits they make to it (their own lines, deletions, a refresh).
@MainActor
@Observable
public final class TasteStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    public private(set) var overview: TasteOverview?
    public private(set) var phase: Phase = .idle
    /// Scopes being refreshed (`overall` or a style id).
    public private(set) var refreshing: Set<String> = []

    /// A refresh is a model call.
    public static let refreshTimeout: TimeInterval = 120
    /// Lines the person writes: 3 to 120 characters.
    public static let lineLengths = 3...120

    private let api: APIClient
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?
    /// See `LooksStore.revision`.
    @ObservationIgnored private var revision = 0
    /// The last line edit queued per scope; see `edit`.
    @ObservationIgnored private var edits: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var editsStarted: [String: Int] = [:]
    @ObservationIgnored private var editsInFlight: [String: Int] = [:]
    /// Bumped by `reset()`; see `edit`.
    @ObservationIgnored private var epoch = 0

    public init(api: APIClient) {
        self.api = api
    }

    /// The scope key `refreshing` uses.
    public static func scopeKey(_ styleId: String?) -> String { styleId ?? "overall" }

    /// The profile for a style, or the overall one for nil. An active style
    /// nothing was learned for yet has an empty profile.
    public func profile(_ styleId: String?) -> TasteProfile? {
        guard let overview else { return nil }
        guard let styleId else { return overview.overall }
        return overview.byStyle[styleId] ?? TasteProfile(styleId: styleId)
    }

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
        if overview == nil { phase = .loading }
        do {
            var fetched: TasteOverview
            var attempts = 0
            repeat {
                let started = revision
                fetched = try await api.call(.get, "api/v1/taste")
                attempts += 1
                if started == revision { break }
            } while attempts < 3
            overview = fetched
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

    /// Re-reads the choices in a scope into learned lines (slow); the
    /// person's own lines stay. Errors: `.server(409, …)` not enough choices
    /// yet (the message says how many more), `.notFound` the style is gone,
    /// `.server(502, …)` the model failed, `.server(503, …)` not set up.
    ///
    /// Line edits made while it runs go ahead (the server merges them into
    /// what it writes); the refresh's own answer is then not trusted to be
    /// the newest, so once those edits are done the overview is fetched again.
    @discardableResult
    public func refresh(_ styleId: String?) async throws -> TasteProfile {
        let key = Self.scopeKey(styleId)
        refreshing.insert(key)
        defer { refreshing.remove(key) }
        let editsBefore = editsStarted[key, default: 0]
        let epochBefore = epoch
        let profile: TasteProfile = try await api.call(
            .post, "api/v1/taste/refresh", body: ScopeBody(styleId: styleId), timeout: Self.refreshTimeout
        )
        if epoch != epochBefore { throw APIError.superseded }
        if editsStarted[key, default: 0] == editsBefore, editsInFlight[key, default: 0] == 0 {
            apply(profile)
        } else {
            await edits[key]?.value
            revision &+= 1
            await load()
        }
        return profile
    }

    /// A line in the person's own words. `kind` is `like` or `avoid`.
    /// Throws `.invalid` (length, already there, style gone).
    @discardableResult
    public func addLine(_ text: String, kind: String, styleId: String?) async throws -> TasteProfile {
        try await edit(styleId) {
            try await self.api.call(.post, "api/v1/taste/lines", body: LineBody(styleId: styleId, text: text, kind: kind))
        }
    }

    /// Removes a line, learned or written. One already gone counts as removed.
    @discardableResult
    public func removeLine(_ lineId: String, styleId: String?) async throws -> TasteProfile {
        let query = styleId.map { [URLQueryItem(name: "styleId", value: $0)] } ?? []
        let encoded = lineId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? lineId
        return try await edit(styleId) {
            try await self.api.call(.delete, "api/v1/taste/lines/\(encoded)", query: query)
        }
    }

    /// Line edits in one scope go out one at a time, each answer applied
    /// before the next is sent. Every answer is the whole scope as the server
    /// had it, so two deletions answered out of order would otherwise bring
    /// the first line back.
    private func edit(_ styleId: String?, _ send: @escaping () async throws -> TasteProfile) async throws -> TasteProfile {
        let key = Self.scopeKey(styleId)
        let previous = edits[key]
        let generation = api.generation
        // The bookkeeping belongs to this session: an edit still finishing
        // after a reset must not touch the next session's counts.
        let epoch = self.epoch
        editsStarted[key, default: 0] += 1
        editsInFlight[key, default: 0] += 1
        let task = Task { () async throws -> TasteProfile in
            await previous?.value
            defer { if self.epoch == epoch { self.editsInFlight[key, default: 1] -= 1 } }
            guard generation == self.api.generation, epoch == self.epoch else { throw APIError.superseded }
            let profile = try await send()
            guard epoch == self.epoch else { throw APIError.superseded }
            self.apply(profile)
            return profile
        }
        edits[key] = Task { _ = try? await task.value }
        return try await task.value
    }

    public func reset() {
        overview = nil
        phase = .idle
        loading = nil
        refreshing = []
        edits = [:]
        editsStarted = [:]
        editsInFlight = [:]
        epoch &+= 1
        revision &+= 1
    }

    private func apply(_ profile: TasteProfile) {
        revision &+= 1
        guard var overview else {
            // Not loaded yet: fetch the whole picture rather than invent the rest.
            Task { await load() }
            return
        }
        if let styleId = profile.styleId {
            overview.byStyle[styleId] = profile
        } else {
            overview.overall = profile
        }
        self.overview = overview
    }
}

/// `styleId` sent as null for the overall scope.
nonisolated private struct ScopeBody: Encodable {
    var styleId: String?

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(styleId, forKey: .styleId)
    }

    enum CodingKeys: String, CodingKey { case styleId }
}

nonisolated private struct LineBody: Encodable {
    var styleId: String?
    var text: String
    var kind: String
}
