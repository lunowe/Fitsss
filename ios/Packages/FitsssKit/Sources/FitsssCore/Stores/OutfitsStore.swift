import Foundation
import Observation

/// Outfit generation and everything around it on the server: the last set of
/// outfits, swapping a piece, feedback, and the forecast. The Today screen's
/// own state (style, occasion, steer text, weather override, location) lives
/// with the screen.
@MainActor
@Observable
public final class OutfitsStore {
    /// The set Today shows: the last one generated (or loaded on launch).
    public private(set) var current: GenerationResult?
    public private(set) var isGenerating = false

    /// A generation takes as long as the model does: tens of seconds, a
    /// minute on a slow day.
    public static let generationTimeout: TimeInterval = 120

    private let api: APIClient
    /// Swaps sent and not answered; while any is out, a refresh of the same
    /// set would show it without the swap.
    @ObservationIgnored private var swapsInFlight = 0

    public init(api: APIClient) {
        self.api = api
    }

    /// Comes back to the last set of outfits, if there is one.
    public func loadLatest() async {
        do {
            let latest: GenerationResult? = try await api.call(.get, "api/v1/generations/latest")
            guard !isGenerating, let latest else { return }
            if let current, latest.createdAt < current.createdAt { return }
            // A newer set, or the same set as the server has it now (a swap
            // whose answer was lost, or one made on another device), unless
            // a swap of ours is still on its way.
            if latest.id == current?.id, swapsInFlight > 0 { return }
            current = latest
        } catch {
            // Today just starts empty.
        }
    }

    /// Generates a new set and makes it current. Errors:
    /// - `.server(409, …)`: the closet can't support the request (empty, or
    ///   too few pieces for the weather); the message says what to add.
    /// - `.server(502, …)`: the model failed; worth retrying.
    /// - `.server(503, …)`: generation is not set up on the server.
    @discardableResult
    public func generate(_ request: GenerationRequest) async throws -> GenerationResult {
        isGenerating = true
        defer { isGenerating = false }
        let result: GenerationResult = try await api.call(
            .post, "api/v1/generations", body: request, timeout: Self.generationTimeout
        )
        current = result
        return result
    }

    /// Replaces one piece of one outfit in the current set. `slot` is an
    /// outfit slot id or `accessories` (then `from` names the accessory
    /// being replaced). The server records a "swapped" event.
    @discardableResult
    public func swap(outfitId: String, slot: String, to blockId: String, from fromBlockId: String? = nil) async throws -> Outfit {
        guard let generation = current else { throw APIError.notFound("No outfits to change") }
        swapsInFlight += 1
        defer { swapsInFlight -= 1 }
        let outfit: Outfit = try await api.call(
            .post, "api/v1/generations/\(generation.id)/swap",
            body: SwapBody(outfitId: outfitId, slot: slot, toBlockId: blockId, fromBlockId: fromBlockId)
        )
        if current?.id == generation.id, let index = current?.outfits.firstIndex(where: { $0.id == outfitId }) {
            current?.outfits[index] = outfit
        }
        return outfit
    }

    /// Feedback for taste learning (liked, disliked with a reason). Saving
    /// and wearing go through `LooksStore`, which records those itself.
    public func record(_ event: OutfitEvent) async throws {
        try await api.callVoid(.post, "api/v1/outfit-events", body: event)
    }

    /// Today's forecast for a place. Throws `.server(503, …)` when the
    /// weather service can't be reached; offer setting it by hand then.
    public func weather(latitude: Double, longitude: Double) async throws -> WeatherSnapshot {
        try await api.call(.get, "api/v1/weather", query: [
            // Plain decimals: `String(Double)` writes 9e-05 near the equator or
            // the prime meridian, which the server rightly refuses.
            URLQueryItem(name: "lat", value: String(format: "%.5f", latitude)),
            URLQueryItem(name: "lon", value: String(format: "%.5f", longitude)),
        ])
    }

    public func reset() {
        current = nil
        isGenerating = false
    }
}

nonisolated private struct SwapBody: Encodable {
    var outfitId: String
    var slot: String
    var toBlockId: String
    var fromBlockId: String?
}
