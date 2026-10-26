import FitsssCore
import FitsssUI
import SwiftUI

/// Creates or edits one style (the web's `StyleSheet`): a name (at most 40
/// characters), a description and rules (at most 600 each, one rule per
/// line), Save pinned at the bottom with the server's message above it if it
/// refuses, and Delete when editing. The server trims and normalizes
/// everything; the sheet sends what was typed.
///
/// State is seeded when the sheet is created, so a cancelled edit is simply
/// dropped.
struct StyleEditorSheet: View {
    let target: StyleEditorTarget
    /// Runs after the server stored the style, before the sheet closes.
    var onSaved: () -> Void

    @Environment(StylesStore.self) private var styles
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    private enum Field: Hashable { case name, description, rules }

    private let original: Draft
    @State private var draft: Draft
    @State private var error: String?
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var confirmingDiscard = false
    @State private var confirmingDelete = false
    @FocusState private var focus: Field?

    init(target: StyleEditorTarget, onSaved: @escaping () -> Void = {}) {
        self.target = target
        self.onSaved = onSaved
        let draft = Draft(target)
        original = draft
        _draft = State(initialValue: draft)
    }

    private var editing: Style? {
        if case .edit(let style) = target { return style }
        return nil
    }

    private var isDirty: Bool { draft != original }
    private var isBusy: Bool { isSaving || isDeleting }

    var body: some View {
        NavigationStack {
            form
                .navigationTitle(editing == nil ? "New style" : "Edit style")
                .navigationSubtitle(editing == nil ? "Describe how you actually dress." : "")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel", systemImage: "xmark", role: .cancel) {
                            if isDirty { confirmingDiscard = true } else { dismiss() }
                        }
                        .accessibilityIdentifier("style.cancel")
                        .confirmationDialog("Discard your changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                            Button("Discard Changes", role: .destructive) { dismiss() }
                            Button("Keep Editing", role: .cancel) {}
                        }
                    }
                }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isDirty || isBusy)
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        // The message was about what was sent; once that changes it is stale.
        .onChange(of: draft) { error = nil }
        .onAppear {
            if editing == nil { focus = .name }
        }
    }

    private var form: some View {
        Form {
            Section {
                TextField("Clean minimal", text: $draft.name)
                    .textInputAutocapitalization(.sentences)
                    .submitLabel(.next)
                    .focused($focus, equals: .name)
                    .onSubmit { focus = .description }
                    .textLimit($draft.name, StyleLimits.name)
                    .accessibilityLabel("Name")
                    .accessibilityIdentifier("style.name")
            } header: {
                Text("Name")
            }

            Section {
                TextField(
                    "Clean lines, mostly neutrals, one dark piece, loose top with straight trousers, white sneakers.",
                    text: $draft.description,
                    axis: .vertical
                )
                .lineLimit(5...14)
                .focused($focus, equals: .description)
                .textLimit($draft.description, StyleLimits.text)
                .accessibilityLabel("Description")
                .accessibilityIdentifier("style.description")
            } header: {
                Text("Description")
            } footer: {
                FieldFooter(hint: "Written in your words. Outfits are generated against this text.", text: draft.description)
            }

            Section {
                TextField("No logos\nNever tuck a tee", text: $draft.rules, axis: .vertical)
                    .lineLimit(4...12)
                    .focused($focus, equals: .rules)
                    .textLimit($draft.rules, StyleLimits.text)
                    .accessibilityLabel("Rules")
                    .accessibilityIdentifier("style.rules")
            } header: {
                Text("Rules")
            } footer: {
                FieldFooter(hint: "One rule per line. These are never broken.", text: draft.rules)
            }

            if let style = editing {
                Section {
                    Button(isDeleting ? "Deleting…" : "Delete style", role: .destructive) {
                        confirmingDelete = true
                    }
                    .disabled(isBusy)
                    .accessibilityIdentifier("style.delete")
                    .confirmationDialog(
                        Text("Delete \(style.name)?"),
                        isPresented: $confirmingDelete,
                        titleVisibility: .visible
                    ) {
                        Button("Delete Style", role: .destructive) {
                            Task { await delete(style) }
                        }
                        Button("Cancel", role: .cancel) {}
                    } message: {
                        Text("Outfits already saved keep their pieces. Only the style itself goes away.")
                    }
                }
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar {
                VStack(spacing: 8) {
                    if let error {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssDestructive)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("style.error")
                    }
                    Button(isSaving ? "Saving…" : "Save") {
                        Task { await save() }
                    }
                    .buttonStyle(.fitsssPrimary)
                    .disabled(isBusy)
                    .accessibilityIdentifier("style.save")
                }
            }
        }
    }

    private func save() async {
        guard !isBusy else { return }
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            if let style = editing {
                try await styles.update(style.id, with: draft.input)
            } else {
                try await styles.create(draft.input)
            }
            onSaved()
            dismiss()
            toasts.show(editing == nil ? "Style added" : "Saved")
        } catch APIError.superseded {
            // Signed out or switched while saving: this sheet is going away.
        } catch let apiError as APIError {
            error = apiError.displayMessage
        } catch {
            self.error = "Could not save this style"
        }
    }

    private func delete(_ style: Style) async {
        guard !isBusy else { return }
        error = nil
        isDeleting = true
        defer { isDeleting = false }
        do {
            try await styles.delete(style.id)
            dismiss()
            toasts.show("Style deleted")
        } catch APIError.superseded {
        } catch let apiError as APIError {
            error = apiError.displayMessage
        } catch {
            self.error = "Could not delete this style"
        }
    }
}

/// A field's hint, and a count once the text nears the 600-character limit.
private struct FieldFooter: View {
    let hint: String
    let text: String

    var body: some View {
        let count = text.serverLength
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline) {
                Text(hint)
                Spacer(minLength: 8)
                counter(count)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(hint)
                counter(count)
            }
        }
    }

    @ViewBuilder
    private func counter(_ count: Int) -> some View {
        if count >= StyleLimits.text - 100 {
            Text("\(count) / \(StyleLimits.text)")
                .monospacedDigit()
                .foregroundStyle(count >= StyleLimits.text ? Color.fitsssDestructive : Color.fitsssLabel2)
                .accessibilityLabel("\(count) of \(StyleLimits.text) characters")
        }
    }
}

// MARK: - Draft

/// Everything the sheet edits, seeded from the stored style.
private struct Draft: Equatable {
    var name: String
    var description: String
    var rules: String

    init(_ target: StyleEditorTarget) {
        switch target {
        case .new:
            name = ""
            description = ""
            rules = ""
        case .edit(let style):
            name = style.name
            description = style.description
            rules = style.rules ?? ""
        }
    }

    /// The whole input, as on the web: the server trims, drops blank rule
    /// lines and stores no rules as none. Leaving `rules` out clears them.
    var input: StyleInput {
        let rules = rules.trimmingCharacters(in: .whitespacesAndNewlines)
        return StyleInput(name: name, description: description, rules: rules.isEmpty ? nil : self.rules)
    }
}
