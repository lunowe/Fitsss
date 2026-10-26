import CoreGraphics
import SwiftUI
import Testing
@testable import GarmentArt

/// The parts of the renderer where a bug draws something plausible but
/// wrong: number scanning, path grammar, arcs, transform order, inheritance.
@Suite struct GarmentArtTests {
    @Test func parsesViewBox() {
        #expect(ArtDrawing(viewBox: "0 0 128 110.7", body: "").viewBox.height == 110.7)
        #expect(ArtDrawing(viewBox: "0,0,98.2,128", body: "").viewBox.width == 98.2)
        #expect(ArtDrawing(viewBox: "0 0 0 10", body: "").viewBox == CGRect(x: 0, y: 0, width: 64, height: 64))
        #expect(ArtDrawing(viewBox: "nonsense", body: "").viewBox == CGRect(x: 0, y: 0, width: 64, height: 64))
    }

    // MARK: Numbers

    @Test func scansCompactNumbers() {
        #expect(NumberScanner.numbers(in: "1.5.5") == [1.5, 0.5])
        #expect(NumberScanner.numbers(in: "-.3-.4") == [-0.3, -0.4])
        #expect(NumberScanner.numbers(in: "10-20+3") == [10, -20, 3])
        #expect(NumberScanner.numbers(in: "1e2 2.5E-1 3e") == [100, 0.25, 3])
        #expect(NumberScanner.numbers(in: " 0.1 , 0.2,0.3 ") == [0.1, 0.2, 0.3])
        #expect(NumberScanner.numbers(in: "4.") == [4])
        // Same value the platform parser gives, digit for digit.
        #expect(NumberScanner.numbers(in: "120.73 0.34525 -13.3192") == [120.73, 0.34525, -13.3192])
    }

    // MARK: Path data

    private func p(_ x: Double, _ y: Double) -> CGPoint { CGPoint(x: x, y: y) }

    @Test func relativeCommandsAndImplicitRepeats() {
        // m then pairs = implicit relative linetos; h/v; z returns to start.
        let segments = PathData.segments("m10 10 5 0 0 5h-5v-5zl2 2")
        #expect(segments == [
            .move(p(10, 10)), .line(p(15, 10)), .line(p(15, 15)), .line(p(10, 15)), .line(p(10, 10)), .close,
            // A drawing command after Z starts a new subpath at the closed one's start.
            .move(p(10, 10)), .line(p(12, 12)),
        ])
    }

    @Test func absoluteMoveRepeatsAsLines() {
        #expect(PathData.segments("M1 2 3 4 5 6") == [.move(p(1, 2)), .line(p(3, 4)), .line(p(5, 6))])
    }

    @Test func compactExportedPath() {
        // From the tee drawing: compact numbers, implicit repeats, relative cubics.
        let segments = PathData.segments("m120.9 31.9 2.4 2L105 50.1l-3.1-1.8z")
        #expect(segments.count == 5)
        let points = segments.compactMap { segment -> CGPoint? in
            switch segment {
            case .move(let point), .line(let point): point
            default: nil
            }
        }
        let expected = [p(120.9, 31.9), p(123.3, 33.9), p(105, 50.1), p(101.9, 48.3)]
        #expect(points.count == expected.count)
        for (point, want) in zip(points, expected) {
            #expect(abs(point.x - want.x) < 1e-9 && abs(point.y - want.y) < 1e-9, "\(point) != \(want)")
        }
        #expect(segments.last == .close)
    }

    @Test func smoothCurvesReflectTheirControlPoint() {
        let segments = PathData.segments("M0 0C10 0 20 10 20 20S30 40 40 40Q50 40 50 50T60 60s5 5 10 10")
        #expect(segments[2] == .cubic(control1: p(20, 30), control2: p(30, 40), to: p(40, 40)))
        #expect(segments[4] == .quad(control: p(50, 60), to: p(60, 60)))
        // `s` after a quad has no cubic to reflect: the first control is the current point.
        #expect(segments[5] == .cubic(control1: p(60, 60), control2: p(65, 65), to: p(70, 70)))
    }

    @Test func stopsAtTheFirstError() {
        #expect(PathData.segments("M0 0L10 10L20").count == 2)
        #expect(PathData.segments("M0 0L10 10 X 5 5").count == 2)
        #expect(PathData.segments("L10 10").isEmpty, "path data must start with a moveto")
        #expect(PathData.segments("M0 0z 5 5").count == 2, "numbers after Z are an error")
    }

    @Test func arcFlagsWithoutSeparators() {
        // `a1 1 0 011 1` is rx=1 ry=1 angle=0 large=0 sweep=1 to (+1, +1).
        let compact = PathData.segments("M0 0a1 1 0 011 1")
        let spaced = PathData.segments("M0 0a1 1 0 0 1 1 1")
        #expect(compact == spaced)
        #expect(compact.count == 2)
        guard case .cubic(_, _, let end) = compact.last else { Issue.record("expected a cubic"); return }
        #expect(end == p(1, 1))
    }

    @Test func overflowingArcDoesNotTrap() {
        // Regression: finite but huge numbers (accepted by the server's art
        // normalizer) overflowed to NaN in the arc math and `Int(_:)` trapped.
        let segments = PathData.segments("M1e200 1e200 A1e200 1e200 0 0 1 0 0")
        #expect(segments.last == .line(p(0, 0)))
        _ = ArtDrawing(viewBox: "0 0 10 10", body: #"<path d="M1e200 1e200 A1e200 1e200 0 0 1 0 0"/>"#)
    }

    private func dashedStroke(_ dash: [Double], nonScaling: Bool = true, local: CGAffineTransform? = nil, path: Path) -> ArtStroke {
        var stroke = ArtStroke(
            paint: .none, opacity: 1, width: 1, cap: .butt, join: .miter, miterLimit: 4,
            dash: dash, dashPhase: 0, nonScaling: nonScaling
        )
        if let local {
            stroke.localPath = path
            stroke.localTransform = local
        }
        return stroke
    }

    // Regression: these drawings hung the app (seconds of CPU, gigabytes of memory).
    @Test func dashesThatWouldCostTooMuchAreDrawnSolid() {
        let stitch = PathData.path("M0 0L100 0")
        #expect(ArtDrawing.dashesAreDrawable(stitch, stroke: dashedStroke([2, 2], path: stitch), scale: 1), "ordinary stitching")

        let farOff = PathData.path("M0 55L1000000000 55")
        #expect(!ArtDrawing.dashesAreDrawable(farOff, stroke: dashedStroke([2, 2], path: farOff), scale: 1))

        let tiny = PathData.path("M0 0L100000000 0")
        let shrunk = dashedStroke([2, 2], nonScaling: false, local: CGAffineTransform(scaleX: 0.000001, y: 0.000001), path: tiny)
        #expect(!ArtDrawing.dashesAreDrawable(tiny, stroke: shrunk, scale: 1), "a dash under a tiny scale() is judged on screen")

        let manyEntries = PathData.path("M0 0L95000 0")
        let crowded = dashedStroke(Array(repeating: 0.001, count: 2000) + [10], path: manyEntries)
        #expect(!ArtDrawing.dashesAreDrawable(manyEntries, stroke: crowded, scale: 1), "every array entry is a segment")

        let invisible = PathData.path("M0 0L10 0")
        #expect(!ArtDrawing.dashesAreDrawable(invisible, stroke: dashedStroke([0.00001], path: invisible), scale: 1))
    }

    @Test func arcGeometry() {
        // sweep=1 is the positive-angle direction: from angle 180° (the start,
        // left of the center) through 270°, so this half circle passes (10, -10).
        let path = PathData.path("M0 0A10 10 0 0 1 20 0")
        let box = path.boundingRect
        #expect(abs(box.minX) < 1e-6 && abs(box.maxX - 20) < 1e-6)
        #expect(abs(box.minY + 10) < 0.01 && abs(box.maxY) < 1e-6)

        // Midpoint of the arc lies on the circle (cubic approximation error < 0.03%).
        let segments = PathData.segments("M0 0A10 10 0 0 1 20 0")
        #expect(segments.count == 3, "a half circle is two quarter cubics")
        guard case .cubic(_, _, let mid) = segments[1] else { Issue.record("expected a cubic"); return }
        #expect(abs(mid.x - 10) < 1e-9 && abs(mid.y + 10) < 1e-9)
    }

    @Test func arcRadiiScaleUpWhenTooSmall() {
        // Radius 1 cannot span 20 units: scaled to 10, a half circle.
        let tooSmall = PathData.path("M0 0A1 1 0 0 1 20 0").boundingRect
        #expect(abs(tooSmall.height - 10) < 0.01)
        // Zero radius is a straight line; identical endpoints draw nothing.
        #expect(PathData.segments("M0 0A0 5 0 0 1 20 0") == [.move(p(0, 0)), .line(p(20, 0))])
        #expect(PathData.segments("M5 5A3 3 0 0 1 5 5") == [.move(p(5, 5))])
    }

    @Test func largeArcTakesTheLongWay() {
        let small = PathData.path("M0 0A10 10 0 0 1 10 10").boundingRect
        let large = PathData.path("M0 0A10 10 0 1 1 10 10").boundingRect
        #expect(abs(small.width - 10) < 0.01)
        #expect(abs(large.width - 20) < 0.01 && abs(large.height - 20) < 0.01)
    }

    @Test func onlyTinyCurvesAreFlattenedForStroking() {
        func kinds(_ path: Path) -> [String] {
            var out: [String] = []
            path.forEach { element in
                switch element {
                case .move: out.append("M")
                case .line: out.append("L")
                case .quadCurve: out.append("Q")
                case .curve: out.append("C")
                case .closeSubpath: out.append("Z")
                }
            }
            return out
        }
        // A 0.2-unit stitch curve becomes four lines; a garment-sized curve stays a curve.
        let tiny = PathData.path(PathData.segments("M0 0q.1 .1 .2 0c.05 .05 .1 .05 .15 0"), flattenBelow: 1)
        #expect(kinds(tiny) == ["M"] + Array(repeating: "L", count: 8))
        let large = PathData.path(PathData.segments("M0 0q10 10 20 0c5 5 10 5 15 0"), flattenBelow: 1)
        #expect(kinds(large) == ["M", "Q", "C"])
        // Flattening keeps the endpoints.
        var last = CGPoint.zero
        tiny.forEach { if case .line(let p) = $0 { last = p } }
        #expect(abs(last.x - 0.35) < 1e-6 && abs(last.y) < 1e-6, "\(last)")
    }

    // MARK: Transforms

    private func apply(_ text: String, _ x: Double, _ y: Double) -> CGPoint {
        CGPoint(x: x, y: y).applying(TransformList.parse(text))
    }

    private func close(_ a: CGPoint, _ b: CGPoint) -> Bool { abs(a.x - b.x) < 1e-9 && abs(a.y - b.y) < 1e-9 }

    @Test func transformListAppliesRightToLeft() {
        // translate(...) scale(...): scale first, then translate.
        #expect(close(apply("translate(10 20) scale(2)", 1, 1), p(12, 22)))
        #expect(close(apply("translate(4.591 4.61)scale(.34525)", 100, 0), p(4.591 + 34.525, 4.61)))
        #expect(close(apply("scale(2) translate(10, 20)", 1, 1), p(22, 42)))
        #expect(close(apply("scale(2 3)", 1, 1), p(2, 3)))
        #expect(close(apply("translate(5)", 1, 1), p(6, 1)))
    }

    @Test func rotateSkewAndMatrix() {
        #expect(close(apply("rotate(90)", 1, 0), p(0, 1)))
        #expect(close(apply("rotate(180 10 10)", 0, 0), p(20, 20)))
        #expect(close(apply("skewX(45)", 0, 10), p(10, 10)))
        #expect(close(apply("skewY(45)", 10, 0), p(10, 10)))
        #expect(close(apply("matrix(1 2 3 4 5 6)", 1, 1), p(1 + 3 + 5, 2 + 4 + 6)))
        #expect(close(apply("matrix(1,0,0,1,-2.5,1e1)", 0, 0), p(-2.5, 10)))
    }

    @Test func malformedTransformIsIgnored() {
        #expect(TransformList.parse("translate(10 20") == .identity)
        #expect(TransformList.parse("spin(3)") == .identity)
        #expect(TransformList.parse("") == .identity)
    }

    // MARK: Drawings

    private func shapes(_ nodes: [ArtNode]) -> [ArtShape] {
        nodes.flatMap { node -> [ArtShape] in
            switch node {
            case .shape(let shape): [shape]
            case .group(_, _, let children): shapes(children)
            }
        }
    }

    @Test func groupTransformsAndPaintsInherit() {
        let drawing = ArtDrawing(viewBox: "0 0 64 64", body: """
        <g stroke="var(--icon-stroke, #000)" stroke-width="1.5" transform="translate(10 0)">\
        <g transform="scale(2)"><path fill="var(--icon-fill-2, #8c8c8c)" d="M0 0h10v10H0z" vector-effect="non-scaling-stroke"/></g>\
        <path d="M0 0h1" fill="none"/></g>
        """)
        let all = shapes(drawing.content.nodes)
        #expect(all.count == 2)
        #expect(all[0].path.boundingRect == CGRect(x: 10, y: 0, width: 20, height: 20))
        #expect(all[0].fill == .fill2)
        #expect(all[0].stroke?.paint == .stroke)
        #expect(all[0].stroke?.width == 1.5)
        #expect(all[0].stroke?.nonScaling == true)
        // vector-effect is not inherited, and a scaling stroke under a transform
        // keeps its own coordinates to be stroked in.
        #expect(all[1].stroke?.nonScaling == false)
        #expect(all[1].stroke?.localPath != nil)
    }

    @Test func defaultFillIsBlackAndStyleWins() {
        let drawing = ArtDrawing(viewBox: "0 0 10 10", body: """
        <rect width="4" height="4"/>\
        <rect width="4" height="4" fill="#fff" style="fill: var(--icon-fill); stroke: currentColor"/>\
        <rect width="4" height="4" fill="var(--unknown, rgb(255, 0, 0))"/>
        """)
        let all = shapes(drawing.content.nodes)
        #expect(all.map(\.fill) == [.rgba(0, 0, 0, 1), .fill, .rgba(1, 0, 0, 1)])
        #expect(all[1].stroke?.paint == .stroke)
    }

    @Test func clipPathsResolveInTheReferencingUserSpace() {
        let drawing = ArtDrawing(viewBox: "0 0 64 64", body: """
        <defs><clipPath id="c"><rect x="0" y="0" width="5" height="5"/></clipPath></defs>\
        <g transform="translate(10 10)" clip-path="url(#c)"><rect width="20" height="20" fill="red"/></g>\
        <g clip-path="url(#missing)"><rect width="1" height="1"/></g>
        """)
        let nodes = drawing.content.nodes
        #expect(nodes.count == 2)
        guard case .group(let clip?, _, _) = nodes[0] else { Issue.record("expected a clipped group"); return }
        #expect(clip.path.boundingRect == CGRect(x: 10, y: 10, width: 5, height: 5))
        // A dangling reference draws unclipped.
        guard case .shape = nodes[1] else { Issue.record("expected an unclipped shape"); return }
    }

    @Test func malformedMarkupKeepsWhatParsed() {
        let drawing = ArtDrawing(viewBox: "0 0 10 10", body: "<path d=\"M0 0h5v5z\"/><path d=")
        #expect(shapes(drawing.content.nodes).count == 1)
    }
}

/// Regression: `stroke-dashoffset="1000000000000"` made Core Graphics walk the
/// whole offset (minutes) and froze the closet. Must render in moments.
@MainActor
@Suite struct DashOffsetRenderTests {
    @Test(.timeLimit(.minutes(1))) func hugeDashOffsetRendersPromptly() {
        let drawing = ArtDrawing(
            viewBox: "0 0 100 100",
            body: ##"<path d="M0 50L100 50" fill="none" stroke="#000" stroke-width="2" stroke-dasharray="3" stroke-dashoffset="1000000000000"/>"##
        )
        let renderer = ImageRenderer(content: GarmentArtView(drawing, inks: ArtInks(fill: .gray, fill2: .gray, stroke: .black)).frame(width: 120, height: 120))
        #expect(renderer.uiImage != nil)
    }
}
