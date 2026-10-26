import Observation

/// Requests other tabs make of Today, the native "Style this piece": the
/// Closet's piece detail pins a piece and asks for Today; the app switches
/// tabs, and Today generates around the pinned piece.
@MainActor
@Observable
public final class TodayIntents {
    /// The piece every outfit must include, until the user unpins it.
    public var pinnedBlockId: String?
    /// Bumped by `styleThis(_:)`; the app watches it to switch to Today.
    public private(set) var openRequests = 0
    /// Bumped by `openCloset()`, Today's way to the Closet when there is too
    /// little to style; the app watches it to switch to the Closet tab.
    public private(set) var closetRequests = 0

    public init() {}

    public func styleThis(_ blockId: String) {
        pinnedBlockId = blockId
        openRequests += 1
    }

    /// Asks the app for the Closet tab (Today's "Add pieces").
    public func openCloset() {
        closetRequests += 1
    }

    public func reset() {
        pinnedBlockId = nil
    }
}
