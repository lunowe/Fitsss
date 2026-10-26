import Foundation
import Security

/// The better-auth session token, kept in the Keychain.
///
/// One token per server, so switching between production and the local dev
/// server does not sign you out of either.
public struct TokenStore: Sendable {
    private let service = "app.fitsss.session"

    public init() {}

    public func token(for server: URL) -> String? {
        var query = baseQuery(server)
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public func setToken(_ token: String?, for server: URL) {
        let query = baseQuery(server)
        SecItemDelete(query as CFDictionary)
        guard let token, let data = token.data(using: .utf8) else { return }
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    private func baseQuery(_ server: URL) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: server.absoluteString,
        ]
    }
}
