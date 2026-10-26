import CoreGraphics
import Foundation

/// What a fill or stroke is painted with. The three inks are resolved per
/// view (`ArtInks`); everything else is fixed in the drawing.
nonisolated enum ArtPaint: Hashable, Sendable {
    case none
    /// `var(--icon-fill)`
    case fill
    /// `var(--icon-fill-2)`
    case fill2
    /// `var(--icon-stroke)`, and `currentColor`.
    case stroke
    /// A literal sRGB color, components 0…1.
    case rgba(Double, Double, Double, Double)

    /// Parses an SVG paint; nil when the value is not understood, so the
    /// inherited paint stays (an invalid presentation attribute is ignored).
    static func parse(_ raw: String) -> ArtPaint? {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return nil }
        let lower = value.lowercased()

        if lower.hasPrefix("var(") {
            return parseVar(value)
        }
        if lower.hasPrefix("url(") {
            // Paint servers (gradients, patterns) are not supported: use the
            // fallback after the reference, else nothing.
            guard let close = value.firstIndex(of: ")") else { return nil }
            let fallback = value[value.index(after: close)...].trimmingCharacters(in: .whitespaces)
            return fallback.isEmpty ? ArtPaint.none : (parse(fallback) ?? ArtPaint.none)
        }
        switch lower {
        case "none": return ArtPaint.none
        case "currentcolor": return .stroke
        case "transparent": return ArtPaint.none
        default: break
        }
        return ArtColor.parse(lower).map { $0.a == 0 ? ArtPaint.none : .rgba($0.r, $0.g, $0.b, $0.a) }
    }

    /// `var(--icon-fill, #b3b3b3)` and friends. An unknown name falls back to
    /// the second argument, which may itself be a `var()`.
    private static func parseVar(_ value: String) -> ArtPaint? {
        guard let open = value.firstIndex(of: "("), let close = value.lastIndex(of: ")"), open < close else { return nil }
        let inner = value[value.index(after: open)..<close]
        let name: Substring
        let fallback: Substring?
        if let comma = inner.firstIndex(of: ",") {
            name = inner[..<comma]
            fallback = inner[inner.index(after: comma)...]
        } else {
            name = inner
            fallback = nil
        }
        switch name.trimmingCharacters(in: .whitespaces) {
        case "--icon-fill": return .fill
        case "--icon-fill-2": return .fill2
        case "--icon-stroke": return .stroke
        default: return fallback.flatMap { parse(String($0)) }
        }
    }
}

/// CSS color literals: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`
/// in comma or space syntax with numbers or percentages, and a few names.
nonisolated enum ArtColor {
    struct RGBA: Equatable {
        var r: Double, g: Double, b: Double, a: Double
    }

    static func parse(_ lower: String) -> RGBA? {
        if lower.hasPrefix("#") { return hex(lower.dropFirst()) }
        if lower.hasPrefix("rgb") { return function(lower) }
        return named[lower]
    }

    private static func hex(_ digits: Substring) -> RGBA? {
        let values = digits.compactMap { $0.hexDigitValue }
        guard values.count == digits.count else { return nil }
        switch values.count {
        case 3, 4:
            let c = values.map { Double($0 * 17) / 255 }
            return RGBA(r: c[0], g: c[1], b: c[2], a: values.count == 4 ? c[3] : 1)
        case 6, 8:
            let c = stride(from: 0, to: values.count, by: 2).map { Double(values[$0] * 16 + values[$0 + 1]) / 255 }
            return RGBA(r: c[0], g: c[1], b: c[2], a: values.count == 8 ? c[3] : 1)
        default:
            return nil
        }
    }

    private static func function(_ lower: String) -> RGBA? {
        guard let open = lower.firstIndex(of: "("), let close = lower.lastIndex(of: ")"), open < close else { return nil }
        let parts = lower[lower.index(after: open)..<close]
            .split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" || $0 == "\t" })
            .map(String.init)
        guard parts.count == 3 || parts.count == 4 else { return nil }
        func channel(_ text: String, scale: Double) -> Double? {
            if text.hasSuffix("%") {
                return Double(text.dropLast()).map { min(max($0 / 100, 0), 1) }
            }
            return Double(text).map { min(max($0 / scale, 0), 1) }
        }
        guard let r = channel(parts[0], scale: 255), let g = channel(parts[1], scale: 255),
              let b = channel(parts[2], scale: 255) else { return nil }
        let a = parts.count == 4 ? channel(parts[3], scale: 1) : 1
        guard let a else { return nil }
        return RGBA(r: r, g: g, b: b, a: a)
    }

    private static let named: [String: RGBA] = [
        "black": RGBA(r: 0, g: 0, b: 0, a: 1),
        "white": RGBA(r: 1, g: 1, b: 1, a: 1),
        "gray": RGBA(r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1),
        "grey": RGBA(r: 128 / 255, g: 128 / 255, b: 128 / 255, a: 1),
        "silver": RGBA(r: 192 / 255, g: 192 / 255, b: 192 / 255, a: 1),
        "red": RGBA(r: 1, g: 0, b: 0, a: 1),
        "green": RGBA(r: 0, g: 128 / 255, b: 0, a: 1),
        "blue": RGBA(r: 0, g: 0, b: 1, a: 1),
        "yellow": RGBA(r: 1, g: 1, b: 0, a: 1),
        "navy": RGBA(r: 0, g: 0, b: 128 / 255, a: 1),
        "transparent": RGBA(r: 0, g: 0, b: 0, a: 0),
    ]
}

/// The inherited presentation properties at one point of the tree, with the
/// SVG initial values: black fill, no stroke, width 1, butt caps, miter
/// joins, miter limit 4, nonzero rules.
nonisolated struct ArtStyle: Sendable {
    var fill: ArtPaint = .rgba(0, 0, 0, 1)
    var fillOpacity: Double = 1
    var evenOddFill = false
    var stroke: ArtPaint = .none
    var strokeOpacity: Double = 1
    var strokeWidth: Double = 1
    var lineCap: CGLineCap = .butt
    var lineJoin: CGLineJoin = .miter
    var miterLimit: Double = 4
    var dashArray: [Double] = []
    var dashOffset: Double = 0
    var evenOddClip = false
    var visible = true

    /// This style with an element's own declarations applied. Values that do
    /// not parse are ignored, so the inherited value stays.
    func applying(_ props: [String: String]) -> ArtStyle {
        var style = self
        for (key, rawValue) in props {
            let value = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
            if value == "inherit" { continue }
            switch key {
            case "fill":
                if let paint = ArtPaint.parse(value) { style.fill = paint }
            case "stroke":
                if let paint = ArtPaint.parse(value) { style.stroke = paint }
            case "fill-opacity":
                if let number = Self.opacity(value) { style.fillOpacity = number }
            case "stroke-opacity":
                if let number = Self.opacity(value) { style.strokeOpacity = number }
            case "fill-rule":
                if value == "evenodd" { style.evenOddFill = true } else if value == "nonzero" { style.evenOddFill = false }
            case "clip-rule":
                if value == "evenodd" { style.evenOddClip = true } else if value == "nonzero" { style.evenOddClip = false }
            case "stroke-width":
                if let number = Self.length(value), number >= 0 { style.strokeWidth = number }
            case "stroke-linecap":
                switch value {
                case "butt": style.lineCap = .butt
                case "round": style.lineCap = .round
                case "square": style.lineCap = .square
                default: break
                }
            case "stroke-linejoin":
                switch value {
                case "miter", "miter-clip": style.lineJoin = .miter
                case "round": style.lineJoin = .round
                case "bevel": style.lineJoin = .bevel
                default: break
                }
            case "stroke-miterlimit":
                if let number = Double(value), number >= 1 { style.miterLimit = number }
            case "stroke-dasharray":
                if value == "none" {
                    style.dashArray = []
                } else if let dashes = Self.dashes(value) {
                    style.dashArray = dashes
                }
            case "stroke-dashoffset":
                if let number = Self.length(value) { style.dashOffset = number }
            case "visibility":
                if value == "hidden" || value == "collapse" { style.visible = false } else if value == "visible" { style.visible = true }
            default:
                break
            }
        }
        return style
    }

    /// `0.5`, `50%`, clamped to 0…1.
    static func opacity(_ value: String) -> Double? {
        let number = value.hasSuffix("%") ? Double(value.dropLast()).map { $0 / 100 } : Double(value)
        return number.map { min(max($0, 0), 1) }
    }

    /// A plain or `px` length. Other units and percentages are not supported.
    static func length(_ value: String) -> Double? {
        let trimmed = value.hasSuffix("px") ? String(value.dropLast(2)) : value
        guard !trimmed.hasSuffix("%") else { return nil }
        var scanner = NumberScanner(trimmed)
        guard let number = scanner.number() else { return nil }
        scanner.skipWhitespace()
        return scanner.isAtEnd ? number : nil
    }

    /// A dash list, made even-length as SVG requires. Empty (solid) when every
    /// dash is zero; nil (invalid, ignored) on a negative value.
    static func dashes(_ value: String) -> [Double]? {
        let numbers = NumberScanner.numbers(in: value.replacingOccurrences(of: "px", with: ""))
        guard !numbers.isEmpty, !numbers.contains(where: { $0 < 0 }) else { return nil }
        if numbers.allSatisfy({ $0 == 0 }) { return [] }
        return numbers.count.isMultiple(of: 2) ? numbers : numbers + numbers
    }
}

/// The presentation keys read from attributes and `style`.
nonisolated enum ArtProperties {
    static let keys: Set<String> = [
        "fill", "stroke", "stroke-width", "fill-rule", "clip-rule", "stroke-linecap", "stroke-linejoin",
        "stroke-miterlimit", "stroke-dasharray", "stroke-dashoffset", "opacity", "fill-opacity",
        "stroke-opacity", "vector-effect", "visibility", "display", "clip-path",
    ]

    /// An element's declared properties: presentation attributes, overridden
    /// by declarations in its `style` attribute.
    static func declared(_ attributes: [String: String]) -> [String: String] {
        var props: [String: String] = [:]
        for (key, value) in attributes where keys.contains(key) {
            props[key] = value
        }
        if let style = attributes["style"] {
            for declaration in style.split(separator: ";") {
                guard let colon = declaration.firstIndex(of: ":") else { continue }
                let key = declaration[..<colon].trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                var value = declaration[declaration.index(after: colon)...].trimmingCharacters(in: .whitespacesAndNewlines)
                if value.lowercased().hasSuffix("!important") {
                    value = String(value.dropLast("!important".count)).trimmingCharacters(in: .whitespaces)
                }
                if keys.contains(key) { props[key] = value }
            }
        }
        return props
    }
}
