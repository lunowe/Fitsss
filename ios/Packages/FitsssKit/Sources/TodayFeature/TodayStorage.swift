import FitsssCore
import Foundation

/// The steering Today remembers between visits, the port of `TodayPrefs` in
/// `src/components/today/prefs.ts`.
nonisolated struct TodayPrefs: Codable, Hashable, Sendable {
    /// nil means "Any style".
    var styleId: String?
    /// One of the catalog's `occasions` ids; nil only before the catalog is known.
    var occasion: String?
}

/// The two things Today keeps on the device, like the web's localStorage:
/// the last weather snapshot (so the screen fills in before CoreLocation
/// answers) and the style and occasion the user last picked.
///
/// Keyed by server *and* user, so another account on the same phone, or the
/// same account on another server, starts from its own choices. Every read is
/// defensive: the stored value can be stale or from an older build.
struct TodayStorage {
    /// A cached forecast older than this is fetched again. A snapshot set by
    /// hand holds until the user changes it, as on the web.
    static let forecastMaxAge: TimeInterval = 30 * 60

    let scope: String
    private let defaults: UserDefaults

    init(server: URL, userId: String, defaults: UserDefaults = .standard) {
        self.scope = "\(server.absoluteString)|\(userId)"
        self.defaults = defaults
    }

    private var prefsKey: String { "fitsss.today.prefs|\(scope)" }
    private var weatherKey: String { "fitsss.today.weather|\(scope)" }
    private var nopedKey: String { "fitsss.today.noped|\(scope)" }

    /// Cards the user marked Nope (by card key), so a relaunch doesn't offer
    /// the same Nope again and record the same taste signal twice. Only the
    /// most recent ones are kept; older sets are not shown anyway.
    func noped() -> Set<String> {
        Set(defaults.stringArray(forKey: nopedKey) ?? [])
    }

    /// Records changes in the order they happen, keeping the newest 60.
    func updateNoped(added: Set<String>, removed: Set<String>) {
        var keys = (defaults.stringArray(forKey: nopedKey) ?? []).filter { !removed.contains($0) && !added.contains($0) }
        keys.append(contentsOf: added.sorted())
        defaults.set(Array(keys.suffix(60)), forKey: nopedKey)
    }

    func prefs() -> TodayPrefs? {
        guard let data = defaults.data(forKey: prefsKey) else { return nil }
        return try? JSONDecoder().decode(TodayPrefs.self, from: data)
    }

    func setPrefs(_ prefs: TodayPrefs) {
        guard let data = try? JSONEncoder().encode(prefs) else { return }
        defaults.set(data, forKey: prefsKey)
    }

    /// The cached snapshot, or nil when there is none or the forecast went stale.
    func weather(now: Date = .now) -> WeatherSnapshot? {
        guard let data = defaults.data(forKey: weatherKey),
              let stored = try? JSONDecoder().decode(StoredWeather.self, from: data),
              stored.weather.tempC.isFinite else { return nil }
        if stored.weather.source != "manual", now.timeIntervalSince(stored.at) > Self.forecastMaxAge { return nil }
        return stored.weather
    }

    func setWeather(_ weather: WeatherSnapshot, at date: Date = .now) {
        guard let data = try? JSONEncoder().encode(StoredWeather(at: date, weather: weather)) else { return }
        defaults.set(data, forKey: weatherKey)
    }
}

nonisolated private struct StoredWeather: Codable {
    var at: Date
    var weather: WeatherSnapshot
}
