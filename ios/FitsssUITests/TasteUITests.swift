import XCTest

/// Walks the Taste screen against the local dev server and keeps screenshots:
/// You → Taste notes; a like and an avoid line (the server's inline refusal
/// of one too short, the field's 120-character limit); deleting with the
/// row's button and with a swipe; the You row's count; a style's refresh
/// refused for too few choices (409, inline), then a few liked choices
/// recorded through the API and a refresh that learns from them (the mock
/// model, `LLM_MOCK=1`, so it costs nothing).
///
/// Cleans up through the API: every `uitest` line, and the lines the mock
/// learned. The liked events stay in `outfit_events` (no API deletes them);
/// their outfits are named `uitest-taste …`, so afterwards:
///
///     psql -d fitsss -c "delete from outfit_events where outfit->>'name' like 'uitest-taste%'"
@MainActor
final class TasteUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
        // Lines left behind by a crashed run would skew the counts.
        cleanUp()
    }

    override func tearDown() {
        cleanUp()
    }

    // MARK: - Lines and the You row

    func testAddDeleteLinesAndYouCount() throws {
        let suffix = Self.suffix()
        let like = "uitest likes wide trousers \(suffix)"
        let avoid = "uitest no logos \(suffix)"

        let app = FitsssUITests.launch(route: "you")
        let row = app.buttons["you.taste"]
        XCTAssertTrue(row.waitForExistence(timeout: 40), "the You tab has a Taste notes row")
        XCTAssertTrue(waitUntil { self.summary(in: app) == self.expectedSummary() },
                      "the row says \(expectedSummary()), it says \(summary(in: app) ?? "nothing")")
        snapshot("you-row-before", app)

        row.tap()
        XCTAssertTrue(app.navigationBars["Taste"].waitForExistence(timeout: 15), "Taste is pushed")
        XCTAssertTrue(app.buttons["taste.scope.overall"].waitForExistence(timeout: 15), "the scope chips show")
        XCTAssertTrue(app.buttons["taste.scope.overall"].isSelected, "Overall is selected")
        snapshot("taste-overall", app)

        // A like, typed past 120 characters: the field keeps 120.
        app.buttons["taste.like.add"].tap()
        let likeField = app.textFields["taste.like.field"]
        XCTAssertTrue(likeField.waitForExistence(timeout: 10), "Add a line opens a field")
        let likeSubmit = app.buttons["taste.like.submit"]
        XCTAssertFalse(likeSubmit.isEnabled, "Add waits for some text")
        let long = like + " " + String(repeating: "z", count: 120)
        likeField.typeText(long)
        Thread.sleep(forTimeInterval: 1)
        XCTAssertEqual((likeField.value as? String)?.count, 120, "the field stops at 120 characters")
        clearText(likeField)
        likeField.typeText(like)
        XCTAssertTrue(likeSubmit.isEnabled)
        snapshot("like-typed", app)
        likeSubmit.tap()
        XCTAssertTrue(app.staticTexts[like].waitForExistence(timeout: 15), "the like shows")
        XCTAssertTrue(likeField.waitForNonExistence(timeout: 5), "the field closes after adding")
        let likeId = try XCTUnwrap(line(like, kind: "lines", styleId: nil)?["id"] as? String, "stored on the server")
        XCTAssertEqual(line(like, kind: "lines", styleId: nil)?["source"] as? String, "user")
        XCTAssertTrue(labelled("You said this", in: app).exists, "says where it came from")

        // An avoid line too short for the server: its sentence, by the field.
        app.buttons["taste.avoid.add"].tap()
        let avoidField = app.textFields["taste.avoid.field"]
        XCTAssertTrue(avoidField.waitForExistence(timeout: 10))
        avoidField.typeText("no")
        app.buttons["taste.avoid.submit"].tap()
        let error = app.staticTexts["taste.avoid.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 15), "the server's message shows inline")
        XCTAssertTrue(error.label.contains("3"), "says how long a line must be: \(error.label)")
        snapshot("avoid-too-short", app)
        clearText(avoidField)
        avoidField.typeText(avoid)
        app.buttons["taste.avoid.submit"].tap()
        XCTAssertTrue(app.staticTexts[avoid].waitForExistence(timeout: 15), "the avoid line shows")
        XCTAssertNotNil(line(avoid, kind: "avoid", styleId: nil), "stored as an avoid line")
        XCTAssertFalse(app.staticTexts["taste.intro"].exists, "no intro once there are lines")
        snapshot("two-lines", app)

        // Delete the like with its button.
        app.buttons["taste.line.\(likeId).delete"].tap()
        XCTAssertTrue(app.staticTexts[like].waitForNonExistence(timeout: 15), "the like is gone")
        XCTAssertTrue(waitUntil { self.line(like, kind: "lines", styleId: nil) == nil }, "deleted on the server")
        snapshot("like-deleted", app)

        // The You row counts what is left.
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        XCTAssertTrue(waitUntil { self.summary(in: app) == self.expectedSummary() },
                      "the row says \(expectedSummary()), it says \(summary(in: app) ?? "nothing")")
        XCTAssertNotEqual(summary(in: app), "Nothing learned yet")
        snapshot("you-row-after", app)

        // Swipe the avoid line away.
        row.tap()
        let avoidText = app.staticTexts[avoid]
        XCTAssertTrue(avoidText.waitForExistence(timeout: 15))
        avoidText.swipeLeft()
        let swipeDelete = app.buttons["Delete"]
        XCTAssertTrue(swipeDelete.waitForExistence(timeout: 5), "the swipe offers Delete")
        snapshot("avoid-swiped", app)
        swipeDelete.tap()
        XCTAssertTrue(avoidText.waitForNonExistence(timeout: 15), "the avoid line is gone")
        XCTAssertTrue(waitUntil { self.line(avoid, kind: "avoid", styleId: nil) == nil }, "deleted on the server")
    }

    // MARK: - A style's refresh

    func testStyleRefreshNeedsChoicesThenLearns() throws {
        // The style with the fewest choices, so "not enough yet" can be seen.
        let overview = try XCTUnwrap(api.data("GET", "api/v1/taste") as? [String: Any])
        let byStyle = try XCTUnwrap(overview["byStyle"] as? [String: [String: Any]])
        let styles = try XCTUnwrap(api.data("GET", "api/v1/styles") as? [[String: Any]])
        let style = try XCTUnwrap(styles.min { a, b in
            events(byStyle[a["id"] as? String ?? ""]) < events(byStyle[b["id"] as? String ?? ""])
        }, "the dev user has styles")
        let styleId = try XCTUnwrap(style["id"] as? String)
        let before = events(byStyle[styleId])

        let app = FitsssUITests.launch(route: "you/taste")
        let chip = app.buttons["taste.scope.\(styleId)"]
        XCTAssertTrue(chip.waitForExistence(timeout: 40), "the style has a chip")
        // Later chips sit past the edge of the row: scroll it, as a thumb would.
        let rowY = app.buttons["taste.scope.overall"].frame.midY
        let origin = app.coordinate(withNormalizedOffset: .zero)
        for _ in 0..<4 where chip.frame.maxX > app.frame.maxX - 8 {
            origin.withOffset(CGVector(dx: 340, dy: rowY))
                .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: 60, dy: rowY)))
            Thread.sleep(forTimeInterval: 1)
        }
        chip.tap()
        XCTAssertTrue(waitUntil { chip.isSelected }, "the chip is selected")
        let status = app.staticTexts["taste.refreshed"]
        scroll(to: status, in: app)
        XCTAssertTrue(status.label.contains("of \(before)"), "counts this style's choices: \(status.label)")
        snapshot("style-scope", app)

        let refresh = app.buttons["taste.refresh"]
        if before < 3 {
            refresh.tap()
            let error = app.staticTexts["taste.refreshError"]
            XCTAssertTrue(error.waitForExistence(timeout: 30), "the 409 shows inline")
            XCTAssertTrue(error.label.contains("Not enough feedback"), "the server's sentence: \(error.label)")
            snapshot("refresh-too-few", app)
            for index in 0..<(3 - before) {
                try recordLiked(styleId: styleId, index: index)
            }
        } else {
            print("note: \(style["name"] ?? styleId) already has \(before) choices; the 409 is not shown")
        }

        refresh.tap()
        XCTAssertTrue(app.staticTexts["taste.refreshError"].waitForNonExistence(timeout: 10), "the old message goes")
        // While it refreshes the status line is not there; reading a missing
        // element's label fails at once instead of waiting.
        XCTAssertTrue(waitUntil(timeout: 60) { status.exists && status.label.hasPrefix("Refreshed") },
                      "refreshed: \(status.exists ? status.label : "no status line")")
        let total = max(before, 3)
        XCTAssertTrue(status.label.contains("\(total) of \(total) choices considered"), status.label)
        let profile = try XCTUnwrap((api.data("GET", "api/v1/taste") as? [String: Any])
            .flatMap { ($0["byStyle"] as? [String: [String: Any]])?[styleId] })
        XCTAssertFalse(profile["lastRefreshedAt"] is NSNull, "refreshed on the server")
        let learned = (profile["lines"] as? [[String: Any]]) ?? []
        XCTAssertFalse(learned.isEmpty, "the mock learned lines from the liked pieces")
        if let first = learned.first?["text"] as? String {
            let shown = app.staticTexts[first]
            scroll(to: shown, in: app, up: true)
            XCTAssertTrue(shown.exists, "the learned line \(first) shows")
            XCTAssertTrue(labelled("Seen", in: app).exists, "with how often it was seen")
        }
        snapshot("refreshed-top", app)
        let favorites = app.descendants(matching: .any)["taste.favorites"].firstMatch
        scroll(to: favorites, in: app)
        snapshot("refreshed-pieces", app)
    }

    // MARK: - Harness

    /// A liked choice in the style: a mock generation's first outfit,
    /// renamed so the event can be found and removed later.
    private func recordLiked(styleId: String, index: Int) throws {
        let weather: [String: Any] = ["tempC": 18.4, "condition": "cloudy", "source": "manual"]
        let request: [String: Any] = [
            "occasion": "everyday", "weather": weather, "count": 1, "pinned": [], "excluded": [], "styleId": styleId,
        ]
        let generation = try XCTUnwrap(api.data("POST", "api/v1/generations", body: request) as? [String: Any], "mock generation")
        var outfit = try XCTUnwrap((generation["outfits"] as? [[String: Any]])?.first)
        outfit["name"] = "uitest-taste \(Self.suffix()) \(index)"
        var body: [String: Any] = ["type": "liked", "outfit": outfit, "styleId": styleId, "occasion": "everyday"]
        if let generationId = generation["id"] { body["generationId"] = generationId }
        XCTAssertEqual(api.send("POST", "api/v1/outfit-events", body: body).status, 204, "liked recorded")
    }

    /// Deletes every `uitest` line and every line the mock learned
    /// ("Reaches for …", "Avoids …"), in every scope.
    nonisolated private func cleanUp() {
        guard let api, let overview = api.data("GET", "api/v1/taste") as? [String: Any] else { return }
        var scopes: [(String?, [String: Any])] = []
        if let overall = overview["overall"] as? [String: Any] { scopes.append((nil, overall)) }
        for (id, profile) in (overview["byStyle"] as? [String: [String: Any]]) ?? [:] { scopes.append((id, profile)) }
        for (styleId, profile) in scopes {
            let lines = ((profile["lines"] as? [[String: Any]]) ?? []) + ((profile["avoid"] as? [[String: Any]]) ?? [])
            for line in lines {
                guard let id = line["id"] as? String, let text = line["text"] as? String else { continue }
                let mine = text.hasPrefix("uitest")
                let mocked = line["source"] as? String == "learned" && (text.hasPrefix("Reaches for") || text.hasPrefix("Avoids"))
                guard mine || mocked else { continue }
                Self.deleteLine(id, styleId: styleId, token: api.token)
            }
        }
    }

    /// `DELETE …/lines/:id?styleId=`. Not `FitsssTestAPI.send`: it builds
    /// the URL with `appending(path:)`, which would encode the `?` into the
    /// path, and the server would take it as an overall line already gone.
    nonisolated private static func deleteLine(_ id: String, styleId: String?, token: String) {
        var components = URLComponents(url: FitsssTestAPI.base.appending(path: "api/v1/taste/lines/\(id)"), resolvingAgainstBaseURL: false)!
        if let styleId { components.queryItems = [URLQueryItem(name: "styleId", value: styleId)] }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "DELETE"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let done = DispatchSemaphore(value: 0)
        FitsssTestAPI.session.dataTask(with: request) { _, response, _ in
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status != 200 { print("note: DELETE line \(id) answered \(status)") }
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 30)
    }

    /// A line in a scope (`lines` or `avoid`), as the server has it.
    private func line(_ text: String, kind: String, styleId: String?) -> [String: Any]? {
        guard let overview = api.data("GET", "api/v1/taste") as? [String: Any] else { return nil }
        let profile = styleId.map { (overview["byStyle"] as? [String: [String: Any]])?[$0] } ?? overview["overall"] as? [String: Any]
        return ((profile?[kind] as? [[String: Any]]) ?? []).first { $0["text"] as? String == text }
    }

    /// What the You row should say, from the server's lines in every scope.
    private func expectedSummary() -> String {
        guard let overview = api.data("GET", "api/v1/taste") as? [String: Any] else { return "?" }
        let profiles = [overview["overall"] as? [String: Any]].compactMap { $0 }
            + ((overview["byStyle"] as? [String: [String: Any]]) ?? [:]).values
        let count = profiles.reduce(0) {
            $0 + (($1["lines"] as? [Any])?.count ?? 0) + (($1["avoid"] as? [Any])?.count ?? 0)
        }
        return count == 0 ? "Nothing learned yet" : "\(count) learned \(count == 1 ? "line" : "lines")"
    }

    private func summary(in app: XCUIApplication) -> String? {
        let text = app.staticTexts["you.taste.summary"]
        if text.exists { return text.label }
        // The link may merge its texts into one label: "Taste notes, 2 learned lines".
        let row = app.buttons["you.taste"]
        guard row.exists else { return nil }
        return row.label.components(separatedBy: ", ").dropFirst().first
    }

    private func events(_ profile: [String: Any]?) -> Int { profile?["totalEvents"] as? Int ?? 0 }

    private static func suffix() -> String { String(UUID().uuidString.prefix(6).lowercased()) }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Swipes until `element` is on screen and tappable (the list is lazy).
    private func scroll(to element: XCUIElement, in app: XCUIApplication, up: Bool = false, maxSwipes: Int = 8) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < maxSwipes {
            if up { app.swipeDown(velocity: .slow) } else { app.swipeUp(velocity: .slow) }
            swipes += 1
        }
        if swipes > 0 { Thread.sleep(forTimeInterval: 1) }
        XCTAssertTrue(element.exists && element.isHittable, "\(element) is reachable")
    }

    private func clearText(_ field: XCUIElement) {
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        let current = (field.value as? String) ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
    }

    /// Any element whose label or value contains `text`.
    private func labelled(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", text, text)).firstMatch
    }

    private func waitUntil(timeout: TimeInterval = 15, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            Thread.sleep(forTimeInterval: 0.5)
        }
        return condition()
    }
}
