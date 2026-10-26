import Foundation
import Observation

/// Who is signed in, and the sign-in/out flows against better-auth.
@MainActor
@Observable
public final class SessionStore {
    public enum State: Equatable, Sendable {
        /// Launch: checking the stored token.
        case restoring
        case signedOut
        case signedIn(User)
    }

    public private(set) var state: State = .restoring {
        didSet { shareSession() }
    }
    public let api: APIClient

    public var user: User? {
        if case .signedIn(let user) = state { user } else { nil }
    }

    public init(api: APIClient) {
        self.api = api
        api.onUnauthorized = { [weak self] in self?.dropSession() }
    }

    /// Checks the stored token with `/api/v1/me`. With `-FitsssLogin` in a
    /// debug build, signs in instead when there is no valid session.
    public func restore() async {
        if api.hasToken {
            do {
                let me: User = try await api.call(.get, "api/v1/me")
                signedIn(me)
                return
            } catch APIError.unauthorized {
                // Fall through to signed out (or the debug login).
            } catch APIError.superseded {
                // A newer sign-in or server switch owns the state now.
                return
            } catch {
                // Offline or the server is down: the token may well still be
                // good, so stay signed in as the last known user.
                if let cached = cachedUser {
                    state = .signedIn(cached)
                    return
                }
            }
        }
        if let login = LaunchOptions.login {
            try? await signIn(email: login.email, password: login.password)
            if user != nil { return }
        }
        state = .signedOut
    }

    /// Throws `APIError.invalid` with better-auth's message on bad credentials.
    public func signIn(email: String, password: String) async throws {
        try await authenticate("api/auth/sign-in/email", body: SignIn(email: email, password: password))
    }

    public func signUp(name: String, email: String, password: String) async throws {
        try await authenticate("api/auth/sign-up/email", body: SignUp(name: name, email: email, password: password))
    }

    public func signOut() async {
        if api.hasToken {
            _ = try? await api.send(.post, "api/auth/sign-out", body: [String: String]())
        }
        dropSession()
    }

    /// Switches server and restores whatever session exists there.
    public func switchServer(to url: URL?) async {
        ServerConfig.set(url)
        api.switchServer(to: url ?? ServerConfig.defaultURL)
        state = .restoring
        await restore()
    }

    private func authenticate(_ path: String, body: some Encodable) async throws {
        api.setToken(nil)
        let (_, response) = try await api.send(.post, path, body: body)
        guard let token = response.value(forHTTPHeaderField: "set-auth-token"), !token.isEmpty else {
            throw APIError.server(status: response.statusCode, message: "Signed in, but the server sent no token.")
        }
        api.setToken(token)
        do {
            let me: User = try await api.call(.get, "api/v1/me")
            signedIn(me)
        } catch {
            // better-auth said yes but the app API did not (not deployed on
            // that server, or it went away mid-sign-in): end the session it
            // just made rather than keep a token nothing can use.
            if api.hasToken {
                _ = try? await api.send(.post, "api/auth/sign-out", body: [String: String]())
                api.setToken(nil)
            }
            if case APIError.notFound = error {
                throw APIError.server(status: 404, message: "This server doesn’t have the Fitsss app API yet.")
            }
            throw error
        }
    }

    private func signedIn(_ user: User) {
        cachedUser = user
        state = .signedIn(user)
    }

    /// Lets the share extension post as whoever is signed in here, to the
    /// same server, and as nobody once they sign out.
    private func shareSession() {
        switch state {
        case .signedIn:
            SharedCredentials.save(api.token.map { .init(server: api.baseURL, token: $0) })
        case .signedOut, .restoring:
            // Restoring is a server switch in progress (launch starts there
            // without a change): until it ends signed in, the extension must
            // not post as the session being left.
            SharedCredentials.save(nil)
        }
    }

    private func dropSession() {
        api.setToken(nil)
        cachedUser = nil
        state = .signedOut
    }

    /// The last user seen on this server, for launching offline.
    private var cachedUser: User? {
        get {
            UserDefaults.standard.data(forKey: cacheKey).flatMap { try? JSONDecoder().decode(User.self, from: $0) }
        }
        set {
            UserDefaults.standard.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: cacheKey)
        }
    }

    private var cacheKey: String { "fitsss.user.\(api.baseURL.absoluteString)" }
}

private struct SignIn: Encodable {
    var email: String
    var password: String
}

private struct SignUp: Encodable {
    var name: String
    var email: String
    var password: String
}
