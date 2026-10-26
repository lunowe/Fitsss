import CoreGraphics
import Foundation

/// The SVG `transform` attribute: `matrix`, `translate`, `scale`, `rotate`
/// (with an optional center), `skewX`, `skewY`, chained left to right, with
/// commas or whitespace (or nothing, `translate(1 2)scale(3)`) between them.
nonisolated enum TransformList {
    /// The combined transform, mapping the element's coordinates into its
    /// parent's. A malformed list is ignored as a whole, as browsers do.
    static func parse(_ text: String) -> CGAffineTransform {
        var scanner = NumberScanner(text)
        var result = CGAffineTransform.identity
        while true {
            scanner.skipWhitespaceAndCommas()
            if scanner.isAtEnd { return result }
            guard let name = scanner.identifier() else { return .identity }
            scanner.skipWhitespace()
            guard scanner.consume(UInt8(ascii: "(")) else { return .identity }
            var args: [Double] = []
            while let value = scanner.number() { args.append(value) }
            scanner.skipWhitespace()
            guard scanner.consume(UInt8(ascii: ")")), let next = transform(name, args) else { return .identity }
            // `A B` maps a point through B first, then A.
            result = next.concatenating(result)
        }
    }

    private static func transform(_ name: String, _ a: [Double]) -> CGAffineTransform? {
        switch name {
        case "matrix":
            guard a.count == 6 else { return nil }
            return CGAffineTransform(a: a[0], b: a[1], c: a[2], d: a[3], tx: a[4], ty: a[5])
        case "translate":
            guard a.count == 1 || a.count == 2 else { return nil }
            return CGAffineTransform(translationX: a[0], y: a.count == 2 ? a[1] : 0)
        case "scale":
            guard a.count == 1 || a.count == 2 else { return nil }
            return CGAffineTransform(scaleX: a[0], y: a.count == 2 ? a[1] : a[0])
        case "rotate":
            guard a.count == 1 || a.count == 3 else { return nil }
            let rotation = CGAffineTransform(rotationAngle: a[0] * .pi / 180)
            guard a.count == 3 else { return rotation }
            // translate(cx cy) rotate(a) translate(-cx -cy)
            return CGAffineTransform(translationX: -a[1], y: -a[2])
                .concatenating(rotation)
                .concatenating(CGAffineTransform(translationX: a[1], y: a[2]))
        case "skewX":
            guard a.count == 1 else { return nil }
            return CGAffineTransform(a: 1, b: 0, c: tan(a[0] * .pi / 180), d: 1, tx: 0, ty: 0)
        case "skewY":
            guard a.count == 1 else { return nil }
            return CGAffineTransform(a: 1, b: tan(a[0] * .pi / 180), c: 0, d: 1, tx: 0, ty: 0)
        default:
            return nil
        }
    }
}
