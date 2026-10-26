import Foundation
import Observation

/// The AI model settings: provider, a model per task, effort; the models
/// OpenRouter offers; and a real test call per task.
@MainActor
@Observable
public final class LLMSettingsStore {
    public enum Phase: Equatable, Sendable {
        case idle, loading, loaded
        case failed(APIError)
    }

    public enum TestState: Equatable, Sendable {
        case idle, running
        case passed(LLMTestResult)
        case failed(String)
    }

    /// What the screen shows: the server's settings with changes still
    /// being saved on top.
    public private(set) var current: LLMSettings?
    public private(set) var phase: Phase = .idle
    /// Nil until fetched; an empty list when OpenRouter could not be reached.
    public private(set) var modelList: LLMModelList?
    public private(set) var modelListFailed: APIError?
    public private(set) var tests: [String: TestState] = [:]

    /// A test is one small model call, but some models think first.
    public static let testTimeout: TimeInterval = 90

    private let api: APIClient
    @ObservationIgnored private var loading: (task: Task<Void, Never>, generation: Int)?
    @ObservationIgnored private var loadingModels: (task: Task<Void, Never>, generation: Int)?
    /// The last settings the server answered with. A change that fails
    /// falls back to them.
    @ObservationIgnored private var confirmed: LLMSettings?
    /// The last change queued; see `change`.
    @ObservationIgnored private var lastWrite: Task<Void, Never>?
    @ObservationIgnored private var writesInFlight = 0
    /// The newest test per task; an older one finishing late writes nothing.
    @ObservationIgnored private var testRuns: [String: UUID] = [:]
    /// Bumped whenever `current` changes here, so a load that started
    /// before does not put older settings back.
    @ObservationIgnored private var revision = 0
    /// Bumped by `reset()`; work from an earlier session leaves no trace.
    @ObservationIgnored private var epoch = 0

    public init(api: APIClient) {
        self.api = api
    }

    public func test(_ task: String) -> TestState { tests[task] ?? .idle }

    /// Concurrent callers share one request; see `ClosetStore.load`.
    public func load() async {
        if let loading, loading.generation == api.generation { return await loading.task.value }
        let task = Task { await performLoad() }
        let generation = api.generation
        loading = (task, generation)
        await task.value
        if loading?.generation == generation { loading = nil }
    }

    private func performLoad() async {
        if current == nil { phase = .loading }
        do {
            for _ in 0..<3 {
                let started = revision
                let fetched: LLMSettings = try await api.call(.get, "api/v1/settings/llm")
                // Changed here meanwhile: this answer may be older than what
                // is shown. Ask again rather than put it back.
                guard started == revision else { continue }
                // A change still on its way will answer with newer settings.
                guard writesInFlight == 0 else { return }
                confirmed = fetched
                show(fetched)
                return
            }
        } catch APIError.superseded {
            return
        } catch is CancellationError {
            if phase == .loading { phase = .idle }
        } catch let error as APIError {
            if current == nil { phase = .failed(error) }
        } catch {
            if current == nil { phase = .failed(.network(error.localizedDescription)) }
        }
    }

    /// The models to pick from, fetched once per session; `force` fetches again.
    public func loadModels(force: Bool = false) async {
        if modelList != nil, !force { return }
        if let loadingModels, loadingModels.generation == api.generation { return await loadingModels.task.value }
        let generation = api.generation
        let task = Task {
            do {
                let list: LLMModelList = try await api.call(.get, "api/v1/settings/llm/models")
                modelList = list
                modelListFailed = nil
            } catch APIError.superseded {
                return
            } catch is CancellationError {
                return
            } catch let error as APIError {
                modelListFailed = error
            } catch {
                modelListFailed = .network(error.localizedDescription)
            }
        }
        loadingModels = (task, generation)
        await task.value
        if loadingModels?.generation == generation { loadingModels = nil }
    }

    /// Shows the change at once and saves it. Changes go out one at a time,
    /// in the order made; only the last answer is shown, so an earlier one
    /// cannot briefly undo a later change. When the last change fails, the
    /// screen goes back to what the server last confirmed, the error is
    /// thrown, and the settings are fetched again. Throws `.invalid`
    /// (unknown provider, a model id the server won't store).
    public func change(_ change: LLMChange) async throws {
        guard let current else { throw APIError.invalid(message: "Settings are still loading.", errors: []) }
        show(current.applying(change))

        let previous = lastWrite
        let generation = api.generation
        let epoch = self.epoch
        writesInFlight += 1
        let task = Task { () async throws -> Void in
            await previous?.value
            var answered = false
            defer {
                if self.epoch == epoch {
                    self.writesInFlight -= 1
                    if !answered, self.writesInFlight == 0 {
                        if let confirmed = self.confirmed { self.show(confirmed) }
                        if generation == self.api.generation { Task { await self.load() } }
                    }
                }
            }
            guard generation == self.api.generation, epoch == self.epoch else { throw APIError.superseded }
            let answer: LLMSettings = try await self.api.call(.patch, "api/v1/settings/llm", body: change)
            guard epoch == self.epoch else { throw APIError.superseded }
            self.confirmed = answer
            if self.writesInFlight == 1 { self.show(answer) }
            answered = true
        }
        lastWrite = Task { _ = try? await task.value }
        try await task.value
    }

    /// Puts settings on screen. A test result is about the provider and
    /// model that ran; where those are no longer in effect, it goes.
    private func show(_ settings: LLMSettings) {
        if let old = current?.settings {
            for task in Set(old.models.keys).union(settings.settings.models.keys)
            where old.provider != settings.settings.provider || old.models[task] != settings.settings.models[task] {
                tests[task] = nil
                testRuns[task] = nil
            }
        }
        current = settings
        phase = .loaded
        revision &+= 1
    }

    /// One tiny real call against the model set for `task`. Never throws;
    /// the outcome is in `tests[task]`. A change still being saved goes
    /// first, so the server tests the model on screen.
    public func runTest(_ task: String) async {
        guard test(task) != .running else { return }
        tests[task] = .running
        let run = UUID()
        testRuns[task] = run
        let generation = api.generation
        await lastWrite?.value
        guard testRuns[task] == run else { return }
        let outcome: TestState
        do {
            let result: LLMTestResult = try await api.call(
                .post, "api/v1/settings/llm/test", body: TestBody(task: task), timeout: Self.testTimeout
            )
            outcome = .passed(result)
        } catch APIError.superseded {
            if testRuns[task] == run {
                testRuns[task] = nil
                tests[task] = nil
            }
            return
        } catch let error as APIError {
            outcome = .failed(error.errorDescription ?? "The test failed.")
        } catch {
            outcome = .failed(error.localizedDescription)
        }
        // Another provider or model came into effect while it ran (`show`
        // dropped the run): the answer was about the old one. So did a
        // sign-out (`reset`).
        guard testRuns[task] == run, generation == api.generation else { return }
        testRuns[task] = nil
        tests[task] = outcome
    }

    public func reset() {
        current = nil
        confirmed = nil
        phase = .idle
        modelList = nil
        modelListFailed = nil
        tests = [:]
        testRuns = [:]
        loading = nil
        loadingModels = nil
        lastWrite = nil
        writesInFlight = 0
        epoch &+= 1
        revision &+= 1
    }
}

nonisolated private struct TestBody: Encodable {
    var task: String
}
