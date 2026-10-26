import Foundation
import Observation

/// Holds the signed-in user's catalog. Shown from the on-disk copy at once,
/// then revalidated with the server by ETag, so the app has its vocabulary and
/// drawings offline and after the first launch never waits on the ~700 KB
/// download.
///
/// The catalog is per user (custom categories, types and drawings), so the
/// disk copy is keyed by server *and* user, and nothing is shown until
/// `activate(userId:)` says whose it is.
@MainActor
@Observable
public final class CatalogStore {
    public private(set) var catalog: Catalog?
    public private(set) var error: APIError?
    public private(set) var isLoading = false
    /// True once this session has confirmed `catalog` with the server (a 200
    /// or a 304). False while only the disk copy is known. Decisions that
    /// discard data because the catalog lacks something (dropping cart lines
    /// for a deleted type) must wait for this.
    public private(set) var isRevalidated = false

    private let api: APIClient
    private var userId: String?
    /// The load in progress, shared by every caller. Unstructured on purpose:
    /// a screen that stops waiting must not cancel the load everyone else
    /// is waiting for.
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?

    public init(api: APIClient) {
        self.api = api
    }

    /// Switches to `userId`'s catalog (its disk copy, until `load()`
    /// revalidates it). Nil clears everything, for sign-out.
    public func activate(userId: String?) {
        guard userId != self.userId || (userId != nil && catalog == nil) else { return }
        self.userId = userId
        catalog = userId.flatMap { Self.readCache(server: api.baseURL, userId: $0) }
        error = nil
        isRevalidated = false
        loading = nil
    }

    /// Fetches unless an identical copy is already held. Safe to call often;
    /// concurrent callers share one request.
    public func load() async {
        // Shared only within one session; see `ClosetStore.load`.
        if let loading, loading.generation == api.generation { return await loading.task.value }
        guard userId != nil else { return }
        let task = Task { await performLoad() }
        let generation = api.generation
        loading = (task, generation)
        await task.value
        if loading?.generation == generation { loading = nil }
    }

    private func performLoad() async {
        guard let userId else { return }
        isLoading = true
        defer { isLoading = false }

        let etag = catalog.map { "\"\($0.version)\"" }
        do {
            let (data, response) = try await api.send(
                .get, "api/v1/catalog", headers: etag.map { ["If-None-Match": $0] } ?? [:]
            )
            // Signed out or switched user while this was in flight.
            guard userId == self.userId else { return }
            error = nil
            if response.statusCode != 304 {
                catalog = try APIClient.decoder.decode(CatalogEnvelope.self, from: data).data
                Self.writeCache(data, server: api.baseURL, userId: userId)
            }
            isRevalidated = true
        } catch APIError.superseded {
            return
        } catch is CancellationError {
            return
        } catch let apiError as APIError {
            error = apiError
        } catch {
            self.error = .decoding("catalog: \(error)")
        }
    }

    /// Forgets the user's catalog (sign-out, server switch).
    public func reset() {
        activate(userId: nil)
    }

    // MARK: - Disk cache

    private static func cacheURL(server: URL, userId: String) -> URL {
        let host = server.host(percentEncoded: false) ?? "server"
        let safeUser = userId.unicodeScalars
            .map { CharacterSet.alphanumerics.contains($0) ? String($0) : "_" }
            .joined()
        return URL.cachesDirectory.appending(path: "catalog-\(host)-\(server.port ?? 0)-\(safeUser).json")
    }

    private static func readCache(server: URL, userId: String) -> Catalog? {
        guard let data = try? Data(contentsOf: cacheURL(server: server, userId: userId)) else { return nil }
        return try? APIClient.decoder.decode(CatalogEnvelope.self, from: data).data
    }

    private static func writeCache(_ data: Data, server: URL, userId: String) {
        try? data.write(to: cacheURL(server: server, userId: userId), options: .atomic)
    }
}

nonisolated private struct CatalogEnvelope: Decodable {
    var data: Catalog
}
