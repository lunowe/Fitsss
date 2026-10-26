import FitsssCore
import SwiftUI

/// A flat lay of one outfit, the native `OutfitFlatLay`: outerwear, layer and
/// top (or the full-body piece) on the upper row, bottom and shoes below,
/// accessories in small circles along the foot. Rows rather than absolute
/// positions, so any subset of slots composes and empty slots collapse.
///
/// Pieces are looked up in `blocks` (pass the closet's active *and* archived
/// pieces: a saved look may use one that was archived since); unknown ids
/// are left out.
public struct OutfitFlatLay: View {
    public enum Size: Sendable {
        case small, medium, large

        /// Silhouette size in points for the largest piece.
        var unit: CGFloat {
            switch self {
            case .small: 44
            case .medium: 66
            case .large: 100
            }
        }

        var spacing: CGFloat {
            switch self {
            case .small: 4
            case .medium: 8
            case .large: 12
            }
        }
    }

    /// Relative size per slot, so a coat reads bigger than the tee beside it
    /// and shoes stay small: the proportions of a real flat lay.
    private static let scale: [String: CGFloat] = [
        "outerwear": 1, "fullbody": 1.02, "layer": 0.82, "top": 0.78,
        "bottom": 0.9, "footwear": 0.58, "accessory": 0.42,
    ]

    private let slots: OutfitSlots
    private let byId: [String: Block]
    private let size: Size

    public init(slots: OutfitSlots, blocks: [Block], size: Size = .medium) {
        self.slots = slots
        self.byId = Dictionary(blocks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        self.size = size
    }

    public var body: some View {
        let upper = pieces(["outerwear": slots.outerwear, "layer": slots.layer, "top": slots.top, "fullbody": slots.fullbody],
                           order: ["outerwear", "layer", "top", "fullbody"])
        let lower = pieces(["bottom": slots.bottom, "footwear": slots.footwear], order: ["bottom", "footwear"])
        let accessories = slots.accessories.compactMap { id in byId[id].map { ($0, points("accessory")) } }

        VStack(spacing: size.spacing) {
            if !upper.isEmpty {
                HStack(alignment: .center, spacing: size.spacing) {
                    ForEach(upper, id: \.0.id) { block, side in glyph(block, side) }
                }
            }
            if !lower.isEmpty {
                HStack(alignment: .bottom, spacing: size.spacing) {
                    ForEach(lower, id: \.0.id) { block, side in glyph(block, side) }
                }
            }
            if !accessories.isEmpty {
                HStack(spacing: size.spacing) {
                    ForEach(accessories, id: \.0.id) { block, side in
                        glyph(block, side)
                            .padding(size == .small ? 4 : 6)
                            .background(Color.fitsssFill, in: Circle())
                    }
                }
            }
        }
        .padding(size == .small ? 8 : (size == .medium ? 12 : 16))
        .frame(maxWidth: .infinity)
        .aspectRatio(1, contentMode: .fit)
        .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    private func points(_ slot: String) -> CGFloat {
        (size.unit * (Self.scale[slot] ?? 0.8)).rounded()
    }

    private func pieces(_ ids: [String: String?], order: [String]) -> [(Block, CGFloat)] {
        order.compactMap { slot in
            guard let id = ids[slot] ?? nil, let block = byId[id] else { return nil }
            return (block, points(slot))
        }
    }

    private func glyph(_ block: Block, _ side: CGFloat) -> some View {
        Silhouette(block: block).frame(width: side, height: side)
    }

    private var accessibilityText: String {
        slots.blockIds.compactMap { byId[$0]?.label }.joined(separator: ", ")
    }
}

/// Every piece of an outfit in wearing order: drawing, the piece's label
/// sentence-cased, its category. `onSelect` makes rows tappable (to open the
/// piece in the closet).
public struct OutfitPieceList: View {
    private let pieces: [Block]
    private let catalog: Catalog?
    private let onSelect: ((Block) -> Void)?

    public init(slots: OutfitSlots, blocks: [Block], catalog: Catalog?, onSelect: ((Block) -> Void)? = nil) {
        let byId = Dictionary(blocks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        self.pieces = slots.blockIds.compactMap { byId[$0] }
        self.catalog = catalog
        self.onSelect = onSelect
    }

    public var body: some View {
        ForEach(pieces) { block in
            if let onSelect {
                Button { onSelect(block) } label: { row(block) }
                    .buttonStyle(.plain)
            } else {
                row(block)
            }
        }
    }

    private func row(_ block: Block) -> some View {
        HStack(spacing: 12) {
            Silhouette(block: block).frame(width: 36, height: 36)
            VStack(alignment: .leading, spacing: 2) {
                Text(block.label.sentenceCased)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                if let category = catalog?.type(block.typeId).flatMap({ catalog?.category($0.categoryId) }) {
                    Text(category.label)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                }
            }
            Spacer(minLength: 0)
            if onSelect != nil {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel3)
            }
        }
        .contentShape(Rectangle())
    }
}
