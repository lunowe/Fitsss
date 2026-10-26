import FitsssCore
import FitsssUI
import SwiftUI

/// One generated outfit: the flat lay, why it works, its pieces, and the four
/// things you can do with it, each one tap from the thumb. Port of
/// `TodayOutfitCard.tsx`.
struct TodayOutfitCard: View {
    let outfit: Outfit
    let index: Int
    let count: Int
    let generation: GenerationResult
    let model: TodayModel
    /// The card's width; the flat lay is a square that fills it.
    let width: CGFloat

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(LooksStore.self) private var looks
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dynamicTypeSize) private var typeSize
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var showsPieces = false
    @State private var showsSwap = false
    @State private var showsNope = false

    var body: some View {
        let blocks = closet.blocks + closet.archived
        let byId = Dictionary(blocks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let entries = PieceEntry.entries(of: outfit, byId: byId, catalog: catalogStore.catalog)
        let saved = model.savedLook(outfit, in: generation, looks: looks) != nil
        let worn = model.isWorn(outfit, in: generation, looks: looks)
        let disliked = model.isDisliked(outfit, in: generation)
        let busy = model.isBusy(outfit, in: generation)

        VStack(alignment: .leading, spacing: 0) {
            OutfitFlatLay(slots: outfit.slots, blocks: blocks, size: .large)
                .frame(width: max(width - 24, 0), height: max(width - 24, 0))
                .id(outfit.slots)
                .transition(.opacity)
                .accessibilityIdentifier("today.card.\(index).flatlay")

            VStack(alignment: .leading, spacing: 4) {
                Text(outfit.name)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityLabel("\(outfit.name), outfit \(index + 1) of \(count)")
                if !outfit.why.isEmpty {
                    Text(outfit.why)
                        .font(.callout)
                        .foregroundStyle(Color.fitsssLabel2)
                }
                if let tip = outfit.tip, !tip.isEmpty {
                    Label {
                        Text(tip)
                    } icon: {
                        Image(systemName: "lightbulb")
                    }
                    .font(.footnote)
                    .foregroundStyle(Color.fitsssLabel2)
                    .padding(.top, 4)
                }
                if disliked {
                    Text("Noted")
                        .font(.caption)
                        .foregroundStyle(Color.fitsssLabel2)
                        .padding(.top, 4)
                        .accessibilityIdentifier("today.card.\(index).noted")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 4)
            .padding(.top, 12)

            Spacer(minLength: 12)

            PiecesStrip(entries: entries) { showsPieces = true }
                .id(outfit.slots)
                .transition(.opacity)
                .accessibilityLabel("All \(entries.count) pieces in \(outfit.name)")
                .accessibilityIdentifier("today.card.\(index).pieces")

            actions(saved: saved, worn: worn, disliked: disliked, busy: busy)
                .padding(.top, 12)
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .opacity(disliked ? 0.6 : 1)
        .animation(.easeOut(duration: 0.2), value: disliked)
        .animation(.easeOut(duration: reduceMotion ? 0.1 : 0.2), value: outfit.slots)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.card.\(index)")
        .sheet(isPresented: $showsPieces) {
            PiecesSheet(outfit: outfit, blocks: blocks)
        }
        .sheet(isPresented: $showsSwap) {
            SwapSheet(outfit: outfit, generation: generation, model: model, entries: entries)
        }
        .sheet(isPresented: $showsNope) {
            NopeSheet(outfit: outfit, generation: generation, model: model)
        }
    }

    @ViewBuilder
    private func actions(saved: Bool, worn: Bool, disliked: Bool, busy: Bool) -> some View {
        let save = ActionTile(symbol: saved ? "bookmark.fill" : "bookmark", title: saved ? "Saved" : "Save", isActive: saved) {
            Task { await model.save(outfit, in: generation, looks: looks, toasts: toasts) }
        }
        .accessibilityIdentifier("today.card.\(index).save")
        let wear = ActionTile(symbol: "checkmark", title: worn ? "Wearing" : "Wear", isActive: worn) {
            Task { await model.wear(outfit, in: generation, looks: looks, toasts: toasts) }
        }
        .accessibilityIdentifier("today.card.\(index).wear")
        let swap = ActionTile(symbol: "arrow.left.arrow.right", title: "Swap", isActive: false) { showsSwap = true }
            .accessibilityIdentifier("today.card.\(index).swap")
        let nope = ActionTile(symbol: disliked ? "hand.thumbsdown.fill" : "hand.thumbsdown", title: "Nope", isActive: disliked) {
            showsNope = true
        }
        .accessibilityIdentifier("today.card.\(index).nope")

        Group {
            if typeSize.isAccessibilitySize {
                VStack(spacing: 8) {
                    HStack(spacing: 8) { save; wear }
                    HStack(spacing: 8) { swap; nope }
                }
            } else {
                HStack(spacing: 8) { save; wear; swap; nope }
            }
        }
        .disabled(busy)
    }
}

/// One of the four square actions under a card. Active is ink, like a
/// selected chip.
private struct ActionTile: View {
    let symbol: String
    let title: String
    let isActive: Bool
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled
    @ScaledMetric(relativeTo: .subheadline) private var iconHeight: CGFloat = 18

    var body: some View {
        Button(action: action) {
            VStack(spacing: 4) {
                // One box for every symbol, so the four labels share a baseline.
                Image(systemName: symbol)
                    .font(.subheadline)
                    .frame(height: iconHeight)
                Text(title)
                    .font(.caption.weight(.medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: Metrics.minTapTarget)
            .padding(.vertical, 4)
            .foregroundStyle(isActive ? Color.fitsssInkForeground : Color.fitsssLabel)
            .background(isActive ? Color.fitsssInk : Color.fitsssFill, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .opacity(isEnabled ? 1 : 0.4)
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(title)
        .accessibilityAddTraits(isActive ? .isSelected : [])
        .animation(.easeOut(duration: 0.15), value: isActive)
    }
}

/// The outfit's pieces in a row of small drawings with their color dots;
/// tapping opens the Pieces sheet.
private struct PiecesStrip: View {
    let entries: [PieceEntry]
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            HStack(spacing: 6) {
                HStack(spacing: 6) {
                    ForEach(entries) { entry in
                        VStack(spacing: 4) {
                            Silhouette(block: entry.block)
                                .frame(width: 36, height: 36)
                            SwatchDot(hex: entry.block.color.hex, secondaryHex: entry.block.secondaryColor?.hex, size: 6)
                        }
                    }
                }
                .fixedSize()
                .frame(maxWidth: .infinity, alignment: .leading)
                .clipped()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel3)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 8)
            .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        }
        .buttonStyle(PressableStyle())
    }
}
