import Foundation

/// Block ids per slot. Mirrors `OutfitSlots` in `src/domain/outfit.ts`:
/// either a top and a bottom or one full-body piece, always footwear, and up
/// to two accessories.
nonisolated public struct OutfitSlots: Codable, Hashable, Sendable {
    public var top: String?
    public var layer: String?
    public var outerwear: String?
    public var bottom: String?
    public var fullbody: String?
    public var footwear: String
    public var accessories: [String]

    public init(
        top: String? = nil, layer: String? = nil, outerwear: String? = nil, bottom: String? = nil,
        fullbody: String? = nil, footwear: String, accessories: [String] = []
    ) {
        self.top = top
        self.layer = layer
        self.outerwear = outerwear
        self.bottom = bottom
        self.fullbody = fullbody
        self.footwear = footwear
        self.accessories = accessories
    }

    /// The block in a slot id from `Catalog.outfitSlots` (not accessories).
    public subscript(slot: String) -> String? {
        switch slot {
        case "top": top
        case "layer": layer
        case "outerwear": outerwear
        case "bottom": bottom
        case "fullbody": fullbody
        case "footwear": footwear
        default: nil
        }
    }

    /// Every block id in the outfit, slots first, then accessories.
    public var blockIds: [String] {
        [top, layer, outerwear, bottom, fullbody, footwear].compactMap { $0 } + accessories
    }
}

/// One outfit as generated or saved.
nonisolated public struct Outfit: Codable, Hashable, Sendable, Identifiable {
    /// Stable within its generation.
    public var id: String
    public var name: String
    public var slots: OutfitSlots
    /// One or two sentences on why it works.
    public var why: String
    public var tip: String?

    public init(id: String, name: String, slots: OutfitSlots, why: String, tip: String? = nil) {
        self.id = id
        self.name = name
        self.slots = slots
        self.why = why
        self.tip = tip
    }
}

/// What the generator knows about today's weather: from the forecast
/// (`GET /api/v1/weather`) or set by hand.
nonisolated public struct WeatherSnapshot: Codable, Hashable, Sendable {
    public var tempC: Double
    public var feelsLikeC: Double?
    public var lowC: Double?
    /// 0 to 100.
    public var precipitationChance: Double?
    /// One of the catalog's `weatherConditions` ids.
    public var condition: String
    /// `forecast` or `manual`.
    public var source: String
    /// A place name from geocoding, when known.
    public var place: String?

    public init(
        tempC: Double, feelsLikeC: Double? = nil, lowC: Double? = nil, precipitationChance: Double? = nil,
        condition: String, source: String, place: String? = nil
    ) {
        self.tempC = tempC
        self.feelsLikeC = feelsLikeC
        self.lowC = lowC
        self.precipitationChance = precipitationChance
        self.condition = condition
        self.source = source
        self.place = place
    }
}

nonisolated public extension WeatherSnapshot {
    /// "21°". `Int(_:)` traps on values outside its range, and the API has
    /// stored absurd temperatures before, so clamp first.
    var temperatureText: String { "\(Self.wholeDegrees(tempC))°" }

    static func wholeDegrees(_ value: Double) -> Int {
        guard value.isFinite else { return 0 }
        return Int(min(max(value, -999), 999).rounded())
    }
}

/// The body of `POST /api/v1/generations`.
nonisolated public struct GenerationRequest: Codable, Hashable, Sendable {
    public var styleId: String?
    /// One of the catalog's `occasions` ids.
    public var occasion: String
    public var weather: WeatherSnapshot
    /// Free text for the day's mood, at most 200 characters.
    public var steer: String?
    /// 1 to 5.
    public var count: Int
    /// Block ids every outfit must include.
    public var pinned: [String]
    /// Block ids no outfit may use.
    public var excluded: [String]
    public var inspoId: String?

    public init(
        styleId: String? = nil, occasion: String, weather: WeatherSnapshot, steer: String? = nil,
        count: Int = 3, pinned: [String] = [], excluded: [String] = [], inspoId: String? = nil
    ) {
        self.styleId = styleId
        self.occasion = occasion
        self.weather = weather
        self.steer = steer
        self.count = count
        self.pinned = pinned
        self.excluded = excluded
        self.inspoId = inspoId
    }
}

/// A set of outfits as `POST /api/v1/generations` stored it.
nonisolated public struct GenerationResult: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var request: GenerationRequest
    public var outfits: [Outfit]
    /// Pieces the weather filter left out before the model saw the closet.
    public var filteredOutCount: Int
    public var model: String
    public var createdAt: Date
}

/// A saved outfit (`/api/v1/looks`).
nonisolated public struct Look: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var slots: OutfitSlots
    public var why: String
    public var tip: String?
    public var styleId: String?
    public var occasion: String?
    public var weather: WeatherSnapshot?
    public var generationId: String?
    public var wornCount: Int
    public var lastWornAt: Date?
    public var createdAt: Date

    /// The look as an outfit, for feedback events and the flat lay.
    public var outfit: Outfit { Outfit(id: id, name: name, slots: slots, why: why, tip: tip) }
}

/// A style the user wears (`/api/v1/styles`).
nonisolated public struct Style: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var description: String
    /// Hard rules, one per line.
    public var rules: String?
    public var sortOrder: Int
    public var createdAt: Date
    public var updatedAt: Date
}

/// The body of `POST`/`PATCH /api/v1/styles`.
nonisolated public struct StyleInput: Codable, Hashable, Sendable {
    public var name: String
    public var description: String
    public var rules: String?

    public init(name: String, description: String, rules: String? = nil) {
        self.name = name
        self.description = description
        self.rules = rules
    }
}

/// Feedback on an outfit (`POST /api/v1/outfit-events`), for taste learning.
nonisolated public struct OutfitEvent: Encodable, Sendable {
    /// `saved`, `liked`, `disliked`, `worn`, `swapped` or `unsaved`.
    public var type: String
    public var outfit: Outfit
    /// Required for `disliked`: one of the catalog's `dislikeReasons` ids.
    public var reason: String?
    public var styleId: String?
    public var occasion: String?
    public var generationId: String?
    public var lookId: String?

    public init(
        type: String, outfit: Outfit, reason: String? = nil, styleId: String? = nil,
        occasion: String? = nil, generationId: String? = nil, lookId: String? = nil
    ) {
        self.type = type
        self.outfit = outfit
        self.reason = reason
        self.styleId = styleId
        self.occasion = occasion
        self.generationId = generationId
        self.lookId = lookId
    }
}
