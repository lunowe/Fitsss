import FitsssCore
import FitsssUI
import SwiftUI

/// Archived pieces (the web's `/closet/archived`), each restorable or
/// deletable for good. Restore and delete are on the row, on swipe, and in
/// the context menu; deleting always asks first.
struct ArchivedScreen: View {
    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var deleting: Block?
    /// Pieces with a request in flight, so their buttons can't fire twice.
    @State private var busy: Set<String> = []

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle("Archived")
            .navigationSubtitle(closet.archived.isEmpty ? "" : piecesText(closet.archived.count))
    }

    @ViewBuilder
    private var content: some View {
        if closet.archived.isEmpty {
            ScrollView {
                ContentUnavailableView {
                    Label("Nothing archived", systemImage: "archivebox")
                } description: {
                    Text("Pieces you remove from your closet land here, so you can bring them back.")
                }
                .containerRelativeFrame(.vertical, alignment: .center) { height, _ in height * 0.8 }
            }
            .refreshable { await closet.load() }
        } else if let catalog = catalogStore.catalog {
            List {
                Section {
                    ForEach(closet.archived) { block in
                        row(block, catalog)
                    }
                } footer: {
                    Text("Restoring puts a piece back in your closet. Deleting cannot be undone.")
                }
            }
            .listStyle(.insetGrouped)
            .refreshable { await closet.load() }
        } else {
            ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func row(_ block: Block, _ catalog: Catalog) -> some View {
        let isBusy = busy.contains(block.id)
        return HStack(spacing: 12) {
            BlockRowThumb(block: block)
            VStack(alignment: .leading, spacing: 2) {
                Text(catalog.headline(of: block))
                    .foregroundStyle(Color.fitsssLabel)
                Text(catalog.colorLine(of: block))
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
            }
            .lineLimit(typeSize.isAccessibilitySize ? 3 : 1)
            .accessibilityElement(children: .combine)

            Spacer(minLength: 4)

            // At accessibility sizes the text needs the width; swipe and the
            // context menu still offer both actions.
            if !typeSize.isAccessibilitySize {
                Button("Restore") { Task { await restore(block) } }
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.fitsssTint)
                    .frame(minHeight: Metrics.minTapTarget)
                    .padding(.horizontal, 4)
                    .buttonStyle(.borderless)
                    .disabled(isBusy)
                    .accessibilityIdentifier("archived.restore.\(block.id)")
                Button {
                    deleting = block
                } label: {
                    Image(systemName: "trash")
                        .font(.body)
                        .frame(width: Metrics.minTapTarget, height: Metrics.minTapTarget)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(Color.fitsssDestructive)
                .buttonStyle(.borderless)
                .disabled(isBusy)
                .accessibilityLabel("Delete \(block.label) permanently")
                .accessibilityIdentifier("archived.delete.\(block.id)")
            }
        }
        .padding(.trailing, -8)
        .opacity(isBusy ? 0.5 : 1)
        .swipeActions(edge: .leading) {
            Button("Restore", systemImage: "arrow.uturn.backward") { Task { await restore(block) } }
                .tint(Color.fitsssTint)
        }
        .swipeActions(edge: .trailing) {
            // Not `role: .destructive`: that would animate the row away before
            // the confirmation is answered.
            Button("Delete", systemImage: "trash") { deleting = block }
                .tint(Color.fitsssDestructive)
        }
        .contextMenu {
            Button("Restore", systemImage: "arrow.uturn.backward") { Task { await restore(block) } }
            Button("Delete permanently", systemImage: "trash", role: .destructive) { deleting = block }
        }
        // On the row, so the dialog's popover points at the piece it deletes.
        .confirmationDialog(
            Text("Delete \(block.label)?"),
            isPresented: Binding(
                get: { deleting?.id == block.id },
                set: { if !$0, deleting?.id == block.id { deleting = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete for good", role: .destructive) {
                Task { await delete(block) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes it for good. You can add it again later, but its history is gone.")
        }
    }

    private func restore(_ block: Block) async {
        guard busy.insert(block.id).inserted else { return }
        defer { busy.remove(block.id) }
        do {
            try await closet.restore(block.id)
            toasts.show("Restored to your closet")
        } catch where !error.isSuperseded {
            toasts.show("Could not restore this piece", isError: true)
        } catch {}
    }

    private func delete(_ block: Block) async {
        guard busy.insert(block.id).inserted else { return }
        defer { busy.remove(block.id) }
        do {
            try await closet.delete(block.id)
            toasts.show("Deleted")
        } catch where !error.isSuperseded {
            toasts.show("Could not delete this piece", isError: true)
        } catch {}
    }
}
