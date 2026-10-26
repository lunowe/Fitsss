import XCTest

/// Walks the Today tab against the local dev server (`LLM_MOCK=1`, so
/// generating is free and deterministic) and keeps screenshots: generate,
/// swap, save (double-tapped, stored once), wear, Nope with a reason, the
/// manual weather sheet, "Style this piece" from the Closet, and the failure
/// states through a stand-in server.
///
/// Looks a test saves are deleted afterwards; the seed closet and styles are
/// left alone. The failure test needs the stand-in on :3298
/// (`/tmp/fitsss-today-standin.py`), which forwards to :3100 and fails
/// generation on request (`POST /__mode`).
@MainActor
final class TodayUITests: XCTestCase {
    nonisolated(unsafe) private var fixtures: TodayFixtures!
    nonisolated(unsafe) private var looksBefore: Set<String> = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        fixtures = try TodayFixtures.signIn()
        looksBefore = Set(fixtures.looks().compactMap { $0["id"] as? String })
    }

    override func tearDown() {
        // Every look this test saved goes again.
        for look in fixtures?.looks() ?? [] {
            if let id = look["id"] as? String, !looksBefore.contains(id) { fixtures.deleteLook(id) }
        }
        TodayFixtures.setStandInMode("proxy")
    }

    // MARK: - Generate, swap, save, wear, nope

    func testGenerateSwapSaveWearNope() throws {
        let app = launch()
        let generate = app.buttons["today.generate"]
        XCTAssertTrue(generate.waitForExistence(timeout: 40))
        waitForWeather(in: app)
        snapshot("idle", app)

        let generation = try generateAndWait(app)
        snapshot("results-top", app)

        let card = element("today.card.0", in: app)
        XCTAssertTrue(card.waitForExistence(timeout: 15), "the first card shows")
        reveal(app.buttons["today.card.0.swap"], in: app)
        snapshot("results", app)

        // Swap: the first slot, then any other piece of that role.
        let before = try XCTUnwrap(fixtures.outfit(0, in: generation.id)?["slots"] as? [String: Any])
        app.buttons["today.card.0.swap"].tap()
        let slot = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'today.swap.slot.'")).firstMatch
        XCTAssertTrue(slot.waitForExistence(timeout: 10), "the swap sheet lists the pieces")
        snapshot("swap-slots", app)
        slot.tap()
        let options = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'today.swap.option.'"))
        XCTAssertTrue(options.firstMatch.waitForExistence(timeout: 10), "the closet's pieces for that slot")
        snapshot("swap-options", app)
        let other = try XCTUnwrap(
            options.allElementsBoundByIndex.first { !$0.isSelected },
            "there is another piece to swap to"
        )
        let target = other.identifier.replacingOccurrences(of: "today.swap.option.", with: "")
        other.tap()
        XCTAssertTrue(options.firstMatch.waitForNonExistence(timeout: 20), "the sheet closes after the swap")
        let swapped = try XCTUnwrap(fixtures.outfit(0, in: generation.id)?["slots"] as? [String: Any])
        XCTAssertNotEqual(NSDictionary(dictionary: before), NSDictionary(dictionary: swapped), "the stored outfit changed")
        XCTAssertTrue(TodayFixtures.ids(in: swapped).contains(target), "the picked piece is in the outfit")
        snapshot("swapped", app)

        // Save, tapped twice in a row: one look.
        let save = app.buttons["today.card.0.save"]
        reveal(save, in: app)
        save.doubleTap()
        XCTAssertTrue(waitForLabel("Saved", of: save, timeout: 20), "the card shows it's saved")
        Thread.sleep(forTimeInterval: 2)
        let saved = fixtures.looks().filter { ($0["generationId"] as? String) == generation.id }
        XCTAssertEqual(saved.count, 1, "a double tap saves once")
        XCTAssertEqual(saved.first?["styleId"] as? String, generation.request["styleId"] as? String)
        XCTAssertEqual(saved.first?["occasion"] as? String, generation.request["occasion"] as? String)
        XCTAssertNotNil(saved.first?["weather"] as? [String: Any], "the look keeps the weather")
        XCTAssertTrue(TodayFixtures.ids(in: saved.first?["slots"] as? [String: Any] ?? [:]).contains(target),
                      "the look is the swapped outfit")
        snapshot("saved", app)

        // Wear: the same look, worn once.
        let wear = app.buttons["today.card.0.wear"]
        wear.tap()
        XCTAssertTrue(waitForLabel("Wearing", of: wear, timeout: 20))
        let worn = fixtures.looks().filter { ($0["generationId"] as? String) == generation.id }
        XCTAssertEqual(worn.count, 1, "wearing a saved card doesn't save it again")
        XCTAssertEqual(worn.first?["wornCount"] as? Int, 1)
        snapshot("worn", app)

        // Nope on the second card, with a reason.
        app.scrollViews["today.carousel"].swipeLeft()
        let nope = app.buttons["today.card.1.nope"]
        XCTAssertTrue(nope.waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1)
        nope.tap()
        let reason = app.buttons["today.nope.too-warm"]
        XCTAssertTrue(reason.waitForExistence(timeout: 10), "the reasons come from the catalog")
        snapshot("nope-sheet", app)
        reason.tap()
        XCTAssertTrue(element("today.card.1.noted", in: app).waitForExistence(timeout: 15), "the card says Noted")
        snapshot("noped", app)

        // The pieces sheet.
        app.scrollViews["today.carousel"].swipeRight()
        Thread.sleep(forTimeInterval: 1)
        app.buttons["today.card.0.pieces"].tap()
        XCTAssertTrue(app.buttons["today.pieces.done"].waitForExistence(timeout: 10))
        snapshot("pieces-sheet", app)
        app.buttons["today.pieces.done"].tap()
    }

    // MARK: - Weather by hand

    func testManualWeatherSheet() throws {
        let app = launch(route: "today/weather")
        let done = app.buttons["today.weather.done"]
        XCTAssertTrue(done.waitForExistence(timeout: 40), "today/weather opens the sheet")
        let stepper = app.steppers.firstMatch
        XCTAssertTrue(stepper.waitForExistence(timeout: 5))
        let decrement = stepper.buttons["Decrement"].exists ? stepper.buttons["Decrement"] : stepper.buttons.element(boundBy: 0)
        decrement.tap()
        decrement.tap()
        app.buttons["today.weather.condition.snow"].tap()
        snapshot("weather-sheet", app)
        done.tap()

        let row = app.buttons["today.weather"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(row.label.contains("Snow") && row.label.contains("Set by you"), "row reads \(row.label)")
        snapshot("weather-manual", app)

        // Generation uses it.
        let generation = try generateAndWait(app)
        let weather = try XCTUnwrap(generation.request["weather"] as? [String: Any])
        XCTAssertEqual(weather["source"] as? String, "manual")
        XCTAssertEqual(weather["condition"] as? String, "snow")

        // Back to the forecast.
        let top = app.buttons["today.weather"]
        scrollToTop(top, in: app)
        top.tap()
        let useLocation = app.buttons["today.weather.useLocation"]
        XCTAssertTrue(useLocation.waitForExistence(timeout: 10))
        reveal(useLocation, in: app, bar: done)
        useLocation.tap()
        let forecast = NSPredicate(format: "label CONTAINS 'Berlin'")
        expectation(for: forecast, evaluatedWith: app.buttons["today.weather"])
        waitForExpectations(timeout: 30)
        snapshot("weather-forecast", app)
    }

    /// With no weather known (location denied, nothing cached), Style me
    /// opens the manual sheet and Done goes on to generate. Needs that state:
    /// `simctl privacy revoke location` and a server spelling with no cache
    /// (`TODAY_UITEST_SERVER=http://127.0.0.1:3100`); skipped otherwise.
    func testStyleMeWithoutWeatherAsksFirst() throws {
        let server = ProcessInfo.processInfo.environment["TODAY_UITEST_SERVER"] ?? "http://127.0.0.1:3100"
        let app = launch(server: server)
        let generate = app.buttons["today.generate"]
        XCTAssertTrue(generate.waitForExistence(timeout: 40))
        waitForWeather(in: app)
        let row = app.buttons["today.weather"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        try XCTSkipUnless(row.label.contains("Set your weather"), "weather is known here: \(row.label)")
        snapshot("no-weather", app)

        let before = fixtures.latestGeneration()?.id
        generate.tap()
        let done = app.buttons["today.weather.done"]
        XCTAssertTrue(done.waitForExistence(timeout: 10), "Style me asks for the weather first")
        snapshot("no-weather-sheet", app)
        done.tap()
        let deadline = Date().addingTimeInterval(60)
        while fixtures.latestGeneration()?.id == before, Date() < deadline { Thread.sleep(forTimeInterval: 0.5) }
        let latest = try XCTUnwrap(fixtures.latestGeneration())
        XCTAssertNotEqual(latest.id, before, "Done went on to generate")
        XCTAssertEqual((latest.request["weather"] as? [String: Any])?["source"] as? String, "manual")
        XCTAssertTrue(element("today.card.0", in: app).waitForExistence(timeout: 20))
        snapshot("no-weather-generated", app)
    }

    // MARK: - Style this piece

    func testStyleThisPieceOpensTodayPinned() throws {
        let top = try XCTUnwrap(fixtures.blocks().first { ($0["category"] as? String) == "top" })
        let id = try XCTUnwrap(top["id"] as? String)

        let app = launch(route: "closet/\(id)")
        // The detail is a lazy List: the button exists once scrolled to.
        XCTAssertTrue(app.buttons["piece.edit.toolbar"].waitForExistence(timeout: 40))
        let styleThis = app.buttons["piece.styleThis"]
        var swipes = 0
        while !(styleThis.exists && styleThis.isHittable), swipes < 8 { app.swipeUp(); swipes += 1 }
        Thread.sleep(forTimeInterval: 1)
        XCTAssertTrue(styleThis.isHittable, "Style this piece is reachable")
        styleThis.tap()

        let pinned = element("today.pinned", in: app)
        XCTAssertTrue(pinned.waitForExistence(timeout: 15), "Today opens with the piece pinned")
        XCTAssertTrue(app.tabBars.buttons["Today"].isSelected)
        snapshot("pinned", app)

        let generation = try generateAndWait(app)
        for outfit in generation.outfits {
            XCTAssertTrue(TodayFixtures.ids(in: outfit["slots"] as? [String: Any] ?? [:]).contains(id),
                          "every outfit wears the pinned piece")
        }
        let request = generation.request["pinned"] as? [String]
        XCTAssertEqual(request, [id])
        snapshot("pinned-results", app)

        let remove = app.buttons["today.pinned.remove"]
        scrollToTop(remove, in: app)
        remove.tap()
        XCTAssertTrue(pinned.waitForNonExistence(timeout: 5), "Remove drops the pin")
    }

    // MARK: - Failures and a slow generation (stand-in on :3298)

    func testFailuresAndSlowGeneration() throws {
        try XCTSkipUnless(TodayFixtures.setStandInMode("proxy"), "the stand-in on :3298 is not running")
        let app = launch(server: TodayFixtures.standIn)
        let generate = app.buttons["today.generate"]
        XCTAssertTrue(generate.waitForExistence(timeout: 40))
        waitForWeather(in: app)

        TodayFixtures.setStandInMode("502")
        generate.tap()
        let retry = app.buttons["today.failure.retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 20), "a 502 offers Try again")
        reveal(retry, in: app)
        snapshot("failure-502", app)

        TodayFixtures.setStandInMode("503")
        retry.tap()
        let failure = element("today.failure", in: app)
        expectation(for: NSPredicate(format: "label CONTAINS 'off'"), evaluatedWith: failure)
        waitForExpectations(timeout: 20)
        XCTAssertFalse(app.buttons["today.failure.retry"].exists, "nothing to retry while generation is off")
        snapshot("failure-503", app)

        TodayFixtures.setStandInMode("409")
        generate.tap()
        let addPieces = app.buttons["today.failure.addPieces"]
        XCTAssertTrue(addPieces.waitForExistence(timeout: 20), "a 409 offers the closet")
        XCTAssertTrue(app.buttons["today.failure.weather"].exists, "and the weather sheet")
        XCTAssertTrue(failure.label.contains("Not enough to work with today"), "with the server's message")
        reveal(addPieces, in: app)
        snapshot("failure-409", app)

        TodayFixtures.setStandInMode("offline")
        generate.tap()
        expectation(for: NSPredicate(format: "label CONTAINS 'offline'"), evaluatedWith: failure)
        waitForExpectations(timeout: 40)
        snapshot("failure-offline", app)

        // A slow one: staged progress, then leave the tab and come back to the result.
        let latest = fixtures.latestGeneration()?.id
        TodayFixtures.setStandInMode("slow 16")
        generate.tap()
        let progress = element("today.generating", in: app)
        XCTAssertTrue(progress.waitForExistence(timeout: 5), "progress shows while the server works")
        Thread.sleep(forTimeInterval: 2)
        reveal(progress, in: app)
        snapshot("generating", app)
        Thread.sleep(forTimeInterval: 11)
        XCTAssertTrue(progress.label.contains("up to a minute"), "a long wait says so: \(progress.label)")
        snapshot("generating-long", app)

        app.tabBars.buttons["Closet"].tap()
        let deadline = Date().addingTimeInterval(40)
        while fixtures.latestGeneration()?.id == latest, Date() < deadline { Thread.sleep(forTimeInterval: 1) }
        XCTAssertNotEqual(fixtures.latestGeneration()?.id, latest, "the server finished")
        Thread.sleep(forTimeInterval: 1)
        app.tabBars.buttons["Today"].tap()
        XCTAssertTrue(element("today.card.0", in: app).waitForExistence(timeout: 10), "the result was kept")
        XCTAssertFalse(progress.exists)
        XCTAssertFalse(failure.exists)
        snapshot("slow-result", app)
    }

    // MARK: - Screenshot tour (light, dark, large text)

    /// The same states at whatever appearance the simulator is in;
    /// `TEST_RUNNER_FITSSS_TYPE_SIZE=AX` runs it at Accessibility XL.
    func testScreenshotTour() throws {
        let large = ProcessInfo.processInfo.environment["FITSSS_TYPE_SIZE"] == "AX"
        let app = launch(extra: large ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXL"] : [])
        XCTAssertTrue(app.buttons["today.generate"].waitForExistence(timeout: 40))
        waitForWeather(in: app)
        if !element("today.card.0", in: app).exists { _ = try generateAndWait(app) }
        Thread.sleep(forTimeInterval: 1)
        snapshot("tour-top", app)

        let swap = app.buttons["today.card.0.swap"]
        reveal(swap, in: app)
        snapshot("tour-card", app)
        app.swipeUp()
        Thread.sleep(forTimeInterval: 1)
        snapshot("tour-bottom", app)

        swap.tap()
        let slot = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'today.swap.slot.'")).firstMatch
        XCTAssertTrue(slot.waitForExistence(timeout: 10))
        slot.tap()
        XCTAssertTrue(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'today.swap.option.'"))
            .firstMatch.waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 0.5)
        snapshot("tour-swap-options", app)
        app.swipeDown(velocity: .fast)
        app.swipeDown(velocity: .fast)
        Thread.sleep(forTimeInterval: 1)

        let nope = app.buttons["today.card.0.nope"]
        if nope.waitForExistence(timeout: 5), nope.isHittable {
            nope.tap()
            XCTAssertTrue(app.buttons["today.nope.skip"].waitForExistence(timeout: 10))
            snapshot("tour-nope", app)
            app.swipeDown(velocity: .fast)
            Thread.sleep(forTimeInterval: 1)
        }

        let row = app.buttons["today.weather"]
        scrollToTop(row, in: app)
        row.tap()
        XCTAssertTrue(app.buttons["today.weather.done"].waitForExistence(timeout: 10))
        snapshot("tour-weather", app)
    }

    // MARK: - Helpers

    private func launch(route: String? = nil, server: String = TodayFixtures.base.absoluteString, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "-FitsssServer", server,
            "-FitsssLogin", "dev@fitsss.local:fitsss-dev-1234",
            "-FitsssRoute", route ?? "today",
        ] + extra
        app.launch()
        allowLocationIfAsked()
        return app
    }

    /// The simulator grants location up front (`simctl privacy grant`); if it
    /// asks anyway, allow while in use.
    private func allowLocationIfAsked() {
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = springboard.buttons["Allow While Using App"]
        if allow.waitForExistence(timeout: 3) { allow.tap() }
    }

    /// The forecast (or the cache) fills the weather row before generating.
    private func waitForWeather(in app: XCUIApplication) {
        let locating = element("today.weather.locating", in: app)
        if locating.exists { _ = locating.waitForNonExistence(timeout: 20) }
    }

    /// Taps Style me and waits for the server to store a new set.
    private func generateAndWait(_ app: XCUIApplication) throws -> TodayFixtures.Generation {
        let before = fixtures.latestGeneration()?.id
        app.buttons["today.generate"].tap()
        let deadline = Date().addingTimeInterval(90)
        var latest = fixtures.latestGeneration()
        while latest?.id == before, Date() < deadline {
            Thread.sleep(forTimeInterval: 0.5)
            latest = fixtures.latestGeneration()
        }
        let generation = try XCTUnwrap(latest)
        XCTAssertNotEqual(generation.id, before, "a new set was generated")
        XCTAssertEqual(generation.model, "mock", "LLM_MOCK must stay on")
        XCTAssertTrue(element("today.card.0", in: app).waitForExistence(timeout: 20))
        Thread.sleep(forTimeInterval: 1)
        return generation
    }

    /// Swipes up until `target` is on screen and clear of the pinned bottom bar.
    private func reveal(_ target: XCUIElement, in app: XCUIApplication, bar: XCUIElement? = nil) {
        let bar = bar ?? app.buttons["today.generate"]
        var swipes = 0
        func clear() -> Bool {
            target.exists && target.isHittable && (!bar.exists || target.frame.maxY < bar.frame.minY - 12)
        }
        while !clear(), swipes < 8 {
            app.swipeUp(velocity: .slow)
            swipes += 1
        }
        if swipes > 0 { Thread.sleep(forTimeInterval: 1) }
    }

    /// Swipes down until `target` sits below the navigation bar and the
    /// scroll has settled (a tap mid-deceleration lands on the bar).
    private func scrollToTop(_ target: XCUIElement, in app: XCUIApplication) {
        let bar = app.navigationBars.firstMatch
        var swipes = 0
        func clear() -> Bool {
            target.exists && target.isHittable && (!bar.exists || target.frame.minY >= bar.frame.maxY)
        }
        while !clear(), swipes < 8 {
            app.swipeDown(velocity: .fast)
            Thread.sleep(forTimeInterval: 1)
            swipes += 1
        }
    }

    private func waitForLabel(_ label: String, of element: XCUIElement, timeout: TimeInterval) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if element.label == label { return true }
            Thread.sleep(forTimeInterval: 0.3)
        }
        return false
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any).matching(identifier: identifier).firstMatch
    }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

/// Talks to the dev server directly, to check what Today stored and to
/// clean up. Blocking on purpose, like `ClosetFixtures`.
nonisolated struct TodayFixtures {
    static let base = URL(string: "http://localhost:3100")!
    static let standIn = "http://localhost:3298"

    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        return URLSession(configuration: configuration)
    }()

    struct Generation {
        var id: String
        var model: String
        var request: [String: Any]
        var outfits: [[String: Any]]
    }

    let token: String

    static func signIn() throws -> TodayFixtures {
        let body: [String: Any] = ["email": "dev@fitsss.local", "password": "fitsss-dev-1234"]
        let response = send("POST", base.appending(path: "api/auth/sign-in/email"), body: body, token: nil)
        let token = try XCTUnwrap(
            response.headers?.value(forHTTPHeaderField: "set-auth-token"),
            "sign-in answered \(response.status)"
        )
        return TodayFixtures(token: token)
    }

    func latestGeneration() -> Generation? {
        let response = Self.send("GET", Self.base.appending(path: "api/v1/generations/latest"), token: token)
        guard let data = response.json?["data"] as? [String: Any], let id = data["id"] as? String else { return nil }
        return Generation(
            id: id,
            model: data["model"] as? String ?? "",
            request: data["request"] as? [String: Any] ?? [:],
            outfits: data["outfits"] as? [[String: Any]] ?? []
        )
    }

    /// One outfit of the latest generation, if `generationId` is still the latest.
    func outfit(_ index: Int, in generationId: String) -> [String: Any]? {
        guard let latest = latestGeneration(), latest.id == generationId, latest.outfits.indices.contains(index) else {
            return nil
        }
        return latest.outfits[index]
    }

    func looks() -> [[String: Any]] {
        Self.send("GET", Self.base.appending(path: "api/v1/looks"), token: token).json?["data"] as? [[String: Any]] ?? []
    }

    func deleteLook(_ id: String) {
        _ = Self.send("DELETE", Self.base.appending(path: "api/v1/looks/\(id)"), token: token)
    }

    func blocks() -> [[String: Any]] {
        Self.send("GET", Self.base.appending(path: "api/v1/blocks"), token: token).json?["data"] as? [[String: Any]] ?? []
    }

    /// Every block id in an outfit's slots.
    static func ids(in slots: [String: Any]) -> [String] {
        slots.flatMap { _, value -> [String] in
            if let id = value as? String { return [id] }
            return value as? [String] ?? []
        }
    }

    /// Switches the stand-in's failure mode. False when it isn't running.
    @discardableResult
    static func setStandInMode(_ mode: String) -> Bool {
        var request = URLRequest(url: URL(string: "\(standIn)/__mode")!)
        request.httpMethod = "POST"
        request.httpBody = Data(mode.utf8)
        request.timeoutInterval = 5
        return send(request).status == 200
    }

    private struct Response {
        var status: Int
        var json: [String: Any]?
        var headers: HTTPURLResponse?
    }

    private static func send(_ method: String, _ url: URL, body: Any? = nil, token: String?) -> Response {
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 60
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return send(request)
    }

    private static func send(_ request: URLRequest) -> Response {
        let box = TodayResponseBox()
        let done = DispatchSemaphore(value: 0)
        session.dataTask(with: request) { data, response, _ in
            box.data = data
            box.response = response as? HTTPURLResponse
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 90)
        let json = box.data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        return Response(status: box.response?.statusCode ?? 0, json: json, headers: box.response)
    }
}

/// Carries a response out of URLSession's callback queue.
nonisolated private final class TodayResponseBox: @unchecked Sendable {
    var data: Data?
    var response: HTTPURLResponse?
}
