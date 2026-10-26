import Foundation

/// Reads SVG numbers out of attribute text: path data, point lists,
/// transforms, dash arrays, viewBoxes.
///
/// Follows the SVG number grammar, including the compact forms exporters
/// write: `1.5.5` is `1.5 .5`, `-.3-.4` is `-.3 -.4`, `1e-3` is an exponent.
nonisolated struct NumberScanner {
    private let bytes: [UInt8]
    private(set) var index = 0

    init(_ text: String) {
        bytes = Array(text.utf8)
    }

    var isAtEnd: Bool { index >= bytes.count }

    /// The next byte, without consuming it.
    var peek: UInt8? { index < bytes.count ? bytes[index] : nil }

    mutating func advance() { index += 1 }

    /// Skips whitespace.
    mutating func skipWhitespace() {
        while index < bytes.count, Self.isWhitespace(bytes[index]) { index += 1 }
    }

    /// Skips the `comma-wsp` between two numbers: whitespace with at most one comma.
    mutating func skipSeparator() {
        skipWhitespace()
        if index < bytes.count, bytes[index] == UInt8(ascii: ",") {
            index += 1
            skipWhitespace()
        }
    }

    /// Skips any run of whitespace and commas.
    mutating func skipWhitespaceAndCommas() {
        while index < bytes.count, Self.isWhitespace(bytes[index]) || bytes[index] == UInt8(ascii: ",") {
            index += 1
        }
    }

    /// True if a number starts at the current position.
    var atNumber: Bool {
        guard let byte = peek else { return false }
        return Self.isDigit(byte) || byte == UInt8(ascii: ".") || byte == UInt8(ascii: "-") || byte == UInt8(ascii: "+")
    }

    /// Reads a number after skipping a leading separator; nil (and nothing
    /// consumed but the separator) when there is none.
    mutating func number() -> Double? {
        skipSeparator()
        return rawNumber()
    }

    /// Reads a number at the current position, without skipping anything.
    mutating func rawNumber() -> Double? {
        let start = index
        var i = index
        var negative = false
        if i < bytes.count, bytes[i] == UInt8(ascii: "-") || bytes[i] == UInt8(ascii: "+") {
            negative = bytes[i] == UInt8(ascii: "-")
            i += 1
        }
        var mantissa: UInt64 = 0
        var significant = 0
        var exponent = 0
        var digits = 0
        var exact = true
        while i < bytes.count, Self.isDigit(bytes[i]) {
            Self.accumulate(bytes[i], into: &mantissa, significant: &significant, exponent: &exponent, exact: &exact, fraction: false)
            digits += 1
            i += 1
        }
        if i < bytes.count, bytes[i] == UInt8(ascii: ".") {
            var j = i + 1
            var fractionDigits = 0
            while j < bytes.count, Self.isDigit(bytes[j]) {
                Self.accumulate(bytes[j], into: &mantissa, significant: &significant, exponent: &exponent, exact: &exact, fraction: true)
                fractionDigits += 1
                j += 1
            }
            // "1." is a number; "." alone is not.
            if digits > 0 || fractionDigits > 0 {
                digits += fractionDigits
                i = j
            }
        }
        guard digits > 0 else {
            index = start
            return nil
        }
        // An exponent only counts when digits follow it.
        if i < bytes.count, bytes[i] == UInt8(ascii: "e") || bytes[i] == UInt8(ascii: "E") {
            var j = i + 1
            var expNegative = false
            if j < bytes.count, bytes[j] == UInt8(ascii: "-") || bytes[j] == UInt8(ascii: "+") {
                expNegative = bytes[j] == UInt8(ascii: "-")
                j += 1
            }
            if j < bytes.count, Self.isDigit(bytes[j]) {
                var value = 0
                while j < bytes.count, Self.isDigit(bytes[j]) {
                    if value < 10_000 { value = value * 10 + Int(bytes[j] - UInt8(ascii: "0")) }
                    j += 1
                }
                exponent += expNegative ? -value : value
                i = j
            }
        }
        index = i

        let result: Double
        if exact, mantissa < (1 << 53), abs(exponent) <= 22 {
            // One correctly rounded operation on two exact values.
            let m = Double(mantissa)
            result = exponent < 0 ? m / Self.powersOfTen[-exponent] : m * Self.powersOfTen[exponent]
        } else {
            let text = String(decoding: bytes[start..<i], as: UTF8.self)
            guard let parsed = Double(text) else { return nil }
            return parsed.isFinite ? parsed : nil
        }
        return negative ? -result : result
    }

    /// Reads an arc flag: a single `0` or `1`, which may be followed directly
    /// by the next number (`a1 1 0 011 1`).
    mutating func flag() -> Bool? {
        skipSeparator()
        guard let byte = peek else { return nil }
        if byte == UInt8(ascii: "0") { index += 1; return false }
        if byte == UInt8(ascii: "1") { index += 1; return true }
        return nil
    }

    /// Reads an identifier (letters and dashes), e.g. a transform function name.
    mutating func identifier() -> String? {
        let start = index
        while index < bytes.count, Self.isLetter(bytes[index]) || bytes[index] == UInt8(ascii: "-") { index += 1 }
        guard index > start else { return nil }
        return String(decoding: bytes[start..<index], as: UTF8.self)
    }

    /// Consumes `byte` if it is next.
    mutating func consume(_ byte: UInt8) -> Bool {
        guard peek == byte else { return false }
        index += 1
        return true
    }

    /// All numbers in a list such as `points` or `stroke-dasharray`. Stops at
    /// the first thing that is not a number.
    static func numbers(in text: String) -> [Double] {
        var scanner = NumberScanner(text)
        var out: [Double] = []
        while let value = scanner.number() {
            out.append(value)
        }
        return out
    }

    // MARK: - Helpers

    private static func accumulate(
        _ byte: UInt8, into mantissa: inout UInt64, significant: inout Int, exponent: inout Int, exact: inout Bool, fraction: Bool
    ) {
        let digit = UInt64(byte - UInt8(ascii: "0"))
        if significant < 18 {
            if mantissa != 0 || digit != 0 { significant += 1 }
            mantissa = mantissa * 10 + digit
            if fraction { exponent -= 1 }
        } else {
            // Too many digits for the fast path; fall back to the full parser.
            exact = false
            if !fraction { exponent += 1 }
        }
    }

    static func isWhitespace(_ byte: UInt8) -> Bool {
        byte == 0x20 || byte == 0x09 || byte == 0x0A || byte == 0x0D || byte == 0x0C
    }

    static func isDigit(_ byte: UInt8) -> Bool { byte >= 0x30 && byte <= 0x39 }

    static func isLetter(_ byte: UInt8) -> Bool {
        (byte >= 0x41 && byte <= 0x5A) || (byte >= 0x61 && byte <= 0x7A)
    }

    /// 10^0 … 10^22, all exactly representable.
    private static let powersOfTen: [Double] = {
        var out: [Double] = [1]
        for _ in 1...22 { out.append(out[out.count - 1] * 10) }
        return out
    }()
}
