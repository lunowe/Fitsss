import SwiftUI

// PUBLIC CONTRACT — `FitsssUI.Silhouette` builds on exactly this surface.

/// A parsed garment drawing: the inner markup of an SVG in the house
/// convention (`var(--icon-fill)`, `var(--icon-fill-2)`, `var(--icon-stroke)`,
/// `vector-effect="non-scaling-stroke"`), ready to draw at any size.
///
/// Supports the subset the drawings use (see `src/lib/art/normalize.ts` and
/// `src/components/silhouettes/art`): `g`, `path`, `circle`, `ellipse`, `rect`,
/// `line`, `polyline`, `polygon`, nested `svg`, `clipPath` references,
/// transforms, inherited presentation attributes and `style` declarations.
/// Parsing happens once, in `init`; drawing walks a prebuilt display list.
nonisolated public struct ArtDrawing: Sendable, Equatable {
    /// The SVG viewBox.
    public let viewBox: CGRect

    let content: Content

    /// Parses once. Never fails: unknown elements and attributes are skipped,
    /// a malformed viewBox falls back to 0 0 64 64.
    public init(viewBox: String, body: String) {
        self.viewBox = Self.parseViewBox(viewBox) ?? CGRect(x: 0, y: 0, width: 64, height: 64)
        let root = SVGNode.parse(body: body)
        content = Content(nodes: ArtBuilder(root: root).build(root))
    }

    /// True when nothing in the body draws.
    public var isEmpty: Bool { content.nodes.isEmpty }

    /// Parsed drawings by key, so lists of tiles parse each drawing once.
    /// Keys from the catalog are content-stable (see `catalog-payload.ts`).
    @MainActor public static func cached(key: String, viewBox: String, body: String) -> ArtDrawing {
        if let hit = cache[key] { return hit }
        let drawing = ArtDrawing(viewBox: viewBox, body: body)
        cache[key] = drawing
        return drawing
    }

    @MainActor private static var cache: [String: ArtDrawing] = [:]

    /// Same parse, same drawing: compared by identity, so SwiftUI can skip
    /// redrawing a tile whose drawing and inks did not change.
    public static func == (lhs: ArtDrawing, rhs: ArtDrawing) -> Bool {
        lhs.content === rhs.content && lhs.viewBox == rhs.viewBox
    }

    /// `min-x min-y width height`, comma or space separated; nil unless the
    /// size is positive.
    static func parseViewBox(_ text: String) -> CGRect? {
        let numbers = NumberScanner.numbers(in: text)
        guard numbers.count == 4, numbers[2] > 0, numbers[3] > 0 else { return nil }
        return CGRect(x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3])
    }

    /// The immutable display list, shared by every copy of the drawing.
    final class Content: Sendable {
        let nodes: [ArtNode]

        init(nodes: [ArtNode]) {
            self.nodes = nodes
        }
    }
}

/// The three colors a drawing is painted with.
nonisolated public struct ArtInks: Equatable, Sendable {
    /// `--icon-fill`: the garment's own color.
    public var fill: Color
    /// `--icon-fill-2`: collars, cuffs, soles.
    public var fill2: Color
    /// `--icon-stroke`: the outline.
    public var stroke: Color

    public init(fill: Color, fill2: Color, stroke: Color) {
        self.fill = fill
        self.fill2 = fill2
        self.stroke = stroke
    }
}

/// Draws a drawing aspect-fit and centered in whatever frame it is given.
/// Strokes keep their declared width in points at every size, like
/// `non-scaling-stroke` on the web.
///
/// The view takes the drawing's aspect ratio and clips to it, so stray
/// geometry outside the viewBox (a few imported drawings carry off-canvas
/// copies) never shows; on the web it can peek into a square tile's margin.
public struct GarmentArtView: View, nonisolated Equatable {
    private let drawing: ArtDrawing
    private let inks: ArtInks

    public init(_ drawing: ArtDrawing, inks: ArtInks) {
        self.drawing = drawing
        self.inks = inks
    }

    public var body: some View {
        let drawing = drawing
        let inks = inks
        Canvas { context, size in
            drawing.draw(in: &context, size: size, inks: inks)
        }
        .aspectRatio(drawing.viewBox.width / drawing.viewBox.height, contentMode: .fit)
    }

    nonisolated public static func == (lhs: GarmentArtView, rhs: GarmentArtView) -> Bool {
        lhs.drawing == rhs.drawing && lhs.inks == rhs.inks
    }
}
