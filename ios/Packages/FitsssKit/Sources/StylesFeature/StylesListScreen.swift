import FitsssCore
import FitsssUI
import SwiftUI

/// The user's styles in their order: an inset grouped list of names with
/// each description's first line. Tap to edit, Edit to drag into a new order,
/// swipe or long-press to delete, and a pinned "New style" button (disabled
/// at the server's limit of six).
struct StylesListScreen: View {
    let launchEditor: StyleEditorLaunch?

    @Environment(StylesStore.self) private var styles
    @Environment(ToastCenter.self) private var toasts

    @State private var editor: StyleEditorTarget?
    @State private var deleting: Style?
    @State private var editMode: EditMode = .inactive
    /// The order shown while a reorder is on its way to the server, so the
    /// row lands where it was dropped instead of snapping back for a moment.
    @State private var pendingOrder: [Style]?
    @State private var isReordering = false
    @State private var didLaunch = false
    /// Bumped after every stored write, for the success haptic.
    @State private var successTick = 0

    private var shown: [Style] { pendingOrder ?? styles.styles }
    private var isLoaded: Bool { styles.phase == .loaded || !styles.styles.isEmpty }

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle("Styles")
            .navigationSubtitle("The looks you actually wear")
            .toolbar {
                if isLoaded, !shown.isEmpty {
                    ToolbarItem(placement: .primaryAction) {
                        Button(editMode.isEditing ? "Done" : "Edit") {
                            withAnimation { editMode = editMode.isEditing ? .inactive : .active }
                        }
                        .fontWeight(editMode.isEditing ? .semibold : .regular)
                        .accessibilityIdentifier("styles.editMode")
                    }
                }
            }
            .sheet(item: $editor) { target in
                StyleEditorSheet(target: target) { successTick += 1 }
            }
            .sensoryFeedback(.success, trigger: successTick)
            .task(id: styles.phase) { openLaunchEditor() }
            // Nothing left to arrange: leave edit mode, so the empty state reads clean.
            .onChange(of: shown.isEmpty) { _, isEmpty in if isEmpty { editMode = .inactive } }
    }

    @ViewBuilder
    private var content: some View {
        if isLoaded {
            if shown.isEmpty {
                StylesEmptyState { editor = .new }
                    .refreshable { await reload() }
            } else {
                list
            }
        } else if case .failed(let error) = styles.phase {
            ContentUnavailableView {
                Label("Can’t load your styles", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await reload() } }
                    .buttonStyle(.fitsssSecondary)
                    // The actions slot proposes a compact width.
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
                    .accessibilityIdentifier("styles.retry")
            }
        } else {
            StylesSkeleton()
        }
    }

    private var list: some View {
        let items = shown
        return List {
            Section {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, style in
                    row(style, index: index)
                }
                .onMove(perform: move)
                .moveDisabled(isReordering)
            } footer: {
                Text(editMode.isEditing
                     ? "Drag to change the order. Today shows your styles in this order."
                     : "Today shows your styles in this order, and remembers the one you last picked.")
                    .accessibilityIdentifier("styles.footer")
            }
        }
        .listStyle(.insetGrouped)
        .environment(\.editMode, $editMode)
        .refreshable { await reload() }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            NewStyleBar(canAddMore: styles.canAddMore) { editor = .new }
        }
    }

    private func row(_ style: Style, index: Int) -> some View {
        Button {
            editor = .edit(style)
        } label: {
            StyleRow(style: style)
        }
        .accessibilityIdentifier("styles.row.\(style.id)")
        .accessibilityHint("Edit")
        // Not `role: .destructive`: that would animate the row away before
        // the confirmation is answered.
        .swipeActions(edge: .trailing) {
            Button("Delete", systemImage: "trash") { deleting = style }
                .tint(Color.fitsssDestructive)
        }
        .contextMenu {
            Button("Edit", systemImage: "pencil") { editor = .edit(style) }
            if index > 0 {
                Button("Move to Top", systemImage: "arrow.up.to.line") {
                    var ids = shown.map(\.id)
                    ids.removeAll { $0 == style.id }
                    reorder(to: [style.id] + ids)
                }
            }
            Button("Delete style", systemImage: "trash", role: .destructive) { deleting = style }
        }
        // On the row, so the dialog's popover points at the style it deletes.
        .deleteStyleConfirmation(for: style, target: $deleting)
    }

    // MARK: - Reorder

    private func move(from source: IndexSet, to destination: Int) {
        var ids = shown.map(\.id)
        ids.move(fromOffsets: source, toOffset: destination)
        reorder(to: ids)
    }

    /// Shows the new order at once, saves it, and puts the old one back if
    /// the server refuses. One reorder at a time, so two can't race.
    private func reorder(to ids: [String]) {
        guard !isReordering, ids != shown.map(\.id) else { return }
        let byId = Dictionary(shown.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        pendingOrder = ids.compactMap { byId[$0] }
        isReordering = true
        Task {
            defer {
                pendingOrder = nil
                isReordering = false
            }
            do {
                try await styles.reorder(ids)
                successTick += 1
            } catch where !error.isSuperseded {
                toasts.show("Could not reorder your styles", isError: true)
            } catch {}
        }
    }

    // MARK: - Loading

    private func reload() async {
        await styles.load()
        if case .failed(let error) = styles.phase, !styles.styles.isEmpty {
            toasts.show(error.displayMessage, isError: true)
        }
    }

    /// `styles/new` and `styles/<id>`: open the sheet once the styles are in.
    private func openLaunchEditor() {
        guard let launchEditor, !didLaunch, styles.phase == .loaded else { return }
        didLaunch = true
        switch launchEditor {
        case .new:
            editor = .new
        case .style(let id):
            if let style = styles.style(id) {
                editor = .edit(style)
            } else {
                toasts.show("That style is gone", isError: true)
            }
        }
    }
}

// MARK: - Row

/// A style's name and the first line of its description. At accessibility
/// text sizes both wrap instead of truncating.
private struct StyleRow: View {
    let style: Style

    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.editMode) private var editMode

    var body: some View {
        let summary = style.summary
        HStack(spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(style.name)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                if !summary.isEmpty {
                    Text(summary)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                }
            }
            .lineLimit(typeSize.isAccessibilitySize ? 4 : 1)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)

            if editMode?.wrappedValue.isEditing != true {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel3)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 2)
        .frame(minHeight: Metrics.minTapTarget)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The pinned primary action. At the limit it is disabled and says why.
private struct NewStyleBar: View {
    let canAddMore: Bool
    let onNew: () -> Void

    var body: some View {
        BottomActionBar {
            VStack(spacing: 8) {
                if !canAddMore {
                    Text("Six styles is the limit. Delete one to add another.")
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .multilineTextAlignment(.center)
                        .frame(maxWidth: .infinity)
                        .accessibilityIdentifier("styles.limit")
                }
                Button(action: onNew) {
                    Label("New style", systemImage: "plus")
                }
                .buttonStyle(.fitsssPrimary)
                .disabled(!canAddMore)
                .accessibilityIdentifier("styles.new")
            }
        }
    }
}

// MARK: - Delete

/// Asks before deleting a style (as the web does), deletes it, and confirms
/// with a toast. Shows while `target` is this style.
private struct DeleteStyleConfirmation: ViewModifier {
    let style: Style
    @Binding var target: Style?
    var onDeleted: () -> Void

    @Environment(StylesStore.self) private var styles
    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.confirmationDialog(
            Text("Delete \(style.name)?"),
            isPresented: Binding(
                get: { target?.id == style.id },
                set: { if !$0, target?.id == style.id { target = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete Style", role: .destructive) {
                Task { await delete() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Outfits already saved keep their pieces. Only the style itself goes away.")
        }
    }

    private func delete() async {
        do {
            try await styles.delete(style.id)
            onDeleted()
            toasts.show("Style deleted")
        } catch where !error.isSuperseded {
            toasts.show("Could not delete this style", isError: true)
        } catch {}
    }
}

extension View {
    func deleteStyleConfirmation(
        for style: Style,
        target: Binding<Style?>,
        onDeleted: @escaping () -> Void = {}
    ) -> some View {
        modifier(DeleteStyleConfirmation(style: style, target: target, onDeleted: onDeleted))
    }
}

// MARK: - Empty and loading

private struct StylesEmptyState: View {
    let onAdd: () -> Void

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("No styles yet", systemImage: "bookmark")
            } description: {
                Text("A style is how you actually dress, written in your own words. Every outfit gets generated against it.")
            } actions: {
                VStack(spacing: 16) {
                    Button(action: onAdd) {
                        Label("Add your first style", systemImage: "plus")
                    }
                    .buttonStyle(.fitsssPrimary)
                    .accessibilityIdentifier("styles.addFirst")
                    Text("Pick two or three, and keep them honest: the ones you reach for, not the ones you mean to.")
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .multilineTextAlignment(.center)
                }
                // The actions slot proposes a compact width; give the primary
                // button the page width like the web's full-width button.
                .containerRelativeFrame(.horizontal) { width, _ in width - 2 * Metrics.pagePadding - 32 }
            }
            .containerRelativeFrame(.vertical, alignment: .center) { height, _ in height * 0.8 }
        }
    }
}

/// Placeholder rows in the list's own shape, while the styles load.
private struct StylesSkeleton: View {
    var body: some View {
        List {
            Section {
                ForEach(0..<4, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Clean minimal").font(.body)
                        Text("Neutrals only, a relaxed tee with straight trousers").font(.subheadline)
                    }
                    .lineLimit(1)
                    .padding(.vertical, 2)
                }
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your styles")
    }
}
