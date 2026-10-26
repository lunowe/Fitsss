import FitsssCore
import SwiftUI

/// Bridges `ColorMath` into `Color(hex:)` without making FitsssUI re-export Core.
enum ColorMathBridge {
    static func rgb(_ hex: String) -> (Double, Double, Double)? {
        ColorMath.rgb(hex).map { ($0.r, $0.g, $0.b) }
    }
}

// MARK: - Swatch

/// A garment color circle (36pt by default). Very light colors get a hairline
/// ring; selected adds a 2pt tint ring with a 2pt gap and a check mark in a
/// contrasting color.
public struct Swatch: View {
    @Environment(\.colorScheme) private var colorScheme

    private let hex: String
    private let isSelected: Bool
    private let size: CGFloat

    private var needsRing: Bool {
        colorScheme == .dark ? (ColorMath.lightness(hex) ?? 1) < 0.25 : ColorMath.isLight(hex)
    }

    public init(hex: String, isSelected: Bool = false, size: CGFloat = Metrics.swatchSize) {
        self.hex = hex
        self.isSelected = isSelected
        self.size = size
    }

    public var body: some View {
        Circle()
            .fill(Color(hex: hex))
            .overlay {
                // A visible ring where the swatch would melt into the card:
                // very light colors in light mode, very dark ones in dark mode.
                Circle().strokeBorder(Color.fitsssSeparator, lineWidth: needsRing ? 1 : 0.5)
            }
            .overlay {
                if isSelected {
                    Image(systemName: "checkmark")
                        .font(.system(size: size * 0.38, weight: .bold))
                        .foregroundStyle((ColorMath.lightness(hex) ?? 1) > 0.6 ? Color.black : Color.white)
                }
            }
            .frame(width: size, height: size)
            .padding(4)
            .overlay {
                if isSelected {
                    Circle().strokeBorder(Color.fitsssTint, lineWidth: 2)
                }
            }
            .animation(.easeOut(duration: 0.15), value: isSelected)
    }
}

/// The small inline color dot next to a tile's color line. With a
/// `secondaryHex` it splits diagonally, like the web's two-tone dot.
public struct SwatchDot: View {
    private let hex: String
    private let secondaryHex: String?
    private let size: CGFloat

    public init(hex: String, secondaryHex: String? = nil, size: CGFloat = 10) {
        self.hex = hex
        self.secondaryHex = secondaryHex
        self.size = size
    }

    public var body: some View {
        Circle()
            .fill(Color(hex: hex))
            .overlay {
                if let secondaryHex {
                    Circle().fill(Color(hex: secondaryHex)).mask(LowerRightHalf())
                }
            }
            .overlay { Circle().strokeBorder(Color.fitsssSeparator, lineWidth: 0.5) }
            .frame(width: size, height: size)
    }

    /// The triangle below the top-right to bottom-left diagonal.
    nonisolated private struct LowerRightHalf: Shape {
        func path(in rect: CGRect) -> Path {
            Path { path in
                path.move(to: CGPoint(x: rect.maxX, y: rect.minY))
                path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
                path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
                path.closeSubpath()
            }
        }
    }
}

// MARK: - Chip

/// A 34pt pill toggle: `fill` background, Subhead text; selected is ink with
/// ink-foreground text.
public struct Chip: View {
    private let title: String
    private let isSelected: Bool
    private let action: () -> Void

    public init(_ title: String, isSelected: Bool, action: @escaping () -> Void) {
        self.title = title
        self.isSelected = isSelected
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline)
                .lineLimit(1)
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
                // 34pt at the default size; grows with Dynamic Type instead of clipping.
                .frame(minHeight: Metrics.chipHeight)
                .foregroundStyle(isSelected ? Color.fitsssInkForeground : Color.fitsssLabel)
                .background(isSelected ? Color.fitsssInk : Color.fitsssFill, in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .animation(.easeOut(duration: 0.15), value: isSelected)
    }
}

/// Lays out children left to right, wrapping onto new lines: chip groups and
/// swatch rows.
public struct FlowLayout: Layout {
    public var spacing: CGFloat
    public var lineSpacing: CGFloat

    public init(spacing: CGFloat = 8, lineSpacing: CGFloat = 8) {
        self.spacing = spacing
        self.lineSpacing = lineSpacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.reduce(0) { $0 + $1.height } + lineSpacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in arrange(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y + (row.height - size.height) / 2), proposal: .unspecified)
                x += size.width + spacing
            }
            y += row.height + lineSpacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = [Row()]
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let needed = rows[rows.count - 1].indices.isEmpty ? size.width : rows[rows.count - 1].width + spacing + size.width
            if needed > width, !rows[rows.count - 1].indices.isEmpty {
                rows.append(Row())
            }
            var row = rows[rows.count - 1]
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
            rows[rows.count - 1] = row
        }
        return rows.filter { !$0.indices.isEmpty }
    }
}

// MARK: - Buttons

/// Press feedback from `DESIGN.md`: scale 0.98, opacity 0.9, 150ms ease-out.
public struct PressableStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// The primary action: full width, 50pt, ink fill, Headline. One per screen,
/// usually pinned to the bottom with `.safeAreaInset(edge: .bottom)`.
public struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Metrics.primaryButtonHeight)
            .foregroundStyle(Color.fitsssInkForeground)
            .background(Color.fitsssInk.opacity(isEnabled ? 1 : 0.3), in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// A secondary action: fill background, tint text.
public struct SecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Metrics.primaryButtonHeight)
            .foregroundStyle(Color.fitsssTint)
            .background(configuration.isPressed ? Color.fitsssFill2 : Color.fitsssFill, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

public extension ButtonStyle where Self == PrimaryButtonStyle {
    static var fitsssPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

public extension ButtonStyle where Self == SecondaryButtonStyle {
    static var fitsssSecondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}

/// A primary button pinned above the bottom safe area on the page background,
/// the native counterpart of the web's sticky `BottomBar`.
public struct BottomActionBar<Content: View>: View {
    private let content: Content

    public init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    public var body: some View {
        content
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.top, 8)
            .padding(.bottom, 8)
            .background(.bar)
            .reservesToastClearance()
    }
}
