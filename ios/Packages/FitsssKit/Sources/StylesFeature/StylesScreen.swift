import FitsssCore
import FitsssUI
import SwiftUI

// Routes (`-FitsssRoute`), read once when the tab is first shown:
//
//     styles               the list
//     styles/new           the list with the new-style sheet open
//     styles/<styleId>     the list with that style's edit sheet open

/// The Styles tab (the web's `/styles` and `StylesManager`): its own
/// navigation stack, rooted at the user's styles in their order.
public struct StylesScreen: View {
    private let launchEditor: StyleEditorLaunch?

    public init() {
        launchEditor = StyleEditorLaunch(route: LaunchOptions.route)
    }

    public var body: some View {
        NavigationStack {
            StylesListScreen(launchEditor: launchEditor)
        }
    }
}

/// The sheet a launch route opens.
enum StyleEditorLaunch: Equatable {
    case new
    case style(id: String)

    init?(route: [String]) {
        guard route.first == "styles", route.count > 1 else { return nil }
        self = route[1] == "new" ? .new : .style(id: route[1])
    }
}

/// What the editor sheet is open for.
enum StyleEditorTarget: Identifiable {
    case new
    case edit(Style)

    var id: String {
        switch self {
        case .new: "new"
        case .edit(let style): style.id
        }
    }
}

// MARK: - Shared bits

/// `MAX_STYLE_NAME` and `MAX_STYLE_TEXT` in `src/server/styles-validate.ts`.
enum StyleLimits {
    static let name = 40
    static let text = 600
}

extension Style {
    /// The description's first line, which is what the row shows.
    var summary: String {
        description.split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: false)
            .first.map { $0.trimmingCharacters(in: .whitespaces) } ?? ""
    }
}

extension Error {
    /// The answer arrived after a sign-out, sign-in or server switch. The
    /// screen it was for is being replaced, so it is not shown as a failure.
    var isSuperseded: Bool { (self as? APIError) == .superseded }
}

extension APIError {
    /// The validator's messages for invalid input, a plain sentence otherwise.
    var displayMessage: String { errorDescription ?? "Something went wrong." }
}
