import FitsssCore
import Foundation

// The cart model for the add flow, ported from
// `src/components/closet/add/cart.ts` (tests: `cart.test.ts`, ported to
// `Tests/AddFlowFeatureTests/CartTests.swift`).
//
// The configurator produces a cartesian product of what the user picked
// (colors x fits/variants x materials). Each combination becomes a cart line;
// adding an identical line again merges by incrementing its quantity.
//
// Plain values, no SwiftUI, so the tests run without a host app.

/// A cart line's attributes: a `BlockInput` without its quantity.
nonisolated public struct CartInput: Codable, Hashable, Sendable {
    public var typeId: String
    public var color: BlockColor
    public var secondaryColor: BlockColor?
    public var fit: String?
    public var variant: String?
    public var material: String?
    public var pattern: String
    public var weight: String?
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
        self.nickname = nickname
        self.notes = notes
    }

    /// The input the server takes, with the line's quantity folded back in.
    public func blockInput(quantity: Int) -> BlockInput {
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

nonisolated public struct CartLine: Hashable, Sendable, Identifiable {
    /// Stable identity of the attribute combination; see `Cart.lineKey`.
    public var key: String
    public var input: CartInput
    public var quantity: Int
    /// Why the server rejected this line on the last save, if it did. Not persisted.
    public var errors: [String] = []

    public var id: String { key }

    public init(input: CartInput, quantity: Int, errors: [String] = []) {
        self.key = Cart.lineKey(input)
        self.input = input
        self.quantity = quantity
        self.errors = errors
    }
}

/// What the configurator holds while the user is choosing.
nonisolated public struct Draft: Hashable, Sendable {
    public var typeId: String
    public var colors: [BlockColor]
    /// Fit ids for garments, variant ids for footwear and accessories.
    public var options: [String]
    public var materials: [String]
    public var pattern: String
    public var weight: String?
    public var nickname: String?
    public var notes: String?

    public init(
        typeId: String,
        colors: [BlockColor] = [],
        options: [String] = [],
        materials: [String] = [],
        pattern: String = "solid",
        weight: String? = nil,
        nickname: String? = nil,
        notes: String? = nil
    ) {
        self.typeId = typeId
        self.colors = colors
        self.options = options
        self.materials = materials
        self.pattern = pattern
        self.weight = weight
        self.nickname = nickname
        self.notes = notes
    }

    /// How many pieces this draft would create. Correct when no material is picked.
    public var count: Int { colors.count * options.count * max(materials.count, 1) }

    /// Trimmed and cut to the server's limit, or nil when nothing is left.
    private static func serverText(limit: Int) -> (String) -> String? {
        { value in
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines).prefix(serverLimit: limit)
            return trimmed.isEmpty ? nil : trimmed
        }
    }

    /// One input per attribute combination, colors outermost, then options,
    /// then materials. No material picked leaves `material` unset.
    public func expand(usesFit: Bool) -> [CartInput] {
        let materials: [String?] = self.materials.isEmpty ? [nil] : self.materials.map(Optional.some)
        var out: [CartInput] = []
        for color in colors {
            for option in options {
                for material in materials {
                    out.append(CartInput(
                        typeId: typeId,
                        color: color,
                        fit: usesFit ? option : nil,
                        variant: usesFit ? nil : option,
                        material: material,
                        pattern: pattern,
                        weight: weight.flatMap { $0.isEmpty ? nil : $0 },
                        nickname: nickname.flatMap(Self.serverText(limit: Cart.nicknameLimit)),
                        notes: notes.flatMap(Self.serverText(limit: Cart.notesLimit))
                    ))
                }
            }
        }
        return out
    }
}

/// The cart: lines in the order they were first added.
nonisolated public struct Cart: Hashable, Sendable {
    public static let maxQuantity = 99
    /// Lines one cart may hold; the server takes at most 500 pieces per save.
    public static let maxLines = 500
    /// The server's limits (`src/domain/validate.ts`), in UTF-16 units like
    /// its `slice`, so it never has to cut a character in half.
    public static let colorNameLimit = 40
    public static let nicknameLimit = 60
    public static let notesLimit = 500

    public private(set) var lines: [CartLine]

    public init(lines: [CartLine] = []) {
        self.lines = lines
    }

    public var isEmpty: Bool { lines.isEmpty }

    /// Total number of pieces, i.e. the sum of every line's quantity.
    public var count: Int { lines.reduce(0) { $0 + $1.quantity } }

    /// Identity of a color for selection state: palette id, or hex + name for customs.
    public static func colorKey(_ color: BlockColor) -> String {
        if let paletteId = color.paletteId { return "p:\(paletteId)" }
        return "c:\(ColorMath.normalizeHex(color.hex) ?? color.hex.lowercased()):\(color.name.lowercased())"
    }

    /// Stable identity of a cart line. Two inputs that differ in nothing a
    /// block stores share a key and therefore merge into one line.
    public static func lineKey(_ input: CartInput) -> String {
        let parts: [String?] = [
            input.typeId,
            colorKey(input.color),
            input.secondaryColor.map(colorKey),
            input.fit,
            input.variant,
            input.material,
            input.pattern,
            input.weight,
            input.nickname,
            input.notes,
        ]
        // JSON keeps free text (nickname, notes) from colliding with the separators.
        let data = (try? JSONEncoder().encode(parts)) ?? Data()
        return String(decoding: data, as: UTF8.self)
    }

    /// Appends inputs, merging identical lines by quantity (capped at 99).
    /// New lines past `maxLines` are left out.
    public mutating func add(_ inputs: [CartInput]) {
        var positions = Dictionary(lines.enumerated().map { ($1.key, $0) }, uniquingKeysWith: { first, _ in first })
        for input in inputs {
            let key = Self.lineKey(input)
            if let at = positions[key] {
                lines[at].quantity = min(Self.maxQuantity, lines[at].quantity + 1)
            } else if lines.count < Self.maxLines {
                positions[key] = lines.count
                lines.append(CartLine(input: input, quantity: 1))
            }
        }
    }

    /// Sets a line's quantity, capped at 99. Anything below 1 removes the line.
    public mutating func setQuantity(_ quantity: Int, forLine key: String) {
        if quantity < 1 {
            remove(key)
            return
        }
        guard let index = lines.firstIndex(where: { $0.key == key }) else { return }
        lines[index].quantity = min(Self.maxQuantity, quantity)
    }

    public mutating func remove(_ key: String) {
        lines.removeAll { $0.key == key }
    }

    public mutating func clear() {
        lines = []
    }

    /// The lines as `BlockInput`s, ready for `ClosetStore.create`. Index `i`
    /// of the result is line `i`, which is how the server reports failures.
    public var inputs: [BlockInput] {
        lines.map { $0.input.blockInput(quantity: $0.quantity) }
    }

    /// Lines bucketed by the category their type is filed under (a built-in
    /// one or a custom one), groups in order of first appearance.
    public func grouped(in catalog: Catalog) -> [CartGroup] {
        var groups: [CartGroup] = []
        var positions: [String: Int] = [:]
        for line in lines {
            let categoryId = catalog.type(line.input.typeId)?.categoryId ?? ""
            if let at = positions[categoryId] {
                groups[at].lines.append(line)
            } else {
                positions[categoryId] = groups.count
                groups.append(CartGroup(categoryId: categoryId, lines: [line]))
            }
        }
        return groups
    }

    /// Drops lines whose type the catalog no longer has (a custom type that
    /// was deleted). Returns true when anything was dropped.
    @discardableResult
    public mutating func prune(using catalog: Catalog) -> Bool {
        let before = lines.count
        lines.removeAll { catalog.type($0.input.typeId) == nil }
        return lines.count != before
    }
}

nonisolated public struct CartGroup: Hashable, Sendable, Identifiable {
    /// The filed-under category id; empty for a type the catalog does not know.
    public var categoryId: String
    public var lines: [CartLine]

    public var id: String { categoryId }
}

// MARK: - Persistence

nonisolated public extension Cart {
    /// What is stored: attributes and quantity. Keys are recomputed on restore,
    /// so a change to `lineKey` can never leave stale identities behind.
    private struct StoredLine: Codable {
        var input: CartInput
        var quantity: Int
    }

    /// Decodes one entry at a time so a single broken one is dropped instead
    /// of failing the whole cart.
    private struct Lenient: Decodable {
        var line: StoredLine?

        init(from decoder: any Decoder) throws {
            line = try? StoredLine(from: decoder)
        }
    }

    func encoded() -> Data {
        (try? JSONEncoder().encode(lines.map { StoredLine(input: $0.input, quantity: $0.quantity) })) ?? Data()
    }

    /// Restores a stored cart. Anything unrecognisable is dropped rather than
    /// throwing (bad JSON, broken colors, quantities outside 1...99, empty
    /// type ids, and, when a catalog is given, types it does not know), so a
    /// stale payload can never break the flow. Identical lines merge.
    static func restore(from data: Data, catalog: Catalog? = nil) -> Cart {
        guard let entries = try? JSONDecoder().decode([Lenient].self, from: data) else { return Cart() }
        var cart = Cart()
        for entry in entries {
            guard let stored = entry.line,
                  !stored.input.typeId.isEmpty,
                  ColorMath.normalizeHex(stored.input.color.hex) != nil,
                  (1...maxQuantity).contains(stored.quantity)
            else { continue }
            if let catalog, catalog.type(stored.input.typeId) == nil { continue }
            var input = stored.input
            input.color.hex = ColorMath.normalizeHex(input.color.hex) ?? input.color.hex
            if let secondary = input.secondaryColor {
                input.secondaryColor?.hex = ColorMath.normalizeHex(secondary.hex) ?? secondary.hex
            }
            let key = lineKey(input)
            if let index = cart.lines.firstIndex(where: { $0.key == key }) {
                cart.lines[index].quantity = min(maxQuantity, cart.lines[index].quantity + stored.quantity)
            } else {
                cart.lines.append(CartLine(input: input, quantity: stored.quantity))
            }
        }
        return cart
    }
}

// MARK: - Saves in flight

/// A batch that was sent and whose answer has not been seen yet: the exact
/// lines, and the idempotency key they were sent with.
///
/// It is persisted with the cart and never edited. When the answer is lost (a
/// dropped connection, the app killed mid-request) the *same* batch is sent
/// again with the *same* key, and the server answers with the first result
/// instead of storing the pieces twice. Nothing is ever inferred from what the
/// closet happens to contain.
nonisolated public struct PendingSave: Codable, Equatable, Sendable {
    public struct Line: Codable, Equatable, Sendable {
        public var input: CartInput
        public var quantity: Int
    }

    /// Sent as `Idempotency-Key`.
    public var key: String
    /// Index `i` is input `i` of the request, which is how the server reports failures.
    public var lines: [Line]
    public var startedAt: Date

    /// Pieces in the batch.
    public var count: Int { lines.reduce(0) { $0 + $1.quantity } }

    public var inputs: [BlockInput] { lines.map { $0.input.blockInput(quantity: $0.quantity) } }

    /// The batch as cart lines, for showing it and for putting it back.
    public var cartLines: [CartLine] { lines.map { CartLine(input: $0.input, quantity: $0.quantity) } }

    /// The lines the server rejected (by index), each with its reasons.
    public func rejectedLines(_ failures: [CreateBlocksResult.Failure]) -> [CartLine] {
        let errorsByIndex = Dictionary(failures.map { ($0.index, $0.errors) }, uniquingKeysWith: +)
        return lines.enumerated().compactMap { index, line in
            guard let errors = errorsByIndex[index] else { return nil }
            var rejected = CartLine(input: line.input, quantity: line.quantity)
            rejected.errors = errors
            return rejected
        }
    }
}

nonisolated public extension Cart {
    /// Moves the first `limit` lines into a new pending save, or returns nil
    /// when there is nothing to send. `skippingRejected` leaves lines the
    /// server just rejected (those with errors) in the cart, so one save can
    /// carry on with the rest instead of sending them again.
    mutating func submit(
        key: String = UUID().uuidString, at date: Date = .now, limit: Int = .max, skippingRejected: Bool = false
    ) -> PendingSave? {
        let chosen = Array(lines.indices.filter { !skippingRejected || lines[$0].errors.isEmpty }.prefix(limit))
        guard !chosen.isEmpty else { return nil }
        let taken = Set(chosen)
        let pending = PendingSave(
            key: key,
            lines: chosen.map { PendingSave.Line(input: lines[$0].input, quantity: lines[$0].quantity) },
            startedAt: date
        )
        lines = lines.indices.filter { !taken.contains($0) }.map { lines[$0] }
        return pending
    }

    /// Puts lines back after the server refused them, merging with identical
    /// lines added in the meantime (quantities add up, capped at 99) and
    /// keeping the server's reasons.
    mutating func putBack(_ returning: [CartLine]) {
        for line in returning {
            if let index = lines.firstIndex(where: { $0.key == line.key }) {
                lines[index].quantity = min(Self.maxQuantity, lines[index].quantity + line.quantity)
                lines[index].errors = line.errors
            } else {
                lines.append(line)
            }
        }
    }
}
