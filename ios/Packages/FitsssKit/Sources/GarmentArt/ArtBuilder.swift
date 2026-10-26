import CoreGraphics
import SwiftUI

// MARK: - Display list

/// A parsed drawing is a short list of these, built once: every path already
/// carries its element's transform (it is in viewBox coordinates), styles are
/// resolved, groups exist only where they change how children composite
/// (a clip or a group opacity).
nonisolated indirect enum ArtNode: Sendable {
    case shape(ArtShape)
    /// `clip` in viewBox coordinates; an empty clip path hides the children.
    case group(clip: ArtClip?, opacity: Double, children: [ArtNode])
}

nonisolated struct ArtShape: Sendable {
    /// In viewBox coordinates.
    var path: Path
    var fill: ArtPaint
    var fillOpacity: Double
    var evenOdd: Bool
    var stroke: ArtStroke?
}

nonisolated struct ArtStroke: Sendable {
    var paint: ArtPaint
    var opacity: Double
    var width: Double
    var cap: CGLineCap
    var join: CGLineJoin
    var miterLimit: Double
    var dash: [Double]
    var dashPhase: Double
    /// `vector-effect="non-scaling-stroke"`: width and dashes are in points
    /// on screen, whatever the transform.
    var nonScaling: Bool
    /// A scaling stroke under a transform is stroked in the element's own
    /// coordinates and then transformed, so a skew or non-uniform scale
    /// shapes the line the way it does in a browser.
    var localPath: Path?
    var localTransform: CGAffineTransform = .identity
    /// The flattening threshold in the stroked path's own units, for the
    /// dashes cut at draw time.
    var tinyCurve: Double = ArtBuilder.tinyCurve
}

nonisolated struct ArtClip: Sendable {
    var path: Path
    var evenOdd: Bool
}

// MARK: - Building

/// Turns the element tree into the display list: SVG inheritance through
/// groups, transforms, clip paths, the geometry of each shape element.
nonisolated struct ArtBuilder {
    private var ids: [String: SVGNode] = [:]

    init(root: SVGNode) {
        root.collectIDs(into: &ids)
    }

    /// The display list for the synthetic `<svg>` root around a body.
    func build(_ root: SVGNode) -> [ArtNode] {
        root.children.flatMap { nodes(for: $0, style: ArtStyle(), ctm: .identity, depth: 0) }
    }

    private static let containers: Set<String> = ["g", "svg"]
    private static let shapes: Set<String> = ["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]

    private func nodes(for element: SVGNode, style inherited: ArtStyle, ctm parentCTM: CGAffineTransform, depth: Int) -> [ArtNode] {
        let kind = element.name
        let isContainer = Self.containers.contains(kind)
        // defs, clipPath, title, desc, metadata and anything unknown draw nothing.
        guard depth < 64, isContainer || Self.shapes.contains(kind) else { return [] }

        let props = ArtProperties.declared(element.attributes)
        if props["display"]?.trimmingCharacters(in: .whitespaces) == "none" { return [] }
        let style = inherited.applying(props)

        var ctm = parentCTM
        if let transform = element.attributes["transform"] {
            ctm = TransformList.parse(transform).concatenating(ctm)
        }
        if kind == "svg" {
            ctm = Self.viewportTransform(element).concatenating(ctm)
        }

        var content: [ArtNode]
        if isContainer {
            content = element.children.flatMap { nodes(for: $0, style: style, ctm: ctm, depth: depth + 1) }
        } else if let shape = Self.shape(element, props: props, style: style, ctm: ctm) {
            content = [.shape(shape)]
        } else {
            content = []
        }
        guard !content.isEmpty else { return [] }

        var opacity = props["opacity"].flatMap(ArtStyle.opacity) ?? 1
        guard opacity > 0 else { return [] }
        let clip = props["clip-path"].flatMap { clip($0, ctm: ctm) }

        // A shape that paints only a fill or only a stroke can take its
        // opacity on that paint and skip the offscreen layer.
        if opacity < 1, content.count == 1, case .shape(var shape) = content[0] {
            if shape.stroke == nil {
                shape.fillOpacity *= opacity
                opacity = 1
            } else if shape.fill == .none, var stroke = shape.stroke {
                stroke.opacity *= opacity
                shape.stroke = stroke
                opacity = 1
            }
            content = [.shape(shape)]
        }

        if clip == nil, opacity >= 1 { return content }
        return [.group(clip: clip, opacity: opacity, children: content)]
    }

    // MARK: Shapes

    /// Curves shorter than this many viewBox units are stroked as polylines
    /// (see `PathBuilder`): at most about 1.3pt on the largest tile.
    static let tinyCurve = 1.0

    private static func shape(_ element: SVGNode, props: [String: String], style: ArtStyle, ctm: CGAffineTransform) -> ArtShape? {
        guard style.visible, let segments = segments(element) else { return nil }

        // A line has no inside to fill.
        var fill = element.name == "line" ? .none : style.fill
        if style.fillOpacity <= 0 { fill = .none }
        let stroked = style.stroke != .none && style.strokeWidth > 0 && style.strokeOpacity > 0
        guard fill != .none || stroked else { return nil }

        let ctmScale = abs(ctm.a * ctm.d - ctm.b * ctm.c).squareRoot()
        let tiny = stroked && ctmScale > 0 ? tinyCurve / ctmScale : 0
        let local = PathData.path(segments, flattenBelow: tiny)
        let path = ctm.isIdentity ? local : local.applying(ctm)

        var stroke: ArtStroke?
        if stroked {
            let nonScaling = props["vector-effect"]?.trimmingCharacters(in: .whitespaces) == "non-scaling-stroke"
            let keepsLocal = !nonScaling && !ctm.isIdentity
            stroke = ArtStroke(
                paint: style.stroke,
                opacity: style.strokeOpacity,
                width: style.strokeWidth,
                cap: style.lineCap,
                join: style.lineJoin,
                miterLimit: style.miterLimit,
                dash: style.dashArray,
                dashPhase: style.dashOffset,
                nonScaling: nonScaling,
                localPath: keepsLocal ? local : nil,
                localTransform: keepsLocal ? ctm : .identity,
                tinyCurve: keepsLocal ? tiny : tinyCurve
            )
        }
        return ArtShape(path: path, fill: fill, fillOpacity: style.fillOpacity, evenOdd: style.evenOddFill, stroke: stroke)
    }

    /// An element's outline in its own coordinates.
    static func geometry(_ element: SVGNode) -> Path? {
        segments(element).map { PathData.path($0) }
    }

    /// An element's outline in its own coordinates, as SVG 2 defines the
    /// equivalent path of each basic shape. Nil when it renders nothing.
    static func segments(_ element: SVGNode) -> [PathSegment]? {
        let a = element.attributes
        func number(_ key: String) -> Double? { a[key].flatMap(ArtStyle.length) }

        switch element.name {
        case "path":
            guard let d = a["d"] else { return nil }
            let segments = PathData.segments(d)
            return segments.isEmpty ? nil : segments

        case "rect":
            let x = number("x") ?? 0, y = number("y") ?? 0
            guard let w = number("width"), let h = number("height"), w > 0, h > 0 else { return nil }
            var rx = number("rx").map { max($0, 0) }
            var ry = number("ry").map { max($0, 0) }
            if rx == nil { rx = ry }
            if ry == nil { ry = rx }
            let cornerX = min(rx ?? 0, w / 2)
            let cornerY = min(ry ?? 0, h / 2)
            var s: [PathSegment] = []
            if cornerX == 0 || cornerY == 0 {
                s = [
                    .move(CGPoint(x: x, y: y)), .line(CGPoint(x: x + w, y: y)), .line(CGPoint(x: x + w, y: y + h)),
                    .line(CGPoint(x: x, y: y + h)), .close,
                ]
            } else {
                func arc(_ from: CGPoint, _ to: CGPoint) {
                    PathData.appendArc(from: from, to: to, rx: cornerX, ry: cornerY, angle: 0, largeArc: false, sweep: true, into: &s)
                }
                let p = [
                    CGPoint(x: x + cornerX, y: y), CGPoint(x: x + w - cornerX, y: y),
                    CGPoint(x: x + w, y: y + cornerY), CGPoint(x: x + w, y: y + h - cornerY),
                    CGPoint(x: x + w - cornerX, y: y + h), CGPoint(x: x + cornerX, y: y + h),
                    CGPoint(x: x, y: y + h - cornerY), CGPoint(x: x, y: y + cornerY),
                ]
                s.append(.move(p[0]))
                if p[1] != p[0] { s.append(.line(p[1])) }
                arc(p[1], p[2])
                if p[3] != p[2] { s.append(.line(p[3])) }
                arc(p[3], p[4])
                if p[5] != p[4] { s.append(.line(p[5])) }
                arc(p[5], p[6])
                if p[7] != p[6] { s.append(.line(p[7])) }
                arc(p[7], p[0])
                s.append(.close)
            }
            return s

        case "circle", "ellipse":
            let cx = number("cx") ?? 0, cy = number("cy") ?? 0
            var rx: Double
            var ry: Double
            if element.name == "circle" {
                guard let r = number("r") else { return nil }
                rx = r
                ry = r
            } else {
                // A missing radius is `auto`: the other one.
                guard let either = number("rx") ?? number("ry") else { return nil }
                rx = number("rx") ?? either
                ry = number("ry") ?? either
            }
            guard rx > 0, ry > 0 else { return nil }
            let points = [
                CGPoint(x: cx + rx, y: cy), CGPoint(x: cx, y: cy + ry),
                CGPoint(x: cx - rx, y: cy), CGPoint(x: cx, y: cy - ry),
            ]
            var s: [PathSegment] = [.move(points[0])]
            for i in 0..<4 {
                PathData.appendArc(
                    from: points[i], to: points[(i + 1) % 4], rx: rx, ry: ry, angle: 0,
                    largeArc: false, sweep: true, into: &s
                )
            }
            s.append(.close)
            return s

        case "line":
            let start = CGPoint(x: number("x1") ?? 0, y: number("y1") ?? 0)
            let end = CGPoint(x: number("x2") ?? 0, y: number("y2") ?? 0)
            return [.move(start), .line(end)]

        case "polyline", "polygon":
            let values = NumberScanner.numbers(in: a["points"] ?? "")
            guard values.count >= 4 else { return nil }
            var s: [PathSegment] = [.move(CGPoint(x: values[0], y: values[1]))]
            var i = 2
            while i + 1 < values.count {
                s.append(.line(CGPoint(x: values[i], y: values[i + 1])))
                i += 2
            }
            if element.name == "polygon" { s.append(.close) }
            return s

        default:
            return nil
        }
    }

    /// A nested `<svg>`: its x/y offset, and its viewBox fitted (meet,
    /// centered) into its width and height when it has all three.
    private static func viewportTransform(_ element: SVGNode) -> CGAffineTransform {
        let a = element.attributes
        let x = a["x"].flatMap(ArtStyle.length) ?? 0
        let y = a["y"].flatMap(ArtStyle.length) ?? 0
        var transform = CGAffineTransform(translationX: x, y: y)
        if let box = a["viewbox"].flatMap(ArtDrawing.parseViewBox),
           let w = a["width"].flatMap(ArtStyle.length), let h = a["height"].flatMap(ArtStyle.length), w > 0, h > 0 {
            let scale = min(w / box.width, h / box.height)
            let fit = CGAffineTransform(
                a: scale, b: 0, c: 0, d: scale,
                tx: (w - box.width * scale) / 2 - box.minX * scale,
                ty: (h - box.height * scale) / 2 - box.minY * scale
            )
            transform = fit.concatenating(transform)
        }
        return transform
    }

    // MARK: Clip paths

    /// Resolves `clip-path="url(#id)"` against the element's user space.
    /// A reference to nothing is ignored (drawn unclipped), as browsers do.
    private func clip(_ value: String, ctm: CGAffineTransform) -> ArtClip? {
        guard let id = Self.reference(value), let node = ids[id], node.name == "clippath" else { return nil }
        // Only user-space clip paths are supported; bounding-box units are rare
        // in drawings and are skipped rather than drawn wrong.
        if node.attributes["clippathunits"]?.trimmingCharacters(in: .whitespaces) == "objectBoundingBox" {
            return nil
        }
        let clipProps = ArtProperties.declared(node.attributes)
        let clipStyle = ArtStyle().applying(clipProps)
        var clipCTM = ctm
        if let transform = node.attributes["transform"] {
            clipCTM = TransformList.parse(transform).concatenating(ctm)
        }

        var parts: [(path: Path, evenOdd: Bool)] = []
        for child in node.children where Self.shapes.contains(child.name) {
            let props = ArtProperties.declared(child.attributes)
            if props["display"]?.trimmingCharacters(in: .whitespaces) == "none" { continue }
            let style = clipStyle.applying(props)
            guard style.visible, let local = Self.geometry(child) else { continue }
            var childCTM = clipCTM
            if let transform = child.attributes["transform"] {
                childCTM = TransformList.parse(transform).concatenating(clipCTM)
            }
            parts.append((local.applying(childCTM), style.evenOddClip))
        }

        guard let first = parts.first else { return ArtClip(path: Path(), evenOdd: false) }
        if parts.count == 1 { return ArtClip(path: first.path, evenOdd: first.evenOdd) }
        // The clip is the union of its children, each under its own rule.
        var union = first.path.normalized(eoFill: first.evenOdd)
        for part in parts.dropFirst() {
            union = union.union(part.path.normalized(eoFill: part.evenOdd))
        }
        return ArtClip(path: union, evenOdd: false)
    }

    /// `url(#id)`, `url('#id')`, `url("#id")` -> `id`.
    static func reference(_ value: String) -> String? {
        let trimmed = value.trimmingCharacters(in: .whitespaces)
        guard trimmed.lowercased().hasPrefix("url("), let close = trimmed.firstIndex(of: ")") else { return nil }
        var inner = trimmed[trimmed.index(trimmed.startIndex, offsetBy: 4)..<close].trimmingCharacters(in: .whitespaces)
        inner = inner.trimmingCharacters(in: CharacterSet(charactersIn: "'\""))
        guard inner.hasPrefix("#") else { return nil }
        return String(inner.dropFirst())
    }
}
