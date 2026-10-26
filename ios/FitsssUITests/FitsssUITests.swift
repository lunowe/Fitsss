import XCTest

/// Drives the app in the simulator against the local dev server
/// (`pnpm dev` on :3100, seed user from `pnpm db:seed`).
///
/// Use these to walk a flow and grab screenshots: they are verification
/// harnesses, not a coverage suite. Screenshots land in the result bundle
/// (`-resultBundlePath`); `xcrun xcresulttool export attachments` pulls them out.
final class FitsssUITests: XCTestCase {
    /// An app launched signed in as the seed user, optionally at a route.
    static func launch(route: String? = nil, dark: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "-FitsssServer", "http://localhost:3100",
            "-FitsssLogin", "dev@fitsss.local:fitsss-dev-1234",
        ]
        if let route { app.launchArguments += ["-FitsssRoute", route] }
        app.launch()
        return app
    }

    func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    func testLaunchesSignedIn() {
        let app = Self.launch()
        XCTAssertTrue(app.tabBars.buttons["Closet"].waitForExistence(timeout: 15))
        snapshot("closet", app)
    }
}
