import Foundation

/// Display strings for a piece, ported from `src/components/closet/labels.ts`
/// so tiles read the same on the web and on the phone.
nonisolated public extension Catalog {
    /// "T-shirt".
    func typeLabel(of block: Block) -> String { type(block.typeId)?.label ?? block.typeId }

    /// The fit for garments, the variant otherwise. Empty when there is neither.
    func variationLabel(fit: String?, variant: String?) -> String {
        if let fit { return fitLabel(fit) }
        if let variant { return variantLabel(variant) }
        return ""
    }

    /// "T-shirt · Relaxed", a tile's first line.
    func headline(typeId: String, fit: String?, variant: String?) -> String {
        let typeLabel = type(typeId)?.label ?? typeId
        let variation = variationLabel(fit: fit, variant: variant)
        return variation.isEmpty ? typeLabel : "\(typeLabel) · \(variation)"
    }

    func headline(of block: Block) -> String {
        headline(typeId: block.typeId, fit: block.fit, variant: block.variant)
    }

    /// "White · Cotton" or "Navy / White · Cotton", a tile's second line.
    func colorLine(color: BlockColor, secondaryColor: BlockColor?, material: String?) -> String {
        let colors = secondaryColor.map { "\(color.name) / \($0.name)" } ?? color.name
        guard let material else { return colors }
        return "\(colors) · \(materialLabel(material))"
    }

    func colorLine(of block: Block) -> String {
        colorLine(color: block.color, secondaryColor: block.secondaryColor, material: block.material)
    }

    /// Lowercased text a closet search matches against.
    func searchHaystack(of block: Block) -> String {
        [
            block.label,
            block.nickname ?? "",
            block.color.name,
            block.secondaryColor?.name ?? "",
            typeLabel(of: block),
            variationLabel(fit: block.fit, variant: block.variant),
            block.material.map(materialLabel) ?? "",
        ]
        .joined(separator: " ")
        .lowercased()
    }
}

nonisolated public extension String {
    /// "black leather chelsea boots" -> "Black leather chelsea boots".
    var sentenceCased: String {
        guard let first else { return self }
        return first.uppercased() + dropFirst()
    }
}

nonisolated public extension String {
    /// Length the way the server's text limits count it (40 for color names,
    /// 60 for nicknames and look names, 500 for notes, 200 for the steer):
    /// code points, `Array.from(text).length` in JavaScript.
    var serverLength: Int { unicodeScalars.count }

    /// The longest prefix of whole characters (as people see them: a flag or
    /// a family emoji is one) within `limit` code points, so text cut here
    /// is stored exactly as typed and never ends in half a character.
    func prefix(serverLimit limit: Int) -> String {
        guard serverLength > limit else { return self }
        var count = 0
        var end = startIndex
        for index in indices {
            let width = self[index].unicodeScalars.count
            if count + width > limit { break }
            count += width
            end = self.index(after: index)
        }
        return String(self[..<end])
    }
}
