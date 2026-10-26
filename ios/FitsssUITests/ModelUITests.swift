import XCTest

/// Walks You → AI model against the local dev server and keeps screenshots,
/// light and dark. The dev server runs with `LLM_MOCK=1`, so the provider is
/// pinned to Mock (shown, not changeable) and nothing here calls a model:
/// the You row, the pinned provider, an effort change kept on the server, a
/// model picked for Picture reading from the searchable list (OpenRouter's,
/// through the server; skipped when it can't be reached), and the test rows
/// held back under the mock.
///
/// Puts the seed user's settings back through the API afterwards.
@MainActor
final class ModelUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!
    nonisolated(unsafe) private var original: [String: Any]?

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
        original = try XCTUnwrap(settings()?["chosen"] as? [String: Any], "the settings load")
    }

    override func tearDown() {
        if let original { api.send("PATCH", "api/v1/settings/llm", body: original) }
    }

    func testPinnedProviderEffortAndPicker() throws {
        let app = launch(route: "you")
        let row = app.buttons["you.model"]
        XCTAssertTrue(row.waitForExistence(timeout: 40), "the You tab has an AI model row")
        XCTAssertTrue(waitUntil { row.label.contains("Mock") }, "the row names the provider in effect: \(row.label)")
        snapshot("you-row", app)

        row.tap()
        XCTAssertTrue(app.navigationBars["AI model"].waitForExistence(timeout: 15), "AI model is pushed")
        let provider = app.segmentedControls["model.provider"]
        XCTAssertTrue(provider.waitForExistence(timeout: 15))
        XCTAssertTrue(provider.buttons["Mock"].isSelected, "Mock is in effect")
        XCTAssertFalse(provider.buttons["OpenRouter"].isEnabled, "a pinned provider can't be changed here")
        let footnote = app.staticTexts["model.provider.footnote"]
        XCTAssertTrue(footnote.label.contains("LLM_MOCK"), "says what pins it: \(footnote.label)")
        XCTAssertFalse(app.buttons["model.test.outfits"].isEnabled, "nothing to test under the mock")
        snapshot("model-mock", app)

        // Effort: saved the moment it is tapped.
        let effort = app.segmentedControls["model.effort"]
        let current = (original?["effort"] as? String) ?? "medium"
        let target = current == "high" ? "Low" : "High"
        effort.buttons[target].tap()
        XCTAssertTrue(waitUntil { self.chosen("effort") == target.lowercased() }, "stored: \(chosen("effort") ?? "nothing")")
        XCTAssertTrue(effort.buttons[target].isSelected)

        // Picture reading: a vision model from the list, found by search.
        let models = (api.data("GET", "api/v1/settings/llm/models") as? [String: Any])?["models"] as? [[String: Any]] ?? []
        let currentVision = (original?["models"] as? [String: String])?["vision"]
        guard let pick = models.first(where: {
            ($0["vision"] as? Bool) == true && ($0["id"] as? String) != currentVision
                && (($0["id"] as? String)?.hasPrefix("google/") ?? false)
        }) ?? models.first(where: { ($0["vision"] as? Bool) == true && ($0["id"] as? String) != currentVision }),
              let pickId = pick["id"] as? String, let pickName = pick["name"] as? String
        else {
            print("note: OpenRouter's list is unavailable; skipping the picker")
            return
        }

        app.buttons["model.row.vision"].tap()
        XCTAssertTrue(app.navigationBars["Picture reading"].waitForExistence(timeout: 15), "the picker is pushed")
        XCTAssertTrue(app.staticTexts["Suggested"].waitForExistence(timeout: 30) || app.staticTexts["All models"].exists, "the list shows")
        snapshot("picker", app)
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10))
        search.tap()
        search.typeText(pickId)
        let option = app.buttons["model.picker.\(pickId)"]
        XCTAssertTrue(option.waitForExistence(timeout: 10), "\(pickId) is found by its id")
        snapshot("picker-search", app)
        option.tap()

        XCTAssertTrue(app.navigationBars["AI model"].waitForExistence(timeout: 10), "picking goes back")
        XCTAssertTrue(waitUntil { self.chosenModel("vision") == pickId }, "stored: \(chosenModel("vision") ?? "nothing")")
        XCTAssertTrue(waitUntil { app.buttons["model.row.vision"].label.contains(pickName) },
                      "the row names the pick: \(app.buttons["model.row.vision"].label)")
        snapshot("model-picked", app)

        // The same screens in dark mode.
        app.terminate()
        let dark = launch(route: "you/model/vision", dark: true)
        XCTAssertTrue(dark.navigationBars["Picture reading"].waitForExistence(timeout: 40))
        XCTAssertTrue(dark.buttons["model.picker.\(pickId)"].waitForExistence(timeout: 30) || dark.staticTexts["Suggested"].exists)
        snapshot("picker-dark", dark)
        dark.navigationBars.buttons.firstMatch.tap()
        XCTAssertTrue(dark.navigationBars["AI model"].waitForExistence(timeout: 10))
        snapshot("model-dark", dark)
    }

    // MARK: - Helpers

    private func launch(route: String, dark: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += [
            "-FitsssServer", "http://localhost:3100",
            "-FitsssLogin", "dev@fitsss.local:fitsss-dev-1234",
            "-FitsssRoute", route,
            "-fitsss.appearance", dark ? "dark" : "light",
        ]
        app.launch()
        return app
    }

    nonisolated private func settings() -> [String: Any]? {
        api.data("GET", "api/v1/settings/llm") as? [String: Any]
    }

    nonisolated private func chosen(_ field: String) -> String? {
        (settings()?["chosen"] as? [String: Any])?[field] as? String
    }

    nonisolated private func chosenModel(_ task: String) -> String? {
        ((settings()?["chosen"] as? [String: Any])?["models"] as? [String: String])?[task]
    }

    private func snapshot(_ name: String, _ app: XCUIApplication) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
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
