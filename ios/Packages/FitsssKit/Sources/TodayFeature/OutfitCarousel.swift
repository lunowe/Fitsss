import FitsssCore
import FitsssUI
import SwiftUI

/// The generated outfits as a horizontally paging deck. Each card is the
/// content width less the page gutter, so the next one peeks just enough to
/// invite a swipe; the dots under it are an indicator, not a control. Port of
/// `OutfitCarousel.tsx`.
struct OutfitCarousel: View {
    let generation: GenerationResult
    let model: TodayModel

    @State private var visibleId: String?
    /// The carousel's own width, measured: cards get an exact width (and the
    /// flat lay an exact square) because the equal-height layout below
    /// proposes no height, which would shrink an aspect-ratio view to its
    /// ideal size.
    @State private var width: CGFloat = 0
    @Environment(\.dynamicTypeSize) private var typeSize

    /// A card for a scroll view `length` wide without its content margins:
    /// less the peek of the next card. At accessibility sizes the text needs
    /// the width more than the peek.
    static func cardWidth(_ length: CGFloat, accessibilitySize: Bool = false) -> CGFloat {
        max(accessibilitySize ? length : length - 32, 0)
    }

    var body: some View {
        let outfits = generation.outfits
        let index = outfits.firstIndex { $0.id == visibleId } ?? 0
        let cardWidth = Self.cardWidth(width - 2 * Metrics.pagePadding, accessibilitySize: typeSize.isAccessibilitySize)

        VStack(spacing: 12) {
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(Array(outfits.enumerated()), id: \.element.id) { offset, outfit in
                        TodayOutfitCard(
                            outfit: outfit, index: offset, count: outfits.count, generation: generation, model: model,
                            width: cardWidth
                        )
                        .frame(width: cardWidth)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .id(outfit.id)
                    }
                }
                // Every card as tall as the tallest, so the actions line up.
                .fixedSize(horizontal: false, vertical: true)
                .scrollTargetLayout()
            }
            .contentMargins(.horizontal, Metrics.pagePadding, for: .scrollContent)
            .scrollTargetBehavior(.viewAligned)
            .scrollIndicators(.hidden)
            .scrollPosition(id: $visibleId)
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
            .accessibilityIdentifier("today.carousel")

            if outfits.count > 1 {
                HStack(spacing: 6) {
                    ForEach(Array(outfits.enumerated()), id: \.element.id) { offset, _ in
                        Circle()
                            .fill(offset == index ? Color.fitsssLabel : Color.fitsssLabel3)
                            .frame(width: 6, height: 6)
                    }
                }
                .animation(.easeOut(duration: 0.2), value: index)
                .accessibilityHidden(true)
            }
        }
    }
}
