import FitsssCore
import FitsssUI
import SwiftUI

/// "In the picture": the pieces the read saw, in its order, as small cards
/// in a row that scrolls sideways. Pieces it was unsure of (confidence under
/// 0.5) are dimmed. Port of `PieceStrip` in `InspoPieces.tsx`.
struct InspoPieceStrip: View {
    let pieces: [InspoPiece]
    let catalog: Catalog?

    @ScaledMetric(relativeTo: .caption) private var cardWidth: CGFloat = 112
    @ScaledMetric(relativeTo: .caption) private var wellHeight: CGFloat = 56

    var body: some View {
        ScrollView(.horizontal) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(Array(pieces.enumerated()), id: \.offset) { index, piece in
                    card(piece)
                        .accessibilityIdentifier("inspo.piece.\(index)")
                }
            }
        }
        .scrollIndicators(.hidden)
    }

    private func card(_ piece: InspoPiece) -> some View {
        let type = catalog?.pieceTypeLabel(piece) ?? piece.typeId
        // Wraps between words, never at the dot ("Grey ·" / "Oversized").
        let detail = (catalog?.pieceDetailLine(piece) ?? piece.color.name)
            .replacingOccurrences(of: " · ", with: "\u{00A0}·\u{00A0}")
        let unsure = piece.confidence < 0.5

        return VStack(alignment: .leading, spacing: 0) {
            Silhouette(
                typeId: piece.typeId,
                variant: piece.variant,
                color: piece.color.hex,
                secondaryColor: piece.secondaryColor?.hex
            )
            .frame(width: wellHeight * 0.8, height: wellHeight * 0.8)
            .frame(maxWidth: .infinity)
            .frame(height: wellHeight)
            .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius))

            Text(type)
                .font(.caption.weight(.medium))
                .foregroundStyle(Color.fitsssLabel)
                .lineLimit(1)
                .padding(.top, 6)
                .padding(.horizontal, 2)
            Text(detail)
                .font(.caption)
                .foregroundStyle(Color.fitsssLabel2)
                .lineLimit(2, reservesSpace: true)
                .padding(.horizontal, 2)
        }
        .padding(8)
        .frame(width: cardWidth, alignment: .leading)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .opacity(unsure ? 0.5 : 1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(unsure ? "\(type), \(detail), not sure" : "\(type), \(detail)")
    }
}

/// "From your closet": every pictured piece against the closet, either the
/// owned piece it matched ("Matched · close") or a gap ("Missing", in red),
/// with the coverage line under it. Port of `ClosetMatches`. Archived pieces
/// count, so a match keeps rendering after a piece leaves the closet.
struct InspoClosetMatches: View {
    let analysis: InspoAnalysis
    let match: InspoMatch
    let pieces: [Block]
    let catalog: Catalog?

    var body: some View {
        let byId = Dictionary(pieces.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let matchOf = Dictionary(match.matches.map { ($0.pieceIndex, $0) }, uniquingKeysWith: { first, _ in first })
        let gapOf = Dictionary(match.gaps.map { ($0.pieceIndex, $0) }, uniquingKeysWith: { first, _ in first })

        Section {
            ForEach(Array(analysis.pieces.enumerated()), id: \.offset) { index, piece in
                if let matched = matchOf[index], let block = byId[matched.blockId] {
                    row(
                        leading: AnyView(Silhouette(block: block).frame(width: 36, height: 36)),
                        title: block.label.sentenceCased,
                        subtitle: Text("Matched · \(InspoMatch.matchWord(matched.score))")
                            .foregroundStyle(Color.fitsssLabel2)
                    )
                    .accessibilityIdentifier("inspo.match.\(index)")
                } else {
                    let description = gapOf[index]?.description.trimmingCharacters(in: .whitespaces) ?? ""
                    row(
                        leading: AnyView(GapDot()),
                        title: (description.isEmpty ? gapFallback(piece, catalog: catalog) : description).sentenceCased,
                        subtitle: Text("Missing").foregroundStyle(Color.fitsssDestructive)
                    )
                    .accessibilityIdentifier("inspo.gap.\(index)")
                }
            }
        } header: {
            Text("From your closet")
        } footer: {
            Text(match.coverageText)
                .accessibilityIdentifier("inspo.coverage")
        }
    }

    private func row(leading: AnyView, title: String, subtitle: Text) -> some View {
        HStack(spacing: 12) {
            leading
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                subtitle
                    .font(.subheadline)
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .combine)
    }
}

/// The dashed ring that stands in for a piece the closet does not have.
private struct GapDot: View {
    var body: some View {
        Circle()
            .strokeBorder(Color.fitsssLabel3, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            .frame(width: 36, height: 36)
            .accessibilityHidden(true)
    }
}
