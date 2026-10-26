import Foundation

/// Everything a request can fail with, already mapped from the `/api/v1`
/// envelope (`{ "error": { code, message, errors? } }`) and from better-auth's
/// own `{ code, message }` bodies.
nonisolated public enum APIError: Error, Equatable, Sendable, LocalizedError {
    /// The token is missing, expired or revoked. `SessionStore` signs out.
    case unauthorized
    case notFound(String)
    /// The server rejected the input; `errors` are the domain validator's messages.
    case invalid(message: String, errors: [String])
    /// Any other non-2xx answer.
    case server(status: Int, message: String)
    /// No connection, timeout, TLS, DNS.
    case network(String)
    /// The server answered 2xx with a body we could not read. A bug, not a user error.
    case decoding(String)
    /// The answer arrived after a sign-out, sign-in or server switch and was
    /// dropped. Nothing to show; whether a write took effect is unknown.
    case superseded

    public var errorDescription: String? {
        switch self {
        case .unauthorized: "Your session ended. Sign in again."
        case .notFound(let message): message
        case .invalid(let message, let errors): errors.isEmpty ? message : errors.joined(separator: "\n")
        case .server(_, let message): message
        case .network: "Can’t reach Fitsss. Check your connection."
        case .decoding: "Something went wrong reading the server’s answer."
        case .superseded: "You switched accounts or servers while this was loading."
        }
    }
}
