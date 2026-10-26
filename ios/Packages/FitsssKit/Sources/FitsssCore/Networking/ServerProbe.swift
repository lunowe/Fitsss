import Foundation

/// Checks that an address answers like a Fitsss server before the app
/// switches to it, so a typo in a custom server URL is caught on the spot
/// instead of signing the app out against a server that isn't there.
///
/// Asks `/api/v1/me` without a token: a Fitsss server answers with its JSON
/// 401 envelope (`{ "error": { "code": "unauthorized" } }`).
public enum ServerProbe {
    public enum Result: Equatable, Sendable {
        case fitsss
        /// Something answered, but not the Fitsss `/api/v1` (a 404 page, another app).
        case notFitsss(status: Int)
        /// No answer: wrong address, server down, other network, blocked by ATS.
        case unreachable(URLError.Code?)
    }

    public static func check(_ server: URL, timeout: TimeInterval = 8) async -> Result {
        var request = URLRequest(url: server.appending(path: "api/v1/me"))
        request.timeoutInterval = timeout
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout
        let session = URLSession(configuration: configuration)
        defer { session.finishTasksAndInvalidate() }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            return .unreachable((error as? URLError)?.code)
        }
        guard let http = response as? HTTPURLResponse else { return .unreachable(nil) }
        if http.statusCode == 200 { return .fitsss }
        if http.statusCode == 401,
           let body = try? JSONDecoder().decode(Envelope.self, from: data),
           body.error.code == "unauthorized" {
            return .fitsss
        }
        return .notFitsss(status: http.statusCode)
    }
}

nonisolated private struct Envelope: Decodable {
    struct Inner: Decodable { var code: String }
    var error: Inner
}
