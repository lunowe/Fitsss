import FitsssCore
import FitsssUI
import SwiftUI

/// You → AI model, the web's `/you/model`: which provider answers, which
/// model does each task, how hard it thinks, and a real test call per task.
///
/// Everything saves the moment it is touched. What the server's environment
/// holds (`LLM_MOCK`, `LLM_MODEL_VISION`…) is shown and can't be changed
/// here, rather than accepting a choice that would have no effect.
struct ModelScreen: View {
    @Environment(LLMSettingsStore.self) private var llm
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle("AI model")
            .navigationSubtitle(subtitle)
            .task {
                async let settings: Void = llm.load()
                async let models: Void = llm.loadModels()
                _ = await (settings, models)
            }
    }

    /// "312 models available", like the web; nothing until the list is in.
    private var subtitle: String {
        guard let list = llm.modelList else { return "" }
        let count = list.models.count
        return count == 0 ? "No models available" : "\(count.formatted()) models available"
    }

    @ViewBuilder
    private var content: some View {
        if let settings = llm.current {
            form(settings)
        } else if case .failed(let error) = llm.phase {
            ContentUnavailableView {
                Label("Can’t load the AI model settings", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await llm.load() } }
                    .accessibilityIdentifier("model.retry")
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func form(_ settings: LLMSettings) -> some View {
        List {
            providerSection(settings)
            modelsSection(settings)
            effortSection(settings)
            testSection(settings)
        }
        .listStyle(.insetGrouped)
        .refreshable {
            async let settings: Void = llm.load()
            async let models: Void = llm.loadModels(force: true)
            _ = await (settings, models)
        }
    }

    // MARK: - Provider

    private func providerSection(_ settings: LLMSettings) -> some View {
        Section {
            Picker("Provider", selection: Binding(
                get: { settings.settings.provider },
                set: { provider in save(LLMChange(provider: provider)) }
            )) {
                ForEach(settings.providers) { provider in
                    Text(provider.label).tag(provider.id)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .disabled(settings.pinned.provider != nil)
            .accessibilityIdentifier("model.provider")
        } header: {
            Text("Provider")
        } footer: {
            Text(providerFootnote(settings))
                .accessibilityIdentifier("model.provider.footnote")
        }
    }

    private func providerFootnote(_ settings: LLMSettings) -> String {
        var sentences: [String] = []
        if let provider = settings.provider {
            if provider.isMock {
                sentences.append("Made-up outfits from your closet. No model is called.")
            } else if let keyVar = provider.keyVar {
                sentences.append(provider.configured
                    ? "The server has a key for \(provider.label)."
                    : "The server has no \(keyVar), so calls will fail until it is set.")
            }
        }
        if let pin = settings.pinned.provider {
            sentences.append("Set by \(pin) on the server.")
        }
        return sentences.joined(separator: " ")
    }

    // MARK: - Models

    private func modelsSection(_ settings: LLMSettings) -> some View {
        Section {
            ForEach(settings.tasks) { task in
                modelRow(task, settings: settings)
            }
        } header: {
            Text("Models")
        } footer: {
            Text(modelsFootnote(settings))
        }
    }

    @ViewBuilder
    private func modelRow(_ task: LLMTask, settings: LLMSettings) -> some View {
        let modelId = settings.settings.models[task.id] ?? ""
        let pin = settings.pinned.model(task.id)
        let label = VStack(alignment: .leading, spacing: 2) {
            Text(task.label)
                .foregroundStyle(Color.fitsssLabel)
            Text(modelName(modelId))
                .font(.subheadline)
                .foregroundStyle(Color.fitsssLabel2)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                .truncationMode(.middle)
            if let pin {
                Text("Set by \(pin) on the server.")
                    .font(.footnote)
                    .foregroundStyle(Color.fitsssLabel2)
            } else if let problem = problem(task, modelId: modelId, settings: settings) {
                // Not a `Label`: in a list row its icon would take the row's
                // icon column, far from the words.
                Text("\(Image(systemName: "exclamationmark.triangle.fill")) \(problem)")
                    .font(.footnote)
                    .foregroundStyle(Color.fitsssDestructive)
                    .accessibilityLabel("Warning: \(problem)")
                    .accessibilityIdentifier("model.row.\(task.id).problem")
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)

        if pin == nil {
            NavigationLink(value: YouScreen.Route.modelPicker(task.id)) { label }
                .accessibilityIdentifier("model.row.\(task.id)")
        } else {
            label.accessibilityIdentifier("model.row.\(task.id)")
        }
    }

    /// The catalogue's name ("Anthropic: Claude Opus 5") once it is in, the id until then.
    private func modelName(_ id: String) -> String {
        llm.modelList?.model(id)?.name ?? id
    }

    /// Why the model set for a task won't work, when that is knowable here.
    private func problem(_ task: LLMTask, modelId: String, settings: LLMSettings) -> String? {
        guard let provider = settings.provider, !provider.isMock else { return nil }
        if !provider.serves(modelId) { return "\(provider.label) doesn’t serve this model." }
        // OpenRouter's list is the catalogue; Anthropic's own models are
        // checked by prefix above.
        guard let list = llm.modelList, !list.models.isEmpty else { return nil }
        guard let model = list.model(modelId) else {
            return provider.modelPrefix == nil ? "OpenRouter doesn’t list this model." : nil
        }
        if task.needsVision, !model.vision { return "This model can’t see pictures." }
        return nil
    }

    private func modelsFootnote(_ settings: LLMSettings) -> String {
        guard let provider = settings.provider else { return "" }
        if provider.isMock { return "The mock provider doesn’t use these. They apply again when you switch provider." }
        if provider.modelPrefix != nil { return "\(provider.label) is called directly, so only its own models work." }
        return "Picture reading lists only models that can see pictures."
    }

    // MARK: - Effort

    private func effortSection(_ settings: LLMSettings) -> some View {
        Section {
            Picker("Effort", selection: Binding(
                get: { settings.settings.effort },
                set: { effort in save(LLMChange(effort: effort)) }
            )) {
                ForEach(settings.effortLevels, id: \.self) { level in
                    Text(level.capitalized).tag(level)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .disabled(settings.pinned.effort != nil)
            .accessibilityIdentifier("model.effort")
        } header: {
            Text("Effort")
        } footer: {
            let pin = settings.pinned.effort.map { " Set by \($0) on the server." } ?? ""
            Text("How long the model may think before answering. Higher means better outfits, a longer wait and a bigger bill.\(pin)")
        }
    }

    // MARK: - Test

    private func testSection(_ settings: LLMSettings) -> some View {
        let isMock = settings.provider?.isMock ?? true
        return Section {
            ForEach(settings.tasks) { task in
                testRow(task, disabled: isMock)
            }
        } header: {
            Text("Test")
        } footer: {
            Text(isMock
                ? "The mock provider makes no calls, so there is nothing to test."
                : "One small real call per task, to the model above, with the server’s key.")
        }
    }

    private func testRow(_ task: LLMTask, disabled: Bool) -> some View {
        let state = llm.test(task.id)
        return Button {
            Task { await llm.runTest(task.id) }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(task.label)
                        .foregroundStyle(disabled ? Color.fitsssLabel3 : Color.fitsssLabel)
                    switch state {
                    case .passed(let result):
                        Text("\(result.model) · \(result.sample)")
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssLabel2)
                            .accessibilityIdentifier("model.test.\(task.id).result")
                    case .failed(let message):
                        Text(message)
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssDestructive)
                            .accessibilityIdentifier("model.test.\(task.id).error")
                    case .idle, .running:
                        EmptyView()
                    }
                }
                Spacer(minLength: 8)
                testStatus(state, disabled: disabled)
            }
            .contentShape(Rectangle())
        }
        .disabled(disabled || state == .running)
        .accessibilityIdentifier("model.test.\(task.id)")
    }

    @ViewBuilder
    private func testStatus(_ state: LLMSettingsStore.TestState, disabled: Bool) -> some View {
        switch state {
        case .running:
            ProgressView()
                .accessibilityLabel("Testing")
        case .passed(let result):
            Label(seconds(result.ms), systemImage: "checkmark.circle.fill")
                .labelStyle(.titleAndIcon)
                .font(.subheadline.monospacedDigit())
                .foregroundStyle(Color.fitsssSuccess)
        case .failed:
            Text("Try Again")
                .foregroundStyle(Color.fitsssTint)
        case .idle:
            Text("Test")
                .foregroundStyle(disabled ? Color.fitsssLabel3 : Color.fitsssTint)
        }
    }

    /// "1.4 s".
    private func seconds(_ ms: Int) -> String {
        (Double(ms) / 1000).formatted(.number.precision(.fractionLength(1))) + " s"
    }

    // MARK: - Saving

    private func save(_ change: LLMChange) {
        Task {
            do {
                try await llm.change(change)
            } catch APIError.superseded {
                // Signed out or switched servers meanwhile; nothing to say.
            } catch let error as APIError {
                toasts.show(error.displayMessage, isError: true)
            } catch {
                toasts.show("That could not be saved.", isError: true)
            }
        }
    }
}

extension APIError {
    /// The validator's messages for invalid input, a plain sentence otherwise.
    var displayMessage: String { errorDescription ?? "Something went wrong." }
}
