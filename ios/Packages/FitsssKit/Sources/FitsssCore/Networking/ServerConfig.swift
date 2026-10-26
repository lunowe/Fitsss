import Foundation

/// Which Fitsss server the app talks to.
///
/// Production by default on a device; the local dev server (`pnpm dev` on the
/// Mac, port 3100) by default in the simulator. The choice is stored in user
/// defaults and can be changed on the You screen; the `-FitsssServer <url>`
/// launch argument overrides both.
public enum ServerConfig {
    public static let production = URL(string: "https://fitsss-production.up.railway.app")!
    public static let local = URL(string: "http://localhost:3100")!

    private static let defaultsKey = "fitsss.serverURL"

    public static var defaultURL: URL {
        #if targetEnvironment(simulator)
        local
        #else
        production
        #endif
    }

    /// The URL to use right now.
    public static var current: URL {
        if let override = LaunchOptions.server { return override }
        if let stored = UserDefaults.standard.string(forKey: defaultsKey), let url = URL(string: stored) {
            return url
        }
        return defaultURL
    }

    /// Persists a choice. Pass nil to go back to the default.
    public static func set(_ url: URL?) {
        if let url {
            UserDefaults.standard.set(url.absoluteString, forKey: defaultsKey)
        } else {
            UserDefaults.standard.removeObject(forKey: defaultsKey)
        }
    }
}
