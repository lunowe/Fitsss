import Foundation

/// Where a trip goes, as picked from `GET /api/v1/places`. Mirrors
/// `TripPlace` in `src/domain/trip.ts`.
nonisolated public struct TripPlace: Codable, Hashable, Sendable, Identifiable {
    public var name: String
    /// State or region, e.g. "Lisbon District".
    public var region: String?
    public var country: String?
    /// ISO 3166-1 alpha-2, e.g. "PT".
    public var countryCode: String?
    public var lat: Double
    public var lon: Double
    /// IANA zone, e.g. "Europe/Lisbon".
    public var timezone: String

    public var id: String { "\(name)|\(lat)|\(lon)" }

    /// "Lisbon District, Portugal": what tells two Lisbons apart.
    public var detail: String {
        [region, country].compactMap { $0 }.filter { !$0.isEmpty && $0 != name }.joined(separator: ", ")
    }

    public init(name: String, region: String? = nil, country: String? = nil, countryCode: String? = nil, lat: Double, lon: Double, timezone: String) {
        self.name = name
        self.region = region
        self.country = country
        self.countryCode = countryCode
        self.lat = lat
        self.lon = lon
        self.timezone = timezone
    }
}

/// One day's weather: the forecast when it reaches that far, else what is
/// typical for the date (`isTypical`), which the screen must say.
nonisolated public struct TripDayWeather: Codable, Hashable, Sendable, Identifiable {
    /// `YYYY-MM-DD`.
    public var date: String
    /// Daytime high, °C.
    public var tempC: Double
    public var lowC: Double?
    public var feelsLikeC: Double?
    /// 0…100.
    public var precipitationChance: Double?
    /// `clear`, `cloudy`, `rain`, `snow`, `wind`, `storm`.
    public var condition: String
    /// `forecast` or `typical`.
    public var source: String

    public var id: String { date }
    public var isTypical: Bool { source == "typical" }
}

nonisolated public struct TripOptions: Codable, Hashable, Sendable {
    /// Ids from `Catalog.trips.activities`.
    public var activities: [String]
    /// `carry-on` or `checked`.
    public var luggage: String
    public var laundry: Bool
    public var styleId: String?
    /// The person's note, e.g. "a wedding on Saturday".
    public var steer: String?
}

/// One piece in the suitcase.
nonisolated public struct PackingItem: Codable, Hashable, Sendable, Identifiable {
    public var blockId: String
    /// How many to bring; never more than the piece's quantity.
    public var count: Int
    /// Ticked off while packing.
    public var packed: Bool

    public var id: String { blockId }
}

nonisolated public struct TripDayPlan: Codable, Hashable, Sendable, Identifiable {
    public var date: String
    public var outfit: Outfit

    public var id: String { date }
}

nonisolated public struct TripPlan: Codable, Hashable, Sendable {
    public var days: [TripDayPlan]
    /// Sorted by category: outerwear, layers, tops, full-body, bottoms, shoes, accessories.
    public var packing: [PackingItem]
    /// Up to four lines of advice for the whole trip.
    public var tips: [String]
    /// What the plan could not satisfy, in words ("…worn 5 days; you have 2").
    public var warnings: [String]

    public var packedCount: Int { packing.filter(\.packed).count }
}

/// `GET /api/v1/trips/:id`. Mirrors `Trip` in `src/domain/trip.ts`.
nonisolated public struct Trip: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var place: TripPlace
    /// `YYYY-MM-DD`, first day.
    public var startDate: String
    /// `YYYY-MM-DD`, last day (included).
    public var endDate: String
    public var options: TripOptions
    public var weather: [TripDayWeather]
    /// Nil until packed, or when packing failed.
    public var plan: TripPlan?
    public var model: String?
    public var createdAt: Date
    public var updatedAt: Date

    public var dayCount: Int { TripDay.days(from: startDate, to: endDate) + 1 }
    public var isPacked: Bool { plan != nil }

    /// Over once its last day is before `today` (`YYYY-MM-DD`).
    public func isPast(today: String) -> Bool { endDate < today }

    public func weather(on date: String) -> TripDayWeather? { weather.first { $0.date == date } }
}

/// Calendar days written `YYYY-MM-DD`, read and written in the Gregorian
/// calendar of the device's time zone (a trip's dates are wall dates, not
/// instants).
nonisolated public enum TripDay {
    private static func formatter() -> DateFormatter {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    public static func string(from date: Date) -> String { formatter().string(from: date) }

    /// Local midnight of that day, for date pickers and display.
    public static func date(from string: String) -> Date? { formatter().date(from: string) }

    public static func today(_ now: Date = .now) -> String { string(from: now) }

    /// Whole days from `from` to `to`, counted on the calendar in UTC: a
    /// zone whose midnight is skipped for daylight saving (Santiago) would
    /// otherwise lose a day.
    public static func days(from: String, to: String) -> Int {
        let formatter = formatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        guard let a = formatter.date(from: from), let b = formatter.date(from: to) else { return 0 }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar.dateComponents([.day], from: a, to: b).day ?? 0
    }

    /// Today's date at a destination, `YYYY-MM-DD`; the device's today when
    /// the zone is unknown.
    public static func today(in zone: String, now: Date = .now) -> String {
        let formatter = formatter()
        formatter.timeZone = TimeZone(identifier: zone) ?? .current
        return formatter.string(from: now)
    }

    /// The day `days` after `date`, `YYYY-MM-DD`.
    public static func adding(_ days: Int, to date: String) -> String {
        let formatter = formatter()
        formatter.timeZone = TimeZone(identifier: "UTC")
        guard let start = formatter.date(from: date) else { return date }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return formatter.string(from: calendar.date(byAdding: .day, value: days, to: start) ?? start)
    }
}

/// `POST /api/v1/trips`.
nonisolated public struct TripDraft: Encodable, Hashable, Sendable {
    public var place: TripPlace
    public var startDate: String
    public var endDate: String
    public var name: String?
    public var activities: [String]
    public var luggage: String
    public var laundry: Bool
    public var styleId: String?
    public var steer: String?

    public init(
        place: TripPlace, startDate: String, endDate: String, name: String? = nil, activities: [String] = [],
        luggage: String, laundry: Bool = false, styleId: String? = nil, steer: String? = nil
    ) {
        self.place = place
        self.startDate = startDate
        self.endDate = endDate
        self.name = name
        self.activities = activities
        self.luggage = luggage
        self.laundry = laundry
        self.styleId = styleId
        self.steer = steer
    }
}

/// `PATCH /api/v1/trips/:id`: only what is set changes. `clearsStyle` sends
/// `styleId: null`; `steer` set to "" clears the note.
nonisolated public struct TripPatch: Encodable, Hashable, Sendable {
    public var name: String?
    public var activities: [String]?
    public var luggage: String?
    public var laundry: Bool?
    public var styleId: String?
    public var clearsStyle = false
    public var steer: String?
    public var packed: [String: Bool]?
    public var counts: [String: Int]?

    public init(
        name: String? = nil, activities: [String]? = nil, luggage: String? = nil, laundry: Bool? = nil,
        styleId: String? = nil, clearsStyle: Bool = false, steer: String? = nil,
        packed: [String: Bool]? = nil, counts: [String: Int]? = nil
    ) {
        self.name = name
        self.activities = activities
        self.luggage = luggage
        self.laundry = laundry
        self.styleId = styleId
        self.clearsStyle = clearsStyle
        self.steer = steer
        self.packed = packed
        self.counts = counts
    }

    enum CodingKeys: String, CodingKey { case name, activities, luggage, laundry, styleId, steer, packed, counts }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(name, forKey: .name)
        try container.encodeIfPresent(activities, forKey: .activities)
        try container.encodeIfPresent(luggage, forKey: .luggage)
        try container.encodeIfPresent(laundry, forKey: .laundry)
        if clearsStyle { try container.encodeNil(forKey: .styleId) } else { try container.encodeIfPresent(styleId, forKey: .styleId) }
        try container.encodeIfPresent(steer, forKey: .steer)
        try container.encodeIfPresent(packed, forKey: .packed)
        try container.encodeIfPresent(counts, forKey: .counts)
    }
}
