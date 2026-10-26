import FitsssCore
import FitsssUI
import SwiftUI

/// One piece (the web's `/closet/[id]`): the drawing, its attributes as the
/// server stored and derived them, and Edit / Remove.
struct PieceDetailScreen: View {
    let blockId: String
    /// Open the edit sheet as soon as the piece is loaded (the `…/edit` route).
    let opensEditor: Bool

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts
    @Environment(TodayIntents.self) private var todayIntents
    @Environment(\.dismiss) private var dismiss

    @State private var editing: Block?
    @State private var removing: Block?
    @State private var didOpenEditor = false
    @State private var isRestoring = false

    private var block: Block? { closet.block(blockId) }

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle(block.flatMap { block in catalogStore.catalog?.typeLabel(of: block) } ?? "")
            .navigationSubtitle(block?.label.sentenceCased ?? "")
            .toolbar {
                if let block, !block.isArchived, canEdit(block) {
                    ToolbarItem(placement: .primaryAction) {
                        Button("Edit") { editing = block }
                            .accessibilityIdentifier("piece.edit.toolbar")
                    }
                }
            }
            .sheet(item: $editing) { block in
                EditPieceSheet(block: block)
            }
            .task(id: block != nil && catalogStore.catalog != nil) {
                guard opensEditor, !didOpenEditor, let block, !block.isArchived, canEdit(block) else { return }
                didOpenEditor = true
                editing = block
            }
    }

    @ViewBuilder
    private var content: some View {
        if let block, let catalog = catalogStore.catalog {
            details(block, catalog)
        } else if closet.phase == .loaded {
            ContentUnavailableView(
                "Piece not found",
                systemImage: "questionmark.square.dashed",
                description: Text("It may have been deleted.")
            )
        } else if case .failed(let error) = closet.phase {
            ContentUnavailableView {
                Label("Can’t load this piece", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await closet.load() } }
                    .buttonStyle(.fitsssSecondary)
                    // The actions slot proposes a compact width.
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func canEdit(_ block: Block) -> Bool {
        catalogStore.catalog?.type(block.typeId) != nil
    }

    private func details(_ block: Block, _ catalog: Catalog) -> some View {
        let type = catalog.type(block.typeId)
        let isGarment = type?.isGarment ?? (block.fit != nil)
        let variation = catalog.variationLabel(fit: block.fit, variant: block.variant)

        return List {
            Section {
                BlockThumb(block: block, aspectRatio: 3 / 2, drawingScale: 0.75)
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                    .accessibilityLabel(block.label)
            }

            Section("Details") {
                LabeledContent("Type", value: catalog.typeLabel(of: block))
                LabeledContent("Color") { ColorValue(color: block.color) }
                if let secondary = block.secondaryColor {
                    LabeledContent("Second color") { ColorValue(color: secondary) }
                }
                LabeledContent(isGarment ? "Fit" : "Style", value: variation.isEmpty ? "—" : variation)
                LabeledContent("Material", value: block.material.map(catalog.materialLabel) ?? "—")
                LabeledContent("Pattern", value: catalog.patternLabel(block.pattern))
                LabeledContent("Weight", value: catalog.weightLabel(block.effectiveWeight))
                LabeledContent("Warmth") { Dots(value: block.warmth) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Warmth \(block.warmth) of 5")
                LabeledContent("Formality") { Dots(value: block.formality) }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("Formality \(block.formality) of 5")
                LabeledContent("Seasons", value: seasons(block))
                LabeledContent("Quantity") { Text("\(block.quantity)").monospacedDigit() }
                    .accessibilityIdentifier("piece.quantity")
            }

            let nickname = block.nickname.flatMap { $0.isEmpty ? nil : $0 }
            let notes = block.notes.flatMap { $0.isEmpty ? nil : $0 }
            if nickname != nil || notes != nil {
                Section("Notes") {
                    if let nickname {
                        LabeledContent("Nickname", value: nickname)
                    }
                    if let notes {
                        Text(notes)
                            .font(.subheadline)
                            .foregroundStyle(Color.fitsssLabel2)
                            .padding(.vertical, 4)
                    }
                }
            }

            if block.isArchived {
                Section {
                    Button(isRestoring ? "Restoring…" : "Restore to closet") {
                        Task { await restore(block) }
                    }
                    .disabled(isRestoring)
                } footer: {
                    Text("This piece is archived.")
                }
            } else {
                if type != nil {
                    Section {
                        // The web's "Style this piece": Today, with this piece in every outfit.
                        Button("Style this piece", systemImage: "sparkles") { todayIntents.styleThis(block.id) }
                            .accessibilityIdentifier("piece.styleThis")
                        Button("Edit") { editing = block }
                            .accessibilityIdentifier("piece.edit")
                    }
                }
                Section {
                    Button("Remove from closet", role: .destructive) { removing = block }
                        .accessibilityIdentifier("piece.remove")
                        .removeFromClosetConfirmation(for: block, target: $removing) { dismiss() }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(Metrics.sectionSpacing)
        .refreshable { await closet.load() }
    }

    /// "Spring, Autumn", from the seasons the server derived.
    private func seasons(_ block: Block) -> String {
        block.seasons.isEmpty ? "—" : block.seasons.map(\.sentenceCased).joined(separator: ", ")
    }

    private func restore(_ block: Block) async {
        isRestoring = true
        defer { isRestoring = false }
        do {
            try await closet.restore(block.id)
            toasts.show("Restored to your closet")
        } catch where !error.isSuperseded {
            toasts.show("Could not restore this piece", isError: true)
        } catch {}
    }
}

/// A color name with its swatch, trailing a detail row.
private struct ColorValue: View {
    let color: BlockColor

    var body: some View {
        HStack(spacing: 8) {
            SwatchDot(hex: color.hex, size: 12)
            Text(color.name)
        }
    }
}

/// Five dots, `value` of them filled: warmth and formality.
private struct Dots: View {
    let value: Int

    var body: some View {
        HStack(spacing: 4) {
            ForEach(1...5, id: \.self) { step in
                Circle()
                    .fill(step <= value ? Color.fitsssLabel : Color.fitsssLabel3)
                    .frame(width: 6, height: 6)
            }
        }
    }
}
