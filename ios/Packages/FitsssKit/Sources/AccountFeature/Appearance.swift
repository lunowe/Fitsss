import SwiftUI

/// System / Light / Dark, like the web's `AppearanceControl`. Stored in user
/// defaults (the web keeps it in localStorage) and applied once at the root
/// with `.appearancePreference()`, so every screen, sheet and dialog follows.
public enum AppearancePreference: String, CaseIterable, Identifiable, Sendable {
    case system, light, dark

    /// The `@AppStorage` key. Read it through `.appearancePreference()`.
    public static let storageKey = "fitsss.appearance"

    public var id: Self { self }

    public var label: String {
        switch self {
        case .system: "System"
        case .light: "Light"
        case .dark: "Dark"
        }
    }

    /// nil follows the system setting.
    public var colorScheme: ColorScheme? {
        switch self {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }
}

public extension View {
    /// Applies the stored appearance preference. Use once, at the app's root.
    func appearancePreference() -> some View {
        modifier(AppearancePreferenceModifier())
    }
}

private struct AppearancePreferenceModifier: ViewModifier {
    @AppStorage(AppearancePreference.storageKey) private var preference: AppearancePreference = .system

    func body(content: Content) -> some View {
        content.preferredColorScheme(preference.colorScheme)
    }
}
