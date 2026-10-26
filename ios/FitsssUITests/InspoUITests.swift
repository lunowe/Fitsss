import UIKit
import XCTest

/// Walks Inspo against the local dev server (`LLM_MOCK=1`, so reading and
/// restyling are free mocks) and keeps screenshots: a picture uploaded
/// through the API shows on the Looks tab's Inspo shelf, its detail reads it,
/// restyles it and saves a result to Looks, files it under a style and back,
/// adds and clears a note, and removes it; plus a link that can't be fetched
/// (the inline error and the screenshot hint).
///
/// Every picture is drawn fresh (the server dedupes identical bytes) and
/// removed afterwards, with the looks saved from it. The seed closet and
/// styles are left alone.
@MainActor
final class InspoUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!
    nonisolated(unsafe) private var createdInspos: [String] = []
    nonisolated(unsafe) private var looksBefore: Set<String> = []
    /// Names of the looks this test saved, so only those go again.
    nonisolated(unsafe) private var savedLookNames: Set<String> = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
        looksBefore = Set(looks().compactMap { $0["id"] as? String })
    }

    override func tearDown() {
        // Pictures the test made, including any it added through the app.
        let inspos = (api?.data("GET", "api/v1/inspos") as? [[String: Any]]) ?? []
        for id in createdInspos where inspos.contains(where: { $0["id"] as? String == id }) {
            api?.send("DELETE", "api/v1/inspos/\(id)")
        }
        for look in looks() {
            guard let id = look["id"] as? String, !looksBefore.contains(id),
                  let name = look["name"] as? String, savedLookNames.contains(name) else { continue }
            api?.send("DELETE", "api/v1/looks/\(id)")
        }
        createdInspos = []
        savedLookNames = []
    }

    // MARK: - Shelf → detail: read, restyle, save, style, note, remove

    func testReadRestyleSaveFileNoteRemove() throws {
        let id = try uploadPicture()
        let styles = (api.data("GET", "api/v1/styles") as? [[String: Any]]) ?? []
        let style = try XCTUnwrap(styles.first, "the seed user has styles")
        let styleId = try XCTUnwrap(style["id"] as? String)
        let styleName = try XCTUnwrap(style["name"] as? String)

        let app = FitsssUITests.launch(route: "looks/inspo")
        let tile = app.buttons["inspo.tile.\(id)"]
        XCTAssertTrue(tile.waitForExistence(timeout: 40), "the new picture shows on the shelf")
        XCTAssertTrue(tile.label.contains("Not read yet"), "unread before it is opened: \(tile.label)")
        XCTAssertTrue(app.segmentedControls["looks.shelf"].buttons["Inspo"].isSelected, "the Inspo segment is on")
        Thread.sleep(forTimeInterval: 1)
        snapshot("shelf", app)

        // Opening it reads it (a mock read), once.
        tile.tap()
        let coverage = app.staticTexts["inspo.coverage"]
        XCTAssertTrue(element("inspo.picture", in: app).waitForExistence(timeout: 15), "the picture shows")
        XCTAssertTrue(waitUntil(timeout: 60) { self.inspo(id)?["analysis"] is [String: Any] }, "read on the server")
        XCTAssertTrue(element("inspo.piece.0", in: app).waitForExistence(timeout: 20), "the pieces the read saw")
        let summary = try XCTUnwrap((inspo(id)?["analysis"] as? [String: Any])?["summary"] as? String)
        XCTAssertTrue(app.staticTexts["inspo.summary"].label == summary, "the summary under the title")
        snapshot("detail-read", app)
        scroll(to: coverage, in: app)
        XCTAssertTrue(coverage.label.hasPrefix("You own about"), "the coverage line: \(coverage.label)")
        snapshot("detail-matches", app)

        // Restyle (mock), then save the first result.
        let restyle = app.buttons["inspo.restyle"]
        scroll(to: restyle, in: app)
        XCTAssertEqual(restyle.label, "Style it from my closet")
        restyle.tap()
        // The rows under it are lazy: wait on the button, then scroll down.
        XCTAssertTrue(waitForLabel("Style it again", of: restyle, timeout: 90), "a result comes back")
        XCTAssertTrue(element("inspo.result.0.flatLay", in: app).waitForExistence(timeout: 10), "the first outfit shows")
        snapshot("restyled", app)
        let nameText = app.staticTexts["inspo.result.0.name"]
        scroll(to: nameText, in: app)
        let name = nameText.label
        XCTAssertFalse(name.isEmpty, "the result has a name")
        savedLookNames.insert(name)
        let save = app.buttons["inspo.result.0.save"]
        scroll(to: save, in: app)
        snapshot("restyled-save", app)
        save.tap()
        expectToast("Saved to Looks", in: app)
        XCTAssertTrue(waitForLabel("Saved", of: save, timeout: 20), "the card shows it's saved")
        let saved = looks().filter { !looksBefore.contains($0["id"] as? String ?? "") && $0["name"] as? String == name }
        XCTAssertEqual(saved.count, 1, "saved once, as a look")
        XCTAssertNil(saved.first?["styleId"] as? String, "a restyle is saved without a style")
        snapshot("saved", app)

        // File it under a style, then clear it again.
        let styleRow = app.buttons["inspo.style"]
        scroll(to: styleRow, in: app)
        XCTAssertTrue(styleRow.label.contains("None"), "not filed yet: \(styleRow.label)")
        styleRow.tap()
        let option = app.buttons["inspo.style.\(styleId)"]
        XCTAssertTrue(option.waitForExistence(timeout: 10), "the user's styles to pick from")
        XCTAssertTrue(app.buttons["inspo.style.none"].isSelected, "None is checked")
        snapshot("style-sheet", app)
        option.tap()
        XCTAssertTrue(option.waitForNonExistence(timeout: 15), "the sheet closes after picking")
        XCTAssertTrue(waitUntil { self.inspo(id)?["styleId"] as? String == styleId }, "filed on the server")
        XCTAssertTrue(waitForLabel(styleName, of: styleRow, timeout: 10), "the row names the style")
        snapshot("filed", app)

        styleRow.tap()
        XCTAssertTrue(option.waitForExistence(timeout: 10))
        XCTAssertTrue(option.isSelected, "the style is checked")
        app.buttons["inspo.style.none"].tap()
        XCTAssertTrue(option.waitForNonExistence(timeout: 15))
        XCTAssertTrue(waitUntil { self.inspo(id)?["styleId"] is NSNull }, "unfiled on the server")
        XCTAssertTrue(waitForLabel("None", of: styleRow, timeout: 10))

        // A note, then none.
        let note = "uitest note \(Self.suffix())"
        let noteRow = app.buttons["inspo.note"]
        scroll(to: noteRow, in: app)
        noteRow.tap()
        let field = element("inspo.note.field", in: app)
        XCTAssertTrue(field.waitForExistence(timeout: 10), "the note sheet")
        field.typeText(note)
        snapshot("note-sheet", app)
        app.buttons["inspo.note.save"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 15), "the sheet closes after saving")
        XCTAssertTrue(waitUntil { self.inspo(id)?["note"] as? String == note }, "stored on the server")
        XCTAssertTrue(waitForLabel(note, of: noteRow, timeout: 10), "the row shows the note")
        snapshot("noted", app)

        noteRow.tap()
        XCTAssertTrue(field.waitForExistence(timeout: 10))
        clearText(field)
        app.buttons["inspo.note.save"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 15))
        XCTAssertTrue(waitUntil { (self.inspo(id)?["note"] as? String ?? "").isEmpty }, "cleared on the server")
        XCTAssertFalse(noteRow.label.contains(note), "the row no longer shows it")

        // Remove: confirm, back on the shelf, gone on the server; the look stays.
        let remove = app.buttons["inspo.remove"]
        scroll(to: remove, in: app)
        remove.tap()
        // The dialog's button carries the identifier on two nested elements.
        let confirm = app.buttons["inspo.remove.confirm"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 10), "asks first")
        snapshot("remove-confirm", app)
        confirm.tap()
        XCTAssertTrue(app.navigationBars["Looks"].waitForExistence(timeout: 15), "back on the shelf")
        XCTAssertTrue(tile.waitForNonExistence(timeout: 10), "the tile is gone")
        expectToast("Picture removed", in: app)
        snapshot("removed", app)
        XCTAssertEqual(api.send("GET", "api/v1/inspos/\(id)").status, 404, "removed on the server")
        XCTAssertEqual(looks().filter { $0["name"] as? String == name && !looksBefore.contains($0["id"] as? String ?? "") }.count, 1,
                       "the look saved from it stays")
        createdInspos.removeAll { $0 == id }
    }

    // MARK: - Add: a link that gives nothing

    func testUnreachableLinkShowsScreenshotHint() throws {
        let before = Set(((api.data("GET", "api/v1/inspos") as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String })

        let app = FitsssUITests.launch(route: "looks/inspo/new")
        let field = app.textFields["inspo.add.link"]
        XCTAssertTrue(field.waitForExistence(timeout: 40), "the route opens Add a picture")
        XCTAssertTrue(app.buttons["inspo.add.library"].exists, "a photo can come from the library")
        snapshot("add", app)

        field.tap()
        field.typeText("https://fitsss-unreachable.invalid/pin.jpg")
        app.buttons["inspo.add.link.submit"].tap()
        let error = app.staticTexts["inspo.add.link.error"]
        XCTAssertTrue(error.waitForExistence(timeout: 40), "the server's message shows under the link")
        XCTAssertTrue(error.label.contains("Take a screenshot and add it as a photo instead."), "with the way out: \(error.label)")
        snapshot("add-link-error", app)

        // Editing the link clears the stale message (submitting dropped the focus).
        field.tap()
        field.typeText("x")
        XCTAssertTrue(error.waitForNonExistence(timeout: 5), "the message goes once the link changes")

        app.buttons["inspo.add.cancel"].tap()
        XCTAssertTrue(field.waitForNonExistence(timeout: 10), "Cancel closes the sheet")
        XCTAssertTrue(app.segmentedControls["looks.shelf"].buttons["Inspo"].isSelected, "on the Inspo shelf")
        let after = Set(((api.data("GET", "api/v1/inspos") as? [[String: Any]]) ?? []).compactMap { $0["id"] as? String })
        XCTAssertEqual(after.subtracting(before), [], "nothing was stored")
    }

    // MARK: - Today's row and the detail route

    /// Today's "Restyle a picture" opens Add a picture in a sheet; the
    /// `looks/inspo/<id>` route opens a read picture's detail directly.
    func testTodayRowAndDetailRoute() throws {
        let app = FitsssUITests.launch()
        let row = app.buttons["today.restylePicture"]
        XCTAssertTrue(row.waitForExistence(timeout: 40), "Today offers Restyle a picture")
        reveal(row, in: app)
        Thread.sleep(forTimeInterval: 1)
        snapshot("today-row", app)
        row.tap()
        Thread.sleep(forTimeInterval: 1.5)
        snapshot("today-row-tapped", app)
        XCTAssertTrue(app.textFields["inspo.add.link"].waitForExistence(timeout: 10), "it opens Add a picture")
        snapshot("today-add-sheet", app)
        app.buttons["inspo.add.cancel"].tap()
        XCTAssertTrue(app.textFields["inspo.add.link"].waitForNonExistence(timeout: 10))

        let id = try uploadPicture()
        XCTAssertNotNil(api.data("POST", "api/v1/inspos/\(id)/analyze"), "read through the API")
        let routed = FitsssUITests.launch(route: "looks/inspo/\(id)")
        XCTAssertTrue(element("inspo.piece.0", in: routed).waitForExistence(timeout: 40), "the route opens the read detail")
        XCTAssertFalse(element("inspo.reading", in: routed).exists, "nothing left to read")
        snapshot("route-detail", routed)
    }

    // MARK: - Empty shelf and slow reads (stand-in server)

    /// The empty shelf, and the reading and styling progress states, which
    /// the instant mocks never show. Needs the stand-in on :3297
    /// (`/tmp/fitsss-inspo-standin.py`), which forwards to :3100 and on
    /// request answers an empty shelf or holds reads and restyles back.
    func testEmptyShelfAndProgressStates() throws {
        try XCTSkipUnless(Self.setStandInMode("empty"), "the stand-in on :3297 is not running")
        defer { Self.setStandInMode("proxy") }

        let app = Self.launchOnStandIn(route: "looks/inspo")
        let add = app.buttons["inspo.empty.add"]
        XCTAssertTrue(add.waitForExistence(timeout: 40), "an empty shelf offers Add a picture")
        Thread.sleep(forTimeInterval: 1)
        snapshot("empty-shelf", app)
        add.tap()
        XCTAssertTrue(app.textFields["inspo.add.link"].waitForExistence(timeout: 10), "it opens Add a picture")
        app.buttons["inspo.add.cancel"].tap()

        let id = try uploadPicture()
        Self.setStandInMode("slow")
        let slow = Self.launchOnStandIn(route: "looks/inspo/\(id)")
        let reading = element("inspo.reading", in: slow)
        XCTAssertTrue(reading.waitForExistence(timeout: 40), "an unread picture says it is being read")
        snapshot("reading", slow)
        XCTAssertTrue(element("inspo.piece.0", in: slow).waitForExistence(timeout: 60), "then shows what it saw")

        let restyle = slow.buttons["inspo.restyle"]
        scroll(to: restyle, in: slow)
        reveal(restyle, in: slow)
        restyle.tap()
        let progress = element("inspo.restyle.progress", in: slow)
        XCTAssertTrue(progress.waitForExistence(timeout: 5), "styling shows its stages")
        XCTAssertTrue(restyle.label.contains("Styling"), "the button says it is busy: \(restyle.label)")
        Thread.sleep(forTimeInterval: 3)
        snapshot("styling", slow)
        XCTAssertTrue(waitUntil(timeout: 60) { self.element("inspo.result.0.flatLay", in: slow).exists }, "the result arrives")
        XCTAssertFalse(progress.exists, "and the stages go")
        snapshot("styled", slow)
    }

    /// Sets the stand-in's mode; false when it isn't running.
    @discardableResult
    nonisolated private static func setStandInMode(_ mode: String) -> Bool {
        var request = URLRequest(url: URL(string: "http://localhost:3297/__mode")!)
        request.httpMethod = "POST"
        request.httpBody = Data(mode.utf8)
        request.timeoutInterval = 5
        let box = UploadBox()
        let done = DispatchSemaphore(value: 0)
        FitsssTestAPI.session.dataTask(with: request) { _, response, _ in
            box.status = (response as? HTTPURLResponse)?.statusCode ?? 0
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 10)
        return box.status == 200
    }

    private static func launchOnStandIn(route: String) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "-FitsssServer", "http://localhost:3297",
            "-FitsssLogin", "dev@fitsss.local:fitsss-dev-1234",
            "-FitsssRoute", route,
        ]
        app.launch()
        return app
    }

    // MARK: - Screenshot tour

    /// The shelf, Add, and a read and restyled detail top to bottom, at
    /// whatever appearance and text size the simulator is set to.
    func testScreenshotTour() throws {
        let id = try uploadPicture(sourceUrl: "https://www.pinterest.com/pin/1234567890/")
        let app = FitsssUITests.launch(route: "looks/inspo")
        let tile = app.buttons["inspo.tile.\(id)"]
        XCTAssertTrue(tile.waitForExistence(timeout: 40))
        Thread.sleep(forTimeInterval: 1.5)
        snapshot("tour-shelf", app)

        app.buttons["inspo.add"].tap()
        XCTAssertTrue(app.textFields["inspo.add.link"].waitForExistence(timeout: 10))
        snapshot("tour-add", app)
        app.buttons["inspo.add.cancel"].tap()
        XCTAssertTrue(app.textFields["inspo.add.link"].waitForNonExistence(timeout: 10))

        tile.tap()
        XCTAssertTrue(element("inspo.piece.0", in: app).waitForExistence(timeout: 60))
        Thread.sleep(forTimeInterval: 1)
        snapshot("tour-detail-1", app)
        let restyle = app.buttons["inspo.restyle"]
        scroll(to: restyle, in: app)
        snapshot("tour-detail-2", app)
        reveal(restyle, in: app)
        restyle.tap()
        Thread.sleep(forTimeInterval: 2)
        snapshot("tour-restyling", app)
        let flatLay = element("inspo.result.0.flatLay", in: app)
        let arrived = waitUntil(timeout: 90) { flatLay.exists || (restyle.exists && restyle.label.contains("again")) }
        snapshot("tour-detail-3", app)
        XCTAssertTrue(arrived, "a restyle comes back")
        for index in 4...9 {
            app.swipeUp(velocity: .slow)
            Thread.sleep(forTimeInterval: 1)
            snapshot("tour-detail-\(index)", app)
            if app.buttons["inspo.remove"].isHittable { break }
        }
        let styleRow = app.buttons["inspo.style"]
        scroll(to: styleRow, in: app)
        styleRow.tap()
        XCTAssertTrue(app.buttons["inspo.style.none"].waitForExistence(timeout: 10))
        snapshot("tour-style-sheet", app)
        app.buttons["inspo.style.cancel"].tap()
        XCTAssertTrue(app.buttons["inspo.style.none"].waitForNonExistence(timeout: 10))
        app.buttons["inspo.note"].tap()
        XCTAssertTrue(app.buttons["inspo.note.save"].waitForExistence(timeout: 10))
        snapshot("tour-note-sheet", app)
        app.buttons["inspo.note.cancel"].tap()
    }

    // MARK: - Harness

    /// A picture no run has sent before, stored through the API (unread).
    private func uploadPicture(sourceUrl: String? = nil) throws -> String {
        var components = URLComponents(url: FitsssTestAPI.base.appending(path: "api/v1/inspos"), resolvingAgainstBaseURL: false)!
        if let sourceUrl { components.queryItems = [URLQueryItem(name: "sourceUrl", value: sourceUrl)] }
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("Bearer \(api.token)", forHTTPHeaderField: "Authorization")
        request.setValue("image/png", forHTTPHeaderField: "Content-Type")
        request.httpBody = Self.uniquePicture()

        let box = UploadBox()
        let done = DispatchSemaphore(value: 0)
        FitsssTestAPI.session.dataTask(with: request) { data, response, _ in
            box.data = data
            box.status = (response as? HTTPURLResponse)?.statusCode ?? 0
            done.signal()
        }.resume()
        _ = done.wait(timeout: .now() + 90)
        XCTAssertEqual(box.status, 201, "a new picture is stored")
        let json = box.data.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
        let id = try XCTUnwrap((json?["data"] as? [String: Any])?["id"] as? String, "upload answered \(box.status)")
        createdInspos.append(id)
        return id
    }

    /// A 4:5 "outfit" in random colors with a random stripe pattern, so the
    /// bytes are new every time.
    private static func uniquePicture() -> Data {
        let size = CGSize(width: 400, height: 500)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        func random() -> UIColor {
            UIColor(hue: .random(in: 0...1), saturation: .random(in: 0.2...0.8), brightness: .random(in: 0.3...0.95), alpha: 1)
        }
        return UIGraphicsImageRenderer(size: size, format: format).pngData { context in
            UIColor(white: 0.94, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            random().setFill()
            context.fill(CGRect(x: 110, y: 60, width: 180, height: 170))
            random().setFill()
            context.fill(CGRect(x: 130, y: 230, width: 140, height: 200))
            random().setFill()
            context.fill(CGRect(x: 120, y: 440, width: 160, height: 36))
            for column in 0..<40 where Bool.random() {
                UIColor(white: .random(in: 0...1), alpha: 1).setFill()
                context.fill(CGRect(x: column * 10, y: 0, width: 10, height: 6))
            }
        }
    }

    private func inspo(_ id: String) -> [String: Any]? {
        api.data("GET", "api/v1/inspos/\(id)") as? [String: Any]
    }

    /// Nonisolated, like `api`: `setUp` and `tearDown` call it too.
    nonisolated private func looks() -> [[String: Any]] {
        (api?.data("GET", "api/v1/looks") as? [[String: Any]]) ?? []
    }

    private static func suffix() -> String { String(UUID().uuidString.prefix(6).lowercased()) }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    private func element(_ identifier: String, in app: XCUIApplication) -> XCUIElement {
        app.descendants(matching: .any)[identifier].firstMatch
    }

    /// Swipes up until `element` is on screen and tappable (the list is lazy).
    private func scroll(to element: XCUIElement, in app: XCUIApplication, maxSwipes: Int = 12) {
        var swipes = 0
        while !(element.exists && element.isHittable), swipes < maxSwipes {
            app.swipeUp(velocity: .slow)
            swipes += 1
        }
        if swipes > 0 { Thread.sleep(forTimeInterval: 1) }
        XCTAssertTrue(element.isHittable, "\(element) is reachable")
    }

    /// Swipes until `element` is fully clear of the tab bar.
    private func reveal(_ element: XCUIElement, in app: XCUIApplication) {
        let tabBar = app.tabBars.firstMatch
        var swipes = 0
        while swipes < 6, element.exists, tabBar.exists, element.frame.maxY > tabBar.frame.minY - 8 {
            app.swipeUp(velocity: .slow)
            swipes += 1
        }
        if swipes > 0 { Thread.sleep(forTimeInterval: 1) }
    }

    private func clearText(_ field: XCUIElement) {
        let current = (field.value as? String) ?? ""
        field.tap()
        field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count + 4))
    }

    private func waitForLabel(_ text: String, of element: XCUIElement, timeout: TimeInterval) -> Bool {
        waitUntil(timeout: timeout) { element.exists && element.label.contains(text) }
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

/// Carries an upload's answer out of URLSession's callback queue.
nonisolated private final class UploadBox: @unchecked Sendable {
    var data: Data?
    var status = 0
}
