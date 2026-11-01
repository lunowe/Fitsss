import Foundation

/// Lays a pattern into a layered kit drawing: the Swift port of
/// `composeLayers` in `src/components/silhouettes/kit/compose.ts`. Plain
/// string assembly, kept character for character in step with the web
/// (a test compares the two), so both clients draw the same stripes:
///
///     base
///     <clipPath id=…><path d=clip/></clipPath>
///     <g clip-path=url(#…)> overlay </g>
///     lines
///
/// Overlay by tile kind:
///   field  the tile's 100×100 markup scaled uniformly to cover `box`
///          (side = max(w, h), centered); `markupV` when the garment's
///          stripes run vertically and the tile has one.
///   motif  the tile's 100×100 markup scaled to `graphic` (or `logo`) size,
///          centered on that anchor. Without the anchor, nothing is drawn.
///   block  a path of `layers.block` filled with the pattern color; without a
///          block panel, the tile's field markup (if any) instead.
nonisolated public enum ArtComposer {
    /// A drawing split around where a pattern goes (`ArtLayers` on the web).
    public struct Layers: Sendable, Hashable {
        public var base: String
        public var lines: String
        public var clip: String
        /// `[x, y, width, height]`.
        public var box: [Double]
        /// `h` (default) or `v`.
        public var stripe: String?
        /// Center x, center y, size.
        public var graphic: [Double]?
        public var logo: [Double]?
        public var block: String?
        /// Areas where a field pattern turns to follow the garment (sleeves).
        public var panels: [Panel]

        public init(
            base: String, lines: String, clip: String, box: [Double],
            stripe: String? = nil, graphic: [Double]? = nil, logo: [Double]? = nil, block: String? = nil,
            panels: [Panel] = []
        ) {
            self.base = base
            self.lines = lines
            self.clip = clip
            self.box = box
            self.stripe = stripe
            self.graphic = graphic
            self.logo = logo
            self.block = block
            self.panels = panels
        }
    }

    /// `ArtPanel` on the web: a panel's outline, its bounds and the angle (in
    /// degrees, clockwise) its pattern turns by.
    public struct Panel: Sendable, Hashable {
        public var clip: String
        /// `[x, y, width, height]`.
        public var box: [Double]
        public var angle: Double

        public init(clip: String, box: [Double], angle: Double) {
            self.clip = clip
            self.box = box
            self.angle = angle
        }
    }

    /// One pattern as 100×100 markup (`PatternTile` on the web).
    public struct Tile: Sendable, Hashable {
        /// `field`, `motif` or `block`.
        public var kind: String
        /// Motifs: `graphic` (default) or `logo`.
        public var anchor: String?
        public var markup: String
        public var markupV: String?

        public init(kind: String, anchor: String? = nil, markup: String, markupV: String? = nil) {
            self.kind = kind
            self.anchor = anchor
            self.markup = markup
            self.markupV = markupV
        }
    }

    /// The body to draw, or nil when the pattern has nothing to lay in (no
    /// tile, an unknown kind, a motif without its anchor): draw `body` then.
    /// `id` names the clip path; it only has to be unique within the body.
    public static func compose(_ layers: Layers, tile: Tile?, id: String) -> String? {
        guard let tile, let overlay = overlay(layers, tile) else { return nil }
        let panels = tile.kind == "field" ? panelsMarkup(layers, tile, id: id) : ""
        return layers.base
            + "<clipPath id=\"\(id)\"><path d=\"\(layers.clip)\"/></clipPath>"
            + "<g clip-path=\"url(#\(id))\">\(overlay)\(panels)</g>"
            + layers.lines
    }

    private static func fieldMarkup(_ layers: Layers, _ tile: Tile) -> String {
        let vertical = layers.stripe == "v" ? tile.markupV.flatMap { $0.isEmpty ? nil : $0 } : nil
        return vertical ?? tile.markup
    }

    /// Each panel refilled with the garment color, then the field tile at the
    /// body's density turned by the panel's angle about the panel's center.
    private static func panelsMarkup(_ layers: Layers, _ tile: Tile, id: String) -> String {
        guard layers.box.count >= 4 else { return "" }
        let side = max(layers.box[2], layers.box[3])
        var out = ""
        for (i, panel) in layers.panels.enumerated() where panel.box.count >= 4 {
            let cx = panel.box[0] + panel.box[2] / 2
            let cy = panel.box[1] + panel.box[3] / 2
            let transform = "rotate(\(num(panel.angle)) \(num(cx)) \(num(cy))) "
                + "translate(\(num(cx - side / 2)) \(num(cy - side / 2))) scale(\(num(side / 100)))"
            out += "<clipPath id=\"\(id)-\(i)\"><path d=\"\(panel.clip)\"/></clipPath>"
                + "<g clip-path=\"url(#\(id)-\(i))\"><path d=\"\(panel.clip)\" fill=\"var(--icon-fill)\"/>"
                + "<g transform=\"\(transform)\">\(fieldMarkup(layers, tile))</g></g>"
        }
        return out
    }

    private static func overlay(_ layers: Layers, _ tile: Tile) -> String? {
        switch tile.kind {
        case "field":
            guard let cover = coverTransform(layers.box) else { return nil }
            return "<g transform=\"\(cover)\">\(fieldMarkup(layers, tile))</g>"
        case "motif":
            let anchor = tile.anchor == "logo" ? layers.logo : layers.graphic
            guard let anchor, let transform = anchorTransform(anchor) else { return nil }
            return "<g transform=\"\(transform)\">\(tile.markup)</g>"
        case "block":
            if let block = layers.block { return "<path d=\"\(block)\" fill=\"var(--icon-pattern, #000)\"/>" }
            // The web tests the markup for truthiness: an empty string is "none".
            guard !tile.markup.isEmpty, let cover = coverTransform(layers.box) else { return nil }
            return "<g transform=\"\(cover)\">\(tile.markup)</g>"
        default:
            return nil
        }
    }

    /// Uniform scale of a 100×100 tile so it covers `box`, centered.
    static func coverTransform(_ box: [Double]) -> String? {
        guard box.count >= 4 else { return nil }
        let (x, y, w, h) = (box[0], box[1], box[2], box[3])
        let side = max(w, h)
        let s = side / 100
        return "translate(\(num(x + w / 2 - side / 2)) \(num(y + h / 2 - side / 2))) scale(\(num(s)))"
    }

    /// A 100×100 tile scaled to `size` and centered on (cx, cy).
    static func anchorTransform(_ anchor: [Double]) -> String? {
        guard anchor.count >= 3 else { return nil }
        let (cx, cy, size) = (anchor[0], anchor[1], anchor[2])
        let s = size / 100
        return "translate(\(num(cx - size / 2)) \(num(cy - size / 2))) scale(\(num(s)))"
    }

    /// `String(Math.round(n * 1000) / 1000)` in JavaScript: ties round up,
    /// integers print without a fraction, -0 prints as 0.
    static func num(_ n: Double) -> String {
        let scaled = n * 1000
        let floor = scaled.rounded(.down)
        let rounded = (scaled - floor >= 0.5 ? floor + 1 : floor) / 1000
        if rounded == 0 { return "0" }
        if rounded == rounded.rounded(), abs(rounded) < 1e15 { return String(Int64(rounded)) }
        return String(rounded)
    }
}
