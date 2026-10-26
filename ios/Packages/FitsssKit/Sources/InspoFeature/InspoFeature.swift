import FitsssCore
import FitsssUI
import SwiftUI

// Inspo: saved inspiration pictures (the web's /inspo and the Looks tab's
// Inspo shelf), adding one, its detail, restyling it from the closet.
//
// This module presents no tab of its own. The app hands its views to other
// features as builders (features never import each other):
//
//     InspoShelf          the Looks tab's Inspo segment (routes `looks/inspo…`
//                         are read by LooksScreen)
//     InspoDetailScreen   one picture, pushed on the Looks stack
//     AddInspoSheet       "Add a picture": from the shelf's "+" (hands the new
//                         picture back) and Today's "Restyle a picture" (flows
//                         into the detail inside the sheet)

// MARK: - Labels

nonisolated extension Catalog {
    /// The catalog's label for a pictured piece, e.g. "Overshirt".
    func pieceTypeLabel(_ piece: InspoPiece) -> String {
        type(piece.typeId)?.label ?? piece.typeId
    }

    /// A pictured piece's second line, "Grey · Oversized": the color, then
    /// the fit, else the variant, else a pattern that isn't plain. Port of
    /// `pieceColorLine` in `src/components/inspo/labels.ts`.
    func pieceDetailLine(_ piece: InspoPiece) -> String {
        var parts = [piece.color.name]
        if let fit = piece.fit {
            parts.append(fitLabel(fit))
        } else if let variant = piece.variant {
            parts.append(variantLabel(variant))
        } else if piece.pattern != "solid" {
            parts.append(patternLabel(piece.pattern))
        }
        return parts.joined(separator: " · ")
    }
}

/// What a gap row says when the match has no description for it: "grey
/// oversized t-shirt", the web's fallback.
@MainActor
func gapFallback(_ piece: InspoPiece, catalog: Catalog?) -> String {
    guard let catalog else { return piece.color.name }
    return "\(catalog.pieceDetailLine(piece)) \(catalog.pieceTypeLabel(piece).lowercased())"
}

/// The tile caption: the summary once read, else what is happening.
func inspoCaption(_ inspo: Inspo, isReading: Bool) -> String {
    if let summary = inspo.analysis?.summary.trimmingCharacters(in: .whitespacesAndNewlines), !summary.isEmpty {
        return summary
    }
    return isReading ? "Reading…" : "Not read yet"
}

/// The link the picture came from, when it is one a browser can open.
func originalURL(_ inspo: Inspo) -> URL? {
    guard let raw = inspo.sourceUrl, let url = URL(string: raw),
          let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
          url.host() != nil
    else { return nil }
    return url
}

// MARK: - Errors

extension Error {
    /// The answer arrived after a sign-out, sign-in or server switch. The
    /// screen it was for is being replaced, so it is not shown as a failure.
    var isSuperseded: Bool { (self as? APIError) == .superseded }

    /// Nothing to show: superseded, cancelled, or a lost session (the
    /// session store signs out).
    var isQuiet: Bool {
        if self is CancellationError { return true }
        guard let api = self as? APIError else { return false }
        return api == .superseded || api == .unauthorized
    }
}

extension APIError {
    /// The validator's messages for invalid input, a plain sentence otherwise.
    var displayMessage: String { errorDescription ?? "Something went wrong." }
}

// MARK: - Shared bits

/// The same small icon well the web's `RowIcon` draws in front of a row.
struct InspoRowIcon: View {
    let systemName: String
    var tint: Color = .fitsssLabel

    @ScaledMetric(relativeTo: .body) private var scaled: CGFloat = 30
    private var size: CGFloat { min(scaled, 40) }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.5, weight: .medium))
            .foregroundStyle(tint)
            .frame(width: size, height: size)
            .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: size * 0.23, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// The trailing chevron of a row that opens something.
struct RowChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(Color.fitsssLabel3)
            .accessibilityHidden(true)
    }
}

/// `OutfitFlatLay` in a square well as wide as it is offered (see
/// `SquareFlatLay` in LooksFeature: in a list row the flat lay alone is only
/// as large as its drawings).
struct SquareFlatLay: View {
    let slots: OutfitSlots
    let pieces: [Block]
    let size: OutfitFlatLay.Size

    var body: some View {
        RoundedRectangle(cornerRadius: Metrics.thumbRadius)
            .fill(Color.fitsssCard2)
            .aspectRatio(1, contentMode: .fit)
            .overlay { OutfitFlatLay(slots: slots, blocks: pieces, size: size) }
            .accessibilityElement(children: .combine)
    }
}
