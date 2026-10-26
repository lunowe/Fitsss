import FitsssCore
import FitsssUI
import SwiftUI

/// The web's `RowIcon`: a small rounded square in `fill` with an ink glyph,
/// leading a grouped row. Use as a `Label` icon so the separator lines up
/// with the title.
struct RowIcon: View {
    let systemName: String
    @ScaledMetric(relativeTo: .body) private var scaled: CGFloat = 28
    /// Grows with Dynamic Type, but like Settings' icons stops well before
    /// the text does.
    private var size: CGFloat { min(scaled, 40) }

    init(_ systemName: String) { self.systemName = systemName }

    var body: some View {
        Image(systemName: systemName)
            .font(.system(size: size * 0.54, weight: .medium))
            .foregroundStyle(Color.fitsssLabel)
            .frame(width: size, height: size)
            .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .accessibilityHidden(true)
    }
}

/// Name, email and role at the top of the You tab. One line each, side by
/// side; at accessibility text sizes everything stacks and wraps instead of
/// truncating.
struct AccountRow: View {
    let user: User
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .title3) private var scaledAvatar: CGFloat = 48

    private var isStacked: Bool { dynamicTypeSize.isAccessibilitySize }
    private var avatar: CGFloat { min(scaledAvatar, 72) }

    var body: some View {
        let layout = isStacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10))
            : AnyLayout(HStackLayout(spacing: 12))
        layout {
            Text(initials)
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.fitsssLabel2)
                .frame(width: avatar, height: avatar)
                .background(Color.fitsssFill, in: Circle())
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(user.name.isEmpty ? "Signed in" : user.name)
                    .font(.headline)
                    .foregroundStyle(Color.fitsssLabel)
                Text(user.email)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
                    .textSelection(.enabled)
            }
            .lineLimit(isStacked ? nil : 1)
            .truncationMode(.middle)

            if !isStacked { Spacer(minLength: 8) }

            if user.isAdmin {
                Text("Admin")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.fitsssFill, in: Capsule())
                    .fixedSize()
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }

    /// Up to two initials from the name, else the email's first letter.
    private var initials: String {
        let words = user.name.split(whereSeparator: \.isWhitespace)
        let letters = words.prefix(2).compactMap(\.first).map(String.init).joined()
        return (letters.isEmpty ? user.email.first.map(String.init) ?? "?" : letters).uppercased()
    }
}

/// `0.1 (1)` from the app bundle.
enum AppVersion {
    static var display: String {
        let info = Bundle.main.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "–"
        guard let build = info?["CFBundleVersion"] as? String, build != version else { return version }
        return "\(version) (\(build))"
    }
}
