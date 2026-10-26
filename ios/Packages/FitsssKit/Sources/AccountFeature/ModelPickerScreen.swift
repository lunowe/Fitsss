import FitsssCore
import FitsssUI
import SwiftUI

/// Picks the model for one task, the web's `ModelPickerSheet`: the suggested
/// ones first, then everything OpenRouter offers that can answer in a
/// schema. A task that reads pictures lists only models that can see them,
/// and Anthropic only its own, because a wrong pick there fails much later
/// and much less legibly.
struct ModelPickerScreen: View {
    let taskId: String

    @Environment(LLMSettingsStore.self) private var llm
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var query = ""

    private var task: LLMTask? { llm.current?.tasks.first { $0.id == taskId } }
    private var selected: String? { llm.current?.settings.models[taskId] }

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle(task?.label ?? "Model")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search models")
            .task { await llm.loadModels() }
    }

    @ViewBuilder
    private var content: some View {
        if let list = llm.modelList, !list.models.isEmpty {
            results(list)
        } else if llm.modelList != nil || llm.modelListFailed != nil {
            ContentUnavailableView {
                Label("Can’t load the models", systemImage: "wifi.exclamationmark")
            } description: {
                Text(llm.modelListFailed?.displayMessage ?? "OpenRouter didn’t answer the server. Try again in a moment.")
            } actions: {
                Button("Try Again") { Task { await llm.loadModels(force: true) } }
                    .accessibilityIdentifier("model.picker.retry")
            }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func results(_ list: LLMModelList) -> some View {
        let shown = matches(in: eligible(list))
        let suggestedIds = Set(list.suggested)
        let suggested = list.suggested.compactMap { id in shown.first { $0.id == id } }
        let others = shown.filter { !suggestedIds.contains($0.id) }
        // A model set before (or by hand) that the list no longer offers.
        let missing = selected.flatMap { id in
            query.isEmpty && !eligible(list).contains { $0.id == id } ? id : nil
        }

        // What the task does, above the first section: the title bar is too
        // narrow for it.
        let first = missing != nil ? "Current" : !suggested.isEmpty ? "Suggested" : "All models"

        return List {
            if let missing {
                Section {
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(missing).foregroundStyle(Color.fitsssLabel)
                            Text("Not in the list for this task.")
                                .font(.footnote)
                                .foregroundStyle(Color.fitsssLabel2)
                        }
                    } icon: {
                        Image(systemName: "checkmark").foregroundStyle(Color.fitsssTint)
                    }
                    .labelStyle(TrailingIconLabelStyle())
                } header: {
                    header("Current", first: first)
                }
            }
            if !suggested.isEmpty {
                Section {
                    ForEach(suggested) { row($0) }
                } header: {
                    header("Suggested", first: first)
                }
            }
            if !others.isEmpty {
                Section {
                    ForEach(others) { row($0) }
                } header: {
                    header("All models", first: first)
                }
            }
        }
        .listStyle(.insetGrouped)
        .overlay {
            if shown.isEmpty, !query.isEmpty {
                ContentUnavailableView.search(text: query)
            }
        }
        .refreshable { await llm.loadModels(force: true) }
    }

    @ViewBuilder
    private func header(_ title: String, first: String) -> some View {
        if title == first, let hint = task?.hint {
            VStack(alignment: .leading, spacing: 16) {
                Text(hint)
                    .font(.subheadline)
                    .fontWeight(.regular)
                    .foregroundStyle(Color.fitsssLabel2)
                    .textCase(nil)
                Text(title)
            }
        } else {
            Text(title)
        }
    }

    /// What this task can use with this provider.
    private func eligible(_ list: LLMModelList) -> [LLMModel] {
        let provider = llm.current?.provider
        let needsVision = task?.needsVision ?? false
        return list.models.filter { model in
            (!needsVision || model.vision) && (provider?.serves(model.id) ?? true)
        }
    }

    private func matches(in models: [LLMModel]) -> [LLMModel] {
        let needle = query.trimmingCharacters(in: .whitespaces)
        guard !needle.isEmpty else { return models }
        return models.filter { $0.id.localizedStandardContains(needle) || $0.name.localizedStandardContains(needle) }
    }

    private func row(_ model: LLMModel) -> some View {
        let isSelected = model.id == selected
        return Button { pick(model.id) } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.name)
                        .foregroundStyle(Color.fitsssLabel)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    Text(model.id)
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                        .truncationMode(.middle)
                    details(model)
                        .padding(.top, 2)
                }
                Spacer(minLength: 8)
                Image(systemName: "checkmark")
                    .fontWeight(.semibold)
                    .foregroundStyle(Color.fitsssTint)
                    .opacity(isSelected ? 1 : 0)
                    .accessibilityHidden(true)
            }
            .contentShape(Rectangle())
        }
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("model.picker.\(model.id)")
    }

    /// Price and badges on one line where they fit, the badges below where not.
    private func details(_ model: LLMModel) -> some View {
        let price = Text(model.promptPricePerM < 0
            ? "Price varies with the model it picks"
            : "\(Self.price(model.promptPricePerM)) in · \(Self.price(model.completionPricePerM)) out per 1M")
            .font(.caption.monospacedDigit())
            .foregroundStyle(Color.fitsssLabel2)
        let badges = HStack(spacing: 6) {
            if model.vision { Badge("Vision") }
            if model.reasoning { Badge("Reasoning") }
        }
        return ViewThatFits(in: .horizontal) {
            HStack(spacing: 6) { price; badges }
            VStack(alignment: .leading, spacing: 4) { price; badges }
        }
    }

    /// "$3.00" (in the region's format), "free", "$150".
    static func price(_ perMillion: Double) -> String {
        if perMillion == 0 { return "free" }
        let digits = perMillion >= 100 ? 0 : 2
        return perMillion.formatted(.currency(code: "USD").presentation(.narrow).precision(.fractionLength(digits)))
    }

    private func pick(_ id: String) {
        dismiss()
        guard id != selected else { return }
        let change = LLMChange(models: [taskId: id])
        Task { [llm, toasts] in
            do {
                try await llm.change(change)
            } catch APIError.superseded {
                // Signed out or switched servers meanwhile.
            } catch let error as APIError {
                toasts.show(error.displayMessage, isError: true)
            } catch {
                toasts.show("That could not be saved.", isError: true)
            }
        }
    }
}

/// A small grey capsule: "Vision", "Reasoning".
private struct Badge: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundStyle(Color.fitsssLabel2)
            .padding(.horizontal, 6)
            .padding(.vertical, 1)
            .background(Color.fitsssFill, in: Capsule())
    }
}

/// The checkmark on the trailing edge, like a picked row.
private struct TrailingIconLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline) {
            configuration.title
            Spacer(minLength: 8)
            configuration.icon.fontWeight(.semibold)
        }
    }
}
