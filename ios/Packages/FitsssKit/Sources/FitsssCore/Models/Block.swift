import Foundation

/// A color as stored on a block. Palette colors carry their `paletteId`;
/// custom ones carry only their own hex. Mirrors `BlockColor` in
/// `src/domain/types.ts`.
nonisolated public struct BlockColor: Codable, Hashable, Sendable {
    public var name: String
    /// `#rrggbb`, lowercase.
    public var hex: String
    /// One of the catalog's `colorFamilies` ids.
    public var family: String
    public var paletteId: String?

    public init(name: String, hex: String, family: String, paletteId: String? = nil) {
        self.name = name
        self.hex = hex
        self.family = family
        self.paletteId = paletteId
    }

    public init(_ palette: PaletteColor) {
        self.init(name: palette.name, hex: palette.hex, family: palette.family, paletteId: palette.id)
    }
}

/// What the user chooses when creating or editing a piece; the body of
/// `POST /api/v1/blocks` and `PATCH /api/v1/blocks/:id`. The server validates
/// it against the catalog and derives everything else.
///
/// Vocabulary fields are plain strings because the vocabulary is data: read
/// the valid values for a type from `Catalog`, never hard-code them.
nonisolated public struct BlockInput: Codable, Hashable, Sendable {
    public var typeId: String
    public var color: BlockColor
    public var secondaryColor: BlockColor?
    /// One of the type's `fitOptions`. Required for garments.
    public var fit: String?
    /// One of the type's `variantOptions`. Required for footwear and accessories.
    public var variant: String?
    public var material: String?
    public var pattern: String
    /// Overrides the type's default weight.
    public var weight: String?
    /// How many near-identical pieces this block stands for, 1 to 99.
    public var quantity: Int
    public var nickname: String?
    public var notes: String?

    public init(
        typeId: String,
        color: BlockColor,
        secondaryColor: BlockColor? = nil,
        fit: String? = nil,
        variant: String? = nil,
        material: String? = nil,
        pattern: String = "solid",
        weight: String? = nil,
        quantity: Int = 1,
        nickname: String? = nil,
        notes: String? = nil
    ) {
        self.typeId = typeId
        self.color = color
        self.secondaryColor = secondaryColor
        self.fit = fit
        self.variant = variant
        self.material = material
        self.pattern = pattern
        self.weight = weight
        self.quantity = quantity
        self.nickname = nickname
        self.notes = notes
    }
}

/// A piece in the closet as the server returns it: the input plus the fields
/// the server derived (never compute those on the client).
nonisolated public struct Block: Codable, Identifiable, Hashable, Sendable {
    public var id: String
    public var typeId: String
    /// The built-in role, e.g. `top` or `footwear`. Not the filed-under category.
    public var category: String
    public var color: BlockColor
    public var secondaryColor: BlockColor?
    public var fit: String?
    public var variant: String?
    public var material: String?
    public var pattern: String
    public var weight: String?
    public var effectiveWeight: String
    public var quantity: Int
    public var nickname: String?
    public var notes: String?
    /// 1 to 5.
    public var warmth: Int
    /// 1 to 5.
    public var formality: Int
    public var seasons: [String]
    /// Lowercase one-liner, e.g. "white relaxed cotton t-shirt".
    public var label: String
    public var createdAt: Date
    public var updatedAt: Date
    public var archivedAt: Date?

    public var isArchived: Bool { archivedAt != nil }

    /// The editable part, for `PATCH`.
    public var input: BlockInput {
        BlockInput(
            typeId: typeId,
            color: color,
            secondaryColor: secondaryColor,
            fit: fit,
            variant: variant,
            material: material,
            pattern: pattern,
            weight: weight,
            quantity: quantity,
            nickname: nickname,
            notes: notes
        )
    }
}

/// `POST /api/v1/blocks` answers per index: some inputs may fail while the
/// rest are saved.
nonisolated public struct CreateBlocksResult: Decodable, Sendable {
    public struct Failure: Decodable, Sendable, Hashable {
        public var index: Int
        public var errors: [String]
    }

    public var created: [Block]
    public var failed: [Failure]
}

/// `GET /api/v1/me`.
nonisolated public struct User: Codable, Hashable, Sendable {
    public var id: String
    public var email: String
    public var name: String
    /// `user` or `admin`.
    public var role: String

    public var isAdmin: Bool { role == "admin" }
}
