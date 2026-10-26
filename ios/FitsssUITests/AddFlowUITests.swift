import XCTest

/// Walks the cart-style add flow against the local dev server and leaves
/// screenshots in the result bundle. Pieces saved by `testAddsTwoTypesAndSaves`
/// are real; delete them afterwards through the API.
@MainActor
final class AddFlowUITests: XCTestCase {

    // MARK: - Flows

    /// Category -> type -> several colors and two fits -> cart, a second
    /// type, quantities in the cart sheet, save.
    func testAddsTwoTypesAndSaves() {
        continueAfterFailure = false
        let app = launch(route: "closet/add")
        emptyCart(app)
        snapshot("01-categories", app)

        app.buttons["addflow.category.top"].tap()
        XCTAssertTrue(app.buttons["addflow.type.t-shirt"].waitForExistence(timeout: 5))
        snapshot("02-type-grid", app)

        app.buttons["addflow.type.t-shirt"].tap()
        let add = app.buttons["addflow.addToCart"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        XCTAssertFalse(add.isEnabled)
        snapshot("03-configurator-empty", app)

        // Three colors (two suggested, one from the palette), two fits: 6 pieces.
        app.buttons["addflow.suggested.white"].tap()
        app.buttons["addflow.suggested.black"].tap()
        tap("addflow.color.sage", in: app)
        snapshot("04-configurator-colors", app)
        tap("addflow.chip.regular", in: app)
        tap("addflow.chip.relaxed", in: app)
        XCTAssertEqual(add.label, "Add 6 to cart")
        snapshot("05-configurator-picked", app)

        add.tap()
        let pill = app.buttons["addflow.cartPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["addflow.type.shirt"].waitForExistence(timeout: 5), "back on the type grid")
        snapshot("06-grid-with-pill", app)
        XCTAssertEqual(pill.label, "Cart, 6 pieces")

        // A second type, with a custom color.
        app.buttons["addflow.type.shirt"].tap()
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        tap("addflow.addCustomColor", in: app)
        let name = app.textFields["addflow.customName"]
        XCTAssertTrue(name.waitForExistence(timeout: 5))
        name.typeText("Dusty rose")
        let hex = app.textFields["addflow.customHex"]
        hex.tap()
        hex.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 12) + "#c48a8a")
        snapshot("07-custom-color", app)
        app.buttons["addflow.customAdd"].tap()
        tap("addflow.chip.regular", in: app)
        XCTAssertEqual(add.label, "Add 1 to cart")
        add.tap()
        XCTAssertTrue(app.buttons["addflow.type.t-shirt"].waitForExistence(timeout: 5))
        XCTAssertEqual(pill.label, "Cart, 7 pieces")

        // Review: one more of the first line, remove the second.
        pill.tap()
        let save = app.buttons["addflow.saveCart"]
        XCTAssertTrue(save.waitForExistence(timeout: 5))
        XCTAssertEqual(save.label, "Add 7 pieces to closet")
        snapshot("08-cart", app)
        app.buttons.matching(identifier: "addflow.increment").element(boundBy: 0).tap()
        app.buttons.matching(identifier: "addflow.decrement").element(boundBy: 1).tap()
        XCTAssertEqual(save.label, "Add 7 pieces to closet")
        expandSheet(app)
        snapshot("09-cart-edited", app)

        save.tap()
        XCTAssertTrue(app.buttons["addflow.close"].waitForNonExistence(timeout: 15), "the flow closes after saving")
        snapshot("10-saved", app)
    }

    /// Every screen of the flow without saving anything; run once in light
    /// and once in dark mode (`xcrun simctl ui <udid> appearance dark`).
    func testTour() {
        continueAfterFailure = false
        let app = launch(route: "closet/add")
        emptyCart(app)
        let mode = appearance
        snapshot("tour-01-categories\(mode)", app)

        app.buttons["addflow.category.footwear"].tap()
        XCTAssertTrue(app.buttons["addflow.type.sneakers"].waitForExistence(timeout: 5))
        snapshot("tour-02-shoes\(mode)", app)
        app.buttons["addflow.type.sneakers"].tap()
        let add = app.buttons["addflow.addToCart"]
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        snapshot("tour-03-configurator-empty\(mode)", app)
        app.buttons["addflow.suggested.white"].tap()
        app.buttons["addflow.suggested.black"].tap()
        app.buttons["addflow.suggested.off-white"].tap()
        snapshot("tour-04-configurator-colors\(mode)", app)
        tap("addflow.addCustomColor", in: app)
        XCTAssertTrue(app.textFields["addflow.customName"].waitForExistence(timeout: 5))
        snapshot("tour-05-custom-color\(mode)", app)
        app.buttons["Cancel"].tap()
        tap("addflow.chip.high-top", in: app)
        tap("addflow.chip.retro", in: app)
        snapshot("tour-06-configurator-styles\(mode)", app)
        add.tap()

        let pill = app.buttons["addflow.cartPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        XCTAssertEqual(pill.label, "Cart, 6 pieces")
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(app.buttons["addflow.category.top"].waitForExistence(timeout: 5))
        app.buttons["addflow.category.top"].tap()
        app.buttons["addflow.type.polo"].tap()
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        app.buttons["addflow.suggested.navy"].tap()
        tap("addflow.chip.regular", in: app)
        snapshot("tour-07-configurator-with-pill\(mode)", app)
        add.tap()
        XCTAssertTrue(app.buttons["addflow.type.polo"].waitForExistence(timeout: 5))
        snapshot("tour-08-grid-with-pill\(mode)", app)

        pill.tap()
        XCTAssertTrue(app.buttons["addflow.saveCart"].waitForExistence(timeout: 5))
        snapshot("tour-09-cart\(mode)", app)
        app.buttons.matching(identifier: "addflow.increment").element(boundBy: 0).tap()
        app.buttons.matching(identifier: "addflow.increment").element(boundBy: 0).tap()
        app.swipeUp()
        snapshot("tour-10-cart-large\(mode)", app)
        clearFromSheet(app)
    }

    /// The cart survives the app being killed mid-flow, across categories.
    func testCartSurvivesRelaunch() {
        continueAfterFailure = false
        var app = launch(route: "closet/add/top/t-shirt")
        emptyCart(app)
        let add = app.buttons["addflow.addToCart"]
        app.buttons["addflow.suggested.navy"].tap()
        tap("addflow.chip.boxy", in: app)
        add.tap()
        let pill = app.buttons["addflow.cartPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        app.buttons["addflow.category.footwear"].tap()
        app.buttons["addflow.type.sneakers"].tap()
        XCTAssertTrue(add.waitForExistence(timeout: 5))
        app.buttons["addflow.suggested.white"].tap()
        tap("addflow.chip.low-top", in: app)
        add.tap()
        XCTAssertTrue(app.buttons["addflow.type.sneakers"].waitForExistence(timeout: 5))
        XCTAssertEqual(pill.label, "Cart, 2 pieces")

        app.terminate()
        app = launch(route: "closet/add")
        let restored = app.buttons["addflow.cartPill"]
        XCTAssertTrue(restored.waitForExistence(timeout: 15))
        XCTAssertEqual(restored.label, "Cart, 2 pieces")
        snapshot("relaunch-01-pill", app)
        restored.tap()
        XCTAssertTrue(app.buttons["addflow.saveCart"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Shoes"].exists, "grouped by category")
        snapshot("relaunch-02-cart", app)
        clearFromSheet(app)
        XCTAssertFalse(app.buttons["addflow.cartPill"].waitForExistence(timeout: 2))
    }

    /// Saves whatever cart is stored (inject one with `simctl spawn defaults
    /// write` first) and shows how the sheet reports what the server rejected.
    func testSavesStoredCart() throws {
        try XCTSkipUnless(
            ProcessInfo.processInfo.environment["ADDFLOW_STORED_CART"] == "1",
            "needs a cart injected with `simctl spawn defaults write` (TEST_RUNNER_ADDFLOW_STORED_CART=1)"
        )
        continueAfterFailure = false
        let app = launch(route: "closet/add/cart")
        let save = app.buttons["addflow.saveCart"]
        XCTAssertTrue(save.waitForExistence(timeout: 10), "a stored cart opens with the sheet")
        snapshot("stored-01-before-save", app)
        save.tap()
        _ = app.staticTexts["addflow.cartError"].waitForExistence(timeout: 10)
        snapshot("stored-02-after-save", app)
    }

    // MARK: - Unconfirmed saves
    //
    // Need `node /tmp/addflow-proxy.mjs` (forwards :3199 to :3100, and drops or
    // holds the answer to POST /api/v1/blocks) and TEST_RUNNER_ADDFLOW_PROXY=1.
    // Write the mode to /tmp/addflow-proxy-mode first: `drop-once` for the lost
    // answer, `delay` for the kill mid-save.

    /// The server stores the batch but the answer is lost: the batch stays
    /// pending, read-only, and the next tap resends it under the same key,
    /// which the server answers with the first result (nothing stored twice).
    func testLostAnswerIsNotSavedTwice() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["ADDFLOW_PROXY"] == "1", "needs the proxy")
        continueAfterFailure = false
        let app = launch(route: "closet/add/top/t-shirt", server: "http://localhost:3199")
        emptyCart(app)
        tap("addflow.color.teal", in: app)
        tap("addflow.chip.boxy", in: app)
        app.buttons["addflow.addToCart"].tap()
        let pill = app.buttons["addflow.cartPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        pill.tap()
        let save = app.buttons["addflow.saveCart"]
        save.tap()
        XCTAssertTrue(app.staticTexts["addflow.cartError"].waitForExistence(timeout: 40), "the lost answer is reported")
        XCTAssertTrue(element("addflow.pending", in: app).exists, "the batch is shown as pending")
        snapshot("unconfirmed-01-pending", app)
        save.tap()
        XCTAssertTrue(app.buttons["addflow.close"].waitForNonExistence(timeout: 40), "resent, confirmed, flow closed")
        snapshot("unconfirmed-02-settled", app)
    }

    /// Saving, then the app is killed before the answer arrives: the next
    /// launch settles it from the closet.
    func testKilledMidSaveIsSettledOnRelaunch() throws {
        try XCTSkipUnless(ProcessInfo.processInfo.environment["ADDFLOW_PROXY"] == "1", "needs the proxy")
        continueAfterFailure = false
        var app = launch(route: "closet/add/top/t-shirt", server: "http://localhost:3199")
        emptyCart(app)
        tap("addflow.color.rust", in: app)
        tap("addflow.chip.boxy", in: app)
        app.buttons["addflow.addToCart"].tap()
        let pill = app.buttons["addflow.cartPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        pill.tap()
        app.buttons["addflow.saveCart"].tap()
        sleep(4) // stored by now; the proxy holds the answer for 25s
        snapshot("unconfirmed-02-saving", app)
        app.terminate()

        app = launch(route: "closet/add", server: "http://localhost:3199")
        // The flow resends the pending batch on open; the proxy holds that
        // answer 25 s too.
        XCTAssertTrue(app.buttons["addflow.cartPill"].waitForNonExistence(timeout: 45), "the pending save was finished")
        snapshot("unconfirmed-03-settled-on-relaunch", app)
    }

    /// The configurator with a few picks and the cart open, at a large
    /// accessibility text size.
    func testLargeDynamicType() {
        continueAfterFailure = false
        let app = launch(route: "closet/add/top/t-shirt", extra: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL",
        ])
        let add = app.buttons["addflow.addToCart"]
        emptyCart(app)
        snapshot("large-01-configurator", app)
        app.buttons["addflow.suggested.white"].tap()
        tap("addflow.chip.regular", in: app)
        snapshot("large-02-configurator-picked", app)
        add.tap()
        let pill = app.buttons["addflow.cartPill"]
        XCTAssertTrue(pill.waitForExistence(timeout: 5))
        snapshot("large-03-type-grid", app)
        app.navigationBars.buttons.element(boundBy: 0).tap()
        snapshot("large-04-categories", app)
        pill.tap()
        XCTAssertTrue(app.buttons["addflow.saveCart"].waitForExistence(timeout: 5))
        snapshot("large-05-cart", app)
        clearFromSheet(app)
    }

    // MARK: - Helpers

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    private func launch(route: String, server: String = "http://localhost:3100", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "-FitsssServer", server,
            "-FitsssLogin", "dev@fitsss.local:fitsss-dev-1234",
            "-FitsssRoute", route,
        ] + extra
        app.launch()
        let depth = route.split(separator: "/").count
        let landmark = switch depth {
        case _ where route.hasSuffix("/cart"): app.buttons["addflow.saveCart"]
        case 4: app.buttons["addflow.addToCart"]
        case 3: app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'addflow.type.'")).firstMatch
        default: app.buttons["addflow.close"]
        }
        XCTAssertTrue(landmark.waitForExistence(timeout: 20), "the flow opened at \(route)")
        return app
    }

    /// Starts from an empty cart whatever an earlier run left behind.
    private func emptyCart(_ app: XCUIApplication) {
        let pill = app.buttons["addflow.cartPill"]
        guard pill.waitForExistence(timeout: 2) else { return }
        pill.tap()
        clearFromSheet(app)
    }

    private func clearFromSheet(_ app: XCUIApplication) {
        let clear = app.buttons["addflow.clearCart"]
        XCTAssertTrue(clear.waitForExistence(timeout: 5))
        clear.tap()
        let confirm = app.buttons["Clear Cart"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 5))
        confirm.tap()
        XCTAssertFalse(app.buttons["addflow.saveCart"].waitForExistence(timeout: 3), "the sheet closes once the cart is empty")
    }

    /// Scrolls the configurator until the element is on screen, then taps it.
    private func tap(_ identifier: String, in app: XCUIApplication) {
        let element = app.buttons[identifier]
        var tries = 0
        while !(element.exists && element.isHittable && isAboveBar(element, app)) && tries < 12 {
            app.collectionViews.firstMatch.swipeUp(velocity: .slow)
            tries += 1
        }
        XCTAssertTrue(element.exists, "\(identifier) not found")
        element.tap()
    }

    /// Clear of the pinned bottom bar, so a tap lands on the element.
    private func isAboveBar(_ element: XCUIElement, _ app: XCUIApplication) -> Bool {
        let bar = app.buttons["addflow.addToCart"]
        guard bar.exists else { return true }
        return element.frame.maxY < bar.frame.minY - 60
    }

    private func expandSheet(_ app: XCUIApplication) {
        app.swipeUp()
    }

    /// "-dark" when the simulator is in dark mode, for screenshot names.
    private var appearance: String {
        ProcessInfo.processInfo.environment["ADDFLOW_DARK"] == "1" ? "-dark" : ""
    }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
