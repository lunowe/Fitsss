import Foundation

/// A garment seen in an inspiration picture, in the closet's vocabulary.
/// Mirrors `InspoPiece` in `src/domain/inspo.ts`.
nonisolated public struct InspoPiece: Codable, Hashable, Sendable {
    /// A catalog category id.
    public var category: String
    /// The closest catalog piece type.
    public var typeId: String
    public var color: BlockColor
    public var secondaryColor: BlockColor?
    public var fit: String?
    public var variant: String?
    public var material: String?
    public var pattern: String
    /// 0 to 1: how sure the model is the piece is there and is this.
    public var confidence: Double
    /// Short free-text detail, e.g. "cropped, boxy, half-tucked".
    public var note: String?
}

/// What the model read from a picture.
nonisolated public struct InspoAnalysis: Codable, Hashable, Sendable {
    /// One sentence on the look as a whole.
    public var summary: String
    public var pieces: [InspoPiece]
    /// Three to six words: "relaxed", "monochrome", "workwear".
    public var vibe: [String]
    /// Dominant colors as hex, most prominent first.
    public var palette: [String]
    /// "loose top, straight leg, chunky shoe".
    public var silhouette: String
    /// 1 to 5.
    public var formality: Double
    /// Which model read it (`mock` with `LLM_MOCK`).
    public var model: String
}

/// A pictured piece matched to an owned one.
nonisolated public struct InspoPieceMatch: Codable, Hashable, Sendable {
    /// Index into `InspoAnalysis.pieces`.
    public var pieceIndex: Int
    public var blockId: String
    /// 0 to 1.
    public var score: Double
}

/// A pictured piece the closet has nothing for.
nonisolated public struct InspoGap: Codable, Hashable, Sendable {
    public var pieceIndex: Int
    /// What would fill it, in plain words: "a beige relaxed overshirt".
    public var description: String
}

/// The picture against the closet, as of the last analysis.
nonisolated public struct InspoMatch: Codable, Hashable, Sendable {
    public var matches: [InspoPieceMatch]
    public var gaps: [InspoGap]
    /// 0 to 1: the share of the pictured look the closet covers.
    public var coverage: Double
}

/// A saved inspiration picture (`/api/v1/inspos`). The bytes are fetched
/// separately (`InspoStore.imageData`).
nonisolated public struct Inspo: Codable, Hashable, Sendable, Identifiable {
    public var id: String
    /// The link it came from, when there was one (always http or https).
    public var sourceUrl: String?
    /// Server path of the bytes, `/api/v1/inspos/:id/image`.
    public var imageUrl: String
    public var width: Int
    public var height: Int
    /// Nil until read (`InspoStore.analyze`).
    public var analysis: InspoAnalysis?
    public var match: InspoMatch?
    /// The style it is filed under as a reference, if any.
    public var styleId: String?
    public var note: String?
    public var createdAt: Date
}

nonisolated public extension Inspo {
    /// What a picture goes by: its first three vibe words, title-cased
    /// ("Relaxed Monochrome Workwear"), or "Inspiration" before it is read.
    var name: String {
        let words = (analysis?.vibe ?? []).prefix(3)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { $0.prefix(1).uppercased() + $0.dropFirst() }
        return words.isEmpty ? "Inspiration" : words.joined(separator: " ")
    }

    /// Width over height, never zero or infinite.
    var aspectRatio: Double {
        guard width > 0, height > 0 else { return 4.0 / 5.0 }
        return min(max(Double(width) / Double(height), 0.2), 5)
    }
}

nonisolated public extension InspoMatch {
    /// "You own about 70% of this look."
    var coverageText: String {
        let percent = Int((min(max(coverage.isFinite ? coverage : 0, 0), 1) * 100).rounded())
        return "You own about \(percent)% of this look."
    }

    /// "close", "similar" or "loose", the web's words for a match score.
    static func matchWord(_ score: Double) -> String {
        score >= 0.8 ? "close" : score >= 0.55 ? "similar" : "loose"
    }
}
