import FitsssCore
import FitsssUI
import Foundation
import Observation

/// Why generating failed, in the terms the screen acts on.
struct GenerationFailure: Equatable {
    enum Kind: Equatable {
        /// 409: the closet can't support the request. Offer the closet (and
        /// the weather sheet, when the weather filter is what left too little).
        case closet
        /// 502 and other server answers: worth another go.
        case retry
        /// 503: no model is set up on this server.
        case notConfigured
        /// No connection or a timeout.
        case offline
    }

    var kind: Kind
    var message: String
}

/// Today's own state, the native `TodayScreen.tsx`: steering, weather,
/// the generation in flight and what the user did with each card. The
/// outfits themselves live in `OutfitsStore` (shared with the app), saved
/// looks in `LooksStore`.
///
/// Lives in the screen's `@State`, so it survives switching tabs: a
/// generation started here keeps going when the user leaves, and its result
/// lands in `OutfitsStore.current` whether or not Today is on screen.
@Observable
final class TodayModel {
    // MARK: Steering

    /// What the user picked this session; nil until they touch a chip.
    private(set) var picked: TodayPrefs?
    /// What this device remembers from earlier visits.
    private(set) var stored: TodayPrefs?
    var steer = "" {
        didSet {
            let limited = steer.prefix(serverLimit: Self.maxSteerLength)
            if limited != steer { steer = limited }
        }
    }

    @ObservationIgnored private var steerSeeded = false

    /// `MAX_STEER_LENGTH` on the server, which counts UTF-16 units.
    static let maxSteerLength = 200

    // MARK: Weather

    enum Weather: Equatable {
        /// Asking the device and the forecast.
        case locating
        case known(WeatherSnapshot)
        /// Nothing known: Today asks for the weather by hand.
        case needsManual(ManualReason)

        var snapshot: WeatherSnapshot? {
            if case .known(let snapshot) = self { snapshot } else { nil }
        }
    }

    enum ManualReason: Equatable {
        case denied, unavailable, forecastFailed
    }

    private(set) var weather: Weather = .locating
    /// The last snapshot ever shown, to seed the sheet when the current one is gone.
    @ObservationIgnored private var lastKnownWeather: WeatherSnapshot?
    /// Whether the user turned location off for Fitsss (read when needed:
    /// CoreLocation knows it without asking).
    var locationDenied: Bool { location.isDenied }
    var isWeatherSheetPresented = false
    /// Style me asked for the weather first: Done goes on to generate.
    var generatesAfterWeather = false

    // MARK: Generation

    private(set) var isGenerating = false
    private(set) var generationStartedAt: Date?
    private(set) var failure: GenerationFailure?
    /// Bumped whenever a new set arrives; the screen scrolls to it.
    private(set) var arrivals = 0

    // MARK: Cards

    @ObservationIgnored private var loadingNoped = false
    /// Cards marked Nope, by `cardKey`; persisted with the device storage.
    private var disliked: Set<String> = [] {
        didSet {
            guard disliked != oldValue, !loadingNoped else { return }
            storage?.updateNoped(added: disliked.subtracting(oldValue), removed: oldValue.subtracting(disliked))
        }
    }
    /// Cards with a save, wear or Nope on its way. Checked and set before the
    /// first `await`, so a second tap can never send a second save.
    private var busy: Set<String> = []
    /// The look each card was saved as this session.
    private var savedLookIds: [String: String] = [:]
    /// Bumped on every save and wear, for the success haptic.
    private(set) var confirmations = 0

    // MARK: Routes

    /// `today/weather` and `today/results`, consumed once.
    private(set) var pendingRoute: String?

    @ObservationIgnored private var storage: TodayStorage?
    @ObservationIgnored private let location = LocationProvider()

    init(route: [String]) {
        if route.first == "today", route.count > 1 { pendingRoute = route[1] }
    }

    func consumeRoute() -> String? {
        defer { pendingRoute = nil }
        return pendingRoute
    }

    /// Points the device storage at this server and user. Called whenever
    /// the screen appears; only the first call per user does anything.
    func activate(server: URL, userId: String) {
        let next = TodayStorage(server: server, userId: userId)
        guard storage?.scope != next.scope else { return }
        storage = next
        loadingNoped = true
        disliked = next.noped()
        loadingNoped = false
        stored = next.prefs()
        picked = nil
        if let cached = next.weather() {
            weather = .known(cached)
            lastKnownWeather = cached
        }
    }

    // MARK: - Steering

    /// The style and occasion on screen: what the user just picked, else the
    /// last generation's, else the device's memory, else the defaults. A
    /// style that no longer exists reads as Any; an unknown occasion as the
    /// catalog's first.
    func prefs(latest: GenerationResult?, styles: [Style], catalog: Catalog?) -> TodayPrefs {
        let fromLatest = latest.map { TodayPrefs(styleId: $0.request.styleId, occasion: $0.request.occasion) }
        var prefs = picked ?? fromLatest ?? stored ?? TodayPrefs()
        if let styleId = prefs.styleId, !styles.contains(where: { $0.id == styleId }) { prefs.styleId = nil }
        if let catalog, !catalog.allOccasions.isEmpty,
           !catalog.allOccasions.contains(where: { $0.id == prefs.occasion }) {
            prefs.occasion = catalog.allOccasions.first?.id
        }
        return prefs
    }

    func choose(_ prefs: TodayPrefs) {
        picked = prefs
        stored = prefs
        storage?.setPrefs(prefs)
    }

    /// The steer text starts as the last generation's, once, like the web.
    func seedSteer(from latest: GenerationResult?) {
        guard !steerSeeded, let latest else { return }
        steerSeeded = true
        if steer.isEmpty { steer = latest.request.steer ?? "" }
    }

    // MARK: - Weather

    /// Fills in the weather: the cache first, else the device and the
    /// forecast. With `force`, refetches the forecast even when one is shown
    /// (pull to refresh); a manual snapshot is kept unless `replaceManual`.
    /// True when a new forecast came in.
    @discardableResult
    func loadWeather(outfits: OutfitsStore, force: Bool = false, replaceManual: Bool = false) async -> Bool {
        if let snapshot = weather.snapshot {
            if !force { return false }
            if snapshot.source == "manual", !replaceManual { return false }
        } else if !force, let cached = storage?.weather() {
            show(cached)
            return false
        }
        let previous = weather.snapshot
        if previous == nil || replaceManual { weather = .locating }

        let fallback: (ManualReason) -> Void = { [self] reason in
            if let previous, !replaceManual || previous.source == "manual" {
                weather = .known(previous)
            } else {
                weather = .needsManual(reason)
            }
        }

        let outcome = await location.locate()
        // Set by hand while this was waiting: the user's word wins.
        if userSetWeather(since: previous) { return false }
        switch outcome {
        case .denied:
            fallback(.denied)
        case .unavailable:
            fallback(.unavailable)
        case .located(let latitude, let longitude):
            do {
                let snapshot = try await outfits.weather(latitude: latitude, longitude: longitude)
                if userSetWeather(since: previous) { return false }
                setWeather(snapshot)
                return true
            } catch is CancellationError {
                // The screen went away; the next appearance asks again.
                if weather == .locating { weather = previous.map(Weather.known) ?? .locating }
            } catch APIError.superseded {
                return false
            } catch {
                if userSetWeather(since: previous) { return false }
                fallback(.forecastFailed)
            }
        }
        return false
    }

    private func userSetWeather(since previous: WeatherSnapshot?) -> Bool {
        guard let current = weather.snapshot else { return false }
        return current.source == "manual" && current != previous
    }

    /// The cached forecast went stale while the app was away: fetch a new one.
    func refreshIfStale(outfits: OutfitsStore) async {
        guard let snapshot = weather.snapshot, snapshot.source != "manual", storage?.weather() == nil else { return }
        await loadWeather(outfits: outfits, force: true)
    }

    func setWeather(_ snapshot: WeatherSnapshot) {
        storage?.setWeather(snapshot)
        show(snapshot)
    }

    private func show(_ snapshot: WeatherSnapshot) {
        weather = .known(snapshot)
        lastKnownWeather = snapshot
    }

    /// What the manual sheet opens with: the weather on screen, else the last
    /// one known, else 16° and the catalog's "cloudy" (the web's defaults).
    func draft(catalog: Catalog?) -> (tempC: Int, condition: String) {
        let base = weather.snapshot ?? lastKnownWeather
        let conditions = catalog?.allWeatherConditions ?? []
        let condition = base?.condition
            ?? conditions.first(where: { $0.id == "cloudy" })?.id
            ?? conditions.first?.id
            ?? ""
        return (WeatherSheet.clamp(base?.tempC ?? 16), condition)
    }

    // MARK: - Generation

    /// Starts a generation unless one is running. The request runs in an
    /// unstructured task owned by this model: leaving the screen stops only
    /// the progress display, never the request, and its result lands in
    /// `OutfitsStore.current` either way.
    func generate(_ request: GenerationRequest, outfits: OutfitsStore, closet: ClosetStore) {
        guard !isGenerating else { return }
        isGenerating = true
        failure = nil
        let startedAt = Date.now
        generationStartedAt = startedAt
        let previousId = outfits.current?.id

        Task {
            defer {
                isGenerating = false
                generationStartedAt = nil
            }
            do {
                try await outfits.generate(request)
                arrivals += 1
            } catch is CancellationError {
                return
            } catch APIError.superseded {
                return
            } catch let error as APIError {
                // A dropped connection or a client timeout can hide a set the
                // server finished anyway: look before calling it a failure.
                if case .network = error {
                    await outfits.loadLatest()
                    if let current = outfits.current, current.id != previousId,
                       current.createdAt > startedAt.addingTimeInterval(-5) {
                        arrivals += 1
                        return
                    }
                }
                failure = Self.failure(for: error, closetIsEmpty: closet.blocks.isEmpty)
            } catch {
                failure = GenerationFailure(kind: .retry, message: error.localizedDescription)
            }
        }
    }

    func dismissFailure() { failure = nil }

    static func failure(for error: APIError, closetIsEmpty: Bool) -> GenerationFailure? {
        switch error {
        case .server(409, let message):
            return GenerationFailure(kind: .closet, message: message)
        case .server(503, let message):
            return GenerationFailure(kind: .notConfigured, message: message)
        case .server(_, let message):
            return GenerationFailure(kind: .retry, message: message)
        case .network:
            return GenerationFailure(
                kind: .offline,
                message: "Can’t reach Fitsss right now. Check your connection and try again."
            )
        case .unauthorized, .superseded:
            // The session store signs out; nothing to show here.
            return nil
        case .invalid, .notFound, .decoding:
            return GenerationFailure(kind: .retry, message: error.errorDescription ?? "Something went wrong.")
        }
    }

    // MARK: - Cards

    static func cardKey(_ outfit: Outfit, in generation: GenerationResult) -> String {
        "\(generation.id)/\(outfit.id)"
    }

    func isBusy(_ outfit: Outfit, in generation: GenerationResult) -> Bool {
        busy.contains(Self.cardKey(outfit, in: generation))
    }

    func isDisliked(_ outfit: Outfit, in generation: GenerationResult) -> Bool {
        disliked.contains(Self.cardKey(outfit, in: generation))
    }

    /// The look this card was saved as: this session's save, or a look from
    /// the same generation with the same pieces (saved earlier, or on the
    /// web). Removing it in Looks makes the card savable again.
    func savedLook(_ outfit: Outfit, in generation: GenerationResult, looks: LooksStore) -> Look? {
        if let id = savedLookIds[Self.cardKey(outfit, in: generation)], let look = looks.look(id) { return look }
        return looks.looks.first { $0.generationId == generation.id && $0.slots == outfit.slots }
    }

    func isWorn(_ outfit: Outfit, in generation: GenerationResult, looks: LooksStore) -> Bool {
        guard let wornAt = savedLook(outfit, in: generation, looks: looks)?.lastWornAt else { return false }
        return Calendar.current.isDateInToday(wornAt)
    }

    func save(_ outfit: Outfit, in generation: GenerationResult, looks: LooksStore, toasts: ToastCenter) async {
        let key = Self.cardKey(outfit, in: generation)
        guard !busy.contains(key), savedLook(outfit, in: generation, looks: looks) == nil else { return }
        busy.insert(key)
        defer { busy.remove(key) }
        do {
            _ = try await saveLook(outfit, in: generation, looks: looks)
            confirmations += 1
            toasts.show("Saved to Looks")
        } catch {
            report(error, fallback: "Couldn’t save this look.", toasts: toasts)
        }
    }

    /// Saves first when needed, then marks the look worn today.
    func wear(_ outfit: Outfit, in generation: GenerationResult, looks: LooksStore, toasts: ToastCenter) async {
        let key = Self.cardKey(outfit, in: generation)
        guard !busy.contains(key), !isWorn(outfit, in: generation, looks: looks) else { return }
        busy.insert(key)
        defer { busy.remove(key) }
        do {
            let look: Look
            if let existing = savedLook(outfit, in: generation, looks: looks) {
                look = existing
            } else {
                look = try await saveLook(outfit, in: generation, looks: looks)
            }
            try await looks.markWorn(look.id)
            confirmations += 1
            toasts.show("Have a good day")
        } catch {
            report(error, fallback: "Couldn’t record that.", toasts: toasts)
        }
    }

    private func saveLook(_ outfit: Outfit, in generation: GenerationResult, looks: LooksStore) async throws -> Look {
        let look = try await looks.save(
            outfit,
            styleId: generation.request.styleId,
            occasion: generation.request.occasion,
            weather: generation.request.weather,
            generationId: generation.id
        )
        savedLookIds[Self.cardKey(outfit, in: generation)] = look.id
        return look
    }

    /// Replaces one piece. Throws for the sheet to show; on success the card
    /// is a new outfit, so its saved and Nope marks are cleared.
    func swap(
        _ outfit: Outfit, in generation: GenerationResult, entry: PieceEntry, to block: Block, outfits: OutfitsStore
    ) async throws {
        try await outfits.swap(outfitId: outfit.id, slot: entry.slot, to: block.id, from: entry.block.id)
        let key = Self.cardKey(outfit, in: generation)
        savedLookIds[key] = nil
        disliked.remove(key)
    }

    /// Records a Nope with its reason. Throws for the sheet to show.
    func dislike(_ outfit: Outfit, in generation: GenerationResult, reason: String, outfits: OutfitsStore) async throws {
        let key = Self.cardKey(outfit, in: generation)
        guard !busy.contains(key) else { return }
        busy.insert(key)
        defer { busy.remove(key) }
        try await outfits.record(OutfitEvent(
            type: "disliked",
            outfit: outfit,
            reason: reason,
            styleId: generation.request.styleId,
            occasion: generation.request.occasion,
            generationId: generation.id
        ))
        disliked.insert(key)
    }

    /// Nope without a reason: the card dims, nothing is sent (the web's Skip).
    func skipDislike(_ outfit: Outfit, in generation: GenerationResult) {
        disliked.insert(Self.cardKey(outfit, in: generation))
    }

    private func report(_ error: any Error, fallback: String, toasts: ToastCenter) {
        if error is CancellationError || (error as? APIError) == .superseded || (error as? APIError) == .unauthorized {
            return
        }
        toasts.show((error as? APIError)?.errorDescription ?? fallback, isError: true)
    }
}
