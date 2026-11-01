import Foundation

/// The catalog as served by `GET /api/v1/catalog` (built by
/// `src/server/catalog-payload.ts`). It is the only source of vocabulary in
/// the app: categories, piece types and their options, labels, the palette,
/// and the drawing for every type and variant.
nonisolated public struct Catalog: Codable, Sendable {
    public var version: String
    public var categories: [CatalogCategory]
    public var types: [PieceType]
    public var fitLabels: [String: String]
    public var variantLabels: [String: String]
    public var materials: [Option]
    public var patterns: [Option]
    public var weights: [Option]
    public var colorFamilies: [Option]
    public var palette: [PaletteColor]
    public var art: [String: ArtPiece]
    /// What Today steers by. Optional so a catalog cached before these
    /// existed still decodes; read them through the accessors below.
    public var occasions: [Occasion]?
    public var weatherConditions: [Option]?
    public var dislikeReasons: [Option]?
    /// Outfit slots in display order, with the role that fills each.
    public var outfitSlots: [OutfitSlotInfo]?
    /// Packing for a trip. Optional like the others above.
    public var trips: TripVocabulary?

    /// An id with its display label, e.g. `("cotton", "Cotton")`.
    public struct Option: Codable, Hashable, Sendable, Identifiable {
        public var id: String
        public var label: String
    }
}

/// What a trip's days can be for, the bags, and the limits on dates.
nonisolated public struct TripVocabulary: Codable, Hashable, Sendable {
    /// `city`, `beach`, `outdoors`… each with a one-line hint.
    public var activities: [Occasion]
    /// `carry-on`, `checked`.
    public var luggage: [Occasion]
    /// A trip of up to this many nights defaults to a carry-on.
    public var carryOnMaxNights: Int
    public var maxDays: Int
    public var maxLeadDays: Int

    /// The bag a trip of `days` days gets unless the person picks one.
    public func defaultLuggage(days: Int) -> String {
        let id = days - 1 <= carryOnMaxNights ? "carry-on" : "checked"
        return luggage.contains { $0.id == id } ? id : luggage.first?.id ?? id
    }
}

nonisolated public struct Occasion: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var hint: String
}

nonisolated public struct OutfitSlotInfo: Codable, Hashable, Sendable, Identifiable {
    /// `top`, `layer`, `outerwear`, `bottom`, `fullbody` or `footwear`.
    public var id: String
    /// The role whose pieces fill it.
    public var role: String
}

/// A category as shown in the UI: one of the seven built-in ones (`id ==
/// role`) or one the user added, which behaves as its `role`.
nonisolated public struct CatalogCategory: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var label: String
    public var hint: String
    public var role: String
    public var custom: Bool
}

nonisolated public struct PieceType: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    /// Built-in role: `top`, `layer`, `outerwear`, `bottom`, `footwear`, `accessory`, `fullbody`.
    public var role: String
    /// The category it is filed under (a role, or a custom category slug).
    public var categoryId: String
    public var custom: Bool
    public var label: String
    public var plural: String
    /// Set for garments, which are described by a fit.
    public var fitOptions: [String]?
    /// Set for footwear and accessories, which are described by a variant.
    public var variantOptions: [String]?
    /// In display order; the first is the default.
    public var materialOptions: [String]
    public var defaultWeight: String
    /// Always contains `solid`.
    public var patternOptions: [String]
    /// Palette ids offered first in the color picker.
    public var suggestedColors: [String]
    public var art: ArtRef

    public struct ArtRef: Codable, Hashable, Sendable {
        /// Key into `Catalog.art`.
        public var `default`: String
        /// Only the variants that draw differently from `default`.
        public var variants: [String: String]?
    }

    /// True when the type is described by a fit rather than a variant.
    public var isGarment: Bool { fitOptions != nil }

    /// Fit ids for garments, variant ids otherwise.
    public var options: [String] { fitOptions ?? variantOptions ?? [] }
}

nonisolated public struct PaletteColor: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    public var name: String
    public var hex: String
    public var family: String
}

/// One drawing: the inner markup of an SVG in the `var(--icon-*)` convention,
/// plus its viewBox. Rendered by `GarmentArt`.
nonisolated public struct ArtPiece: Codable, Hashable, Sendable {
    public var viewBox: String
    public var body: String
}

// MARK: - Lookups

nonisolated public extension Catalog {
    func type(_ id: String) -> PieceType? { types.first { $0.id == id } }

    func category(_ id: String) -> CatalogCategory? { categories.first { $0.id == id } }

    /// Types filed under a category id, in catalog order.
    func types(inCategory id: String) -> [PieceType] { types.filter { $0.categoryId == id } }

    func paletteColor(_ id: String) -> PaletteColor? { palette.first { $0.id == id } }

    func palette(inFamily family: String) -> [PaletteColor] { palette.filter { $0.family == family } }

    /// The drawing for a type, honoring its variant. Nil only for an unknown type.
    func art(typeId: String, variant: String? = nil) -> (key: String, piece: ArtPiece)? {
        guard let type = type(typeId) else { return nil }
        let key = variant.flatMap { type.art.variants?[$0] } ?? type.art.default
        return art[key].map { (key, $0) }
    }

    func fitLabel(_ id: String) -> String { fitLabels[id] ?? humanize(id) }
    func variantLabel(_ id: String) -> String { variantLabels[id] ?? humanize(id) }
    func materialLabel(_ id: String) -> String { materials.first { $0.id == id }?.label ?? humanize(id) }
    func patternLabel(_ id: String) -> String { patterns.first { $0.id == id }?.label ?? humanize(id) }
    func weightLabel(_ id: String) -> String { weights.first { $0.id == id }?.label ?? humanize(id) }
    func familyLabel(_ id: String) -> String { colorFamilies.first { $0.id == id }?.label ?? humanize(id) }

    /// A fit label for garments, a variant label otherwise.
    func optionLabel(_ id: String, for type: PieceType) -> String {
        type.isGarment ? fitLabel(id) : variantLabel(id)
    }
}

/// "silk-scarf" -> "Silk scarf", for vocabulary with no label.
nonisolated func humanize(_ slug: String) -> String {
    let words = slug.replacingOccurrences(of: "-", with: " ").trimmingCharacters(in: .whitespaces)
    guard let first = words.first else { return slug }
    return first.uppercased() + words.dropFirst()
}

// MARK: - Outfit vocabulary

nonisolated public extension Catalog {
    var allOccasions: [Occasion] { occasions ?? [] }
    var allWeatherConditions: [Option] { weatherConditions ?? [] }
    var allDislikeReasons: [Option] { dislikeReasons ?? [] }
    var allOutfitSlots: [OutfitSlotInfo] { outfitSlots ?? [] }

    func occasionLabel(_ id: String) -> String { allOccasions.first { $0.id == id }?.label ?? humanize(id) }
    func weatherLabel(_ id: String) -> String { allWeatherConditions.first { $0.id == id }?.label ?? humanize(id) }

    /// The quiet second line under an outfit: "Everyday · Clean minimal · 21°".
    /// Missing parts are left out. Port of `outfitMeta` in `src/components/outfit/meta.ts`.
    func outfitMeta(occasion: String?, styleName: String?, weather: WeatherSnapshot?) -> String {
        var parts: [String] = []
        if let occasion, let match = allOccasions.first(where: { $0.id == occasion }) { parts.append(match.label) }
        if let styleName, !styleName.isEmpty { parts.append(styleName) }
        if let weather { parts.append(weather.temperatureText) }
        return parts.joined(separator: " · ")
    }
}
