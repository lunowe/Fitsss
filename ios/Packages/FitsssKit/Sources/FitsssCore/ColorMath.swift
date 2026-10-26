import Foundation

/// Hex color helpers, ported from `src/domain/colors.ts`. The server
/// re-validates every color it is sent; these exist so the custom color
/// picker can build a valid `BlockColor` and swatches can pick a border.
nonisolated public enum ColorMath {
    /// `"#AbC123"` or `"abc123"` -> `"#abc123"`; nil for anything else.
    public static func normalizeHex(_ hex: String) -> String? {
        var raw = hex.trimmingCharacters(in: .whitespaces).lowercased()
        if raw.hasPrefix("#") { raw.removeFirst() }
        // ASCII only: `isHexDigit` also accepts full-width digits, which the server rejects.
        guard raw.count == 6, raw.allSatisfy({ $0.isASCII && $0.isHexDigit }) else { return nil }
        return "#" + raw
    }

    /// `(r, g, b)` in 0...1, or nil when not a 6-digit hex.
    public static func rgb(_ hex: String) -> (r: Double, g: Double, b: Double)? {
        guard let normalized = normalizeHex(hex), let value = UInt32(normalized.dropFirst(), radix: 16) else { return nil }
        return (Double((value >> 16) & 0xff) / 255, Double((value >> 8) & 0xff) / 255, Double(value & 0xff) / 255)
    }

    /// Perceived lightness 0...1 (Rec. 601 luma), nil when not a hex.
    public static func lightness(_ hex: String) -> Double? {
        guard let (r, g, b) = rgb(hex) else { return nil }
        return 0.299 * r + 0.587 * g + 0.114 * b
    }

    /// Very light colors, whose swatches need a visible border.
    public static func isLight(_ hex: String) -> Bool { (lightness(hex) ?? 0) > 0.82 }

    /// Rough color family for a custom color. Same thresholds as the web.
    public static func family(forHex hex: String) -> String {
        guard let (r, g, b) = rgb(hex) else { return "neutral" }
        let maxValue = max(r, g, b), minValue = min(r, g, b)
        let delta = maxValue - minValue
        let l = (maxValue + minValue) / 2
        let s = delta == 0 ? 0 : delta / (1 - abs(2 * l - 1))
        if s < 0.12 { return "neutral" }
        var h = 0.0
        if delta != 0 {
            if maxValue == r {
                h = ((g - b) / delta).truncatingRemainder(dividingBy: 6)
            } else if maxValue == g {
                h = (b - r) / delta + 2
            } else {
                h = (r - g) / delta + 4
            }
            h *= 60
            if h < 0 { h += 360 }
        }
        if h < 15 || h >= 340 { return l > 0.75 ? "pink" : "red" }
        if h < 45 { return s < 0.5 || l < 0.45 ? "brown" : "red" }
        if h < 70 { return l < 0.4 ? "green" : "yellow" }
        if h < 170 { return "green" }
        if h < 260 { return "blue" }
        if h < 300 { return "purple" }
        return "pink"
    }

    /// A user-entered color, or nil when the hex is not valid.
    public static func customColor(name: String, hex: String) -> BlockColor? {
        guard let normalized = normalizeHex(hex) else { return nil }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return BlockColor(name: trimmed.isEmpty ? "Custom" : trimmed.prefix(serverLimit: 40), hex: normalized, family: family(forHex: normalized))
    }
}
