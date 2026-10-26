import SwiftUI

nonisolated public extension ArtDrawing {
    /// Draws the drawing into `context`, fitted into a `size` box the way the
    /// web's `preserveAspectRatio="xMidYMid meet"` does, and clipped to it.
    ///
    /// Non-scaling strokes are stroked at their declared width in points (and
    /// their dashes in points), so outlines weigh the same on a 26pt chip and
    /// a 168pt tile. Other strokes scale with the drawing.
    func draw(in context: inout GraphicsContext, size: CGSize, inks: ArtInks) {
        let box = viewBox
        guard size.width > 0, size.height > 0, box.width > 0, box.height > 0, !content.nodes.isEmpty else { return }
        let scale = min(size.width / box.width, size.height / box.height)
        let fit = CGAffineTransform(
            a: scale, b: 0, c: 0, d: scale,
            tx: (size.width - box.width * scale) / 2 - box.minX * scale,
            ty: (size.height - box.height * scale) / 2 - box.minY * scale
        )
        var ctx = context
        ctx.clip(to: Path(CGRect(origin: .zero, size: size)))
        ctx.concatenate(fit)
        Self.draw(content.nodes, in: &ctx, scale: scale, palette: ArtPalette(inks))
    }

    private static func draw(_ nodes: [ArtNode], in ctx: inout GraphicsContext, scale: Double, palette: ArtPalette) {
        for node in nodes {
            switch node {
            case .shape(let shape):
                draw(shape, in: &ctx, scale: scale, palette: palette)
            case .group(let clip, let opacity, let children):
                var sub = ctx
                if let clip {
                    if clip.path.isEmpty { continue }
                    sub.clip(to: clip.path, style: FillStyle(eoFill: clip.evenOdd))
                }
                if opacity < 1 {
                    // Group opacity composites the children as one layer.
                    sub.opacity *= opacity
                    sub.drawLayer { layer in
                        layer.opacity = 1
                        draw(children, in: &layer, scale: scale, palette: palette)
                    }
                } else {
                    draw(children, in: &sub, scale: scale, palette: palette)
                }
            }
        }
    }

    private static func draw(_ shape: ArtShape, in ctx: inout GraphicsContext, scale: Double, palette: ArtPalette) {
        if let shading = palette.shading(shape.fill, opacity: shape.fillOpacity) {
            ctx.fill(shape.path, with: shading, style: FillStyle(eoFill: shape.evenOdd))
        }
        guard let stroke = shape.stroke, let shading = palette.shading(stroke.paint, opacity: stroke.opacity) else { return }

        // The context is in viewBox units: a non-scaling stroke divides its
        // width and dashes by the fit scale to land at points on screen.
        let k = stroke.nonScaling ? 1 / scale : 1
        var path = shape.path
        var sub = ctx
        if let local = stroke.localPath {
            path = local
            sub.concatenate(stroke.localTransform)
        }
        if !stroke.dash.isEmpty, dashesAreDrawable(path, stroke: stroke, scale: scale) {
            path = dashed(path, stroke: stroke, k: k)
        }
        let style = StrokeStyle(
            lineWidth: stroke.width * k, lineCap: stroke.cap, lineJoin: stroke.join, miterLimit: stroke.miterLimit
        )
        sub.stroke(path, with: shading, style: style)
    }

    /// Whether cutting this stroke's dashes is worth it, judged on screen:
    /// a dash period under half a point can't be seen, and more than a few
    /// thousand dashes cost seconds and gigabytes for nothing (a hostile
    /// `stroke-dasharray`, a dashed line running far off the canvas, or a
    /// dash inside a tiny `scale()` hung the app). Such a line is drawn solid.
    internal static func dashesAreDrawable(_ path: Path, stroke: ArtStroke, scale: Double) -> Bool {
        // How many screen points one unit of the path and of the dash covers.
        let localScale = stroke.localPath == nil
            ? 1
            : abs(stroke.localTransform.a * stroke.localTransform.d - stroke.localTransform.b * stroke.localTransform.c).squareRoot()
        let pathToScreen = scale * localScale
        let dashToScreen = stroke.nonScaling ? 1 : pathToScreen
        // Core Graphics cuts one segment per array entry, so a long array
        // multiplies the work however long its period is.
        guard stroke.dash.count <= 64 else { return false }
        let period = stroke.dash.reduce(0, +) * dashToScreen
        guard period.isFinite, period >= 0.5 else { return false }
        let length = approximateLength(path) * pathToScreen
        guard length.isFinite else { return false }
        return length / period * Double(stroke.dash.count) <= 8_000
    }

    /// The length of the path's control polygon: never shorter than the
    /// path itself, and cheap.
    internal static func approximateLength(_ path: Path) -> Double {
        var total = 0.0
        var current = CGPoint.zero
        var start = CGPoint.zero
        func walk(to point: CGPoint) {
            total += hypot(point.x - current.x, point.y - current.y)
            current = point
        }
        path.forEach { element in
            switch element {
            case .move(let to):
                current = to
                start = to
            case .line(let to):
                walk(to: to)
            case .quadCurve(let to, let control):
                walk(to: control)
                walk(to: to)
            case .curve(let to, let control1, let control2):
                walk(to: control1)
                walk(to: control2)
                walk(to: to)
            case .closeSubpath:
                walk(to: start)
            }
        }
        return total
    }

    /// Cuts the dashes with Core Graphics and strokes them solid. SwiftUI's
    /// own dashing draws dashes under about a pixel as a solid line and
    /// fattens slightly longer ones, which turns the art's fine stitching
    /// (`stroke-dasharray=".6"`) into heavy seams.
    private static func dashed(_ path: Path, stroke: ArtStroke, k: Double) -> Path {
        let lengths = stroke.dash.map { CGFloat($0 * k) }
        // The offset only matters modulo one period, and Core Graphics walks
        // all of it: a `stroke-dashoffset` of 1e12 took minutes.
        let period = lengths.reduce(0, +)
        var phase = stroke.dashPhase * k
        if period > 0, phase.isFinite {
            phase = phase.truncatingRemainder(dividingBy: period)
            if phase < 0 { phase += period }
        } else {
            phase = 0
        }
        let cut = path.cgPath.copy(dashingWithPhase: phase, lengths: lengths)
        return PathData.flattened(Path(cut), below: stroke.tinyCurve)
    }
}

/// The inks of one draw call as shadings, made once per draw.
nonisolated private struct ArtPalette {
    let inks: ArtInks
    let fill: GraphicsContext.Shading
    let fill2: GraphicsContext.Shading
    let stroke: GraphicsContext.Shading

    init(_ inks: ArtInks) {
        self.inks = inks
        fill = .color(inks.fill)
        fill2 = .color(inks.fill2)
        stroke = .color(inks.stroke)
    }

    func shading(_ paint: ArtPaint, opacity: Double) -> GraphicsContext.Shading? {
        guard opacity > 0 else { return nil }
        switch paint {
        case .none:
            return nil
        case .fill:
            return opacity >= 1 ? fill : .color(inks.fill.opacity(opacity))
        case .fill2:
            return opacity >= 1 ? fill2 : .color(inks.fill2.opacity(opacity))
        case .stroke:
            return opacity >= 1 ? stroke : .color(inks.stroke.opacity(opacity))
        case .rgba(let r, let g, let b, let a):
            return .color(Color(.sRGB, red: r, green: g, blue: b, opacity: a * opacity))
        }
    }
}
