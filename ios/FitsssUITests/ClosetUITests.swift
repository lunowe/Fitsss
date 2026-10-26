import XCTest

/// Walks the Closet tab against the local dev server and keeps screenshots:
/// grid, filter, search, detail, edit → save, the inline error, archive from
/// the detail page and from a tile's context menu, Archived → restore and
/// delete, and the launch routes.
///
/// Every test creates its own piece through the API (nickname
/// `uitest-<random>`) and deletes it afterwards, so the seed closet is left as
/// it was.
@MainActor
final class ClosetUITests: XCTestCase {
    // Touched from the nonisolated XCTest lifecycle overrides as well as the
    // tests; XCTest runs all of them one after another on the main thread.
    nonisolated(unsafe) private var fixtures: ClosetFixtures!
    nonisolated(unsafe) private var created: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        fixtures = try ClosetFixtures.signIn()
    }

    override func tearDown() {
        for id in created {
            fixtures?.delete(id)
        }
        created = []
    }

    // MARK: - Grid, filter, search

    func testGridFilterAndSearch() throws {
        let nickname = Self.uniqueNickname()
        let id = try makePiece(nickname: nickname, quantity: 2)

        let app = FitsssUITests.launch(route: "closet")
        let tile = element("closet.tile.\(id)", in: app)
        XCTAssertTrue(tile.waitForExistence(timeout: 40), "the new piece shows in the grid")
        snapshot("grid", app)

        // A custom category filters to its own pieces only.
        let jewelry = app.buttons["closet.filter.jewelry"]
        if jewelry.waitForExistence(timeout: 5) {
            scrollChips(to: jewelry, in: app, leftwards: true)
            jewelry.tap()
            XCTAssertTrue(tile.waitForNonExistence(timeout: 5), "a top is not in Jewelry")
            snapshot("filter-jewelry", app)
            scrollChips(to: app.buttons["closet.filter.all"], in: app, leftwards: false)
            app.buttons["closet.filter.all"].tap()
            XCTAssertTrue(tile.waitForExistence(timeout: 15))
        }

        let tops = app.buttons["closet.filter.top"]
        XCTAssertTrue(tops.waitForExistence(timeout: 15))
        tops.tap()
        snapshot("filter-tops", app)
        scrollChips(to: app.buttons["closet.filter.all"], in: app, leftwards: false)
        app.buttons["closet.filter.all"].tap()

        // Search matches the nickname (part of the haystack).
        let search = revealSearchField(in: app)
        snapshot("search-open", app)
        search.typeText(nickname)
        XCTAssertTrue(tile.waitForExistence(timeout: 5), "search finds the piece by nickname")
        snapshot("search-hit", app)

        search.typeText("zzz")
        XCTAssertTrue(tile.waitForNonExistence(timeout: 15))
        snapshot("search-empty", app)
    }

    // MARK: - Edit

    func testEditAndSave() throws {
        let nickname = Self.uniqueNickname()
        let id = try makePiece(nickname: nickname)

        let app = FitsssUITests.launch(route: "closet/\(id)")
        XCTAssertTrue(app.buttons["piece.edit.toolbar"].waitForExistence(timeout: 40))
        snapshot("detail-top", app)
        app.swipeUp()
        snapshot("detail-bottom", app)
        app.swipeDown()

        app.buttons["piece.edit.toolbar"].tap()
        let save = app.buttons["edit.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 10))
        snapshot("edit-top", app)

        // Color: Navy from the suggested row, plus a second color.
        app.buttons["Navy"].firstMatch.tap()
        let addSecond = app.buttons["edit.addSecondColor"]
        scroll(to: addSecond, in: app)
        addSecond.tap()

        // Fit: Oversized, then quantity 3 and a new nickname.
        let oversized = app.buttons["Oversized"]
        scroll(to: oversized, in: app, maxSwipes: 20)
        oversized.tap()
        let increment = app.buttons["edit.quantity-Increment"]
        scroll(to: increment, in: app)
        increment.tap()
        increment.tap()
        snapshot("edit-middle", app)

        let field = app.textFields["edit.nickname"]
        scroll(to: field, in: app)
        field.tap()
        field.typeText(" edited")
        snapshot("edit-filled", app)

        save.tap()
        XCTAssertTrue(save.waitForNonExistence(timeout: 20), "the sheet closes after saving")
        expectToast("Saved", in: app)
        snapshot("detail-after-save", app)

        // The server stored exactly what was chosen.
        let fetched = fixtures.block(id)
        let stored = try XCTUnwrap(fetched)
        XCTAssertEqual((stored["color"] as? [String: Any])?["paletteId"] as? String, "navy")
        XCTAssertNotNil(stored["secondaryColor"] as? [String: Any])
        XCTAssertEqual(stored["fit"] as? String, "oversized")
        XCTAssertEqual(stored["quantity"] as? Int, 3)
        XCTAssertEqual(stored["nickname"] as? String, "\(nickname) edited")
        // LabeledContent merges label and value into one element.
        let fitRow = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS 'Oversized' OR value CONTAINS 'Oversized'")).firstMatch
        XCTAssertTrue(fitRow.waitForExistence(timeout: 10), "the detail page shows the server's answer")
    }

    /// Every optional field can be cleared, the server stores the clears
    /// (omitted means null on PATCH), and the detail page shows its answer.
    func testEditClearsOptionalFields() throws {
        let id = try makePiece(nickname: Self.uniqueNickname(), extra: [
            "secondaryColor": ["name": "Navy", "hex": "#1f2a44", "family": "blue", "paletteId": "navy"],
            "notes": "Clear me",
        ])
        let before = try XCTUnwrap(fixtures.block(id))
        XCTAssertNotNil(before["secondaryColor"] as? [String: Any])
        XCTAssertEqual(before["material"] as? String, "cotton")

        let app = FitsssUITests.launch(route: "closet/\(id)/edit")
        let save = app.buttons["edit.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 40))

        let removeSecond = app.buttons["edit.removeSecondColor"]
        scroll(to: removeSecond, in: app, maxSwipes: 25)
        removeSecond.tap()
        XCTAssertTrue(app.buttons["edit.addSecondColor"].waitForExistence(timeout: 15))

        let noMaterial = app.buttons["None"]
        scroll(to: noMaterial, in: app, maxSwipes: 15)
        noMaterial.tap()

        let nickname = app.textFields["edit.nickname"]
        scroll(to: nickname, in: app)
        clearText(nickname)
        // Return ends editing; with the keyboard up the notes field below
        // stays covered however far the sheet scrolls.
        app.typeText("\n")
        let notes = app.descendants(matching: .any)["edit.notes"].firstMatch
        scroll(to: notes, in: app)
        clearText(notes)
        snapshot("clear-filled", app)

        save.tap()
        XCTAssertTrue(save.waitForNonExistence(timeout: 20), "the sheet closes after saving")

        // Stored as cleared, not kept.
        let fetched = fixtures.block(id)
        let after = try XCTUnwrap(fetched)
        for field in ["secondaryColor", "material", "nickname", "notes"] {
            XCTAssertTrue(after[field] == nil || after[field] is NSNull, "\(field) cleared, got \(String(describing: after[field]))")
        }
        let label = try XCTUnwrap(after["label"] as? String)
        XCTAssertFalse(label.contains("navy") || label.contains("cotton"), "label rederived: \(label)")

        // The detail page shows the server's answer.
        let subtitle = label.prefix(1).uppercased() + label.dropFirst()
        XCTAssertTrue(app.staticTexts[subtitle].waitForExistence(timeout: 10), "subtitle is the new label")
        XCTAssertFalse(labelled("Second color", in: app).exists, "no second color row")
        XCTAssertTrue(labelled("Material", in: app).exists)
        XCTAssertFalse(labelled("Cotton", in: app).exists, "material shows as none")
        snapshot("clear-detail", app)
    }

    /// A save that the server refuses shows its message in the sheet and keeps it open.
    func testSaveErrorShowsInline() throws {
        let id = try makePiece(nickname: Self.uniqueNickname())

        let app = FitsssUITests.launch(route: "closet/\(id)/edit")
        let save = app.buttons["edit.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 40), "the edit route opens the sheet")
        snapshot("edit-route", app)

        // Gone on the server while the sheet is open.
        fixtures.delete(id)
        created.removeAll { $0 == id }

        app.buttons["Black"].firstMatch.tap()
        save.tap()
        XCTAssertTrue(app.staticTexts["edit.error"].waitForExistence(timeout: 15))
        XCTAssertTrue(save.exists, "the sheet stays open")
        snapshot("edit-error", app)
    }

    // MARK: - Archive, restore, delete

    func testArchiveRestoreAndDelete() throws {
        let nickname = Self.uniqueNickname()
        let id = try makePiece(nickname: nickname)

        // Remove from the detail page: confirm, pop back, toast.
        let app = FitsssUITests.launch(route: "closet/\(id)")
        XCTAssertTrue(app.buttons["piece.edit.toolbar"].waitForExistence(timeout: 40))
        // The list is lazy: the button only exists once scrolled into view.
        let remove = app.buttons["piece.remove"]
        scroll(to: remove, in: app)
        remove.tap()
        let confirm = app.buttons["Remove"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        snapshot("remove-confirm", app)
        confirm.tap()
        expectToast("Moved to Archived", in: app)
        XCTAssertTrue(app.buttons["closet.filter.all"].waitForExistence(timeout: 20), "back on the grid")
        snapshot("removed-toast", app)
        let archivedAt = fixtures.block(id)?["archivedAt"]
        XCTAssertFalse(archivedAt is NSNull || archivedAt == nil, "archived on the server")

        // Archived link at the foot of the grid, then Restore.
        let link = element("closet.archived", in: app)
        openArchived(link, in: app)
        let restore = app.buttons["archived.restore.\(id)"]
        XCTAssertTrue(restore.waitForExistence(timeout: 10))
        snapshot("archived-list", app)
        restore.tap()
        expectToast("Restored to your closet", in: app)
        XCTAssertTrue(restore.waitForNonExistence(timeout: 15))
        snapshot("restored", app)
        let restored = fixtures.block(id)
        XCTAssertTrue(restored?["archivedAt"] is NSNull || restored?["archivedAt"] == nil, "restored on the server")

        // Remove again from the tile's context menu. Search for the piece so
        // its tile is alone at the top: in a long closet, a tile found by
        // swiping can sit under the pinned chips or the bottom bar, and the
        // press lands on those instead.
        app.navigationBars.buttons.firstMatch.tap()
        let tile = element("closet.tile.\(id)", in: app)
        // Leave the empty search that opened Archived, then search for this piece.
        leaveSearch(in: app)
        let search = revealSearchField(in: app)
        search.typeText(nickname)
        XCTAssertTrue(tile.waitForExistence(timeout: 15), "search finds the restored piece")
        Thread.sleep(forTimeInterval: 1)
        tile.press(forDuration: 1.5)
        let menuRemove = app.buttons["Remove from closet"]
        XCTAssertTrue(menuRemove.waitForExistence(timeout: 15))
        snapshot("context-menu", app)
        menuRemove.tap()
        XCTAssertTrue(app.buttons["Remove"].waitForExistence(timeout: 15))
        app.buttons["Remove"].tap()
        XCTAssertTrue(tile.waitForNonExistence(timeout: 15))
        // Leave search, so the grid (and its Archived link) is whole again.
        leaveSearch(in: app)

        // Delete for good from Archived.
        openArchived(link, in: app)
        let delete = app.buttons["archived.delete.\(id)"]
        XCTAssertTrue(delete.waitForExistence(timeout: 10))
        delete.tap()
        let confirmDelete = app.buttons["Delete for good"]
        XCTAssertTrue(confirmDelete.waitForExistence(timeout: 15))
        snapshot("delete-confirm", app)
        confirmDelete.tap()
        XCTAssertTrue(delete.waitForNonExistence(timeout: 15))
        expectToast("Deleted", in: app)
        snapshot("deleted", app)
        let gone = fixtures.block(id)
        XCTAssertNil(gone, "deleted on the server")
        created.removeAll { $0 == id }
    }

    /// The tile's context menu opens the edit sheet too.
    func testContextMenuEdit() throws {
        let id = try makePiece(nickname: Self.uniqueNickname())
        let app = FitsssUITests.launch(route: "closet")
        let tile = element("closet.tile.\(id)", in: app)
        XCTAssertTrue(tile.waitForExistence(timeout: 40))
        tile.press(forDuration: 1.2)
        let edit = app.buttons["Edit"]
        XCTAssertTrue(edit.waitForExistence(timeout: 15))
        edit.tap()
        XCTAssertTrue(app.buttons["edit.save"].waitForExistence(timeout: 10))
        snapshot("context-edit-sheet", app)
    }

    // MARK: - Routes

    func testArchivedRouteAndAddRoute() throws {
        let app = FitsssUITests.launch(route: "closet/archived")
        XCTAssertTrue(app.navigationBars["Archived"].waitForExistence(timeout: 40))
        snapshot("route-archived", app)

        let add = FitsssUITests.launch(route: "closet/add")
        XCTAssertFalse(add.buttons["closet.add"].waitForExistence(timeout: 15) && add.buttons["closet.add"].isHittable,
                       "the add flow covers the grid")
        snapshot("route-add", add)
    }

    // MARK: - Harness

    private func makePiece(nickname: String, quantity: Int = 1, extra: [String: Any] = [:]) throws -> String {
        let id = try fixtures.createTee(nickname: nickname, quantity: quantity, extra: extra)
        created.append(id)
        return id
    }

    private static func uniqueNickname() -> String {
        "uitest-\(UUID().uuidString.prefix(6).lowercased())"
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.buttons[identifier].firstMatch
    }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Opens the Archived list from the grid. Searching for something no piece
    /// matches first leaves the grid empty, so the link at its foot is on
    /// screen however big the dev closet has grown.
    private func openArchived(_ link: XCUIElement, in app: XCUIApplication) {
        let search = revealSearchField(in: app)
        search.typeText("zz-no-such-piece")
        XCTAssertTrue(link.waitForExistence(timeout: 10), "the Archived link shows under an empty search")
        link.tap()
    }

    /// Closes the search field (its button is "Close" on iOS 27, "Cancel" before).
    private func leaveSearch(in app: XCUIApplication) {
        for label in ["Close", "Cancel"] {
            let button = app.navigationBars.buttons[label]
            if button.waitForExistence(timeout: 2) { button.tap(); return }
        }
    }

    /// Whether `element` sits above the edit sheet's pinned Save bar. XCUITest
    /// calls an element under the bar hittable, and the tap then lands on
    /// Save: a sheet saved half-edited.
    private func clearOfBar(_ element: XCUIElement, in app: XCUIApplication) -> Bool {
        let save = app.buttons["edit.save"]
        guard save.exists, element != save else { return true }
        return element.frame.maxY < save.frame.minY - 12
    }

    /// Swipes up until `element` is on screen and tappable.
    private func scroll(
        to element: XCUIElement,
        in app: XCUIApplication,
        maxSwipes: Int = 10,
        velocity: XCUIGestureVelocity = .slow
    ) {
        var swipes = 0
        while !(element.exists && element.isHittable && clearOfBar(element, in: app)), swipes < maxSwipes {
            app.swipeUp(velocity: velocity)
            swipes += 1
        }
        // A tap during the deceleration only stops the scroll. (No swiping
        // back down: in a sheet that dismisses it.)
        if swipes > 0 { Thread.sleep(forTimeInterval: 1) }
        XCTAssertTrue(element.isHittable, "\(element) is reachable")
    }

    /// Drags the chip row until `chip` is fully on screen. Offscreen chips
    /// exist (the row is not lazy) but have no hit point, so compare frames
    /// and drag by coordinates.
    private func scrollChips(to chip: XCUIElement, in app: XCUIApplication, leftwards: Bool) {
        let screen = app.windows.firstMatch.frame
        var drags = 0
        while !(chip.frame.minX >= screen.minX && chip.frame.maxX <= screen.maxX), drags < 6 {
            let origin = app.coordinate(withNormalizedOffset: .zero)
            let y = chip.frame.midY
            let start = origin.withOffset(CGVector(dx: leftwards ? screen.width * 0.8 : screen.width * 0.2, dy: y))
            let end = origin.withOffset(CGVector(dx: leftwards ? screen.width * 0.2 : screen.width * 0.8, dy: y))
            start.press(forDuration: 0.05, thenDragTo: end)
            drags += 1
        }
    }

    /// Taps at the end of a field and deletes everything in it.
    private func clearText(_ field: XCUIElement) {
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
        let current = (field.value as? String) ?? ""
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 2))
    }

    /// Any element whose label or value contains `text`. LabeledContent rows
    /// merge both into one element, so `staticTexts[text]` misses them.
    private func labelled(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", text, text)).firstMatch
    }

    /// Toasts last 2.5s; on a loaded machine the check can come too late, so
    /// a miss is noted, not failed. The test checks the outcome itself.
    private func expectToast(_ message: String, in app: XCUIApplication) {
        if !app.staticTexts[message].waitForExistence(timeout: 3) {
            print("note: toast “\(message)” not seen (may have expired)")
        }
    }

    /// Opens search with the toolbar button, like the web's search icon.
    private func revealSearchField(in app: XCUIApplication) -> XCUIElement {
        app.buttons["closet.search"].tap()
        let field = app.searchFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 10), "search field exists")
        return field
    }
}

/// Talks to the dev server directly, to set up and check pieces. Blocking on
/// purpose: UI tests are synchronous, and async XCTest methods hang after a
/// failed assertion when `continueAfterFailure` is false.
nonisolated struct ClosetFixtures {
    static let base = URL(string: "http://localhost:3100")!
    /// No cookies at all: once a better-auth session cookie is sent back, the
    /// server demands an Origin header on sign-in (403 MISSING_OR_NULL_ORIGIN).
    static let session: URLSession = {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpShouldSetCookies = false
        configuration.httpCookieAcceptPolicy = .never
        return URLSession(configuration: configuration)
    }()

    let token: String

    static func signIn() throws -> ClosetFixtures {
        let body: [String: Any] = ["email": "dev@fitsss.local", "password": "fitsss-dev-1234"]
        let response = try send("POST", "api/auth/sign-in/email", body: body, token: nil)
        let token = try XCTUnwrap(
            response.headers?.value(forHTTPHeaderField: "set-auth-token"),
            "sign-in answered \(response.status): \(response.json ?? [:])"
        )
        return ClosetFixtures(token: token)
    }

    /// A white regular cotton t-shirt with a nickname; `extra` adds or
    /// replaces input fields (a second color, notes).
    func createTee(nickname: String, quantity: Int, extra: [String: Any] = [:]) throws -> String {
        var body: [String: Any] = [
            "typeId": "t-shirt",
            "color": ["name": "White", "hex": "#ffffff", "family": "neutral", "paletteId": "white"],
            "fit": "regular",
            "material": "cotton",
            "pattern": "solid",
            "quantity": quantity,
            "nickname": nickname,
        ]
        body.merge(extra) { _, new in new }
        let response = try Self.send("POST", "api/v1/blocks", body: body, token: token)
        XCTAssertEqual(response.status, 201)
        let created = ((response.json?["data"] as? [String: Any])?["created"] as? [[String: Any]])?.first
        return try XCTUnwrap(created?["id"] as? String)
    }

    /// The stored piece, nil once it is gone.
    func block(_ id: String) -> [String: Any]? {
        guard let response = try? Self.send("GET", "api/v1/blocks/\(id)", token: token), response.status != 404 else {
            return nil
        }
        return response.json?["data"] as? [String: Any]
    }

    func delete(_ id: String) {
        _ = try? Self.send("DELETE", "api/v1/blocks/\(id)", token: token)
    }

    private struct Response {
        var status: Int
        var json: [String: Any]?
        var headers: HTTPURLResponse?
    }

    private static func send(_ method: String, _ path: String, body: Any? = nil, token: String?) throws -> Response {
        var request = URLRequest(url: base.appending(path: path))
        request.httpMethod = method
        request.timeoutInterval = 60
        if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let box = ResponseBox()
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
nonisolated private final class ResponseBox: @unchecked Sendable {
    var data: Data?
    var response: HTTPURLResponse?
}
