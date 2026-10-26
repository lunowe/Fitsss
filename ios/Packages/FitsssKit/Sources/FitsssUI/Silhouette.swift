import FitsssCore
import GarmentArt
import SwiftUI

/// A tinted garment drawing for a piece type, the native `Silhouette` from
/// `src/components/silhouettes`. Resolves the drawing (the user's own, else
/// built-in art, else the glyph) from the catalog in the environment.
///
///     Silhouette(typeId: block.typeId, variant: block.variant,
///                color: block.color.hex, secondaryColor: block.secondaryColor?.hex)
///         .frame(width: 64, height: 64)
///
/// The drawing fits the frame it is given. Outline and shade follow the
/// garment's own lightness, not the theme: a white piece gets dark lines on a
/// dark card too.
public struct Silhouette: View {
    @Environment(CatalogStore.self) private var catalogStore

    private let typeId: String
    private let variant: String?
    private let color: String
    private let secondaryColor: String?

    public init(typeId: String, variant: String? = nil, color: String, secondaryColor: String? = nil) {
        self.typeId = typeId
        self.variant = variant
        self.color = color
        self.secondaryColor = secondaryColor
    }

    /// Convenience for a stored piece.
    public init(block: Block) {
        self.init(
            typeId: block.typeId,
            variant: block.variant,
            color: block.color.hex,
            secondaryColor: block.secondaryColor?.hex
        )
    }

    public var body: some View {
        if let resolved = catalogStore.catalog?.art(typeId: typeId, variant: variant),
           case let drawing = ArtDrawing.cached(key: resolved.key, viewBox: resolved.piece.viewBox, body: resolved.piece.body),
           !drawing.isEmpty {
            GarmentArtView(drawing, inks: Self.inks(color: color, secondaryColor: secondaryColor))
                .accessibilityHidden(true)
        } else {
            // Catalog not loaded yet, a type it does not know, or a drawing
            // that came out empty: a swatch of the color, never a blank box.
            Circle()
                .fill(Color(hex: color))
                .padding(8)
                .accessibilityHidden(true)
        }
    }

    /// Ink and shade from the garment's lightness, matching the web:
    /// black at 62% on light pieces, white at 72% on dark ones; the shade is
    /// the color mixed 18% towards the opposite end.
    public static func inks(color: String, secondaryColor: String?) -> ArtInks {
        let lightness = ColorMath.lightness(color)
        let isDark = (lightness ?? 1) <= 0.45
        let stroke = lightness == nil
            ? Color.fitsssLabel.opacity(0.7)
            : (isDark ? Color.white.opacity(0.72) : Color.black.opacity(0.62))
        let fill = Color(hex: color)
        let fill2 = secondaryColor.map(Color.init(hex:)) ?? shade(color, towardsWhite: isDark)
        return ArtInks(fill: fill, fill2: fill2, stroke: stroke)
    }

    private static func shade(_ hex: String, towardsWhite: Bool) -> Color {
        guard let (r, g, b) = ColorMath.rgb(hex) else { return Color(uiColor: .systemGray2) }
        let target = towardsWhite ? 1.0 : 0.0
        let mix = { (channel: Double) in channel * 0.82 + target * 0.18 }
        return Color(.sRGB, red: mix(r), green: mix(g), blue: mix(b))
    }
}
