import Foundation

/// One observation about the person's taste. Mirrors `TasteLine` in
/// `src/lib/taste/types.ts`.
nonisolated public struct TasteLine: Codable, Hashable, Sendable, Identifiable {
    /// Derived from the text, so it stays the same across refreshes.
    public var id: String
    public var text: String
    /// `learned` (from feedback) or `user` (typed by the person; a refresh
    /// never replaces it).
    public var source: String
    /// How many choices back a learned line.
    public var evidence: Double?
    public var createdAt: Date?

    public var isUserStated: Bool { source == "user" }
}

/// How much one piece is reached for (score above 0) or skipped (below).
nonisolated public struct BlockAffinity: Codable, Hashable, Sendable {
    public var blockId: String
    public var score: Double
}

/// Taste for one scope: overall (`styleId` nil) or one style.
nonisolated public struct TasteProfile: Codable, Hashable, Sendable {
    public var styleId: String?
    /// Things this person tends to like.
    public var lines: [TasteLine]
    /// Things to avoid.
    public var avoid: [TasteLine]
    /// Choices considered at the last refresh.
    public var eventCount: Int
    /// Choices there are now.
    public var totalEvents: Int
    public var lastRefreshedAt: Date?
    /// Most reached-for pieces first, at most eight.
    public var favorites: [BlockAffinity]
    /// Most skipped first, at most eight.
    public var skipped: [BlockAffinity]

    public init(styleId: String?, totalEvents: Int = 0) {
        self.styleId = styleId
        self.lines = []
        self.avoid = []
        self.eventCount = 0
        self.totalEvents = totalEvents
        self.lastRefreshedAt = nil
        self.favorites = []
        self.skipped = []
    }
}

/// `GET /api/v1/taste`: overall, and one profile per active style.
nonisolated public struct TasteOverview: Codable, Hashable, Sendable {
    public var overall: TasteProfile
    public var byStyle: [String: TasteProfile]
    /// Every choice recorded, all scopes.
    public var totalEvents: Int

    /// Lines in every scope, liked and avoided: what the app currently believes.
    public var learnedLineCount: Int {
        ([overall] + Array(byStyle.values)).reduce(0) { $0 + $1.lines.count + $1.avoid.count }
    }
}
