import FitsssCore
import FitsssUI
import SwiftUI

/// Every piece of one outfit, in wearing order.
struct PiecesSheet: View {
    let outfit: Outfit
    let blocks: [Block]

    @Environment(CatalogStore.self) private var catalogStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    OutfitPieceList(slots: outfit.slots, blocks: blocks, catalog: catalogStore.catalog)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(outfit.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                        .accessibilityIdentifier("today.pieces.done")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

/// Swap one piece: pick the slot, then a piece of the same role from the
/// closet. Picking the piece already in the outfit leaves it alone.
struct SwapSheet: View {
    let outfit: Outfit
    let generation: GenerationResult
    let model: TodayModel
    let entries: [PieceEntry]

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(entries) { entry in
                        NavigationLink(value: entry) {
                            SlotRow(entry: entry)
                        }
                        .accessibilityIdentifier("today.swap.slot.\(entry.id)")
                    }
                } footer: {
                    Text("Pick the piece you want to change.")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Swap a piece")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: PieceEntry.self) { entry in
                SwapOptionsScreen(outfit: outfit, generation: generation, model: model, entry: entry) { dismiss() }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct SlotRow: View {
    let entry: PieceEntry

    @Environment(CatalogStore.self) private var catalogStore

    var body: some View {
        HStack(spacing: 12) {
            Silhouette(block: entry.block)
                .frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.block.label.sentenceCased)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                if let category = catalogStore.catalog?.category(entry.role) {
                    Text(category.label)
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                }
            }
        }
    }
}

/// The closet's pieces that can fill one slot, the current one outlined.
private struct SwapOptionsScreen: View {
    let outfit: Outfit
    let generation: GenerationResult
    let model: TodayModel
    let entry: PieceEntry
    let onDone: () -> Void

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(OutfitsStore.self) private var outfits
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var swappingTo: String?
    @State private var error: String?

    var body: some View {
        let options = closet.blocks.filter { $0.category == entry.role }
        let columns = [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 150 : 100), spacing: 12)]

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let error {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssDestructive)
                        .accessibilityIdentifier("today.swap.error")
                }
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(options) { block in
                        OptionTile(
                            block: block,
                            headline: catalogStore.catalog?.headline(of: block) ?? block.label.sentenceCased,
                            isCurrent: block.id == entry.block.id,
                            isSwapping: swappingTo == block.id
                        ) {
                            Task { await pick(block) }
                        }
                        .disabled(swappingTo != nil)
                    }
                }
            }
            .padding(Metrics.pagePadding)
        }
        .background(Color.fitsssBackground)
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    /// "Swap the t-shirt", from the piece's own type.
    private var title: String {
        let type = catalogStore.catalog?.typeLabel(of: entry.block) ?? entry.block.label
        return "Swap the \(type.lowercased())"
    }

    private func pick(_ block: Block) async {
        guard swappingTo == nil else { return }
        guard block.id != entry.block.id else {
            onDone()
            return
        }
        swappingTo = block.id
        error = nil
        defer { swappingTo = nil }
        do {
            try await model.swap(outfit, in: generation, entry: entry, to: block, outfits: outfits)
            onDone()
        } catch is CancellationError {
            return
        } catch APIError.superseded {
            return
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Couldn’t swap that piece."
        }
    }
}

private struct OptionTile: View {
    let block: Block
    let headline: String
    let isCurrent: Bool
    let isSwapping: Bool
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: Metrics.thumbRadius)
                    .fill(Color.fitsssCard2)
                    .aspectRatio(1, contentMode: .fit)
                    .overlay {
                        Silhouette(block: block)
                            .padding(14)
                    }
                    .overlay {
                        if isSwapping { ProgressView() }
                    }
                Text(headline)
                    .font(.caption)
                    .foregroundStyle(Color.fitsssLabel2)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    SwatchDot(hex: block.color.hex, secondaryHex: block.secondaryColor?.hex, size: 8)
                    Text(block.color.name)
                        .font(.caption)
                        .foregroundStyle(Color.fitsssLabel3)
                        .lineLimit(1)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .overlay {
                if isCurrent {
                    RoundedRectangle(cornerRadius: Metrics.cardRadius).strokeBorder(Color.fitsssTint, lineWidth: 2)
                }
            }
            .opacity(isEnabled || isSwapping ? 1 : 0.5)
            .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(block.label.sentenceCased)
        .accessibilityValue(isCurrent ? "In this outfit" : "")
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
        .accessibilityIdentifier("today.swap.option.\(block.id)")
    }
}

/// "Not this one?": a reason makes the next set avoid it; Skip only dims the card.
struct NopeSheet: View {
    let outfit: Outfit
    let generation: GenerationResult
    let model: TodayModel

    @Environment(CatalogStore.self) private var catalogStore
    @Environment(OutfitsStore.self) private var outfits
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var sending: String?
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Tell me why and the next set will avoid it.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                    FlowLayout(spacing: 8, lineSpacing: 8) {
                        ForEach(catalogStore.catalog?.allDislikeReasons ?? []) { reason in
                            Chip(reason.label, isSelected: sending == reason.id) {
                                Task { await send(reason.id) }
                            }
                            .disabled(sending != nil)
                            .accessibilityIdentifier("today.nope.\(reason.id)")
                        }
                    }
                    if let error {
                        Label(error, systemImage: "exclamationmark.circle")
                            .font(.subheadline)
                            .foregroundStyle(Color.fitsssDestructive)
                    }
                }
                .padding(Metrics.pagePadding)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .navigationTitle("Not this one?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                Button {
                    model.skipDislike(outfit, in: generation)
                    dismiss()
                } label: {
                    Text("Skip")
                        .font(.body)
                        .frame(maxWidth: .infinity, minHeight: Metrics.minTapTarget)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.fitsssTint)
                .padding(.horizontal, Metrics.pagePadding)
                .padding(.vertical, 8)
                // Opaque, so the reasons scroll under it instead of showing through.
                .background(.bar)
                .disabled(sending != nil)
                .accessibilityIdentifier("today.nope.skip")
            }
        }
        .presentationDetents(typeSize.isAccessibilitySize ? [.large] : [.medium, .large])
    }

    private func send(_ reason: String) async {
        guard sending == nil else { return }
        sending = reason
        error = nil
        defer { sending = nil }
        do {
            try await model.dislike(outfit, in: generation, reason: reason, outfits: outfits)
            dismiss()
        } catch is CancellationError {
            return
        } catch APIError.superseded {
            return
        } catch {
            self.error = (error as? APIError)?.errorDescription ?? "Couldn’t send that. Try again."
        }
    }
}
