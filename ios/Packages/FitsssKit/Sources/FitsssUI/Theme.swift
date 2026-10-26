import SwiftUI
import UIKit

/// The `DESIGN.md` tokens. The web palette was modeled on the iOS system
/// colors, so on iOS each token *is* the system color: light and dark mode,
/// increased contrast and every future appearance come for free. Use these
/// names (or the system colors they alias); never write a hex in a view except
/// a garment's own color.
public extension Color {
    /// Grouped page background (`--color-bg`).
    static let fitsssBackground = Color(uiColor: .systemGroupedBackground)
    /// Cards and grouped rows (`--color-card`).
    static let fitsssCard = Color(uiColor: .secondarySystemGroupedBackground)
    /// Nested or elevated surfaces on a card (`--color-card-2`).
    static let fitsssCard2 = Color(uiColor: .tertiarySystemGroupedBackground)
    static let fitsssLabel = Color(uiColor: .label)
    static let fitsssLabel2 = Color(uiColor: .secondaryLabel)
    static let fitsssLabel3 = Color(uiColor: .tertiaryLabel)
    static let fitsssSeparator = Color(uiColor: .separator)
    /// Secondary buttons and chips (`--color-fill`).
    static let fitsssFill = Color(uiColor: .tertiarySystemFill)
    /// Pressed fill (`--color-fill-2`).
    static let fitsssFill2 = Color(uiColor: .systemFill)
    /// Interactive text and selection. Never the primary button.
    static let fitsssTint = Color(uiColor: .systemBlue)
    /// Primary buttons: black in light mode, white in dark.
    static let fitsssInk = Color(uiColor: .label)
    /// Text on ink.
    static let fitsssInkForeground = Color(uiColor: .systemBackground)
    static let fitsssDestructive = Color(uiColor: .systemRed)
    static let fitsssSuccess = Color(uiColor: .systemGreen)

    /// A garment color from its stored hex. Unknown values render grey.
    init(hex: String) {
        if let (r, g, b) = ColorMathBridge.rgb(hex) {
            self.init(.sRGB, red: r, green: g, blue: b)
        } else {
            self.init(uiColor: .systemGray3)
        }
    }
}

/// Spacing and shape from `DESIGN.md`: a 4pt grid, 16pt page padding,
/// 12pt card radius, 24pt between grouped sections.
public enum Metrics {
    public static let pagePadding: CGFloat = 16
    public static let sectionSpacing: CGFloat = 24
    public static let cardRadius: CGFloat = 12
    public static let thumbRadius: CGFloat = 10
    public static let sheetRadius: CGFloat = 16
    public static let minTapTarget: CGFloat = 44
    public static let swatchSize: CGFloat = 36
    public static let chipHeight: CGFloat = 34
    public static let primaryButtonHeight: CGFloat = 50
}

/// Section header above a grouped list: Footnote, uppercase, secondary label.
public struct SectionHeader: View {
    private let title: String

    public init(_ title: String) { self.title = title }

    public var body: some View {
        Text(title)
            .font(.footnote)
            .textCase(.uppercase)
            .tracking(0.4)
            .foregroundStyle(Color.fitsssLabel2)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.pagePadding)
            .accessibilityAddTraits(.isHeader)
    }
}
