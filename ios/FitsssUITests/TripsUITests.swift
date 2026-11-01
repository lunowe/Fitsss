import XCTest

/// Walks Trips against the local dev server (`LLM_MOCK=1`, so packing is an
/// instant mock) and keeps screenshots: Today's "Plan a trip" row opens the
/// sheet; a place found by search ("Lisbon" shows the Portuguese one first,
/// told apart by its country), dates a few days ahead, an activity, "Pack my
/// bag"; the detail packs it and shows the weather strip and the suitcase; a
/// piece ticked here is packed on the server; the Days view shows an outfit
/// a day; Done closes the sheet; the trip is on the Looks tab's Trips shelf;
/// Delete removes it. Plus the same screens in dark mode, by route.
///
/// Every trip this test makes is deleted through the API afterwards, failure
/// or not. Trips there before (the seed user's Lisbon) are left alone.
@MainActor
final class TripsUITests: XCTestCase {
    nonisolated(unsafe) private var api: FitsssTestAPI!
    nonisolated(unsafe) private var tripsBefore: Set<String> = []
    /// Pieces this test added to the dev closet, deleted afterwards.
    nonisolated(unsafe) private var addedBlocks: [String] = []
    /// Pieces this test archived, restored afterwards.
    nonisolated(unsafe) private var archivedBlocks: [String] = []

    override func setUpWithError() throws {
        continueAfterFailure = false
        api = try FitsssTestAPI.signIn()
        tripsBefore = Set(trips().compactMap { $0["id"] as? String })
    }

    override func tearDown() {
        for trip in trips() {
            guard let id = trip["id"] as? String, !tripsBefore.contains(id) else { continue }
            api?.send("DELETE", "api/v1/trips/\(id)")
        }
        for id in archivedBlocks { api?.send("DELETE", "api/v1/blocks/\(id)/archive") }
        for id in addedBlocks { api?.send("DELETE", "api/v1/blocks/\(id)") }
        archivedBlocks = []
        addedBlocks = []
    }

    // MARK: - Today → plan → pack → tick → days → shelf → delete

    func testPlanPackTickDaysDelete() throws {
        let app = launch(route: "today")
        let row = app.buttons["today.planTrip"]
        XCTAssertTrue(row.waitForExistence(timeout: 40), "Today offers Plan a trip")
        reveal(row, in: app)
        Thread.sleep(forTimeInterval: 1)
        snapshot("today-row", app)
        row.tap()

        // Where: search as you type; the Portuguese Lisbon comes first.
        let placeRow = app.buttons["trip.plan.place"]
        XCTAssertTrue(placeRow.waitForExistence(timeout: 10), "the plan sheet opens")
        snapshot("plan-empty", app)
        placeRow.tap()
        let search = app.searchFields.firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 10), "the place search")
        search.tap()
        search.typeText("Lisbon")
        let first = app.buttons["trip.place.0"]
        XCTAssertTrue(first.waitForExistence(timeout: 40), "places come back")
        XCTAssertTrue(first.label.contains("Portugal"), "the first Lisbon is the Portuguese one: \(first.label)")
        XCTAssertTrue(app.buttons["trip.place.1"].exists, "and there are others to tell apart")
        snapshot("plan-search", app)
        first.tap()
        XCTAssertTrue(waitForLabel("Lisbon", of: placeRow, timeout: 10), "the place is on the form: \(placeRow.label)")

        // When: a few days ahead. Best effort through the calendar popover;
        // the defaults (today, three days) carry the rest of the test.
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let start = calendar.date(byAdding: .day, value: 3, to: today)!
        let end = calendar.date(byAdding: .day, value: 6, to: today)!
        let pickedStart = pickDate(app.datePickers["trip.plan.start"], start, in: app)
        let pickedEnd = pickedStart && pickDate(app.datePickers["trip.plan.end"], end, in: app)
        if pickedStart && pickedEnd {
            XCTAssertTrue(app.staticTexts["trip.plan.length"].label.contains("4 days"), "four days: \(app.staticTexts["trip.plan.length"].label)")
        } else {
            print("note: the calendar popover could not be driven; packing with the default dates")
        }

        app.buttons["trip.plan.activity.city"].tap()
        XCTAssertTrue(app.staticTexts["trip.plan.activities.footnote"].label.hasPrefix("City:"), "the chosen activity's hint shows")
        let bag = app.segmentedControls["trip.plan.bag"]
        XCTAssertTrue(bag.buttons["Carry-on"].isSelected, "a short trip defaults to a carry-on")
        snapshot("plan-filled", app)

        // Pack: creates the trip (the weather), flows into the detail, packs it.
        let pack = app.buttons["trip.plan.pack"]
        XCTAssertTrue(pack.isEnabled, "the form is complete")
        pack.tap()
        let progress = element("trip.progress", in: app)
        XCTAssertTrue(progress.waitForExistence(timeout: 120), "the suitcase shows once packed")
        let created = trips().filter { !tripsBefore.contains($0["id"] as? String ?? "") }
        XCTAssertEqual(created.count, 1, "one trip was created")
        let trip = try XCTUnwrap(created.first)
        let id = try XCTUnwrap(trip["id"] as? String)
        let plan = try XCTUnwrap(trip["plan"] as? [String: Any], "packed on the server")
        let packing = try XCTUnwrap(plan["packing"] as? [[String: Any]])
        XCTAssertFalse(packing.isEmpty, "the suitcase has pieces")
        XCTAssertTrue(progress.label.contains("0 of \(packing.count) packed"), "nothing ticked yet: \(progress.label)")
        XCTAssertTrue(element("trip.weather", in: app).exists, "the weather strip")
        XCTAssertTrue(element("trip.place", in: app).label.contains("Portugal"), "the place line")
        if pickedStart && pickedEnd {
            XCTAssertEqual(trip["startDate"] as? String, isoDay(start), "the start date made it to the server")
            XCTAssertEqual(trip["endDate"] as? String, isoDay(end))
        }
        Thread.sleep(forTimeInterval: 1)
        snapshot("suitcase", app)

        // Tick the first piece: shown at once, stored on the server.
        let firstBlock = try XCTUnwrap(packing[0]["blockId"] as? String)
        let item = app.buttons["trip.item.\(firstBlock)"]
        scroll(to: item, in: app)
        XCTAssertEqual(item.value as? String, "Not packed")
        item.tap()
        XCTAssertTrue(waitUntil { self.packed(id, firstBlock) == true }, "ticked on the server")
        XCTAssertTrue(waitUntil { item.value as? String == "Packed" }, "ticked on screen")
        XCTAssertTrue(progress.label.contains("1 of \(packing.count) packed"), "the count moved: \(progress.label)")
        snapshot("ticked", app)

        // Days: an outfit a day, each piece a row that swaps.
        let view = app.segmentedControls["trip.view"]
        scroll(to: view, in: app)
        view.buttons["Days"].tap()
        let startDate = try XCTUnwrap(trip["startDate"] as? String)
        let day = element("trip.day.\(startDate)", in: app)
        XCTAssertTrue(day.waitForExistence(timeout: 10), "the first day's outfit")
        let days = try XCTUnwrap(plan["days"] as? [[String: Any]])
        XCTAssertEqual(days.count, try XCTUnwrap(trip["weather"] as? [[String: Any]]).count, "a day planned for every day of weather")
        Thread.sleep(forTimeInterval: 1)
        snapshot("days", app)

        // Swap: the sheet offers same-category pieces, the current one marked.
        let footwear = try XCTUnwrap(((days[0]["outfit"] as? [String: Any])?["slots"] as? [String: Any])?["footwear"] as? String)
        let shoeRow = app.buttons["trip.day.\(startDate).piece.\(footwear)"]
        scroll(to: shoeRow, in: app)
        shoeRow.tap()
        let current = app.buttons["trip.swap.option.\(footwear)"]
        XCTAssertTrue(current.waitForExistence(timeout: 10), "the swap sheet shows the shoes")
        XCTAssertTrue(current.isSelected, "the current pair is marked")
        snapshot("swap", app)
        app.buttons["trip.swap.cancel"].tap()
        XCTAssertTrue(current.waitForNonExistence(timeout: 10))

        // Done closes the sheet; the shelf has the trip.
        app.buttons["trip.done"].tap()
        XCTAssertTrue(app.buttons["trip.done"].waitForNonExistence(timeout: 10), "Done closes the sheet")
        app.tabBars.buttons["Looks"].tap()
        let shelf = app.segmentedControls["looks.shelf"]
        XCTAssertTrue(shelf.waitForExistence(timeout: 15))
        shelf.buttons["Trips"].tap()
        let shelfRow = app.buttons["trips.row.\(id)"]
        XCTAssertTrue(shelfRow.waitForExistence(timeout: 15), "the trip is on the shelf")
        XCTAssertTrue(shelfRow.label.contains("1 of \(packing.count) packed"), "with its packing line: \(shelfRow.label)")
        Thread.sleep(forTimeInterval: 1)
        snapshot("shelf", app)

        // Delete from the detail's menu: confirm, back on the shelf, gone.
        shelfRow.tap()
        XCTAssertTrue(element("trip.progress", in: app).waitForExistence(timeout: 15), "the shelf opens the detail")
        app.buttons["trip.more"].tap()
        let delete = app.buttons["Delete trip"]
        XCTAssertTrue(delete.waitForExistence(timeout: 10), "the menu offers Delete")
        snapshot("menu", app)
        delete.tap()
        let confirm = app.buttons["trip.delete.confirm"].firstMatch
        XCTAssertTrue(confirm.waitForExistence(timeout: 10), "asks first")
        snapshot("delete-confirm", app)
        confirm.tap()
        XCTAssertTrue(shelfRow.waitForNonExistence(timeout: 15), "the row is gone")
        XCTAssertTrue(shelf.waitForExistence(timeout: 10), "back on the shelf")
        XCTAssertEqual(api.send("GET", "api/v1/trips/\(id)").status, 404, "deleted on the server")
        snapshot("deleted", app)
    }

    // MARK: - Dark mode, by route

    /// A trip made and packed through the API, opened by `looks/trips/<id>`
    /// in dark mode: the detail (suitcase and days), taking a worn piece out
    /// (refused by the server, shown in an alert), Edit trip and Pack again
    /// (a real repack under the mock, which keeps the tick), the shelf, and
    /// the plan sheet from the shelf's "+".
    func testDarkModeByRoute() throws {
        let id = try createPackedTrip()
        let app = launch(route: "looks/trips/\(id)", dark: true)
        let progress = element("trip.progress", in: app)
        XCTAssertTrue(progress.waitForExistence(timeout: 40), "the route opens the packed detail")
        Thread.sleep(forTimeInterval: 1.5)
        snapshot("dark-suitcase", app)

        // A piece the days wear can't be taken out: the server's sentence, in an alert.
        let trip = try XCTUnwrap(api.data("GET", "api/v1/trips/\(id)") as? [String: Any])
        let packing = try XCTUnwrap((trip["plan"] as? [String: Any])?["packing"] as? [[String: Any]])
        let firstBlock = try XCTUnwrap(packing[0]["blockId"] as? String)
        let item = app.buttons["trip.item.\(firstBlock)"]
        scroll(to: item, in: app)
        item.tap()
        XCTAssertTrue(waitUntil { self.packed(id, firstBlock) == true }, "ticked on the server")
        item.press(forDuration: 1.2)
        let takeOut = app.buttons["Take out of the bag"]
        XCTAssertTrue(takeOut.waitForExistence(timeout: 10), "the long press offers the counts")
        snapshot("dark-count-menu", app)
        takeOut.tap()
        let alert = app.alerts.firstMatch
        XCTAssertTrue(alert.waitForExistence(timeout: 15), "the server refuses, in an alert")
        XCTAssertTrue(alert.label.contains("Can’t take that out"), alert.label)
        snapshot("dark-refused", app)
        alert.buttons["OK"].tap()
        XCTAssertTrue(alert.waitForNonExistence(timeout: 5))
        XCTAssertEqual(packed(id, firstBlock), true, "still packed, still ticked")

        let view = app.segmentedControls["trip.view"]
        scroll(to: view, in: app)
        view.buttons["Days"].tap()
        Thread.sleep(forTimeInterval: 1)
        snapshot("dark-days", app)
        view.buttons["Suitcase"].tap()

        // Edit: the name, and a change that affects the plan offers a repack.
        app.buttons["trip.more"].tap()
        let edit = app.buttons["Edit trip"]
        XCTAssertTrue(edit.waitForExistence(timeout: 10))
        edit.tap()
        let name = app.textFields["trip.edit.name"]
        XCTAssertTrue(name.waitForExistence(timeout: 10), "the edit sheet")
        snapshot("dark-edit", app)
        // The toggle first, while nothing covers it; the keyboard comes up for the name.
        let laundry = app.switches["trip.edit.laundry"].firstMatch
        XCTAssertTrue(laundry.waitForExistence(timeout: 5))
        // The knob, not the label: a tap on a toggle's label does nothing.
        laundry.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
        XCTAssertTrue(waitUntil(timeout: 5) { (laundry.value as? String) == "1" }, "laundry is on: \(laundry.value ?? "")")
        name.tap()
        name.typeText(" week")
        app.buttons["trip.edit.save"].tap()
        let offer = app.buttons["trip.repack.offer.yes"].firstMatch
        XCTAssertTrue(offer.waitForExistence(timeout: 15), "saving a change to the plan offers to pack again")
        snapshot("dark-repack-offer", app)
        app.buttons["trip.repack.offer.no"].firstMatch.tap()
        XCTAssertTrue(waitUntil {
            let now = self.api.data("GET", "api/v1/trips/\(id)") as? [String: Any]
            return now?["name"] as? String == "Lisbon week" && ((now?["options"] as? [String: Any])?["laundry"] as? Bool) == true
        }, "the name and laundry are stored")
        XCTAssertTrue(app.navigationBars["Lisbon week"].waitForExistence(timeout: 10), "the title follows the name")

        // Pack again with a note: the plan is replaced, the tick is kept.
        app.buttons["trip.more"].tap()
        let repack = app.buttons["Pack again…"]
        XCTAssertTrue(repack.waitForExistence(timeout: 10))
        repack.tap()
        let note = element("trip.repack.note", in: app)
        XCTAssertTrue(note.waitForExistence(timeout: 10), "the repack sheet")
        note.tap()
        note.typeText("something for a rainy day")
        snapshot("dark-repack", app)
        app.buttons["trip.repack.go"].tap()
        XCTAssertTrue(waitUntil(timeout: 60) {
            let now = self.api.data("GET", "api/v1/trips/\(id)") as? [String: Any]
            return ((now?["options"] as? [String: Any])?["steer"] as? String) == "something for a rainy day"
        }, "the note is stored with the new plan")
        XCTAssertTrue(progress.waitForExistence(timeout: 30), "the suitcase is back")
        XCTAssertEqual(packed(id, firstBlock), true, "the tick survived the repack")
        Thread.sleep(forTimeInterval: 1)
        snapshot("dark-repacked", app)

        app.navigationBars.buttons.firstMatch.tap()
        let shelfRow = app.buttons["trips.row.\(id)"]
        XCTAssertTrue(shelfRow.waitForExistence(timeout: 15), "back on the shelf")
        XCTAssertTrue(app.segmentedControls["looks.shelf"].buttons["Trips"].isSelected, "on the Trips segment")
        Thread.sleep(forTimeInterval: 1)
        snapshot("dark-shelf", app)
        app.buttons["trips.add"].tap()
        XCTAssertTrue(app.buttons["trip.plan.place"].waitForExistence(timeout: 10), "+ opens Plan a trip")
        snapshot("dark-plan", app)
        app.buttons["trip.plan.cancel"].tap()
        XCTAssertTrue(app.buttons["trip.plan.place"].waitForNonExistence(timeout: 10))
    }

    // MARK: - A gone piece, taking one off, a dress into separates

    /// Day one of a packed trip is changed through the API to wear a dress
    /// (added to the closet for the test) and a belt, and its shoes are
    /// archived. The Days view then shows the shoes' slot as a placeholder
    /// that can be filled, "Take it off" removes the belt, and "Top and
    /// bottom instead" replaces the dress; each checked on the server.
    func testGoneSlotTakeOffAndSeparates() throws {
        let id = try createPackedTrip()
        let trip = try XCTUnwrap(api.data("GET", "api/v1/trips/\(id)") as? [String: Any])
        let date = try XCTUnwrap(trip["startDate"] as? String)
        let blocks = (api.data("GET", "api/v1/blocks") as? [[String: Any]]) ?? []
        func firstBlock(_ category: String, not excluded: Set<String> = []) throws -> String {
            try XCTUnwrap(blocks.first { $0["category"] as? String == category && !excluded.contains($0["id"] as? String ?? "") }?["id"] as? String,
                          "the dev closet has a \(category)")
        }
        let belt = try firstBlock("accessory")
        let shoes = try XCTUnwrap(slots(id, date)?["footwear"] as? String, "day one wears shoes")

        // A dress for the closet, worn on day one; a belt too; the shoes archived.
        let dressInput: [String: Any] = [
            "typeId": "dress", "fit": "relaxed", "material": "cotton", "pattern": "solid", "quantity": 1,
            "color": ["name": "Black", "hex": "#111111", "family": "neutral", "paletteId": "black"],
        ]
        let created = try XCTUnwrap((api.data("POST", "api/v1/blocks", body: dressInput) as? [String: Any])?["created"] as? [[String: Any]])
        let dress = try XCTUnwrap(created.first?["id"] as? String, "the dress is stored")
        addedBlocks.append(dress)
        XCTAssertNotNil(api.data("POST", "api/v1/trips/\(id)/swap", body: ["date": date, "slot": "fullbody", "toBlockId": dress]), "day one wears the dress")
        XCTAssertNotNil(api.data("POST", "api/v1/trips/\(id)/swap", body: ["date": date, "slot": "accessories", "toBlockId": belt]), "and the belt")
        XCTAssertNotNil(api.data("POST", "api/v1/blocks/\(shoes)/archive"), "the shoes are archived")
        archivedBlocks.append(shoes)

        let app = launch(route: "looks/trips/\(id)")
        XCTAssertTrue(element("trip.progress", in: app).waitForExistence(timeout: 40))
        let view = app.segmentedControls["trip.view"]
        scroll(to: view, in: app)
        view.buttons["Days"].tap()

        // The shoes' slot is still there, empty, and can be filled.
        let gone = app.buttons["trip.day.\(date).slot.footwear"]
        scroll(to: gone, in: app)
        XCTAssertTrue(gone.label.contains("No longer in your closet"), gone.label)
        Thread.sleep(forTimeInterval: 1)
        snapshot("gone-slot", app)
        gone.tap()
        let otherShoes = try firstBlock("footwear", not: [shoes])
        let option = app.buttons["trip.swap.option.\(otherShoes)"]
        XCTAssertTrue(option.waitForExistence(timeout: 10), "the sheet offers the other shoes")
        XCTAssertTrue(app.navigationBars["Pick from shoes"].exists, "named after the slot")
        snapshot("gone-slot-sheet", app)
        option.tap()
        XCTAssertTrue(option.waitForNonExistence(timeout: 15), "the sheet closes")
        XCTAssertTrue(waitUntil { self.slots(id, date)?["footwear"] as? String == otherShoes }, "the day wears them now")
        XCTAssertTrue(app.buttons["trip.day.\(date).piece.\(otherShoes)"].waitForExistence(timeout: 10), "the row shows them")

        // The belt comes off.
        let beltRow = app.buttons["trip.day.\(date).piece.\(belt)"]
        scroll(to: beltRow, in: app)
        beltRow.tap()
        let takeOff = app.buttons["trip.swap.takeOff"]
        XCTAssertTrue(takeOff.waitForExistence(timeout: 10), "an accessory can be taken off")
        snapshot("takeoff-sheet", app)
        takeOff.tap()
        XCTAssertTrue(takeOff.waitForNonExistence(timeout: 15))
        XCTAssertTrue(waitUntil { (self.slots(id, date)?["accessories"] as? [String])?.isEmpty == true }, "no accessory on the server")
        XCTAssertTrue(beltRow.waitForNonExistence(timeout: 10), "and no row")

        // The dress gives way to a top and a bottom.
        let dressRow = app.buttons["trip.day.\(date).piece.\(dress)"]
        scroll(to: dressRow, in: app)
        dressRow.tap()
        let separates = app.buttons["trip.swap.separates"]
        XCTAssertTrue(separates.waitForExistence(timeout: 10), "a full-body piece offers separates")
        snapshot("separates-offer", app)
        separates.tap()
        let top = try firstBlock("top")
        let topOption = app.buttons["trip.swap.option.\(top)"]
        XCTAssertTrue(topOption.waitForExistence(timeout: 10), "first a top")
        XCTAssertTrue(app.navigationBars["Pick a top"].exists)
        snapshot("separates-top", app)
        topOption.tap()
        let bottom = try firstBlock("bottom")
        let bottomOption = app.buttons["trip.swap.option.\(bottom)"]
        XCTAssertTrue(bottomOption.waitForExistence(timeout: 10), "then a bottom")
        XCTAssertTrue(app.navigationBars["Pick a bottom"].waitForExistence(timeout: 5))
        snapshot("separates-bottom", app)
        bottomOption.tap()
        XCTAssertTrue(bottomOption.waitForNonExistence(timeout: 15), "the sheet closes")
        XCTAssertTrue(waitUntil {
            let now = self.slots(id, date)
            return now?["fullbody"] == nil && now?["top"] as? String == top && now?["bottom"] as? String == bottom
        }, "the day wears the top and the bottom: \(slots(id, date) ?? [:])")
        XCTAssertTrue(app.buttons["trip.day.\(date).piece.\(top)"].waitForExistence(timeout: 10))
        Thread.sleep(forTimeInterval: 1)
        snapshot("separates-done", app)

        // The suitcase says what happened to the archived shoes.
        scroll(to: view, in: app)
        view.buttons["Suitcase"].tap()
        let warnings = element("trip.warnings", in: app)
        if warnings.waitForExistence(timeout: 5) { snapshot("warnings", app) }
    }

    // MARK: - Harness

    /// The slots of one day's outfit as the server has them.
    private func slots(_ tripId: String, _ date: String) -> [String: Any]? {
        let trip = api.data("GET", "api/v1/trips/\(tripId)") as? [String: Any]
        let days = (trip?["plan"] as? [String: Any])?["days"] as? [[String: Any]]
        return (days?.first { $0["date"] as? String == date }?["outfit"] as? [String: Any])?["slots"] as? [String: Any]
    }

    /// A trip to Lisbon a week from now, packed by the mock.
    private func createPackedTrip() throws -> String {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: .now)
        let body: [String: Any] = [
            "place": [
                "name": "Lisbon", "region": "Lisbon District", "country": "Portugal", "countryCode": "PT",
                "lat": 38.72509, "lon": -9.1498, "timezone": "Europe/Lisbon",
            ],
            "startDate": isoDay(calendar.date(byAdding: .day, value: 7, to: today)!),
            "endDate": isoDay(calendar.date(byAdding: .day, value: 11, to: today)!),
            "activities": ["city", "evening"],
            "laundry": false,
        ]
        let created = try XCTUnwrap(api.data("POST", "api/v1/trips", body: body) as? [String: Any], "the trip is created")
        let id = try XCTUnwrap(created["id"] as? String)
        let packed = try XCTUnwrap(api.data("POST", "api/v1/trips/\(id)/plan", body: [:]) as? [String: Any], "the trip is packed")
        XCTAssertNotNil(packed["plan"] as? [String: Any])
        return id
    }

    nonisolated private func trips() -> [[String: Any]] {
        (api?.data("GET", "api/v1/trips") as? [[String: Any]]) ?? []
    }

    private func packed(_ tripId: String, _ blockId: String) -> Bool? {
        let trip = api.data("GET", "api/v1/trips/\(tripId)") as? [String: Any]
        let packing = (trip?["plan"] as? [String: Any])?["packing"] as? [[String: Any]]
        return packing?.first { $0["blockId"] as? String == blockId }?["packed"] as? Bool
    }

    private func isoDay(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = .current
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    /// Picks a day in a compact date picker's calendar: opens it, moves to
    /// the month, taps the day, closes it. False when the calendar can't be
    /// driven (then the test goes on with the default dates).
    private func pickDate(_ picker: XCUIElement, _ date: Date, in app: XCUIApplication) -> Bool {
        guard picker.waitForExistence(timeout: 5) else { return false }
        scroll(to: picker, in: app)
        picker.tap()
        let next = app.buttons["Next Month"]
        guard next.waitForExistence(timeout: 5) else {
            print("note: no calendar popover for \(picker)")
            return false
        }
        let calendar = Calendar.current
        let months = calendar.dateComponents([.month], from: calendar.startOfDay(for: .now), to: date).month ?? 0
        let monthsAhead = calendar.component(.month, from: date) == calendar.component(.month, from: .now) ? 0 : max(months, 1)
        for _ in 0..<monthsAhead { next.tap() }
        // Cells are labelled "Wednesday, October 29" (the locale's long form).
        let label = date.formatted(.dateTime.weekday(.wide).month(.wide).day())
        let cell = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", label)).firstMatch
        guard cell.waitForExistence(timeout: 5) else {
            print("note: no calendar cell “\(label)”")
            app.navigationBars.firstMatch.tap()
            return false
        }
        cell.tap()
        // Closes the popover: a tap on the sheet's title bar.
        app.navigationBars.firstMatch.tap()
        _ = next.waitForNonExistence(timeout: 5)
        return true
    }

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

    private func waitForLabel(_ text: String, of element: XCUIElement, timeout: TimeInterval) -> Bool {
        waitUntil(timeout: timeout) { element.exists && element.label.contains(text) }
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
