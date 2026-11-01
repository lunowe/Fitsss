import Foundation
import Synchronization
import Testing
@testable import FitsssCore

/// Edits whose answers come back late or out of order must not undo newer
/// ones, on the server or on screen. A stand-in network holds requests until
/// the test lets them through.
@Suite(.serialized) @MainActor struct WriteOrderTests {
    @Test func notesOfOnePictureAreSentOneAtATime() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = InspoStore(api: net.client)
        net.answer("GET", "/api/v1/inspos") { _ in Self.envelope("[\(Self.inspo(note: nil))]") }
        await store.load()

        net.answer("PATCH", "/api/v1/inspos/p1", hold: true) { body in
            let note = (try? JSONSerialization.jsonObject(with: body) as? [String: String])?["note"] ?? ""
            return Self.envelope(Self.inspo(note: note))
        }
        let first = Task { try await store.setNote("p1", note: "older") }
        try await net.waitForRequests(2)
        let second = Task { try await store.setNote("p1", note: "newer") }
        // The load and the first note; the second waits for the first's
        // answer before it is sent at all.
        try await Task.sleep(for: .milliseconds(150))
        #expect(net.received.count == 2)
        net.releaseAll()
        _ = try await (first.value, second.value)

        #expect(net.sentBodies("PATCH").map { String(decoding: $0, as: UTF8.self) } == [#"{"note":"older"}"#, #"{"note":"newer"}"#])
        #expect(store.inspo("p1")?.note == "newer")
    }

    @Test func aSlowReadDoesNotUndoANoteSavedMeanwhile() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = InspoStore(api: net.client)
        net.answer("GET", "/api/v1/inspos") { _ in Self.envelope("[\(Self.inspo(note: nil))]") }
        await store.load()

        // The read's answer is the picture as it was before the note.
        net.answer("POST", "/api/v1/inspos/p1/analyze", hold: true) { _ in Self.envelope(Self.inspo(note: nil, read: true)) }
        net.answer("PATCH", "/api/v1/inspos/p1") { _ in Self.envelope(Self.inspo(note: "kept")) }
        async let read = store.analyze("p1")
        try await net.waitForRequests(2)
        _ = try await store.setNote("p1", note: "kept")
        net.releaseAll()
        _ = try await read

        #expect(store.inspo("p1")?.note == "kept")
        #expect(store.inspo("p1")?.analysis != nil)
    }

    @Test func twoDeletionsAnsweredOutOfOrderBothStick() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = TasteStore(api: net.client)
        net.answer("GET", "/api/v1/taste") { _ in Self.envelope(Self.overview(["a", "b"])) }
        await store.load()

        // Deleting a answers with b still there; deleting b with nothing left.
        net.answer("DELETE", "/api/v1/taste/lines/a", hold: true) { _ in Self.envelope(Self.profile(["b"])) }
        net.answer("DELETE", "/api/v1/taste/lines/b") { _ in Self.envelope(Self.profile([])) }
        let first = Task { try await store.removeLine("a", styleId: nil) }
        try await net.waitForRequests(2)
        let second = Task { try await store.removeLine("b", styleId: nil) }
        // Deleting b waits for a's answer before it is sent.
        try await Task.sleep(for: .milliseconds(150))
        #expect(net.received.count == 2)
        net.releaseAll()
        _ = try await (first.value, second.value)

        #expect(store.profile(nil)?.lines.map(\.id) == [])
        #expect(net.received.map(\.path) == ["/api/v1/taste", "/api/v1/taste/lines/a", "/api/v1/taste/lines/b"])
    }

    @Test func anEditFinishingAfterAResetLeavesTheNewSessionAlone() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = TasteStore(api: net.client)
        net.answer("GET", "/api/v1/taste") { _ in Self.envelope(Self.overview(["a"])) }
        await store.load()

        net.answer("POST", "/api/v1/taste/lines", hold: true) { _ in Self.envelope(Self.profile(["a", "old"])) }
        let stale = Task { try await store.addLine("old", kind: "like", styleId: nil) }
        try await net.waitForRequests(2)

        store.reset()
        net.answer("GET", "/api/v1/taste") { _ in Self.envelope(Self.overview(["fresh"])) }
        await store.load()
        net.releaseAll()
        _ = try? await stale.value

        #expect(store.profile(nil)?.lines.map(\.id) == ["fresh"])
        // And a refresh in the new session shows its answer.
        net.answer("POST", "/api/v1/taste/refresh") { _ in Self.envelope(Self.profile(["fresh", "learned"])) }
        _ = try await store.refresh(nil)
        #expect(store.profile(nil)?.lines.map(\.id) == ["fresh", "learned"])
    }

    @Test func settingsChangesGoOutInOrderAndTheLastOneShows() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = LLMSettingsStore(api: net.client)
        net.answer("GET", "/api/v1/settings/llm") { _ in Self.envelope(Self.llmSettings(effort: "medium")) }
        await store.load()

        // Each answer is the settings with the effort that request sent.
        net.answer("PATCH", "/api/v1/settings/llm", hold: true) { body in
            let effort = (try? JSONSerialization.jsonObject(with: body) as? [String: String])?["effort"] ?? "medium"
            return Self.envelope(Self.llmSettings(effort: effort))
        }
        let first = Task { try await store.change(LLMChange(effort: "high")) }
        try await net.waitForRequests(2)
        let second = Task { try await store.change(LLMChange(effort: "low")) }
        // The second waits for the first's answer before it is sent at all,
        // and shows meanwhile.
        try await Task.sleep(for: .milliseconds(150))
        #expect(net.received.count == 2)
        #expect(store.current?.settings.effort == "low", "shown before any answer")
        net.releaseAll()
        _ = try await (first.value, second.value)

        #expect(net.sentBodies("PATCH").map { String(decoding: $0, as: UTF8.self) } == [#"{"effort":"high"}"#, #"{"effort":"low"}"#])
        #expect(store.current?.settings.effort == "low")
        #expect(store.current?.chosen.effort == "low")
    }

    @Test func aFailedSettingsChangeFallsBackToWhatTheServerConfirmed() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = LLMSettingsStore(api: net.client)
        net.answer("GET", "/api/v1/settings/llm") { _ in Self.envelope(Self.llmSettings(effort: "medium")) }
        await store.load()

        // The save fails, and so does the read that follows it (offline).
        net.answer("PATCH", "/api/v1/settings/llm") { _ in Data(#"{"error":{"code":"x","message":"refused"}}"#.utf8) }
        net.answer("GET", "/api/v1/settings/llm") { _ in Data(#"{"error":{"code":"x","message":"down"}}"#.utf8) }
        await #expect(throws: APIError.self) { try await store.change(LLMChange(effort: "high")) }
        #expect(store.current?.settings.effort == "medium", "not shown as saved")
        try await net.waitForRequests(3)
        try await Task.sleep(for: .milliseconds(100))
        #expect(store.current?.settings.effort == "medium", "still not, after the read failed too")
    }

    @Test func aStaleRecoveryFetchDoesNotUndoANewerTick() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = TripsStore(api: net.client)
        net.answer("GET", "/api/v1/trips") { _ in Self.envelope("[\(Self.trip(packed: false))]") }
        await store.load()

        // The first tick fails; its recovery read is slow and sees the trip unticked.
        let patches = Counter()
        net.answer("PATCH", "/api/v1/trips/t1") { _ in
            patches.next() == 1 ? Data(#"{"error":{"code":"boom","message":"refused"}}"#.utf8) : Self.envelope(Self.trip(packed: true))
        }
        net.answer("GET", "/api/v1/trips/t1", hold: true) { _ in Self.envelope(Self.trip(packed: false)) }
        await #expect(throws: APIError.self) { try await store.setPacked("t1", blockId: "b1", packed: true) }
        try await net.waitForRequests(3)
        // Ticked again, this time stored.
        try await store.setPacked("t1", blockId: "b1", packed: true)
        net.releaseAll()
        try await Task.sleep(for: .milliseconds(150))

        #expect(store.trip("t1")?.plan?.packing.first?.packed == true)
    }

    @Test func aLateAnswerDoesNotBringBackADeletedTrip() async throws {
        let net = HeldNetwork.start()
        defer { net.stop() }
        let store = TripsStore(api: net.client)
        net.answer("GET", "/api/v1/trips") { _ in Self.envelope("[\(Self.trip(packed: false))]") }
        await store.load()

        net.answer("PATCH", "/api/v1/trips/t1", hold: true) { _ in Self.envelope(Self.trip(packed: true)) }
        net.answer("DELETE", "/api/v1/trips/t1") { _ in Self.envelope("null") }
        let tick = Task { try await store.setPacked("t1", blockId: "b1", packed: true) }
        try await net.waitForRequests(2)
        try await store.remove("t1")
        net.releaseAll()
        _ = try? await tick.value

        #expect(store.trip("t1") == nil)
        #expect(store.trips.isEmpty)
    }

    // MARK: - Fixtures

    nonisolated static func envelope(_ json: String) -> Data { Data(#"{"data":\#(json)}"#.utf8) }

    nonisolated static func inspo(note: String?, read: Bool = false) -> String {
        let noteJSON = note.map { #""\#($0)""# } ?? "null"
        let analysis = read
            ? #"{"summary":"s","pieces":[],"vibe":["calm"],"palette":[],"silhouette":"x","formality":2,"model":"mock"}"#
            : "null"
        let match = read ? #"{"matches":[],"gaps":[],"coverage":0}"# : "null"
        return #"{"id":"p1","sourceUrl":null,"imageUrl":"/api/v1/inspos/p1/image","width":4,"height":5,"analysis":\#(analysis),"match":\#(match),"styleId":null,"note":\#(noteJSON),"createdAt":"2026-10-13T09:06:44.324Z"}"#
    }

    nonisolated static func profile(_ ids: [String]) -> String {
        let lines = ids.map { #"{"id":"\#($0)","text":"line \#($0)","source":"user","createdAt":"2026-10-13T09:06:44.324Z"}"# }
        return #"{"styleId":null,"lines":[\#(lines.joined(separator: ","))],"avoid":[],"eventCount":0,"totalEvents":0,"lastRefreshedAt":null,"favorites":[],"skipped":[]}"#
    }

    nonisolated static func llmSettings(effort: String) -> String {
        let choice = #"{"provider":"openrouter","models":{"outfits":"a/b","taste":"a/b","vision":"a/b"},"effort":"\#(effort)"}"#
        return #"{"settings":\#(choice),"chosen":\#(choice),"pinned":{"provider":null,"models":{"outfits":null,"taste":null,"vision":null},"effort":null},"providers":[{"id":"openrouter","label":"OpenRouter","keyVar":"OPENROUTER_API_KEY","configured":true,"modelPrefix":null}],"tasks":[{"id":"outfits","label":"Outfits","hint":"h","needsVision":false}],"effortLevels":["low","medium","high"]}"#
    }

    nonisolated static func trip(packed: Bool) -> String {
        let outfit = #"{"id":"o1","name":"Look","slots":{"top":"b1","bottom":"b2","footwear":"b3","accessories":[]},"why":"."}"#
        let plan = #"{"days":[{"date":"2026-11-07","outfit":\#(outfit)}],"packing":[{"blockId":"b1","count":1,"packed":\#(packed)},{"blockId":"b2","count":1,"packed":false},{"blockId":"b3","count":1,"packed":false}],"tips":[],"warnings":[]}"#
        return #"{"id":"t1","name":"Lisbon","place":{"name":"Lisbon","lat":38.7,"lon":-9.1,"timezone":"Europe/Lisbon"},"startDate":"2026-11-07","endDate":"2026-11-07","options":{"activities":[],"luggage":"carry-on","laundry":false},"weather":[{"date":"2026-11-07","tempC":19,"condition":"cloudy","source":"forecast"}],"plan":\#(plan),"model":"mock","createdAt":"2026-10-26T09:06:44.324Z","updatedAt":"2026-10-26T09:06:44.324Z"}"#
    }

    nonisolated static func overview(_ ids: [String]) -> String {
        #"{"overall":\#(profile(ids)),"byStyle":{},"totalEvents":0}"#
    }
}

/// Counts calls from the network's queue.
final class Counter: Sendable {
    private let value = Mutex(0)
    func next() -> Int { value.withLock { $0 += 1; return $0 } }
}

/// A `URLProtocol` stand-in for the server: canned answers per method and
/// path, optionally held until `releaseAll()`.
final class HeldNetwork: Sendable {
    struct Received: Sendable { var method: String; var path: String; var body: Data }
    typealias Answer = @Sendable (Data) -> Data

    private struct State {
        var answers: [String: (hold: Bool, answer: Answer)] = [:]
        var received: [Received] = []
        var held: [@Sendable () -> Void] = []
        var released = false
    }

    private let state = Mutex(State())
    nonisolated(unsafe) static var current: HeldNetwork?

    @MainActor let client: APIClient

    @MainActor private init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [HeldProtocol.self]
        client = APIClient(baseURL: URL(string: "https://fitsss.test")!, token: "t", session: URLSession(configuration: configuration))
    }

    @MainActor static func start() -> HeldNetwork {
        let network = HeldNetwork()
        current = network
        return network
    }

    func stop() { Self.current = nil }

    func answer(_ method: String, _ path: String, hold: Bool = false, _ answer: @escaping Answer) {
        state.withLock { $0.answers["\(method) \(path)"] = (hold, answer) }
    }

    var received: [Received] { state.withLock { $0.received } }

    func sentBodies(_ method: String) -> [Data] { received.filter { $0.method == method }.map(\.body) }

    func waitForRequests(_ count: Int) async throws {
        for _ in 0..<200 where received.count < count { try await Task.sleep(for: .milliseconds(10)) }
        #expect(received.count >= count)
    }

    func releaseAll() {
        let held = state.withLock { state in
            state.released = true
            defer { state.held = [] }
            return state.held
        }
        held.forEach { $0() }
    }

    fileprivate func handle(_ request: URLRequest, reply: @escaping @Sendable (Data) -> Void) {
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
        let method = request.httpMethod ?? "GET"
        let path = request.url?.path ?? ""
        let respond: (@Sendable () -> Void)? = state.withLock { state in
            state.received.append(Received(method: method, path: path, body: body))
            guard let entry = state.answers["\(method) \(path)"] else { return { reply(Data(#"{"error":{"code":"not_found","message":"no answer"}}"#.utf8)) } }
            let send: @Sendable () -> Void = { reply(entry.answer(body)) }
            if entry.hold && !state.released {
                state.held.append(send)
                return nil
            }
            return send
        }
        respond?()
    }

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

final class HeldProtocol: URLProtocol, @unchecked Sendable {
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let network = HeldNetwork.current else { return }
        let url = request.url!
        network.handle(request) { [weak self] data in
            guard let self else { return }
            let text = String(decoding: data, as: UTF8.self)
            let ok = !text.hasPrefix(#"{"error""#)
            // An error with code "boom" is a server failure; any other a 404.
            let status = ok ? 200 : text.contains(#""code":"boom""#) ? 500 : 404
            let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: nil)!
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }

    override func stopLoading() {}
}
