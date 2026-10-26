import FitsssCore
import FitsssUI
import SwiftUI

// Routes (`-FitsssRoute`), read once when the tab is first shown:
//
//     closet                   the grid
//     closet/archived          archived pieces
//     closet/<blockId>         a piece's detail page
//     closet/<blockId>/edit    the detail page with the edit sheet open
//     closet/add…              the grid with the add flow presented on top;
//                              the add flow reads the rest of the route itself

/// Where the closet's navigation stack can go.
enum ClosetDestination: Hashable {
    case archived
    /// `edit` opens the edit sheet once the piece is loaded (the `…/edit` route).
    case piece(id: String, edit: Bool = false)
}

/// The Closet tab: its own navigation stack, rooted at the closet grid.
///
/// The add flow lives in `AddFlowFeature`, which this module does not depend
/// on; the app hands it in as `addFlow`, a view builder that receives the
/// action that closes it.
public struct ClosetScreen: View {
    private let addFlow: (_ close: @escaping () -> Void) -> AnyView

    @State private var path: [ClosetDestination]
    @State private var isAdding: Bool

    public init(addFlow: @escaping (_ close: @escaping () -> Void) -> AnyView) {
        self.addFlow = addFlow
        let launch = Self.launchState(for: LaunchOptions.route)
        _path = State(initialValue: launch.path)
        _isAdding = State(initialValue: launch.isAdding)
    }

    public var body: some View {
        NavigationStack(path: $path) {
            ClosetGridScreen(onAdd: { isAdding = true })
                .navigationDestination(for: ClosetDestination.self) { destination in
                    switch destination {
                    case .archived:
                        ArchivedScreen()
                    case .piece(let id, let edit):
                        PieceDetailScreen(blockId: id, opensEditor: edit)
                    }
                }
        }
        // Full screen like the web's /closet/add page, so a swipe can't drop a
        // half-filled cart; the flow closes itself (cancel or saved).
        .fullScreenCover(isPresented: $isAdding) {
            addFlow { isAdding = false }
        }
    }

    static func launchState(for route: [String]) -> (path: [ClosetDestination], isAdding: Bool) {
        guard route.first == "closet", route.count > 1 else { return ([], false) }
        switch route[1] {
        case "add":
            return ([], true)
        case "archived":
            return ([.archived], false)
        case let id:
            return ([.piece(id: id, edit: route.count > 2 && route[2] == "edit")], false)
        }
    }
}

// MARK: - Shared bits

/// "1 piece", "26 pieces".
func piecesText(_ count: Int) -> String {
    "\(count.formatted()) \(count == 1 ? "piece" : "pieces")"
}

extension APIError {
    /// The message to show for a failed write: the validator's messages for
    /// invalid input, a plain sentence otherwise.
    var displayMessage: String { errorDescription ?? "Something went wrong." }
}

extension Error {
    /// The answer arrived after a sign-out, sign-in or server switch. The
    /// screen it was for is being replaced, so it is not shown as a failure.
    var isSuperseded: Bool { (self as? APIError) == .superseded }
}
