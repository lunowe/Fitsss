import FitsssCore
import FitsssUI
import SwiftUI

// Routes (`-FitsssRoute`), read once when the tab is first shown:
//
//     looks                    the grid of saved looks
//     looks/<lookId>           a look's detail page
//     looks/<lookId>/rename    the detail page with the rename sheet open
//     looks/inspo              the Inspo shelf
//     looks/inspo/new          the Inspo shelf with "Add a picture" open
//     looks/inspo/<inspoId>    a picture's detail page

/// Where the Looks tab's navigation stack can go.
enum LooksDestination: Hashable {
    /// `rename` opens the rename sheet once the look is loaded (the `…/rename` route).
    case look(id: String, rename: Bool = false)
    /// A saved picture, drawn by the app's `LooksInspo.detail`.
    case inspo(id: String)
}

/// The Looks tab's two shelves, as on the web's `LooksTabs`.
enum LooksShelf: Hashable {
    case saved, inspo
}

/// The Inspo half of the Looks tab. It lives in InspoFeature, which this
/// module does not depend on, so the app hands its views in (as with
/// `ClosetScreen(addFlow:)`).
public struct LooksInspo {
    /// The shelf, given the actions that open a picture (by id) and "Add a picture".
    let shelf: (_ open: @escaping (String) -> Void, _ add: @escaping () -> Void) -> AnyView
    /// A picture's detail page, pushed on this tab's stack.
    let detail: (_ id: String) -> AnyView
    /// "Add a picture", presented as a sheet. `close` dismisses it; `added`
    /// takes the new picture's id (the tab closes the sheet and opens it).
    let add: (_ close: @escaping () -> Void, _ added: @escaping (String) -> Void) -> AnyView

    public init(
        shelf: @escaping (_ open: @escaping (String) -> Void, _ add: @escaping () -> Void) -> AnyView,
        detail: @escaping (_ id: String) -> AnyView,
        add: @escaping (_ close: @escaping () -> Void, _ added: @escaping (String) -> Void) -> AnyView
    ) {
        self.shelf = shelf
        self.detail = detail
        self.add = add
    }
}

/// The Looks tab (the web's `/looks`): its own navigation stack, rooted at
/// two shelves under one large title, Saved (the looks you kept) and Inspo
/// (the pictures you brought), switched by a segmented control.
public struct LooksScreen: View {
    private let inspo: LooksInspo

    @State private var path: [LooksDestination]
    @State private var shelf: LooksShelf
    @State private var isAddingInspo: Bool

    public init(inspo: LooksInspo) {
        self.inspo = inspo
        let launch = Self.launchState(for: LaunchOptions.route)
        _path = State(initialValue: launch.path)
        _shelf = State(initialValue: launch.shelf)
        _isAddingInspo = State(initialValue: launch.addsInspo)
    }

    public var body: some View {
        NavigationStack(path: $path) {
            LooksRootScreen(
                shelf: $shelf,
                inspoShelf: inspo.shelf(
                    { id in path.append(.inspo(id: id)) },
                    { isAddingInspo = true }
                ),
                onAddInspo: { isAddingInspo = true }
            )
            .navigationDestination(for: LooksDestination.self) { destination in
                switch destination {
                case .look(let id, let rename):
                    LookDetailScreen(lookId: id, opensRename: rename)
                case .inspo(let id):
                    inspo.detail(id)
                }
            }
        }
        .sheet(isPresented: $isAddingInspo) {
            inspo.add(
                { isAddingInspo = false },
                { id in
                    isAddingInspo = false
                    shelf = .inspo
                    path.append(.inspo(id: id))
                }
            )
        }
    }

    static func launchState(for route: [String]) -> (shelf: LooksShelf, path: [LooksDestination], addsInspo: Bool) {
        guard route.first == "looks", route.count > 1 else { return (.saved, [], false) }
        if route[1] == "inspo" {
            guard route.count > 2 else { return (.inspo, [], false) }
            return route[2] == "new" ? (.inspo, [], true) : (.inspo, [.inspo(id: route[2])], false)
        }
        return (.saved, [.look(id: route[1], rename: route.count > 2 && route[2] == "rename")], false)
    }
}

/// The tab's root: the large title with the shelf's count, the Saved | Inspo
/// control pinned under it, and the shelf. "+" adds a picture on Inspo.
private struct LooksRootScreen: View {
    @Binding var shelf: LooksShelf
    let inspoShelf: AnyView
    let onAddInspo: () -> Void

    @Environment(LooksStore.self) private var looks
    @Environment(ClosetStore.self) private var closet
    @Environment(InspoStore.self) private var inspos

    var body: some View {
        Group {
            switch shelf {
            case .saved: LooksGridScreen()
            case .inspo: inspoShelf
            }
        }
        .background(Color.fitsssBackground)
        .navigationTitle("Looks")
        .navigationSubtitle(subtitle)
        .safeAreaBar(edge: .top, spacing: 0) {
            Picker("Shelf", selection: $shelf) {
                Text("Saved").tag(LooksShelf.saved)
                Text("Inspo").tag(LooksShelf.inspo)
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.top, 4)
            .padding(.bottom, 8)
            .accessibilityLabel("Looks or inspo")
            .accessibilityIdentifier("looks.shelf")
        }
        .toolbar {
            if shelf == .inspo {
                ToolbarItem(placement: .primaryAction) {
                    Button("Add a picture", systemImage: "plus", action: onAddInspo)
                        .accessibilityIdentifier("inspo.add")
                }
            }
        }
    }

    private var subtitle: String {
        switch shelf {
        case .saved:
            return LooksGridScreen.subtitle(looks: looks, closet: closet)
        case .inspo:
            guard inspos.phase == .loaded || !inspos.inspos.isEmpty else { return "" }
            let count = inspos.inspos.count
            return "\(count.formatted()) \(count == 1 ? "picture" : "pictures")"
        }
    }
}

// MARK: - Shared bits

/// Every piece a look can show: the closet's active pieces and the archived
/// ones, since a saved look keeps rendering after a piece leaves the closet.
extension ClosetStore {
    var lookPieces: [Block] { blocks + archived }
}

/// `OutfitFlatLay` in a square well as wide as it is offered. On its own its
/// well is only as wide and tall as the drawings wherever the height is open
/// (a grid cell, a list row), so a filled square of the same `card-2` sets the
/// shape and the flat lay sits centered on it.
struct SquareFlatLay: View {
    let slots: OutfitSlots
    let pieces: [Block]
    let size: OutfitFlatLay.Size

    var body: some View {
        RoundedRectangle(cornerRadius: Metrics.thumbRadius)
            .fill(Color.fitsssCard2)
            .aspectRatio(1, contentMode: .fit)
            .overlay { OutfitFlatLay(slots: slots, blocks: pieces, size: size) }
            .accessibilityElement(children: .combine)
    }
}

/// The quiet line under a look: "Everyday · Clean minimal · 21°". The style
/// name comes from the user's styles; a deleted style is simply left out.
@MainActor
func lookMeta(_ look: Look, catalog: Catalog?, styles: StylesStore) -> String {
    let styleName = look.styleId.flatMap { styles.style($0)?.name }
    if let catalog {
        return catalog.outfitMeta(occasion: look.occasion, styleName: styleName, weather: look.weather)
    }
    // No catalog yet: everything but the occasion label.
    return [styleName, look.weather.map(\.temperatureText)]
        .compactMap { $0 }
        .joined(separator: " · ")
}

/// "Worn 3×", or "Not yet", trailing the "Wore this today" row as on the web.
func wornLabel(_ count: Int) -> String {
    count == 0 ? "Not yet" : "Worn \(count.formatted())×"
}

/// "2 September", the web's last-worn date.
func lastWornText(_ date: Date) -> String {
    date.formatted(.dateTime.day().month(.wide))
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
