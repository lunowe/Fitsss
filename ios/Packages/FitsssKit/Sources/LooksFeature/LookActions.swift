import FitsssCore
import FitsssUI
import SwiftUI

/// The web's `LookActions`, shared by the detail page and the grid's context
/// menu: wear, rename and remove.

// MARK: - Wear

/// Logs the look as worn today (the server bumps the count and records a
/// taste event) and confirms with a toast. Returns whether it was stored.
@discardableResult
func wearLook(_ id: String, looks: LooksStore, toasts: ToastCenter) async -> Bool {
    let before = looks.look(id)?.wornCount
    do {
        let look = try await looks.markWorn(id)
        // A second wear within a few hours is the same wear; say so.
        toasts.show(look.wornCount == before ? "Already logged as worn today" : "Logged as worn today")
        return true
    } catch APIError.notFound(let message) {
        toasts.show(message, isError: true)
    } catch where !error.isSuperseded {
        toasts.show("Could not record that", isError: true)
    } catch {}
    return false
}

// MARK: - Rename

/// The web's rename sheet: one field, at most 60 characters, the server's
/// message inline if it refuses, Save pinned at the bottom.
struct RenameLookSheet: View {
    let look: Look
    /// Runs after the server stored the new name, before the sheet closes.
    var onRenamed: () -> Void = {}

    /// `MAX_LOOK_NAME` in `src/server/looks-validate.ts`.
    static let maxName = 60

    @Environment(LooksStore.self) private var looks
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    @State private var name: String
    @State private var error: String?
    @State private var isSaving = false
    @FocusState private var isFocused: Bool

    init(look: Look, onRenamed: @escaping () -> Void = {}) {
        self.look = look
        self.onRenamed = onRenamed
        _name = State(initialValue: look.name)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Easy Monday", text: $name)
                        .font(.body)
                        .focused($isFocused)
                        .submitLabel(.done)
                        .onSubmit { Task { await save() } }
                        .textLimit($name, Self.maxName)
                        .accessibilityLabel("Look name")
                        .accessibilityIdentifier("look.rename.field")
                }
            }
            .navigationTitle("Rename look")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                        .accessibilityIdentifier("look.rename.cancel")
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
                                .accessibilityIdentifier("look.rename.error")
                        }
                        Button(isSaving ? "Saving…" : "Save") {
                            Task { await save() }
                        }
                        .buttonStyle(.fitsssPrimary)
                        .disabled(isSaving)
                        .accessibilityIdentifier("look.rename.save")
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isSaving)
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        // The message was about what was sent; once that changes it is stale.
        .onChange(of: name) { error = nil }
        .onAppear { isFocused = true }
    }

    private func save() async {
        guard !isSaving else { return }
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            try await looks.rename(look.id, to: name)
            onRenamed()
            dismiss()
            toasts.show("Renamed")
        } catch APIError.superseded {
            // Signed out or switched while saving: this sheet is going away.
        } catch let apiError as APIError {
            error = apiError.displayMessage
        } catch {
            self.error = "Could not rename this look"
        }
    }
}

// MARK: - Remove

/// Asks before removing a look (as the web does), removes it, and confirms
/// with a toast. Attach it to the control that asks, so the dialog points at
/// it; it shows while `target` is this look.
private struct RemoveLookConfirmation: ViewModifier {
    let look: Look
    @Binding var target: Look?
    /// Runs after a successful remove, e.g. to pop the detail page.
    var onRemoved: () -> Void

    @Environment(LooksStore.self) private var looks
    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.confirmationDialog(
            Text("Remove \(look.name)?"),
            isPresented: Binding(
                get: { target?.id == look.id },
                set: { if !$0, target?.id == look.id { target = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                Task { await remove() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The pieces stay in your closet. Only this saved combination goes away.")
        }
    }

    private func remove() async {
        do {
            try await looks.remove(look.id)
            onRemoved()
            toasts.show("Look removed")
        } catch where !error.isSuperseded {
            toasts.show("Could not remove this look", isError: true)
        } catch {}
    }
}

extension View {
    func removeLookConfirmation(
        for look: Look,
        target: Binding<Look?>,
        onRemoved: @escaping () -> Void = {}
    ) -> some View {
        modifier(RemoveLookConfirmation(look: look, target: target, onRemoved: onRemoved))
    }
}
