import Foundation
import Observation

/// Saved inspiration pictures, newest first, and everything done with them:
/// adding (a photo's bytes or a link), reading (the slow model call),
/// restyling from the closet, filing under a style, the note.
@MainActor
@Observable
public final class InspoStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    public private(set) var inspos: [Inspo] = []
    public private(set) var phase: Phase = .idle
    /// Pictures being read right now, so every screen showing one can say so.
    public private(set) var analyzing: Set<String> = []
    /// Pictures being restyled right now.
    public private(set) var restyling: Set<String> = []
    /// The last restyle of each picture this session, so coming back to a
    /// picture shows what it gave last time.
    public private(set) var restyles: [String: GenerationResult] = [:]

    /// Reading a picture and restyling one take as long as the model does.
    public static let modelTimeout: TimeInterval = 120

    private let api: APIClient
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?
    /// See `LooksStore.revision`.
    @ObservationIgnored private var revision = 0
    @ObservationIgnored private var analyses: [String: (task: Task<Inspo, any Error>, generation: Int)] = [:]
    @ObservationIgnored private let images = NSCache<NSString, NSData>()
    /// The last edit queued per picture and field ("id.note"); see `write`.
    @ObservationIgnored private var writes: [String: Task<Void, Never>] = [:]

    public init(api: APIClient) {
        self.api = api
        images.totalCostLimit = 48 * 1024 * 1024
    }

    public func inspo(_ id: String) -> Inspo? { inspos.first { $0.id == id } }

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
        if inspos.isEmpty { phase = .loading }
        do {
            var fetched: [Inspo]
            var attempts = 0
            repeat {
                let started = revision
                fetched = try await api.call(.get, "api/v1/inspos")
                attempts += 1
                if started == revision { break }
            } while attempts < 3
            inspos = fetched
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

    // MARK: - Adding

    /// Which session is signed in, as a mark to hand back to `add(imageData:…
    /// session:)`: work that started under one session (preparing a photo)
    /// must not finish under the next.
    public var sessionMark: Int { api.generation }

    /// Adds a picture from its bytes (resize first: `PictureDownscaler`).
    /// Unread; call `analyze` next. Sending the same bytes again returns the
    /// picture already there, so retrying after a lost answer is safe.
    /// With `session` (a `sessionMark` taken before the bytes were prepared),
    /// throws `.superseded` instead of sending if someone else has signed in
    /// or the server changed since. Throws `.invalid` (not a picture),
    /// `.server(413, …)` (too big).
    @discardableResult
    public func add(
        imageData: Data, contentType: String = "image/jpeg", sourceUrl: String? = nil, session: Int? = nil
    ) async throws -> Inspo {
        if let session, session != api.generation { throw APIError.superseded }
        let query = sourceUrl.map { [URLQueryItem(name: "sourceUrl", value: $0)] } ?? []
        let inspo: Inspo = try await api.upload("api/v1/inspos", data: imageData, contentType: contentType, query: query)
        insert(inspo)
        return inspo
    }

    /// Adds a picture from a link: an image, or a page that has one (a
    /// Pinterest pin). Throws `.invalid` with the server's sentence when the
    /// link gave nothing usable; a screenshot is the way out then.
    @discardableResult
    public func add(link: String) async throws -> Inspo {
        let inspo: Inspo = try await api.call(.post, "api/v1/inspos", body: ["url": link], timeout: 30)
        insert(inspo)
        return inspo
    }

    private func insert(_ inspo: Inspo) {
        revision &+= 1
        if let index = inspos.firstIndex(where: { $0.id == inspo.id }) {
            inspos[index] = inspo
        } else {
            inspos.insert(inspo, at: 0)
        }
    }

    // MARK: - Reading and restyling

    /// Reads the picture into pieces and matches them to the closet (slow).
    /// Asking again while a read is running waits for that one. Errors:
    /// `.server(502, …)` the read failed (worth a retry), `.server(503, …)`
    /// reading pictures is not set up on the server.
    @discardableResult
    public func analyze(_ id: String) async throws -> Inspo {
        if let running = analyses[id], running.generation == api.generation {
            return try await running.task.value
        }
        let generation = api.generation
        let task = Task { () throws -> Inspo in
            try await goneAware(id) {
                try await self.api.call(.post, "api/v1/inspos/\(id)/analyze", timeout: Self.modelTimeout)
            }
        }
        analyses[id] = (task, generation)
        analyzing.insert(id)
        defer {
            if analyses[id]?.generation == generation {
                analyses[id] = nil
                analyzing.remove(id)
            }
        }
        let inspo = try await task.value
        merge(inspo) { local, answer in
            local.analysis = answer.analysis
            local.match = answer.match
        }
        return self.inspo(id) ?? inspo
    }

    /// Outfits from the closet in the spirit of the picture (it must have
    /// been read). Without `weather` the server assumes a mild grey day. The
    /// result is kept in `restyles[id]`. Errors as `OutfitsStore.generate`.
    @discardableResult
    public func restyle(
        _ id: String, occasion: String? = nil, weather: WeatherSnapshot? = nil, count: Int = 2
    ) async throws -> GenerationResult {
        restyling.insert(id)
        defer { restyling.remove(id) }
        let generation = api.generation
        let result: GenerationResult = try await goneAware(id) {
            try await self.api.call(
                .post, "api/v1/inspos/\(id)/restyle",
                body: RestyleBody(count: count, occasion: occasion, weather: weather),
                timeout: Self.modelTimeout
            )
        }
        if generation == api.generation { restyles[id] = result }
        return result
    }

    // MARK: - Editing

    /// Files the picture as a reference for a style (nil unfiles it).
    /// Throws `.invalid` when the style is gone.
    @discardableResult
    public func setStyle(_ id: String, styleId: String?) async throws -> Inspo {
        let inspo: Inspo = try await write(id, "style") {
            try await self.api.call(.patch, "api/v1/inspos/\(id)", body: StyleBody(styleId: styleId))
        }
        merge(inspo) { $0.styleId = $1.styleId }
        return self.inspo(id) ?? inspo
    }

    /// Replaces the note; empty clears it. At most 500 characters.
    @discardableResult
    public func setNote(_ id: String, note: String) async throws -> Inspo {
        let inspo: Inspo = try await write(id, "note") {
            try await self.api.call(.patch, "api/v1/inspos/\(id)", body: ["note": note])
        }
        merge(inspo) { $0.note = $1.note }
        return self.inspo(id) ?? inspo
    }

    /// Edits of one field of one picture go out one at a time, in the order
    /// they were made: sent side by side, the older could reach the server
    /// last and win there while the app shows the newer. One that waited
    /// across a sign-out or a switch is not sent at all.
    private func write(_ id: String, _ field: String, _ send: @escaping () async throws -> Inspo) async throws -> Inspo {
        let key = "\(id).\(field)"
        let previous = writes[key]
        let generation = api.generation
        let task = Task { () async throws -> Inspo in
            await previous?.value
            guard generation == self.api.generation else { throw APIError.superseded }
            return try await self.goneAware(id, send)
        }
        writes[key] = Task { _ = try? await task.value }
        return try await task.value
    }

    /// Each edit's answer is the whole picture as the server had it then. A
    /// slow answer to one edit (a read, the style) must not undo another (a
    /// note saved meanwhile), so each edit takes only its own fields.
    private func merge(_ answer: Inspo, _ take: (inout Inspo, Inspo) -> Void) {
        revision &+= 1
        guard let index = inspos.firstIndex(where: { $0.id == answer.id }) else { return }
        take(&inspos[index], answer)
    }

    /// Deletes the picture and its analysis. Looks saved from it stay. A
    /// picture already removed (on another device) counts as removed.
    public func remove(_ id: String) async throws {
        do {
            try await api.callVoid(.delete, "api/v1/inspos/\(id)")
        } catch APIError.notFound {
            // Already gone: the outcome asked for.
        }
        drop(id)
    }

    // MARK: - Pictures

    /// The picture's bytes. Kept in memory once fetched (they never change).
    public func imageData(_ id: String) async throws -> Data {
        if let cached = images.object(forKey: id as NSString) { return cached as Data }
        let generation = api.generation
        let data = try await api.bytes("api/v1/inspos/\(id)/image")
        if generation == api.generation {
            images.setObject(data as NSData, forKey: id as NSString, cost: data.count)
        }
        return data
    }

    /// The picture's bytes if they are already here, for drawing without a flash.
    public func cachedImageData(_ id: String) -> Data? {
        images.object(forKey: id as NSString) as Data?
    }

    // MARK: -

    public func reset() {
        inspos = []
        phase = .idle
        loading = nil
        analyses = [:]
        analyzing = []
        restyling = []
        restyles = [:]
        images.removeAllObjects()
        writes = [:]
        revision &+= 1
    }

    /// Thrown when the picture no longer exists on the server; it has been
    /// dropped from `inspos` too, so screens showing it can close.
    public static let goneMessage = "That picture was already removed."

    private func goneAware<T>(_ id: String, _ call: () async throws -> T) async throws -> T {
        do {
            return try await call()
        } catch APIError.notFound {
            drop(id)
            throw APIError.notFound(Self.goneMessage)
        }
    }

    private func drop(_ id: String) {
        revision &+= 1
        inspos.removeAll { $0.id == id }
        restyles[id] = nil
        images.removeObject(forKey: id as NSString)
    }
}

nonisolated private struct RestyleBody: Encodable {
    var count: Int
    var occasion: String?
    var weather: WeatherSnapshot?
}

/// `{ "styleId": null }` must be sent as null, not left out: that is how a
/// picture is unfiled.
nonisolated private struct StyleBody: Encodable {
    var styleId: String?

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(styleId, forKey: .styleId)
    }

    enum CodingKeys: String, CodingKey { case styleId }
}
