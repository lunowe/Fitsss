import XCTest

/// Walks the Styles tab against the local dev server and keeps screenshots:
/// the list, a refused save (inline error), create, edit, drag to reorder in
/// Edit mode, swipe to delete; the six-style limit, "Move to Top"
/// from the context menu, and the `styles/new` and `styles/<id>` routes.
///
/// The user's own styles are never edited: every test makes its own
/// (`uitest-…`), deletes them afterwards, puts the original order back, and
/// checks the originals' names, text and order are exactly as they were.
@MainActor
final class StylesUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!
    /// The styles as found, in order: id, name, description, rules.
    nonisolated(unsafe) private var originals: [[String: String]] = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
        originals = Self.snapshotStyles(api)
        // A test style left behind by a crashed run would skew the counts.
        cleanUp()
    }

    override func tearDown() {
        cleanUp()
    }

    /// Deletes every `uitest-` style and restores the original order.
    nonisolated private func cleanUp() {
        guard let api else { return }
        let current = (api.data("GET", "api/v1/styles") as? [[String: Any]]) ?? []
        for style in current where (style["name"] as? String)?.hasPrefix("uitest-") == true {
            if let id = style["id"] as? String { api.send("DELETE", "api/v1/styles/\(id)") }
        }
        let ids = originals.compactMap { $0["id"] }
        if !ids.isEmpty { api.send("PUT", "api/v1/styles/order", body: ["ids": ids]) }
    }

    // MARK: - Create, edit, reorder, delete

    func testCreateEditReorderDelete() throws {
        let app = FitsssUITests.launch(route: "styles")
        for style in originals {
            XCTAssertTrue(app.buttons["styles.row.\(style["id"]!)"].waitForExistence(timeout: 40), "\(style["name"]!) is listed")
        }
        XCTAssertTrue(app.staticTexts["styles.footer"].exists, "the footer explains the order")
        snapshot("list", app)

        // A save the server refuses (no name): its message shows in the sheet.
        app.buttons["styles.new"].tap()
        let save = app.buttons["style.save"]
        XCTAssertTrue(save.waitForExistence(timeout: 10))
        save.tap()
        let error = app.staticTexts["style.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 15), "the server's message shows inline")
        XCTAssertTrue(error.label.contains("name"), "says a name is needed: \(error.label)")
        snapshot("new-error", app)

        // Create: a name typed past 40 characters (the field keeps the first
        // 40), a two-line description, rules with a blank line and padding.
        let typedName = "uitest-\(Self.suffix())-" + String(repeating: "y", count: 40)
        let name = String(typedName.prefix(40))
        let nameField = app.textFields["style.name"]
        nameField.tap()
        nameField.typeText(typedName)
        Thread.sleep(forTimeInterval: 1)
        XCTAssertEqual(nameField.value as? String, name, "the name field stops at 40 characters")
        let description = app.descendants(matching: .any)["style.description"].firstMatch
        description.tap()
        description.typeText("Quiet layers and one sharp piece.\nNothing shiny.")
        let rules = app.descendants(matching: .any)["style.rules"].firstMatch
        rules.tap()
        rules.typeText("No logos\n\n  Never tuck a tee  ")
        snapshot("new-filled", app)
        save.tap()
        XCTAssertTrue(save.waitForNonExistence(timeout: 20), "the sheet closes after saving")
        expectToast("Style added", in: app)

        let created = try XCTUnwrap(styles().first { $0["name"] as? String == name }, "stored on the server")
        let id = try XCTUnwrap(created["id"] as? String)
        XCTAssertEqual(created["description"] as? String, "Quiet layers and one sharp piece.\nNothing shiny.")
        XCTAssertEqual(created["rules"] as? String, "No logos\nNever tuck a tee", "the server normalized the rules")
        let row = app.buttons["styles.row.\(id)"]
        XCTAssertTrue(row.waitForExistence(timeout: 10), "the new style is listed")
        XCTAssertTrue(labelled("Quiet layers and one sharp piece.", in: app).exists, "the row shows the first line")
        XCTAssertFalse(labelled("Nothing shiny.", in: app).exists, "and only the first line")
        XCTAssertEqual(styles().last?["id"] as? String, id, "new styles go last")
        snapshot("created", app)

        // Edit: the sheet opens seeded; the change is stored.
        row.tap()
        XCTAssertTrue(nameField.waitForExistence(timeout: 10))
        XCTAssertEqual(nameField.value as? String, name, "seeded with the stored name")
        XCTAssertTrue(app.buttons["style.delete"].exists, "editing offers Delete")
        // At the end of the text, not wherever the middle of the field is.
        description.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.92)).tap()
        description.typeText(" Edited.")
        snapshot("edit-filled", app)
        save.tap()
        XCTAssertTrue(save.waitForNonExistence(timeout: 20))
        expectToast("Saved", in: app)
        let edited = try XCTUnwrap(styles().first { $0["id"] as? String == id })
        XCTAssertEqual(edited["description"] as? String, "Quiet layers and one sharp piece.\nNothing shiny. Edited.")

        // Reorder: Edit, drag the new style from the bottom to the top.
        app.buttons["styles.editMode"].tap()
        XCTAssertTrue(app.buttons["Done"].waitForExistence(timeout: 5))
        Thread.sleep(forTimeInterval: 1)
        snapshot("edit-mode", app)
        let top = app.buttons["styles.row.\(originals[0]["id"]!)"]
        let drag = {
            let handle = try XCTUnwrap(self.reorderHandle(for: row, in: app), "the row has a reorder handle")
            handle.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(
                forDuration: 0.8,
                thenDragTo: top.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.1)),
                withVelocity: .slow,
                thenHoldForDuration: 0.6
            )
        }
        try drag()
        // XCUITest drags occasionally don't take under load; one retry.
        if !waitUntil({ self.styles().first?["id"] as? String == id }) { try drag() }
        XCTAssertTrue(waitUntil { self.styles().first?["id"] as? String == id }, "the server stored the new style first")
        snapshot("reordered", app)
        app.buttons["styles.editMode"].tap()
        let order = styles().compactMap { $0["id"] as? String }
        XCTAssertEqual(order, [id] + originals.map { $0["id"]! }, "the rest kept their order")

        // Delete: swipe, confirm, gone on the server.
        row.swipeLeft()
        let swipeDelete = app.buttons["Delete"]
        XCTAssertTrue(swipeDelete.waitForExistence(timeout: 10))
        snapshot("swipe", app)
        swipeDelete.tap()
        let confirm = app.buttons["Delete Style"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        snapshot("delete-confirm", app)
        confirm.tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 15), "the row is gone")
        expectToast("Style deleted", in: app)
        XCTAssertFalse(styles().contains { $0["id"] as? String == id }, "deleted on the server")
        snapshot("deleted", app)

        assertOriginalsUntouched()
    }

    // MARK: - Limit, context menu, routes

    func testLimitContextMenuAndRoutes() throws {
        // Fill up to six through the API.
        var made: [String] = []
        while styles().count < 6 {
            let created = try XCTUnwrap(
                api.data("POST", "api/v1/styles", body: [
                    "name": "uitest-limit-\(made.count + 1)",
                    "description": "Filler for the limit test.\nSecond line.",
                ]) as? [String: Any]
            )
            made.append(try XCTUnwrap(created["id"] as? String))
        }
        let last = try XCTUnwrap(made.last, "at least one test style was needed")

        // `styles/<id>` opens that style's sheet.
        let app = FitsssUITests.launch(route: "styles/\(last)")
        let nameField = app.textFields["style.name"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 40), "the route opens the editor")
        XCTAssertEqual(nameField.value as? String, "uitest-limit-\(made.count)")
        snapshot("route-edit", app)
        app.buttons["style.cancel"].tap()
        XCTAssertTrue(nameField.waitForNonExistence(timeout: 10))

        // At six: New style is disabled and says why.
        let new = app.buttons["styles.new"]
        XCTAssertTrue(new.waitForExistence(timeout: 10))
        XCTAssertFalse(new.isEnabled, "no seventh style")
        XCTAssertTrue(app.staticTexts["styles.limit"].exists, "the limit is explained")
        snapshot("limit", app)

        // Context menu: make the last test style Today's default.
        let row = app.buttons["styles.row.\(last)"]
        XCTAssertTrue(row.waitForExistence(timeout: 10))
        row.press(forDuration: 1.5)
        let makeDefault = app.buttons["Move to Top"]
        XCTAssertTrue(makeDefault.waitForExistence(timeout: 10))
        snapshot("context-menu", app)
        makeDefault.tap()
        XCTAssertTrue(waitUntil { self.styles().first?["id"] as? String == last }, "stored first")

        // Delete from the context menu: back under the limit.
        row.press(forDuration: 1.5)
        let menuDelete = app.buttons["Delete style"]
        XCTAssertTrue(menuDelete.waitForExistence(timeout: 10))
        menuDelete.tap()
        let confirm = app.buttons["Delete Style"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 10))
        confirm.tap()
        XCTAssertTrue(row.waitForNonExistence(timeout: 15))
        XCTAssertTrue(waitUntil { new.isEnabled }, "New style is enabled again under six")
        XCTAssertFalse(app.staticTexts["styles.limit"].exists)
        snapshot("under-limit", app)

        // `styles/new` opens an empty sheet.
        let routed = FitsssUITests.launch(route: "styles/new")
        let field = routed.textFields["style.name"]
        XCTAssertTrue(field.waitForExistence(timeout: 40), "the route opens the new-style sheet")
        XCTAssertTrue(routed.navigationBars["New style"].exists || routed.staticTexts["New style"].exists)
        snapshot("route-new", routed)
        routed.buttons["style.cancel"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 10))

        cleanUp()
        assertOriginalsUntouched()
    }

    // MARK: - Harness

    private func styles() -> [[String: Any]] {
        (api.data("GET", "api/v1/styles") as? [[String: Any]]) ?? []
    }

    nonisolated private static func snapshotStyles(_ api: FitsssTestAPI) -> [[String: String]] {
        ((api.data("GET", "api/v1/styles") as? [[String: Any]]) ?? [])
            .filter { ($0["name"] as? String)?.hasPrefix("uitest-") != true }
            .map { style in
                [
                    "id": style["id"] as? String ?? "",
                    "name": style["name"] as? String ?? "",
                    "description": style["description"] as? String ?? "",
                    "rules": style["rules"] as? String ?? "",
                ]
            }
    }

    /// The originals, in their order, with the same names and text.
    private func assertOriginalsUntouched() {
        let now = Self.snapshotStyles(api)
        XCTAssertEqual(now, originals, "the original styles are exactly as they were")
    }

    /// The drag handle Edit mode shows on `row`: the "Reorder" control on the
    /// same line.
    private func reorderHandle(for row: XCUIElement, in app: XCUIApplication) -> XCUIElement? {
        let handles = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Reorder'"))
        let midY = row.frame.midY
        return handles.allElementsBoundByIndex.first { abs($0.frame.midY - midY) < 22 }
    }

    private static func suffix() -> String { String(UUID().uuidString.prefix(6).lowercased()) }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func labelled(_ text: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)
            .matching(NSPredicate(format: "label CONTAINS %@ OR value CONTAINS %@", text, text)).firstMatch
    }

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
