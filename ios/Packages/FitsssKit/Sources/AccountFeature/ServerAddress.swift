import FitsssCore
import Foundation

/// The two servers the app knows by name, and everything else.
enum ServerChoice: Hashable {
    case production, local, custom

    init(_ url: URL) {
        if ServerAddress.same(url, ServerConfig.production) {
            self = .production
        } else if ServerAddress.same(url, ServerConfig.local) {
            self = .local
        } else {
            self = .custom
        }
    }

    var title: String {
        switch self {
        case .production: "Production"
        case .local: "Local dev"
        case .custom: "Custom"
        }
    }

    var presetURL: URL? {
        switch self {
        case .production: ServerConfig.production
        case .local: ServerConfig.local
        case .custom: nil
        }
    }
}

enum ServerAddress {
    /// `host` or `host:port`, for showing a server in a row.
    static func display(_ url: URL) -> String {
        let host = url.host(percentEncoded: false) ?? url.absoluteString
        return url.port.map { "\(host):\($0)" } ?? host
    }

    /// The name shown for the current server: the preset's, or the custom host.
    static func name(_ url: URL) -> String {
        let choice = ServerChoice(url)
        return choice == .custom ? display(url) : choice.title
    }

    static func same(_ a: URL, _ b: URL) -> Bool {
        normalized(a) == normalized(b)
    }

    private static func normalized(_ url: URL) -> String {
        var string = url.absoluteString.lowercased()
        while string.hasSuffix("/") { string.removeLast() }
        return string
    }

    enum ParseError: Error, Equatable {
        case empty, invalid, unsupportedScheme

        var message: String {
            switch self {
            case .empty: "Enter the server’s address."
            case .invalid: "That doesn’t look like a server address. Try one like http://192.168.1.20:3100."
            case .unsupportedScheme: "Use an address that starts with http:// or https://."
            }
        }
    }

    /// Turns what someone typed into a server root URL.
    ///
    /// Without a scheme, local addresses (an IP, `localhost`, `*.local`, a bare
    /// host name) get `http://` like the dev server, anything else `https://`.
    /// Paths, queries and fragments are dropped: the server lives at the root,
    /// and a pasted `http://mac.local:3100/closet` should still work.
    static func parse(_ raw: String) -> Result<URL, ParseError> {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return .failure(.empty) }
        guard !text.contains(where: \.isWhitespace) else { return .failure(.invalid) }

        let withScheme: String
        if text.contains("://") {
            withScheme = text
        } else {
            let host = text.split(whereSeparator: { $0 == ":" || $0 == "/" }).first.map(String.init) ?? text
            withScheme = (isLocal(host) ? "http://" : "https://") + text
        }

        guard let parsed = URLComponents(string: withScheme) else { return .failure(.invalid) }
        guard let scheme = parsed.scheme?.lowercased(), ["http", "https"].contains(scheme) else {
            return .failure(.unsupportedScheme)
        }
        guard let host = parsed.host, !host.isEmpty, parsed.user == nil, parsed.password == nil else {
            return .failure(.invalid)
        }

        var root = URLComponents()
        root.scheme = scheme
        root.host = host.lowercased()
        root.port = parsed.port
        guard let url = root.url else { return .failure(.invalid) }
        return .success(url)
    }

    private static func isLocal(_ host: String) -> Bool {
        let host = host.lowercased()
        if host == "localhost" || host.hasSuffix(".local") || !host.contains(".") { return true }
        return host.allSatisfy { $0.isNumber || $0 == "." }
    }

    /// What to say when the probe found no Fitsss server at `url`.
    static func problem(_ result: ServerProbe.Result, at url: URL) -> String? {
        let host = display(url)
        switch result {
        case .fitsss:
            return nil
        case .notFitsss(let status):
            return "\(host) answered (\(status)), but it doesn’t have the Fitsss app API."
        case .unreachable(.appTransportSecurityRequiresSecureConnection):
            return "Plain http:// only works for local addresses. Use https:// for \(host)."
        case .unreachable(.timedOut):
            return "\(host) didn’t answer. Check the address, and that the server is running on the same Wi‑Fi."
        case .unreachable:
            return "Can’t reach \(host). Check the address, and that the server is running on the same Wi‑Fi."
        }
    }
}
