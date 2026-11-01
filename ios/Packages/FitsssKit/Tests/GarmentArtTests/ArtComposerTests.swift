import Testing
@testable import GarmentArt

/// `ArtComposer` must produce exactly what the web's `composeLayers` does, or
/// the two clients lay stripes differently. Expected strings were copied from
/// running `src/components/silhouettes/kit/compose.ts` (with these small tiles
/// in place of `PATTERN_TILES`) under `pnpm exec tsx`.
@Suite struct ArtComposerTests {
    private let layers = ArtComposer.Layers(
        base: #"<path d="M10 10h40v50H10Z" fill="var(--icon-fill)"/>"#,
        lines: #"<path d="M10 10h40v50H10Z" fill="none" stroke="var(--icon-stroke)"/>"#,
        clip: "M12 12h36v46H12Z",
        box: [12.3, -0.0004, 35.55, 46.0005],
        stripe: "v",
        graphic: [30, 30.5, 17.3335]
    )

    private let stripe = ArtComposer.Tile(
        kind: "field",
        markup: #"<rect x="0" y="10" width="100" height="4"/>"#,
        markupV: #"<rect x="10" y="0" width="4" height="100"/>"#
    )
    private let graphic = ArtComposer.Tile(kind: "motif", markup: #"<circle cx="50" cy="50" r="40"/>"#)
    private let logo = ArtComposer.Tile(kind: "motif", anchor: "logo", markup: #"<path d="M20 70 50 20 80 70Z"/>"#)
    private let colorblock = ArtComposer.Tile(kind: "block", markup: #"<rect x="0" y="50" width="100" height="50"/>"#)

    private let head = #"<path d="M10 10h40v50H10Z" fill="var(--icon-fill)"/><clipPath id="pc"><path d="M12 12h36v46H12Z"/></clipPath><g clip-path="url(#pc)">"#
    private let tail = #"</g><path d="M10 10h40v50H10Z" fill="none" stroke="var(--icon-stroke)"/>"#

    @Test func matchesTheWebOutput() {
        var horizontal = layers
        horizontal.stripe = nil
        var panel = layers
        panel.block = "M10 30h40v10H10Z"

        #expect(ArtComposer.compose(layers, tile: stripe, id: "pc")
            == head + #"<g transform="translate(7.075 0) scale(0.46)"><rect x="10" y="0" width="4" height="100"/></g>"# + tail)
        #expect(ArtComposer.compose(horizontal, tile: stripe, id: "pc")
            == head + #"<g transform="translate(7.075 0) scale(0.46)"><rect x="0" y="10" width="100" height="4"/></g>"# + tail)
        #expect(ArtComposer.compose(layers, tile: graphic, id: "pc")
            == head + #"<g transform="translate(21.333 21.833) scale(0.173)"><circle cx="50" cy="50" r="40"/></g>"# + tail)
        #expect(ArtComposer.compose(panel, tile: colorblock, id: "pc")
            == head + #"<path d="M10 30h40v10H10Z" fill="var(--icon-pattern, #000)"/>"# + tail)
        #expect(ArtComposer.compose(layers, tile: colorblock, id: "pc")
            == head + #"<g transform="translate(7.075 0) scale(0.46)"><rect x="0" y="50" width="100" height="50"/></g>"# + tail)
        // A motif without its anchor and an unknown pattern draw the plain body.
        #expect(ArtComposer.compose(layers, tile: logo, id: "pc") == nil)
        #expect(ArtComposer.compose(layers, tile: nil, id: "pc") == nil)
    }

    /// A sleeve panel: refilled, then the stripe at body density turned about
    /// the panel's center. Expected string from `composeLayers` under tsx.
    @Test func turnsFieldPatternsOnPanels() {
        var sleeve = layers
        sleeve.stripe = nil
        sleeve.panels = [ArtComposer.Panel(clip: "M40 12h8v20h-8Z", box: [40, 12, 8.25, 20], angle: -22.5)]
        #expect(ArtComposer.compose(sleeve, tile: stripe, id: "pc")
            == head + #"<g transform="translate(7.075 0) scale(0.46)"><rect x="0" y="10" width="100" height="4"/></g>"#
            + #"<clipPath id="pc-0"><path d="M40 12h8v20h-8Z"/></clipPath><g clip-path="url(#pc-0)"><path d="M40 12h8v20h-8Z" fill="var(--icon-fill)"/>"#
            + #"<g transform="rotate(-22.5 44.125 22) translate(21.125 -1) scale(0.46)"><rect x="0" y="10" width="100" height="4"/></g></g>"#
            + tail)
        // Motifs and blocks ignore panels.
        #expect(ArtComposer.compose(sleeve, tile: graphic, id: "pc")
            == head + #"<g transform="translate(21.333 21.833) scale(0.173)"><circle cx="50" cy="50" r="40"/></g>"# + tail)
    }

    @Test func numbersPrintLikeJavaScript() {
        // `String(Math.round(n * 1000) / 1000)` in node.
        #expect(ArtComposer.num(-0.0005) == "0")
        #expect(ArtComposer.num(-2.0005) == "-2.001")
        #expect(ArtComposer.num(1234.5675) == "1234.568")
        #expect(ArtComposer.num(0.1 + 0.2) == "0.3")
        #expect(ArtComposer.num(7) == "7")
        #expect(ArtComposer.num(-12.25) == "-12.25")
        #expect(ArtComposer.num(1e-7) == "0")
    }

    @Test func patternPaintIsItsOwnInk() {
        // `var(--icon-pattern, #000)` resolves to the pattern ink, not its fallback.
        #expect(ArtPaint.parse("var(--icon-pattern, #000)") == .pattern)
    }
}
