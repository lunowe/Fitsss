import CoreGraphics
import SwiftUI

/// One absolute path segment. Path data is reduced to these four drawing
/// operations: H/V become lines, S/T are expanded with their reflected
/// control point, arcs become cubics.
nonisolated enum PathSegment: Equatable, Sendable {
    case move(CGPoint)
    case line(CGPoint)
    case quad(control: CGPoint, to: CGPoint)
    case cubic(control1: CGPoint, control2: CGPoint, to: CGPoint)
    case close
}

/// The SVG path data grammar (`d`), all commands in absolute and relative
/// form, implicit repeats, compact numbers and unseparated arc flags.
///
/// Like a browser, it renders up to the first error: everything parsed
/// before a malformed command is kept.
nonisolated enum PathData {
    static func segments(_ d: String) -> [PathSegment] {
        var scanner = NumberScanner(d)
        var out: [PathSegment] = []
        out.reserveCapacity(16)

        var current = CGPoint.zero
        var subpathStart = CGPoint.zero
        // The second control point of the previous C/S, and the control point
        // of the previous Q/T, for the reflections of S and T.
        var lastCubicControl: CGPoint?
        var lastQuadControl: CGPoint?
        var command: UInt8?
        // After Z the next drawing command starts a new subpath at the start point.
        var needsMove = false
        var first = true

        parsing: while true {
            scanner.skipWhitespaceAndCommas()
            guard let byte = scanner.peek else { break }

            if NumberScanner.isLetter(byte) {
                guard Self.isCommand(byte) else { break }
                command = byte
                scanner.advance()
            } else if command == nil || !scanner.atNumber {
                break
            }
            guard let cmd = command else { break }
            // Path data must open with a moveto.
            if first, cmd != UInt8(ascii: "M"), cmd != UInt8(ascii: "m") { break }
            first = false

            let relative = cmd >= UInt8(ascii: "a")
            let origin = relative ? current : .zero

            switch cmd | 0x20 { // lowercase
            case UInt8(ascii: "m"):
                guard let x = scanner.number(), let y = scanner.number() else { break parsing }
                let point = CGPoint(x: origin.x + x, y: origin.y + y)
                out.append(.move(point))
                current = point
                subpathStart = point
                needsMove = false
                lastCubicControl = nil
                lastQuadControl = nil
                // Further coordinate pairs are implicit linetos.
                command = relative ? UInt8(ascii: "l") : UInt8(ascii: "L")

            case UInt8(ascii: "z"):
                out.append(.close)
                current = subpathStart
                needsMove = true
                lastCubicControl = nil
                lastQuadControl = nil
                // Numbers directly after Z are an error.
                command = nil

            case UInt8(ascii: "l"):
                guard let x = scanner.number(), let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                current = CGPoint(x: origin.x + x, y: origin.y + y)
                out.append(.line(current))
                lastCubicControl = nil
                lastQuadControl = nil

            case UInt8(ascii: "h"):
                guard let x = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                current = CGPoint(x: (relative ? current.x : 0) + x, y: current.y)
                out.append(.line(current))
                lastCubicControl = nil
                lastQuadControl = nil

            case UInt8(ascii: "v"):
                guard let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                current = CGPoint(x: current.x, y: (relative ? current.y : 0) + y)
                out.append(.line(current))
                lastCubicControl = nil
                lastQuadControl = nil

            case UInt8(ascii: "c"):
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                let c1 = CGPoint(x: origin.x + x1, y: origin.y + y1)
                let c2 = CGPoint(x: origin.x + x2, y: origin.y + y2)
                current = CGPoint(x: origin.x + x, y: origin.y + y)
                out.append(.cubic(control1: c1, control2: c2, to: current))
                lastCubicControl = c2
                lastQuadControl = nil

            case UInt8(ascii: "s"):
                guard let x2 = scanner.number(), let y2 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                let c1 = lastCubicControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                let c2 = CGPoint(x: origin.x + x2, y: origin.y + y2)
                current = CGPoint(x: origin.x + x, y: origin.y + y)
                out.append(.cubic(control1: c1, control2: c2, to: current))
                lastCubicControl = c2
                lastQuadControl = nil

            case UInt8(ascii: "q"):
                guard let x1 = scanner.number(), let y1 = scanner.number(),
                      let x = scanner.number(), let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                let c = CGPoint(x: origin.x + x1, y: origin.y + y1)
                current = CGPoint(x: origin.x + x, y: origin.y + y)
                out.append(.quad(control: c, to: current))
                lastQuadControl = c
                lastCubicControl = nil

            case UInt8(ascii: "t"):
                guard let x = scanner.number(), let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                let c = lastQuadControl.map { CGPoint(x: 2 * current.x - $0.x, y: 2 * current.y - $0.y) } ?? current
                current = CGPoint(x: origin.x + x, y: origin.y + y)
                out.append(.quad(control: c, to: current))
                lastQuadControl = c
                lastCubicControl = nil

            case UInt8(ascii: "a"):
                guard let rx = scanner.number(), let ry = scanner.number(), let angle = scanner.number(),
                      let largeArc = scanner.flag(), let sweep = scanner.flag(),
                      let x = scanner.number(), let y = scanner.number() else { break parsing }
                if needsMove { out.append(.move(current)); needsMove = false }
                let end = CGPoint(x: origin.x + x, y: origin.y + y)
                Self.appendArc(
                    from: current, to: end, rx: rx, ry: ry, angle: angle,
                    largeArc: largeArc, sweep: sweep, into: &out
                )
                current = end
                lastCubicControl = nil
                lastQuadControl = nil

            default:
                break parsing
            }
        }
        return out
    }

    /// The path for `d`, in the element's own coordinates.
    static func path(_ d: String) -> Path {
        path(segments(d))
    }

    /// Builds a path from segments. Curves whose control polygon is shorter
    /// than `tiny` become four-line polylines (see `PathBuilder`).
    static func path(_ segments: [PathSegment], flattenBelow tiny: Double = 0) -> Path {
        var builder = PathBuilder(tiny: tiny)
        for segment in segments {
            switch segment {
            case .move(let p): builder.move(p)
            case .line(let p): builder.line(p)
            case .quad(let c, let p): builder.quad(c, p)
            case .cubic(let c1, let c2, let p): builder.cubic(c1, c2, p)
            case .close: builder.close()
            }
        }
        return builder.path
    }

    /// The same path with its tiny curves flattened.
    static func flattened(_ path: Path, below tiny: Double) -> Path {
        var builder = PathBuilder(tiny: tiny)
        path.forEach { element in
            switch element {
            case .move(let p): builder.move(p)
            case .line(let p): builder.line(p)
            case .quadCurve(let p, let c): builder.quad(c, p)
            case .curve(let p, let c1, let c2): builder.cubic(c1, c2, p)
            case .closeSubpath: builder.close()
            }
        }
        return builder.path
    }

    private static func isCommand(_ byte: UInt8) -> Bool {
        switch byte | 0x20 {
        case UInt8(ascii: "m"), UInt8(ascii: "z"), UInt8(ascii: "l"), UInt8(ascii: "h"), UInt8(ascii: "v"),
             UInt8(ascii: "c"), UInt8(ascii: "s"), UInt8(ascii: "q"), UInt8(ascii: "t"), UInt8(ascii: "a"):
            return true
        default:
            return false
        }
    }

    // MARK: - Arcs

    /// An elliptical arc as cubic Béziers (SVG implementation notes, B.2.4
    /// and B.2.5): radii scaled up when they cannot span the endpoints, a zero
    /// radius is a straight line, identical endpoints draw nothing.
    static func appendArc(
        from start: CGPoint, to end: CGPoint, rx rxIn: Double, ry ryIn: Double, angle: Double,
        largeArc: Bool, sweep: Bool, into out: inout [PathSegment]
    ) {
        if start == end { return }
        var rx = abs(rxIn)
        var ry = abs(ryIn)
        if rx == 0 || ry == 0 {
            out.append(.line(end))
            return
        }
        let phi = angle.truncatingRemainder(dividingBy: 360) * .pi / 180
        let cosPhi = cos(phi)
        let sinPhi = sin(phi)

        let dx2 = (start.x - end.x) / 2
        let dy2 = (start.y - end.y) / 2
        let x1p = cosPhi * dx2 + sinPhi * dy2
        let y1p = -sinPhi * dx2 + cosPhi * dy2

        let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
        if lambda > 1 {
            let scale = lambda.squareRoot()
            rx *= scale
            ry *= scale
        }

        let rx2 = rx * rx
        let ry2 = ry * ry
        let numerator = rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p
        let denominator = rx2 * y1p * y1p + ry2 * x1p * x1p
        var coefficient = denominator == 0 ? 0 : (max(0, numerator / denominator)).squareRoot()
        if largeArc == sweep { coefficient = -coefficient }
        let cxp = coefficient * (rx * y1p / ry)
        let cyp = coefficient * -(ry * x1p / rx)

        let cx = cosPhi * cxp - sinPhi * cyp + (start.x + end.x) / 2
        let cy = sinPhi * cxp + cosPhi * cyp + (start.y + end.y) / 2

        func vectorAngle(_ ux: Double, _ uy: Double, _ vx: Double, _ vy: Double) -> Double {
            atan2(ux * vy - uy * vx, ux * vx + uy * vy)
        }
        let ux = (x1p - cxp) / rx
        let uy = (y1p - cyp) / ry
        let vx = (-x1p - cxp) / rx
        let vy = (-y1p - cyp) / ry
        let theta1 = vectorAngle(1, 0, ux, uy)
        var delta = vectorAngle(ux, uy, vx, vy)
        if !sweep, delta > 0 { delta -= 2 * .pi }
        if sweep, delta < 0 { delta += 2 * .pi }

        // Huge (but finite) coordinates overflow to inf/NaN above; `Int(_:)`
        // traps on those, so a hostile drawing would crash every render.
        // Fall back to a straight line.
        guard delta.isFinite, cx.isFinite, cy.isFinite, rx.isFinite, ry.isFinite else {
            out.append(.line(end))
            return
        }
        let count = max(1, Int((abs(delta) / (.pi / 2) - 1e-7).rounded(.up)))
        let step = delta / Double(count)
        let k = 4.0 / 3.0 * tan(step / 4)

        func map(_ x: Double, _ y: Double) -> CGPoint {
            CGPoint(x: cx + rx * cosPhi * x - ry * sinPhi * y, y: cy + rx * sinPhi * x + ry * cosPhi * y)
        }
        var a1 = theta1
        for i in 0..<count {
            let a2 = a1 + step
            let cos1 = cos(a1), sin1 = sin(a1)
            let cos2 = cos(a2), sin2 = sin(a2)
            let c1 = map(cos1 - k * sin1, sin1 + k * cos1)
            let c2 = map(cos2 + k * sin2, sin2 - k * cos2)
            let to = i == count - 1 ? end : map(cos2, sin2)
            out.append(.cubic(control1: c1, control2: c2, to: to))
            a1 = a2
        }
    }
}

/// Accumulates a `Path`, replacing curves smaller than `tiny` with short
/// polylines.
///
/// SwiftUI's stroker frays curves that are only a fraction of a point long:
/// the stitch details in the imported art (hundreds of 0.1-unit curves) come
/// out as a hairy band with miter spikes, where browsers and Core Graphics
/// draw a clean line. Four straight pieces are indistinguishable at that size
/// and stroke cleanly.
nonisolated struct PathBuilder {
    private(set) var path = Path()
    let tiny: Double
    private var current = CGPoint.zero
    private var start = CGPoint.zero

    init(tiny: Double) {
        self.tiny = tiny
    }

    mutating func move(_ p: CGPoint) {
        path.move(to: p)
        current = p
        start = p
    }

    mutating func line(_ p: CGPoint) {
        path.addLine(to: p)
        current = p
    }

    mutating func quad(_ c: CGPoint, _ p: CGPoint) {
        if tiny > 0, Self.distance(current, c) + Self.distance(c, p) < tiny {
            let p0 = current
            for i in 1...4 {
                let t = Double(i) / 4, u = 1 - t
                path.addLine(to: CGPoint(
                    x: u * u * p0.x + 2 * u * t * c.x + t * t * p.x,
                    y: u * u * p0.y + 2 * u * t * c.y + t * t * p.y
                ))
            }
        } else {
            path.addQuadCurve(to: p, control: c)
        }
        current = p
    }

    mutating func cubic(_ c1: CGPoint, _ c2: CGPoint, _ p: CGPoint) {
        if tiny > 0, Self.distance(current, c1) + Self.distance(c1, c2) + Self.distance(c2, p) < tiny {
            let p0 = current
            for i in 1...4 {
                let t = Double(i) / 4, u = 1 - t
                let a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t
                path.addLine(to: CGPoint(
                    x: a * p0.x + b * c1.x + c * c2.x + d * p.x,
                    y: a * p0.y + b * c1.y + c * c2.y + d * p.y
                ))
            }
        } else {
            path.addCurve(to: p, control1: c1, control2: c2)
        }
        current = p
    }

    mutating func close() {
        path.closeSubpath()
        current = start
    }

    private static func distance(_ a: CGPoint, _ b: CGPoint) -> Double {
        hypot(b.x - a.x, b.y - a.y)
    }
}
