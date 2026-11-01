import FitsssCore
import FitsssUI
import Observation
import SwiftUI

// Trips: packing for a trip. Where you're going and when, the weather for
// every day, and one model call that packs a suitcase from the closet with an
// outfit a day. Then ticking pieces off, changing counts, swapping a day's
// piece, packing again.
//
// This module presents no tab of its own. The app hands its views to other
// features as builders (features never import each other):
//
//     TripsShelf          the Looks tab's Trips segment (routes `looks/trips…`
//                         are read by LooksScreen)
//     TripDetailScreen    one trip, pushed on the Looks stack, or inside the
//                         plan sheet with Done
//     PlanTripSheet       "Plan a trip": from the shelf's "+" (hands the new
//                         trip back) and Today's "Plan a trip" row (flows into
//                         the detail inside the sheet, which packs it)
//
// Routes (`-FitsssRoute`), read by the hosts:
//
//     looks/trips              the Trips shelf
//     looks/trips/new          the shelf with "Plan a trip" open
//     looks/trips/<tripId>     a trip's detail page
//     today/trip               Today with "Plan a trip" open

// MARK: - Words

/// Dates and short lines for a trip, formatted by the system for the
/// device's locale ("Sat, Nov 7 – Sat, Nov 14" in the US, "Sat 7 Nov – Sat
/// 14 Nov" in the UK).
nonisolated enum TripText {
    /// "Sat, Nov 7 – Sat, Nov 14".
    static func dateRange(_ trip: Trip) -> String {
        dateRange(from: trip.startDate, to: trip.endDate)
    }

    static func dateRange(from start: String, to end: String, now: Date = .now) -> String {
        guard let a = TripDay.date(from: start), let b = TripDay.date(from: end) else { return "\(start) – \(end)" }
        var style = Date.IntervalFormatStyle().weekday(.abbreviated).day().month(.abbreviated)
        // The year only when it isn't this one (or the trip crosses one).
        let years = Set([a, b, now].map { Calendar.current.component(.year, from: $0) })
        if years.count > 1 { style = style.year() }
        if a == b {
            var single = Date.FormatStyle().weekday(.abbreviated).day().month(.abbreviated)
            if years.count > 1 { single = single.year() }
            return a.formatted(single)
        }
        return (a..<b).formatted(style)
    }

    /// "8 days".
    static func length(days: Int) -> String {
        "\(days.formatted()) \(days == 1 ? "day" : "days")"
    }

    /// "8 days · 7 nights", for the plan sheet.
    static func lengthWithNights(days: Int) -> String {
        let nights = max(days - 1, 0)
        return "\(length(days: days)) · \(nights.formatted()) \(nights == 1 ? "night" : "nights")"
    }

    /// "Sat, Nov 7 – Sat, Nov 14 · 8 days", the detail's subtitle.
    static func subtitle(_ trip: Trip) -> String {
        "\(dateRange(trip)) · \(length(days: trip.dayCount))"
    }

    /// "Sat, Nov 7".
    static func dayTitle(_ date: String) -> String {
        guard let day = TripDay.date(from: date) else { return date }
        return day.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated))
    }

    /// "Saturday, November 7", for VoiceOver.
    static func dayTitleLong(_ date: String) -> String {
        guard let day = TripDay.date(from: date) else { return date }
        return day.formatted(.dateTime.weekday(.wide).day().month(.wide))
    }

    /// ("Nov", "7") for the shelf's date tile.
    static func monthAndDay(_ date: String) -> (month: String, day: String) {
        guard let day = TripDay.date(from: date) else { return ("", "") }
        return (day.formatted(.dateTime.month(.abbreviated)), day.formatted(.dateTime.day()))
    }

    /// "Sat".
    static func weekday(_ date: String) -> String {
        guard let day = TripDay.date(from: date) else { return "" }
        return day.formatted(.dateTime.weekday(.abbreviated))
    }

    /// "Lisbon, Portugal": the place with what tells it apart, the country
    /// first since the region is usually noise once chosen.
    static func placeLine(_ place: TripPlace) -> String {
        let tail = place.country ?? place.region
        guard let tail, !tail.isEmpty, tail != place.name else { return place.name }
        return "\(place.name), \(tail)"
    }

    /// "9 of 17 packed", "All packed", "Not packed yet".
    static func packedLine(_ trip: Trip) -> String {
        guard let plan = trip.plan else { return "Not packed yet" }
        let total = plan.packing.count
        let packed = plan.packedCount
        if total == 0 { return "Nothing to pack" }
        if packed == total { return "All packed" }
        return "\(packed.formatted()) of \(total.formatted()) packed"
    }

    /// "18–20°", the range of daytime highs.
    static func highsRange(_ days: [TripDayWeather]) -> String? {
        let highs = days.map { WeatherSnapshot.wholeDegrees($0.tempC) }
        guard let low = highs.min(), let high = highs.max() else { return nil }
        return low == high ? "\(high)°" : "\(low)–\(high)°"
    }

    /// The condition most days share, for one symbol at a glance.
    static func dominantCondition(_ days: [TripDayWeather]) -> String? {
        let counts = Dictionary(grouping: days, by: \.condition).mapValues(\.count)
        return counts.max { a, b in a.value == b.value ? a.key > b.key : a.value < b.value }?.key
    }

    static func degrees(_ value: Double) -> String { "\(WeatherSnapshot.wholeDegrees(value))°" }
}

/// SF Symbol per weather condition id. The conditions and their labels come
/// from the catalog; this only draws them (the same table as Today's).
nonisolated func weatherSymbol(_ condition: String) -> String {
    switch condition {
    case "clear": "sun.max"
    case "cloudy": "cloud"
    case "rain": "cloud.rain"
    case "snow": "snowflake"
    case "wind": "wind"
    case "storm": "cloud.bolt"
    default: "thermometer.medium"
    }
}

// MARK: - Catalog lookups

extension Catalog {
    /// "Outerwear", the category a piece's role is filed under.
    nonisolated func roleLabel(_ role: String) -> String {
        category(role)?.label ?? role.sentenceCased
    }

    nonisolated func activityLabel(_ id: String) -> String {
        trips?.activities.first { $0.id == id }?.label ?? id.sentenceCased
    }

    nonisolated func luggageLabel(_ id: String) -> String {
        trips?.luggage.first { $0.id == id }?.label ?? id.sentenceCased
    }
}

// MARK: - Errors

extension Error {
    /// The answer arrived after a sign-out, sign-in or server switch.
    var isSuperseded: Bool { (self as? APIError) == .superseded }

    /// Nothing to show: superseded, cancelled, or a lost session (the
    /// session store signs out).
    var isQuiet: Bool {
        if self is CancellationError { return true }
        guard let api = self as? APIError else { return false }
        return api == .superseded || api == .unauthorized
    }
}

extension APIError {
    /// The validator's messages for invalid input, a plain sentence otherwise.
    var displayMessage: String { errorDescription ?? "Something went wrong." }
}

// MARK: - Packing

/// Why packing failed, in the terms the detail acts on. `APIError` keeps
/// the status and the server's sentence, not its code, so the 409s and 503s
/// are told apart by what the sentence is about.
struct PackFailure: Equatable {
    enum Kind: Equatable {
        /// 409 `empty_closet` / `too_few_pieces`: the closet can't dress
        /// some day. Offer the closet.
        case closet
        /// 409 `trip_busy` (packed elsewhere right now, or too many at
        /// once) and 429 `rate_limited`: wait, then try again.
        case busy
        /// 503 `weather_failed`: nothing to do but try later.
        case weather
        /// 503 `not_configured`: no model on this server.
        case notConfigured
        /// 502 and the rest: worth another go.
        case retry
        case offline
    }

    var kind: Kind
    var message: String

    init(_ error: APIError) {
        message = error.displayMessage
        switch error {
        case .server(409, let message) where message.localizedCaseInsensitiveContains("closet"): kind = .closet
        case .server(409, _), .server(429, _): kind = .busy
        case .server(503, let message) where message.localizedCaseInsensitiveContains("weather"): kind = .weather
        case .server(503, _): kind = .notConfigured
        case .network: kind = .offline
        default: kind = .retry
        }
    }
}

/// Packing from anywhere (the plan sheet, the detail, Repack) goes through
/// here, so the outcome is kept per trip: the detail shows a failure even
/// when the screen that started the packing is gone, and a trip created by
/// the sheet is packed by whichever detail shows it first. Scoped to the
/// session: the app calls `reset()` on sign-out and server switch, and a
/// packing that finishes after that is ignored.
@MainActor
@Observable
public final class TripPacker {
    public static let shared = TripPacker()

    /// The last failure per trip, until the next attempt or a dismissal.
    private(set) var failures: [String: PackFailure] = [:]
    /// When the packing in progress started, per trip, for the progress
    /// line. A monotonic clock: the wall clock can be set back.
    private(set) var started: [String: ContinuousClock.Instant] = [:]
    /// Trips the plan sheet created: the detail packs them when it appears.
    private var pendingPacks: Set<String> = []
    /// Bumped by `reset()`; a packing from an older session changes nothing.
    private var epoch = 0

    func requestPack(_ id: String) { pendingPacks.insert(id) }

    /// True once per request.
    func consumePack(_ id: String) -> Bool { pendingPacks.remove(id) != nil }

    func dismissFailure(_ id: String) { failures[id] = nil }

    /// Forgets everything: the next session starts clean.
    public func reset() {
        failures = [:]
        started = [:]
        pendingPacks = []
        epoch &+= 1
    }

    /// Packs the trip and records how it went. Never throws: the detail
    /// reads `failures`. A second call while one runs joins it (the store
    /// shares the request).
    func pack(_ id: String, steer: String? = nil, trips: TripsStore) async {
        let epoch = self.epoch
        failures[id] = nil
        if started[id] == nil { started[id] = .now }
        defer {
            if self.epoch == epoch, !trips.packing.contains(id) { started[id] = nil }
        }
        do {
            try await trips.pack(id, steer: steer)
        } catch let error as APIError {
            guard self.epoch == epoch, !error.isQuiet else { return }
            failures[id] = PackFailure(error)
        } catch is CancellationError {
        } catch {
            guard self.epoch == epoch else { return }
            failures[id] = PackFailure(.network(error.localizedDescription))
        }
    }
}

// MARK: - Shared bits

/// The web's `RowIcon`: a small rounded square in `fill` with an ink glyph.
struct TripRowIcon: View {
    let systemName: String
    @ScaledMetric(relativeTo: .body) private var scaled: CGFloat = 30
    private var size: CGFloat { min(scaled, 40) }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.5, weight: .medium))
            .foregroundStyle(Color.fitsssLabel)
            .frame(width: size, height: size)
            .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: size * 0.23, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// The trailing chevron of a row that opens something.
struct RowChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.fitsssLabel3)
            .accessibilityHidden(true)
    }
}

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}
