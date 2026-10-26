import Foundation

/// Talks to the Fitsss server: `/api/v1/*` (envelope `{ data }` or
/// `{ error }`) and better-auth's `/api/auth/*`.
///
/// Authenticated with `Authorization: Bearer <token>`; the token comes from
/// the `set-auth-token` header on sign-in and lives in `TokenStore`.
@MainActor
public final class APIClient {
    public enum Method: String, Sendable {
        case get = "GET", post = "POST", patch = "PATCH", put = "PUT", delete = "DELETE"
    }

    public private(set) var baseURL: URL
    private let tokens: TokenStore
    private let session: URLSession

    /// Called whenever an authenticated request comes back 401.
    public var onUnauthorized: (() -> Void)?

    /// Bumped whenever the token or the server changes. A response to a
    /// request sent under an older generation belongs to a session that no
    /// longer exists: it is dropped (`APIError.superseded`) instead of
    /// repopulating stores for the next account, and its 401 cannot sign
    /// the new session out.
    public private(set) var generation = 0

    public init(baseURL: URL = ServerConfig.current, tokens: TokenStore = TokenStore(), session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = tokens
        self.session = session
        self.memoryToken = nil
        self.keepsTokenInMemory = false
    }

    /// A client for a session someone else owns (the share extension posts
    /// with the app's `SharedCredentials`): the token is held in memory and
    /// never written to this process's Keychain.
    public init(baseURL: URL, token: String, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.tokens = TokenStore()
        self.session = session
        self.memoryToken = token
        self.keepsTokenInMemory = true
    }

    private var memoryToken: String?
    private let keepsTokenInMemory: Bool

    public var token: String? { keepsTokenInMemory ? memoryToken : tokens.token(for: baseURL) }
    public var hasToken: Bool { token != nil }

    public func setToken(_ token: String?) {
        if keepsTokenInMemory {
            memoryToken = token
        } else {
            tokens.setToken(token, for: baseURL)
        }
        generation &+= 1
    }

    /// Points the client at another server. The caller restores the session.
    public func switchServer(to url: URL) {
        baseURL = url
        generation &+= 1
    }

    // MARK: - /api/v1

    /// A `/api/v1` call whose `data` decodes as `T`.
    public func call<T: Decodable>(
        _ method: Method = .get,
        _ path: String,
        query: [URLQueryItem] = [],
        body: (any Encodable)? = nil,
        headers: [String: String] = [:],
        timeout: TimeInterval = 30
    ) async throws -> T {
        let (data, _) = try await send(method, path, query: query, body: body, headers: headers, timeout: timeout)
        do {
            return try Self.decoder.decode(Envelope<T>.self, from: data).data
        } catch {
            throw APIError.decoding("\(path): \(error)")
        }
    }

    /// Sends raw bytes (a picture) as the body, `contentType` naming them;
    /// the answer's `data` decodes as `T`.
    public func upload<T: Decodable>(
        _ path: String,
        data: Data,
        contentType: String,
        query: [URLQueryItem] = [],
        timeout: TimeInterval = 60
    ) async throws -> T {
        let (body, _) = try await send(.post, path, query: query, raw: (data, contentType), timeout: timeout)
        do {
            return try Self.decoder.decode(Envelope<T>.self, from: body).data
        } catch {
            throw APIError.decoding("\(path): \(error)")
        }
    }

    /// The body of a non-JSON answer (a picture's bytes).
    public func bytes(_ path: String, timeout: TimeInterval = 30) async throws -> Data {
        try await send(.get, path, headers: ["Accept": "*/*"], timeout: timeout).0
    }

    /// A `/api/v1` call whose body, if any, is ignored (204s, fire-and-forget).
    public func callVoid(
        _ method: Method,
        _ path: String,
        query: [URLQueryItem] = [],
        body: (any Encodable)? = nil
    ) async throws {
        _ = try await send(method, path, query: query, body: body)
    }

    /// The lowest level: builds, sends, maps non-2xx to `APIError`. Returns
    /// the raw body for callers that need headers (ETags, `set-auth-token`).
    /// 304 counts as success.
    @discardableResult
    public func send(
        _ method: Method,
        _ path: String,
        query: [URLQueryItem] = [],
        body: (any Encodable)? = nil,
        raw: (data: Data, contentType: String)? = nil,
        headers: [String: String] = [:],
        timeout: TimeInterval = 30
    ) async throws -> (Data, HTTPURLResponse) {
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { components.queryItems = query }

        let sentGeneration = generation
        let sentToken = token

        var request = URLRequest(url: components.url!)
        request.httpMethod = method.rawValue
        request.timeoutInterval = timeout
        // Bearer only. better-auth also sets its session cookie on sign-in;
        // if URLSession stored and replayed it, every later /api/auth POST
        // (sign-in after sign-out, sign-out itself) would carry a cookie and
        // no Origin, which better-auth's CSRF check rejects with 403
        // "Missing or null Origin".
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let sentToken { request.setValue("Bearer \(sentToken)", forHTTPHeaderField: "Authorization") }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.encoder.encode(body)
        } else if let raw {
            request.setValue(raw.contentType, forHTTPHeaderField: "Content-Type")
            request.httpBody = raw.data
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            guard generation == sentGeneration else { throw APIError.superseded }
            // The caller's task was cancelled (a view went away): not a
            // connection problem, and not something to show.
            if error is CancellationError || (error as? URLError)?.code == .cancelled {
                throw CancellationError()
            }
            throw APIError.network(error.localizedDescription)
        }
        guard generation == sentGeneration else { throw APIError.superseded }
        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("Not an HTTP response")
        }
        if (200..<300).contains(http.statusCode) || http.statusCode == 304 {
            return (data, http)
        }
        throw mapFailure(status: http.statusCode, data: data, sentToken: sentToken != nil)
    }

    private func mapFailure(status: Int, data: Data, sentToken: Bool) -> APIError {
        let body = try? Self.decoder.decode(ErrorBody.self, from: data)
        let message = body?.error?.message ?? body?.message ?? HTTPURLResponse.localizedString(forStatusCode: status)
        switch status {
        case 401:
            // better-auth answers a wrong password with 401 too; only treat it
            // as a lost session when we actually sent a token.
            guard sentToken else { return .invalid(message: message, errors: []) }
            onUnauthorized?()
            return .unauthorized
        case 404:
            return .notFound(message)
        case 400, 422:
            return .invalid(message: message, errors: body?.error?.errors ?? [])
        default:
            return .server(status: status, message: message)
        }
    }

    // MARK: - JSON

    nonisolated public static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let raw = try container.decode(String.self)
            // The server sends `2026-09-08T08:55:31.828Z`; plain `.iso8601`
            // rejects the fractional seconds.
            if let date = try? Date(raw, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)) {
                return date
            }
            if let date = try? Date(raw, strategy: .iso8601) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Bad date \(raw)")
        }
        return decoder
    }()

    nonisolated public static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
}

nonisolated private struct Envelope<T: Decodable>: Decodable {
    var data: T
}

/// Either the `/api/v1` envelope or a better-auth error body.
nonisolated private struct ErrorBody: Decodable {
    struct Inner: Decodable {
        var code: String?
        var message: String?
        var errors: [String]?
    }

    var error: Inner?
    var code: String?
    var message: String?
}
