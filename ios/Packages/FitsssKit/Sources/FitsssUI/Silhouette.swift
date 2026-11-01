import FitsssCore
import GarmentArt
import SwiftUI

/// A tinted garment drawing for a piece type, the native `Silhouette` from
/// `src/components/silhouettes`. Resolves the drawing (the user's own, else
/// built-in art, else the glyph) from the catalog in the environment.
///
///     Silhouette(block: block)
///         .frame(width: 64, height: 64)
///
/// The drawing fits the frame it is given. Outline and shade follow the
/// garment's own lightness, not the theme: a white piece gets dark lines on a
/// dark card too. Kit drawings change shape with the fit and, when the piece
/// has a pattern, lay it in painted with the pattern color.
public struct Silhouette: View {
    @Environment(CatalogStore.self) private var catalogStore

    private let typeId: String
    private let variant: String?
    private let fit: String?
    private let color: String
    private let secondaryColor: String?
    private let pattern: String?
    private let patternColor: String?

    public init(
        typeId: String,
        variant: String? = nil,
        fit: String? = nil,
        color: String,
        secondaryColor: String? = nil,
        pattern: String? = nil,
        patternColor: String? = nil
    ) {
        self.typeId = typeId
        self.variant = variant
        self.fit = fit
        self.color = color
        self.secondaryColor = secondaryColor
        self.pattern = pattern
        self.patternColor = patternColor
    }

    /// Convenience for a stored piece.
    public init(block: Block) {
        self.init(
            typeId: block.typeId,
            variant: block.variant,
            fit: block.fit,
            color: block.color.hex,
            secondaryColor: block.secondaryColor?.hex,
            pattern: block.pattern,
            patternColor: block.patternColor?.hex
        )
    }

    public var body: some View {
        if let catalog = catalogStore.catalog,
           let drawing = Self.drawing(in: catalog, typeId: typeId, variant: variant, fit: fit, pattern: pattern),
           !drawing.isEmpty {
            GarmentArtView(drawing, inks: Self.inks(color: color, secondaryColor: secondaryColor, patternColor: patternColor))
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

    /// The parsed drawing for a piece: variant, then fit, then the type's
    /// own; with the pattern laid in when the drawing has layers and the
    /// catalog a tile for it. Cached by art key and pattern (and the catalog
    /// version, since tiles are not part of the art key).
    public static func drawing(in catalog: Catalog, typeId: String, variant: String?, fit: String?, pattern: String?) -> ArtDrawing? {
        guard let resolved = catalog.art(typeId: typeId, variant: variant, fit: fit) else { return nil }
        let piece = resolved.piece
        if let pattern, pattern != "solid", let layers = piece.layers, let tile = catalog.patternTile(pattern) {
            return ArtDrawing.cached(key: "\(resolved.key)|\(pattern)|\(catalog.version)", viewBox: piece.viewBox) {
                ArtComposer.compose(ArtComposer.Layers(layers), tile: ArtComposer.Tile(tile), id: "fitsss-pattern")
                    ?? piece.body
            }
        }
        return ArtDrawing.cached(key: resolved.key, viewBox: piece.viewBox, body: piece.body)
    }

    /// Ink and shade from the garment's lightness, matching the web:
    /// black at 62% on light pieces, white at 72% on dark ones; the shade is
    /// the color mixed 18% towards the opposite end. The pattern ink is the
    /// piece's pattern color, else `defaultPatternColor` on the web: a deep
    /// navy on light pieces, an off-white on dark ones.
    public static func inks(color: String, secondaryColor: String?, patternColor: String? = nil) -> ArtInks {
        let lightness = ColorMath.lightness(color)
        let isDark = (lightness ?? 1) <= 0.45
        let stroke = lightness == nil
            ? Color.fitsssLabel.opacity(0.7)
            : (isDark ? Color.white.opacity(0.72) : Color.black.opacity(0.62))
        let fill = Color(hex: color)
        let fill2 = secondaryColor.map(Color.init(hex:)) ?? shade(color, towardsWhite: isDark)
        let pattern = patternColor.map(Color.init(hex:)) ?? defaultPatternColor(lightness: lightness)
        return ArtInks(fill: fill, fill2: fill2, stroke: stroke, pattern: pattern)
    }

    /// `defaultPatternColor` in `src/components/silhouettes/index.tsx`.
    private static func defaultPatternColor(lightness: Double?) -> Color {
        guard let lightness else { return Color.fitsssLabel.opacity(0.55) }
        return Color(hex: lightness > 0.45 ? "#1f2a44" : "#f4f1ea")
    }

    private static func shade(_ hex: String, towardsWhite: Bool) -> Color {
        guard let (r, g, b) = ColorMath.rgb(hex) else { return Color(uiColor: .systemGray2) }
        let target = towardsWhite ? 1.0 : 0.0
        let mix = { (channel: Double) in channel * 0.82 + target * 0.18 }
        return Color(.sRGB, red: mix(r), green: mix(g), blue: mix(b))
    }
}

private extension ArtComposer.Layers {
    init(_ layers: ArtPiece.Layers) {
        self.init(
            base: layers.base, lines: layers.lines, clip: layers.clip, box: layers.box,
            stripe: layers.stripe, graphic: layers.graphic, logo: layers.logo, block: layers.block,
            panels: (layers.panels ?? []).map { ArtComposer.Panel(clip: $0.clip, box: $0.box, angle: $0.angle) }
        )
    }
}

private extension ArtComposer.Tile {
    init(_ tile: PatternTile) {
        self.init(kind: tile.kind, anchor: tile.anchor, markup: tile.markup, markupV: tile.markupV)
    }
}
