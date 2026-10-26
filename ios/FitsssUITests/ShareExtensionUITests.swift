import XCTest

/// The share extension, end to end: Photos → Share → Fitsss → Add to Inspo,
/// and the picture arrives on the server (`GET /api/v1/inspos`), uploaded
/// with the session the app shares through the Keychain group. Then the
/// in-app copy of the sheet (`dev/share`), for screenshots of its states.
///
/// Needs a picture in the simulator's library first:
///
///     xcrun simctl addmedia $UDID some-photo.jpg
///
/// Every picture this adds is deleted again through the API: only those it
/// can tell are its own (other tests add pictures at the same time).
@MainActor
final class ShareExtensionUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!
    nonisolated(unsafe) private var before: Set<String> = []
    nonisolated(unsafe) private var created: Set<String> = []

    /// `ShareSheetDemo`'s sample picture says it came from here.
    static let demoSource = "https://www.pinterest.com/pin/1155351829985172590/"

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
        before = Set(Self.inspos(api).compactMap { $0["id"] as? String })
    }

    override func tearDown() {
        guard let api else { return }
        for id in created {
            api.send("DELETE", "api/v1/inspos/\(id)")
        }
        created = []
    }

    func testShareAPhotoFromPhotos() throws {
        // The app signed in once, so it has written the shared credentials.
        let app = FitsssUITests.launch()
        XCTAssertTrue(app.tabBars.buttons["Closet"].waitForExistence(timeout: 40), "signed in")
        XCUIDevice.shared.press(.home)

        let photos = XCUIApplication(bundleIdentifier: "com.apple.mobileslideshow")
        photos.launch()
        dismissFirstRun(photos)
        // Photos reopens where it was left (a photo, its share sheet): back to the grid.
        let close = photos.buttons["header.closeButton"]
        if close.waitForExistence(timeout: 2) { close.tap() }
        let back = photos.buttons["BackButton"]
        if back.waitForExistence(timeout: 2) { back.tap() }
        let photo = newestPhoto(in: photos)
        XCTAssertTrue(photo.exists, "a photo in the library (simctl addmedia)\n\(photos.debugDescription)")
        let share = photos.buttons["Share"]
        // The grid is drawn by Photos itself; a tap during its first layout can miss.
        for _ in 0..<3 where !share.exists {
            photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            _ = share.waitForExistence(timeout: 6)
        }
        snapshot("photos-photo")
        XCTAssertTrue(share.exists, "the photo's Share button\n\(photos.debugDescription)")
        share.tap()

        let target = fitsssTarget(in: photos)
        XCTAssertTrue(target.waitForExistence(timeout: 15), "Fitsss is in the share sheet\n\(photos.debugDescription)")
        snapshot("share-sheet")
        let add = photos.buttons["share.add"]
        // A tap while the share sheet is still laying out its rows is dropped.
        for attempt in 0..<3 where !add.exists {
            if attempt > 0 { print("note: the extension did not open, tapping Fitsss again") }
            Thread.sleep(forTimeInterval: 1.5)
            if target.exists, target.isHittable { target.tap() }
            _ = add.waitForExistence(timeout: 15)
        }
        XCTAssertTrue(add.exists, "the extension's sheet\n\(photos.debugDescription)")
        XCTAssertTrue(photos.images["share.picture"].waitForExistence(timeout: 20), "shows the picture")
        XCTAssertTrue(waitUntil { add.isEnabled }, "Add to Inspo once the picture is read")
        snapshot("extension-ready")
        add.tap()

        // "Added to Inspo" shows for a second; a slow snapshot can miss it.
        if photos.staticTexts["share.added"].waitForExistence(timeout: 30) {
            snapshot("extension-added")
        } else {
            print("note: “Added to Inspo” not seen (it shows for about a second)")
        }
        XCTAssertTrue(add.waitForNonExistence(timeout: 30), "the sheet closes itself (a failure would keep it, with Try Again)")

        // The test photo is taller than wide, so it arrives 1024 high, with no source.
        var arrived: [String] = []
        XCTAssertTrue(waitUntil(timeout: 30) {
            arrived = self.newInspos().filter { $0["sourceUrl"] == nil || $0["sourceUrl"] is NSNull }
                .filter { $0["height"] as? Int == 1024 || $0["width"] as? Int == 1024 }
                .compactMap { $0["id"] as? String }
            return !arrived.isEmpty
        }, "the picture arrived on the server")
        created.formUnion(arrived)
        XCTAssertEqual(arrived.count, 1, "one picture, not more")
        if let id = arrived.first {
            let inspo = try XCTUnwrap(api.data("GET", "api/v1/inspos/\(id)") as? [String: Any])
            let width = inspo["width"] as? Int ?? 0, height = inspo["height"] as? Int ?? 0
            XCTAssertLessThanOrEqual(max(width, height), 1024, "scaled down before the upload: \(width)×\(height)")
            // `?analyze=1`: the server reads it after answering (the mock, at once).
            XCTAssertTrue(waitUntil(timeout: 30) {
                (self.api.data("GET", "api/v1/inspos/\(id)") as? [String: Any])?["analysis"] is [String: Any]
            }, "read by the server without the app asking")
        }
    }

    /// The same sheet in the app (`dev/share…`): ready, the states, and a
    /// real upload of the sample picture with the shared credentials.
    func testInAppSheetStates() throws {
        for state in ["link", "linkfailed", "adding", "signedout"] {
            let app = FitsssUITests.launch(route: "dev/share/\(state)")
            XCTAssertTrue(app.navigationBars["Fitsss"].waitForExistence(timeout: 40), "the sheet for \(state)")
            Thread.sleep(forTimeInterval: 1)
            snapshot("demo-\(state)", app)
        }

        let app = FitsssUITests.launch(route: "dev/share")
        let add = app.buttons["share.add"]
        XCTAssertTrue(add.waitForExistence(timeout: 40))
        XCTAssertTrue(add.isEnabled, "signed in through the shared credentials (else this would say signed out)")
        XCTAssertTrue(app.images["share.picture"].exists)
        snapshot("demo-ready", app)
        add.tap()
        XCTAssertTrue(app.staticTexts["share.added"].waitForExistence(timeout: 30), "Added to Inspo")
        snapshot("demo-added", app)
        XCTAssertTrue(app.buttons["share.demo.again"].waitForExistence(timeout: 10), "the sheet closed itself")
        let sample = newInspos().filter { $0["sourceUrl"] as? String == Self.demoSource }.compactMap { $0["id"] as? String }
        created.formUnion(sample)
        XCTAssertEqual(sample.count, 1, "the sample arrived, with its source")
    }

    // MARK: - Harness

    nonisolated private static func inspos(_ api: FitsssTestAPI) -> [[String: Any]] {
        (api.data("GET", "api/v1/inspos") as? [[String: Any]]) ?? []
    }

    /// Pictures that were not there when the test started.
    private func newInspos() -> [[String: Any]] {
        Self.inspos(api).filter { !before.contains($0["id"] as? String ?? "") }
    }

    /// Photos' welcome and what's-new sheets on a fresh simulator.
    private func dismissFirstRun(_ photos: XCUIApplication) {
        for label in ["Continue", "Not Now", "OK", "Allow", "Keep Current View"] {
            let button = photos.buttons[label]
            if button.waitForExistence(timeout: label == "Continue" ? 5 : 1) { button.tap() }
        }
    }

    /// The newest picture in the library grid (oldest first, so the last):
    /// the one `simctl addmedia` put there, not the simulator's samples.
    private func newestPhoto(in photos: XCUIApplication) -> XCUIElement {
        let images = photos.images.matching(NSPredicate(format: "label BEGINSWITH 'Photo'"))
        guard images.firstMatch.waitForExistence(timeout: 20) else { return images.firstMatch }
        Thread.sleep(forTimeInterval: 1)
        return images.element(boundBy: images.count - 1)
    }

    /// "Fitsss" in the share sheet's row of apps, or behind More.
    private func fitsssTarget(in photos: XCUIApplication) -> XCUIElement {
        let target = photos.descendants(matching: .any)
            .matching(NSPredicate(format: "label == 'Fitsss' AND elementType != %d", XCUIElement.ElementType.staticText.rawValue))
            .firstMatch
        if target.waitForExistence(timeout: 10) { return target }
        let more = photos.buttons["More"]
        if more.exists {
            more.tap()
        }
        return target
    }

    private func snapshot(_ name: String, _ app: XCUIApplication? = nil) {
        // The whole screen: the share sheet and the extension are not the app's own windows.
        let attachment = XCTAttachment(screenshot: app?.screenshot() ?? XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
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
