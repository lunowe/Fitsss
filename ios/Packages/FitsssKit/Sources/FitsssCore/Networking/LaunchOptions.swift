import Foundation

/// Launch arguments for driving the app from the command line (simulator
/// screenshots, UI tests). Pass them to `xcrun simctl launch <device> <bundle>`
/// or set them in `XCUIApplication.launchArguments`.
///
///     -FitsssServer http://localhost:3100       which server to talk to
///     -FitsssLogin dev@fitsss.local:password    sign in on launch (debug builds only)
///     -FitsssRoute closet/add/top               open a screen directly (see each feature)
///     -FitsssTab closet                         select a tab
///
/// They are read through `UserDefaults`, which is how the system exposes
/// `-Key value` arguments, so `UserDefaults.standard.string(forKey:)` works too.
public enum LaunchOptions {
    public static var server: URL? {
        UserDefaults.standard.string(forKey: "FitsssServer").flatMap(URL.init(string:))
    }

    /// `(email, password)` from `-FitsssLogin`, debug builds only.
    public static var login: (email: String, password: String)? {
        #if DEBUG
        guard let raw = UserDefaults.standard.string(forKey: "FitsssLogin"),
              let colon = raw.firstIndex(of: ":") else { return nil }
        return (String(raw[..<colon]), String(raw[raw.index(after: colon)...]))
        #else
        return nil
        #endif
    }

    /// Slash-separated path from `-FitsssRoute`, e.g. `["closet", "add", "top"]`.
    public static var route: [String] {
        (UserDefaults.standard.string(forKey: "FitsssRoute") ?? "")
            .split(separator: "/")
            .map(String.init)
    }

    public static var tab: String? { UserDefaults.standard.string(forKey: "FitsssTab") }
}
