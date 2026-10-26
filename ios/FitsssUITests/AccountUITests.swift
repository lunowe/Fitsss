import XCTest

/// Walks the account flows against the local dev server and keeps
/// screenshots: sign in (wrong password, then right), relaunch, sign out,
/// create an account, the server picker, appearance.
///
/// These launch *without* `-FitsssLogin` and get to a known state through the
/// UI, so they exercise the real sign-in path. Accounts created here are
/// `ios-test-<timestamp>@fitsss.local`; there is no delete API.
@MainActor
final class AccountUITests: XCTestCase {
    static let email = "dev@fitsss.local"
    static let password = "fitsss-dev-1234"

    // MARK: - Harness

    private var current: XCUIApplication?

    func launch(_ extra: [String] = []) -> XCUIApplication {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments += ["-FitsssServer", "http://localhost:3100"] + extra
        app.launch()
        current = app
        return app
    }

    /// Declines the system "Save Password?" sheet the Passwords app offers
    /// after a sign-in. It is AutoFill working, not a failure, but it covers
    /// the app (and can arrive late), so every wait below checks for it.
    @discardableResult
    func dismissSavePassword() -> Bool {
        guard let app = current else { return false }
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        for notNow in [app.buttons["Not Now"], springboard.buttons["Not Now"]] where notNow.exists {
            snapshot("save-password-prompt", app)
            notNow.tap()
            return true
        }
        return false
    }

    /// The whole screen, keyboard and system prompts included.
    func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    /// Waits for either the sign-in screen or the tabs.
    @discardableResult
    func waitForSession(_ app: XCUIApplication, timeout: TimeInterval = 90) -> Bool {
        let signIn = app.buttons["signin.submit"]
        let tabs = app.tabBars.buttons["Closet"]
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if dismissSavePassword() { continue }
            if tabs.exists { return true }
            if signIn.exists { return false }
            RunLoop.current.run(until: Date().addingTimeInterval(0.2))
        }
        XCTFail("Neither the sign-in screen nor the tabs appeared")
        return false
    }

    func signOutThroughYou(_ app: XCUIApplication) {
        tapWhenReady(app.tabBars.buttons["You"])
        let row = app.buttons["you.signout"]
        if !row.waitForExistence(timeout: 15) || !row.isHittable {
            app.swipeUp()
        }
        tapWhenReady(row)
        let confirm = app.buttons.matching(NSPredicate(format: "label == 'Sign out' AND identifier != 'you.signout'")).firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        snapshot("you-signout-confirm", app)
        tapWhenReady(confirm)
        XCTAssertTrue(app.buttons["signin.submit"].waitForExistence(timeout: 40))
    }

    func ensureSignedOut(_ app: XCUIApplication) {
        if waitForSession(app) { signOutThroughYou(app) }
    }

    func ensureSignedIn(_ app: XCUIApplication) {
        guard !waitForSession(app) else { return }
        signIn(app, email: Self.email, password: Self.password)
        waitForTabs(app)
    }

    func signIn(_ app: XCUIApplication, email: String, password: String) {
        let emailField = app.textFields["signin.email"]
        tapWhenReady(emailField)
        emailField.clearAndType(email)
        let passwordField = app.secureTextFields["signin.password"]
        tapWhenReady(passwordField)
        passwordField.clearAndType(password)
        tapWhenReady(app.buttons["signin.submit"])
    }

    /// Taps once the element exists and can be hit. The machine these run
    /// on is often busy with several simulators; implicit waits are too short.
    func tapWhenReady(_ element: XCUIElement, timeout: TimeInterval = 30, file: StaticString = #filePath, line: UInt = #line) {
        if !element.exists { dismissSavePassword() }
        XCTAssertTrue(element.waitForExistence(timeout: timeout), "\(element) never appeared", file: file, line: line)
        let deadline = Date().addingTimeInterval(timeout)
        while !element.isHittable, Date() < deadline {
            if !dismissSavePassword() { RunLoop.current.run(until: Date().addingTimeInterval(0.3)) }
        }
        element.tap()
    }

    /// Signed in: waits for the tabs, declining the save-password sheet
    /// whenever it shows (before the tabs, or a moment after).
    func waitForTabs(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
        let tabs = app.tabBars.buttons["Closet"]
        var deadline = Date().addingTimeInterval(90)
        while Date() < deadline, !tabs.exists {
            if !dismissSavePassword() { RunLoop.current.run(until: Date().addingTimeInterval(0.5)) }
        }
        XCTAssertTrue(tabs.exists, "No tabs", file: file, line: line)
        deadline = Date().addingTimeInterval(12)
        while Date() < deadline {
            if dismissSavePassword() { return }
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
    }

    func waitForLabel(_ element: XCUIElement, containing text: String, timeout: TimeInterval = 40) -> Bool {
        let predicate = NSPredicate(format: "exists == true AND label CONTAINS[c] %@", text)
        return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: element)], timeout: timeout) == .completed
    }

    // MARK: - Flows

    func testSignInSignOut() {
        var app = launch()
        ensureSignedOut(app)
        snapshot("signin", app)

        // Wrong password: inline error, still on the sign-in screen.
        signIn(app, email: Self.email, password: "not-the-password")
        let error = app.staticTexts["signin.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 40))
        XCTAssertEqual(error.label, "Invalid email or password")
        snapshot("signin-wrong-password", app)

        // Right password, submitted with the return key.
        let passwordField = app.secureTextFields["signin.password"]
        tapWhenReady(passwordField)
        passwordField.clearAndType(Self.password + "\n")
        waitForTabs(app)

        // Relaunch: still signed in.
        app.terminate()
        app = launch()
        XCTAssertTrue(waitForSession(app), "Relaunch should restore the session")

        tapWhenReady(app.tabBars.buttons["You"])
        XCTAssertTrue(app.staticTexts[Self.email].waitForExistence(timeout: 15))
        XCTAssertTrue(app.staticTexts["Admin"].exists)
        XCTAssertTrue(app.buttons["you.catalog"].exists || app.links["you.catalog"].exists)
        snapshot("you", app)
        app.swipeUp()
        snapshot("you-bottom", app)

        signOutThroughYou(app)
        snapshot("signed-out", app)

        // Leave the simulator signed in for the next run.
        signIn(app, email: Self.email, password: Self.password)
        waitForTabs(app)
    }

    func testCreateAccount() {
        let app = launch()
        ensureSignedOut(app)

        tapWhenReady(app.buttons["signin.mode"])
        let name = app.textFields["signin.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 15))
        snapshot("signup", app)

        let stamp = Int(Date().timeIntervalSince1970)
        let email = "ios-test-\(stamp)@fitsss.local"
        print("ACCOUNT_UI_TEST_CREATED \(email)")

        // Return-key flow: name → email → password → submit.
        tapWhenReady(name)
        name.typeText("iOS Test\n")
        app.textFields["signin.email"].typeText(email + "\n")
        app.secureTextFields["signin.password"].typeText("short\n")
        let error = app.staticTexts["signin.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 15))
        snapshot("signup-short-password", app)

        let password = app.secureTextFields["signin.password"]
        password.clearAndType("ios-test-password\n")
        waitForTabs(app)

        tapWhenReady(app.tabBars.buttons["You"])
        XCTAssertTrue(app.staticTexts[email].waitForExistence(timeout: 15))
        XCTAssertFalse(app.staticTexts["Admin"].exists)
        XCTAssertFalse(app.buttons["you.catalog"].exists)
        snapshot("you-new-account", app)

        // Same address again: the server's message, inline. Fields tapped
        // one by one here (the return-key flow is covered above).
        signOutThroughYou(app)
        tapWhenReady(app.buttons["signin.mode"])
        let nameAgain = app.textFields["signin.name"]
        tapWhenReady(nameAgain)
        nameAgain.typeText("iOS Test")
        tapWhenReady(app.textFields["signin.email"])
        app.textFields["signin.email"].typeText(email)
        tapWhenReady(app.secureTextFields["signin.password"])
        app.secureTextFields["signin.password"].typeText("ios-test-password")
        tapWhenReady(app.buttons["signin.submit"])
        XCTAssertTrue(waitForLabel(error, containing: "already exists"), error.label)
        snapshot("signup-existing", app)

        tapWhenReady(app.buttons["signin.mode"])
        signIn(app, email: Self.email, password: Self.password)
        waitForTabs(app)
    }

    func testServerSwitching() {
        let app = launch()
        ensureSignedIn(app)

        tapWhenReady(app.tabBars.buttons["You"])
        snapshot("server-test-you", app)
        tapWhenReady(app.buttons["you.server"])
        XCTAssertTrue(app.buttons["server.local"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["server.local"].isSelected)
        snapshot("server", app)

        // A custom address that is not an address.
        tapWhenReady(app.buttons["server.custom"])
        let field = app.textFields["server.custom.field"]
        XCTAssertTrue(field.waitForExistence(timeout: 15))
        field.typeText("not a server\n")
        let error = app.staticTexts["server.custom.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 15))
        snapshot("server-invalid", app)

        // A well-formed address where nothing answers: checked, not switched.
        field.clearAndType("http://127.0.0.1:3999\n")
        XCTAssertTrue(error.waitForExistence(timeout: 40))
        XCTAssertTrue(error.label.contains("127.0.0.1:3999"), error.label)
        snapshot("server-unreachable", app)

        // Something that answers but is not the Fitsss API (production today,
        // or any web page): switch there anyway through the preset, land on
        // the sign-in screen, and come back from it.
        tapWhenReady(app.buttons["server.production"])
        let confirm = app.buttons["Switch to Production"]
        XCTAssertTrue(confirm.waitForExistence(timeout: 15))
        snapshot("server-confirm", app)
        tapWhenReady(confirm)

        if waitForSession(app, timeout: 90) {
            // Production has a session for this simulator: fine, go back.
            tapWhenReady(app.tabBars.buttons["You"])
            tapWhenReady(app.buttons["you.server"])
            tapWhenReady(app.buttons["server.local"])
            tapWhenReady(app.buttons["Switch to Local dev"])
        } else {
            let server = app.buttons["signin.server"]
            XCTAssertTrue(server.label.contains("Production"), server.label)
            snapshot("signin-production", app)
            tapWhenReady(server)
            XCTAssertTrue(app.buttons["server.local"].waitForExistence(timeout: 15))
            snapshot("signin-server-sheet", app)
            tapWhenReady(app.buttons["server.local"])
        }

        // Back on local: the token for this server was kept.
        waitForTabs(app)
        tapWhenReady(app.tabBars.buttons["You"])
        XCTAssertTrue(app.staticTexts[Self.email].waitForExistence(timeout: 15))
        snapshot("server-back-on-local", app)
    }

    func testAppearance() {
        let app = launch()
        ensureSignedIn(app)
        tapWhenReady(app.tabBars.buttons["You"])

        let picker = app.segmentedControls["you.appearance"]
        XCTAssertTrue(picker.waitForExistence(timeout: 15))
        tapWhenReady(picker.buttons["Dark"])
        snapshot("you-dark", app)
        tapWhenReady(app.buttons["you.server"])
        snapshot("server-dark", app)
        tapWhenReady(app.navigationBars.buttons.firstMatch)
        tapWhenReady(app.tabBars.buttons["Closet"])
        snapshot("closet-dark", app)
        tapWhenReady(app.tabBars.buttons["You"])

        tapWhenReady(picker.buttons["Light"])
        snapshot("you-light", app)
        tapWhenReady(picker.buttons["System"])
        snapshot("you-system", app)
    }
}

@MainActor
extension XCUIElement {
    /// Replaces the field's text. Taps at the trailing edge, so the cursor
    /// lands after the text (a center tap puts it mid-text in a long value
    /// and the deletes leave a tail behind).
    func clearAndType(_ text: String) {
        coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.5)).tap()
        if let current = value as? String, !current.isEmpty, current != placeholderValue {
            typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
        }
        typeText(text)
    }
}
