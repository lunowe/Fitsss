import Foundation
import Security

/// The server and session token the share extension posts with, in a
/// Keychain access group the app and the extension both have.
///
/// The app writes it whenever someone is signed in and deletes it on
/// sign-out, so sharing to Fitsss works exactly while the app is signed in,
/// to the same server. The group comes from the `FitsssKeychainGroup`
/// Info.plist key (`$(AppIdentifierPrefix)com.lunowe.Fitsss.shared`); without
/// it (tests, previews) nothing is shared.
nonisolated public enum SharedCredentials {
    public struct Credentials: Codable, Sendable, Equatable {
        public var server: URL
        public var token: String
    }

    private static let service = "app.fitsss.share"
    private static let account = "current"

    public static var accessGroup: String? {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "FitsssKeychainGroup") as? String,
              !group.isEmpty, !group.hasPrefix("$(") else { return nil }
        return group
    }

    public static func load() -> Credentials? {
        guard var query = baseQuery() else { return nil }
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: data)
    }

    /// Replaces what is stored; nil deletes it.
    public static func save(_ credentials: Credentials?) {
        guard let query = baseQuery() else { return }
        guard let credentials, let data = try? JSONEncoder().encode(credentials) else {
            SecItemDelete(query as CFDictionary)
            return
        }
        if load() == credentials { return }
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    private static func baseQuery() -> [String: Any]? {
        guard let accessGroup else { return nil }
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecAttrAccessGroup as String: accessGroup,
        ]
    }
}
