import FitsssCore
import FitsssUI
import SwiftUI

/// The web's `InspoActions` sheets: which style the picture is a reference
/// for, and its note.

// MARK: - Reference for a style

/// None plus the user's styles, the current one checked. Picking one stores
/// it and closes; a style deleted meanwhile is refused inline.
struct InspoStyleSheet: View {
    let inspo: Inspo
    /// Runs after the server stored the choice, before the sheet closes.
    var onChanged: () -> Void = {}

    @Environment(InspoStore.self) private var inspos
    @Environment(StylesStore.self) private var styles
    @Environment(\.dismiss) private var dismiss

    /// The row being stored (`""` for None), nil when idle.
    @State private var saving: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row(title: "None", id: nil)
                        .accessibilityIdentifier("inspo.style.none")
                    ForEach(styles.styles) { style in
                        row(title: style.name, id: style.id)
                            .accessibilityIdentifier("inspo.style.\(style.id)")
                    }
                } footer: {
                    VStack(alignment: .leading, spacing: 8) {
                        if let error {
                            Text(error)
                                .foregroundStyle(Color.fitsssDestructive)
                                .accessibilityIdentifier("inspo.style.error")
                        }
                        if styles.styles.isEmpty, styles.phase == .loaded {
                            Text("You have no styles yet. Add one on the Styles tab first.")
                        } else {
                            Text("Outfits for this style will keep this picture in mind.")
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Reference for")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                        .accessibilityIdentifier("inspo.style.cancel")
                }
            }
            .refreshable { await styles.load() }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(saving != nil)
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        .task { await styles.load() }
    }

    /// The live value, so a change made elsewhere shows here too.
    private var currentStyleId: String? { (inspos.inspo(inspo.id) ?? inspo).styleId }

    private func row(title: String, id: String?) -> some View {
        let isCurrent = currentStyleId == id
        return Button {
            Task { await choose(id) }
        } label: {
            HStack {
                Text(title)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                Spacer()
                if saving == (id ?? "") {
                    ProgressView()
                } else if isCurrent {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.fitsssTint)
                }
            }
            .frame(minHeight: Metrics.minTapTarget)
            .contentShape(Rectangle())
        }
        .disabled(saving != nil)
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
    }

    private func choose(_ id: String?) async {
        guard saving == nil else { return }
        guard currentStyleId != id else {
            dismiss()
            return
        }
        error = nil
        saving = id ?? ""
        defer { saving = nil }
        do {
            try await inspos.setStyle(inspo.id, styleId: id)
            onChanged()
            dismiss()
        } catch where error.isQuiet {
        } catch let apiError as APIError {
            error = apiError.displayMessage
            // "That style is gone": show the list as it is now.
            if case .invalid = apiError { await styles.load() }
            if case .notFound = apiError { dismiss() }
        } catch {
            self.error = "Could not save that."
        }
    }
}

// MARK: - Note

/// What the user wants to remember about the picture: one multi-line field,
/// at most 500 characters (as the server counts them), Save pinned at the
/// bottom. Empty clears it.
struct InspoNoteSheet: View {
    let inspo: Inspo
    var onSaved: () -> Void = {}

    /// The server's limit on a note.
    static let maxNote = 500

    @Environment(InspoStore.self) private var inspos
    @Environment(\.dismiss) private var dismiss

    @State private var draft: String
    @State private var error: String?
    @State private var isSaving = false
    @FocusState private var isFocused: Bool

    init(inspo: Inspo, onSaved: @escaping () -> Void = {}) {
        self.inspo = inspo
        self.onSaved = onSaved
        _draft = State(initialValue: inspo.note ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Note", text: $draft, prompt: Text("The proportions, not the pieces."), axis: .vertical)
                        .font(.body)
                        .lineLimit(4...12)
                        .focused($isFocused)
                        .textLimit($draft, Self.maxNote)
                        .accessibilityLabel("Note")
                        .accessibilityIdentifier("inspo.note.field")
                } footer: {
                    Text("What you want to remember about this picture.")
                }
            }
            .navigationTitle("Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                        .accessibilityIdentifier("inspo.note.cancel")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    VStack(spacing: 8) {
                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(Color.fitsssDestructive)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .accessibilityIdentifier("inspo.note.error")
                        }
                        Button(isSaving ? "Saving…" : "Save") {
                            Task { await save() }
                        }
                        .buttonStyle(.fitsssPrimary)
                        .disabled(isSaving)
                        .accessibilityIdentifier("inspo.note.save")
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isSaving)
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        .onChange(of: draft) { error = nil }
        .onAppear { isFocused = true }
    }

    private func save() async {
        guard !isSaving else { return }
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            try await inspos.setNote(inspo.id, note: draft.trimmingCharacters(in: .whitespacesAndNewlines))
            onSaved()
            dismiss()
        } catch where error.isQuiet {
        } catch APIError.notFound {
            dismiss()
        } catch let apiError as APIError {
            error = apiError.displayMessage
        } catch {
            self.error = "Could not save the note."
        }
    }
}
