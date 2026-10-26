import XCTest

/// Walks the Looks tab against the local dev server and keeps screenshots:
/// grid → detail, "Wore this today", rename (the server's inline error, then
/// a real name), remove; the card's context menu; the `looks/<id>/rename`
/// route.
///
/// Every test saves its own look through the API (a mock generation, so it
/// costs nothing; `LLM_MOCK=1`) and removes it afterwards.
@MainActor
final class LooksUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!
    nonisolated(unsafe) private var created: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
    }

    override func tearDown() {
        for id in created {
            api?.send("DELETE", "api/v1/looks/\(id)")
        }
        created = []
    }

    // MARK: - Open, wear, rename, remove

    func testOpenWearRenameRemove() throws {
        let name = "uitest look \(Self.suffix())"
        let id = try makeLook(name: name)

        let app = FitsssUITests.launch(route: "looks")
        let card = app.buttons["looks.card.\(id)"]
        XCTAssertTrue(card.waitForExistence(timeout: 40), "the saved look shows in the grid")
        snapshot("grid", app)

        card.tap()
        XCTAssertTrue(app.navigationBars.staticTexts[name].waitForExistence(timeout: 15), "the detail is titled with the look's name")
        XCTAssertTrue(app.descendants(matching: .any)["look.flatLay"].firstMatch.waitForExistence(timeout: 10))
        snapshot("detail-top", app)

        // Wear: the count goes up, the footer shows the date, the server agrees.
        let wear = app.buttons["look.wear"]
        scroll(to: wear, in: app)
        XCTAssertTrue(labelled("Not yet", in: app).exists, "never worn yet")
        snapshot("detail-actions", app)
        wear.tap()
        expectToast("Logged as worn today", in: app)
        XCTAssertTrue(labelled("Worn 1×", in: app).waitForExistence(timeout: 15), "the count shows the server's answer")
        XCTAssertTrue(app.staticTexts["look.lastWorn"].waitForExistence(timeout: 5), "the last-worn footer appears")
        snapshot("worn", app)
        let worn = try XCTUnwrap(api.data("GET", "api/v1/looks/\(id)") as? [String: Any])
        XCTAssertEqual(worn["wornCount"] as? Int, 1)
        XCTAssertFalse(worn["lastWornAt"] is NSNull || worn["lastWornAt"] == nil, "lastWornAt set")

        // Rename to nothing: the server refuses and says why, inline.
        app.buttons["look.rename"].tap()
        let field = app.textFields["look.rename.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        clearText(field)
        app.buttons["look.rename.save"].tap()
        let error = app.staticTexts["look.rename.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 15), "the server's message shows in the sheet")
        XCTAssertTrue(error.label.contains("name"), "says the name is missing: \(error.label)")
        snapshot("rename-error", app)

        // Longer than 60 characters: the field keeps the first 60, and what
        // it shows is what gets stored.
        let renamed = "uitest renamed \(Self.suffix())"
        let long = renamed + " " + String(repeating: "x", count: 60)
        field.typeText(long)
        Thread.sleep(forTimeInterval: 1)
        let typed = (field.value as? String) ?? ""
        snapshot("rename-long", app)
        XCTAssertEqual(typed, String(long.prefix(60)), "the field stops at 60 characters")
        app.buttons["look.rename.save"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 20), "the sheet closes after saving")
        expectToast("Renamed", in: app)
        let clipped = try XCTUnwrap(api.data("GET", "api/v1/looks/\(id)") as? [String: Any])
        XCTAssertEqual(clipped["name"] as? String, String(long.prefix(60)), "stored as shown")

        // A plain new name.
        app.buttons["look.rename"].tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        clearText(field)
        field.typeText(renamed)
        snapshot("rename-filled", app)
        app.buttons["look.rename.save"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 20), "the sheet closes after saving")
        XCTAssertTrue(app.navigationBars.staticTexts[renamed].waitForExistence(timeout: 10), "the title shows the new name")
        let stored = try XCTUnwrap(api.data("GET", "api/v1/looks/\(id)") as? [String: Any])
        XCTAssertEqual(stored["name"] as? String, renamed)
        snapshot("renamed", app)

        // Remove: confirm, back on the grid, gone on the server.
        let remove = app.buttons["look.remove"]
        scroll(to: remove, in: app)
        remove.tap()
        let confirm = app.buttons["Remove"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        snapshot("remove-confirm", app)
        confirm.tap()
        XCTAssertTrue(app.navigationBars["Looks"].waitForExistence(timeout: 15), "back on the grid")
        XCTAssertTrue(card.waitForNonExistence(timeout: 10), "the card is gone")
        expectToast("Look removed", in: app)
        snapshot("removed", app)
        XCTAssertEqual(api.send("GET", "api/v1/looks/\(id)").status, 404, "removed on the server")
        created.removeAll { $0 == id }
    }

    // MARK: - Context menu and routes

    /// Long-press a card: "Wore this today" records a wear without opening it.
    /// Then the rename route opens the detail with the sheet up.
    func testContextMenuWearAndRenameRoute() throws {
        let id = try makeLook(name: "uitest menu \(Self.suffix())")

        let app = FitsssUITests.launch(route: "looks")
        let card = app.buttons["looks.card.\(id)"]
        XCTAssertTrue(card.waitForExistence(timeout: 40))
        Thread.sleep(forTimeInterval: 1)
        card.press(forDuration: 1.5)
        let wear = app.buttons["Wore this today"]
        XCTAssertTrue(wear.waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["Rename"].exists)
        XCTAssertTrue(app.buttons["Remove look"].exists)
        snapshot("context-menu", app)
        wear.tap()
        expectToast("Logged as worn today", in: app)
        XCTAssertTrue(waitUntil { (self.api.data("GET", "api/v1/looks/\(id)") as? [String: Any])?["wornCount"] as? Int == 1 },
                      "worn once on the server")

        let routed = FitsssUITests.launch(route: "looks/\(id)/rename")
        let field = routed.textFields["look.rename.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 40), "the rename route opens the sheet")
        snapshot("route-rename", routed)
        routed.buttons["look.rename.cancel"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 10))
        XCTAssertTrue(labelled("Worn 1×", in: routed).waitForExistence(timeout: 10) || {
            routed.swipeUp()
            return labelled("Worn 1×", in: routed).waitForExistence(timeout: 5)
        }(), "the detail shows the wear from the menu")
        snapshot("route-detail", routed)
    }

    // MARK: - Harness

    /// Generates mock outfits and saves the first under `name`, with Clean
    /// minimal's id when that style exists, so the meta line has all three parts.
    private func makeLook(name: String) throws -> String {
        let styles = (api.data("GET", "api/v1/styles") as? [[String: Any]]) ?? []
        let styleId = styles.first { $0["name"] as? String == "Clean minimal" }?["id"] as? String
        let weather: [String: Any] = ["tempC": 18.4, "condition": "cloudy", "source": "manual"]
        var request: [String: Any] = ["occasion": "everyday", "weather": weather, "count": 1, "pinned": [], "excluded": []]
        if let styleId { request["styleId"] = styleId }
        let generation = try XCTUnwrap(api.data("POST", "api/v1/generations", body: request) as? [String: Any], "mock generation")
        var outfit = try XCTUnwrap((generation["outfits"] as? [[String: Any]])?.first)
        outfit["name"] = name
        outfit["tip"] = "Roll the sleeves once."
        var body: [String: Any] = ["outfit": outfit, "occasion": "everyday", "weather": weather]
        if let styleId { body["styleId"] = styleId }
        if let generationId = generation["id"] { body["generationId"] = generationId }
        let look = try XCTUnwrap(api.data("POST", "api/v1/looks", body: body) as? [String: Any], "saved look")
        let id = try XCTUnwrap(look["id"] as? String)
        created.append(id)
        return id
    }

    private static func suffix() -> String { String(UUID().uuidString.prefix(6).lowercased()) }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Swipes up until `element` is on screen and tappable (the list is lazy).
    private func scroll(to element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 8) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < maxSwipes {
            app.swipeUp(velocity: .slow)
            swipes += 1
        }
        if swipes > 0 { Thread.sleep(forTimeInterval: 1) }
        XCTAssertTrue(element.isHittable, "\(element) is reachable")
    }

    private func clearText(_ field: XCUIElement) {
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        let current = (field.value as? String) ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
    }

    /// Any element whose label or value contains `text` (LabeledContent merges both).
    private func labelled(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", text, text)).firstMatch
    }

    /// Toasts last 2.5s; a miss is noted, not failed. The test checks the outcome itself.
    private func expectToast(_ message: String, in app: XCUIApplication) {
        if !app.staticTexts[message].waitForExistence(timeout: 3) {
            print("note: toast “\(message)” not seen (may have expired)")
        }
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

/// Talks to the dev server directly, to set up and check looks and styles.
/// Blocking on purpose: UI tests are synchronous, and async XCTest methods
/// hang after a failed assertion when `continueAfterFailure` is false.
nonisolated struct FitsssTestAPI {
    static let base = URL(string: "http://localhost:3100")!
    /// No cookies: once a better-auth session cookie is sent back, sign-in
    /// demands an Origin header (403 MISSING_OR_NULL_ORIGIN).
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        return URLSession(configuration: configuration)
    }()

    let token: String

    static func signIn() throws -> FitsssTestAPI {
        let response = Self.send(
            "POST", "api/auth/sign-in/email",
            body: ["email": "dev@fitsss.local", "password": "fitsss-dev-1234"], token: nil
        )
        let token = try XCTUnwrap(response.headers?.value(forHTTPHeaderField: "set-auth-token"), "sign-in answered \(response.status)")
        return FitsssTestAPI(token: token)
    }

    struct Response {
        var status: Int
        var json: [String: Any]?
        var headers: HTTPURLResponse?
    }

    /// The `data` of a 2xx answer, nil otherwise (logged). A read that gets
    /// no answer or a 5xx is tried once more: the dev server recompiles now
    /// and then.
    func data(_ method: String, _ path: String, body: Any? = nil) -> Any? {
        var response = send(method, path, body: body)
        if method == "GET", response.status == 0 || response.status >= 500 {
            Thread.sleep(forTimeInterval: 2)
            response = send(method, path, body: body)
        }
        guard (200..<300).contains(response.status) else {
            print("note: \(method) \(path) answered \(response.status): \(response.json ?? [:])")
            return nil
        }
        return response.json?["data"]
    }

    @discardableResult
    func send(_ method: String, _ path: String, body: Any? = nil) -> Response {
        Self.send(method, path, body: body, token: token)
    }

    private static func send(_ method: String, _ path: String, body: Any?, token: String?) -> Response {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 60
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body, let encoded = try? JSONSerialization.data(withJSONObject: body) {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = encoded
        }
        let box = TestResponseBox()
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
nonisolated private final class TestResponseBox: @unchecked Sendable {
    var data: Data?
    var response: HTTPURLResponse?
}
