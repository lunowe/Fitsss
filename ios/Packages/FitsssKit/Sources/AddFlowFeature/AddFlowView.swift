import FitsssCore
import FitsssUI
import SwiftUI

/// The cart-style add flow: category -> type -> configurator, with a cart
/// that saves everything in one batch. Presented modally by the Closet tab;
/// owns its own navigation stack. Calls `onClose` when the user closes it
/// (the cart is kept) or after a successful save.
///
/// The native port of `src/app/(app)/closet/add/**` and
/// `src/components/closet/add/*`.
///
/// Routes (`-FitsssRoute`, applied the first time the flow opens after launch):
///
///     closet/add                          categories
///     closet/add/<categoryId>             the types filed under a category
///     closet/add/<categoryId>/<typeId>    the configurator for a type
///     closet/add/cart                     categories, with the cart sheet open
///
/// The Closet tab presents the flow on launch when the route starts with
/// `closet/add`.
public struct AddFlowView: View {
    @Environment(SessionStore.self) private var session
    private let onClose: () -> Void

    public init(onClose: @escaping () -> Void) {
        self.onClose = onClose
    }

    public var body: some View {
        AddFlow(storageKey: storageKey, onClose: onClose)
            // A different user or server gets their own cart.
            .id(storageKey)
    }

    private var storageKey: String? {
        session.user.map { CartStore.storageKey(server: session.api.baseURL, userId: $0.id) }
    }
}

/// A step in the flow's navigation stack.
enum AddRoute: Hashable {
    case category(String)
    case type(categoryId: String, typeId: String)
}

/// `-FitsssRoute closet/add/...`, parsed once per launch.
enum LaunchRoute {
    /// Set once a flow has opened, so closing and reopening starts at the root.
    private static var consumed = false

    static var pending: (path: [AddRoute], opensCart: Bool) {
        let route = LaunchOptions.route
        guard !consumed, route.count >= 2, route[0] == "closet", route[1] == "add" else { return ([], false) }
        let rest = Array(route.dropFirst(2))
        if rest.first == "cart" { return ([], true) }
        var path: [AddRoute] = []
        if let category = rest.first { path.append(.category(category)) }
        if rest.count >= 2 { path.append(.type(categoryId: rest[0], typeId: rest[1])) }
        return (path, false)
    }

    static func consume() { consumed = true }
}

struct AddFlow: View {
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ClosetStore.self) private var closet
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var cart: CartStore
    @State private var path: [AddRoute]
    @State private var showsCart: Bool
    /// The configurator's pinned bar, measured, so the pill can sit above it.
    @State private var bottomBarHeight: CGFloat = 96

    private let onClose: () -> Void

    init(storageKey: String?, onClose: @escaping () -> Void) {
        self.onClose = onClose
        let launch = LaunchRoute.pending
        let cart = CartStore(storageKey: storageKey)
        _cart = State(initialValue: cart)
        _path = State(initialValue: launch.path)
        // `closet/add/cart` with nothing in it just opens the categories.
        _showsCart = State(initialValue: launch.opensCart && !cart.isCompletelyEmpty)
    }

    var body: some View {
        NavigationStack(path: $path) {
            CategoryListScreen(onClose: onClose)
                .navigationDestination(for: AddRoute.self) { route in
                    switch route {
                    case .category(let id):
                        TypeGridScreen(categoryId: id)
                    case .type(let categoryId, let typeId):
                        ConfiguratorScreen(
                            categoryId: categoryId,
                            typeId: typeId,
                            onAdded: { added(categoryId: categoryId) },
                            onBarHeight: { height in if height > 0 { bottomBarHeight = height } }
                        )
                    }
                }
        }
        .overlay(alignment: .bottomTrailing) {
            if !cart.isCompletelyEmpty {
                CartPill(count: cart.totalCount) { showsCart = true }
                    .reservesToastClearance()
                    .padding(.trailing, Metrics.pagePadding)
                    .padding(.bottom, isOnConfigurator ? bottomBarHeight + 8 : 8)
                    .transition(reduceMotion ? .opacity : .scale(scale: 0.9).combined(with: .opacity))
            }
        }
        .animation(.easeOut(duration: 0.2), value: cart.isCompletelyEmpty)
        .animation(.easeOut(duration: 0.2), value: isOnConfigurator)
        .sensoryFeedback(.success, trigger: cart.addCount)
        .sheet(isPresented: $showsCart) {
            CartSheet(onSaved: onClose)
                .environment(cart)
                .toastHost(toasts)
        }
        .onChange(of: cart.isCompletelyEmpty) { _, isEmpty in
            // Like the web: the sheet only stays open while there is something
            // in it. A save moving the cart into its pending batch doesn't count.
            if isEmpty { showsCart = false }
        }
        .environment(cart)
        .toastHost(toasts)
        .onAppear { LaunchRoute.consume() }
        .task(id: PruneTrigger(version: catalogStore.catalog?.version, confirmed: catalogStore.isRevalidated)) {
            // Only a catalog the server just confirmed may drop lines: the
            // cached copy can be stale (or, before this session, someone else's).
            if catalogStore.isRevalidated, let catalog = catalogStore.catalog { cart.prune(using: catalog) }
        }
        .task {
            // The last save never got its answer (connection dropped, app
            // killed): finish it now. Resending is safe; the server replays
            // the first result for the same key.
            guard cart.pendingSave != nil else { return }
            let outcome = await cart.save(onlyPending: true) { inputs, key in
                try await closet.create(inputs, idempotencyKey: key)
            }
            switch outcome {
            case .saved(let added, let rejected) where added > 0:
                toasts.show(rejected == 0
                    ? "Finished your last save: \(plural(added, "piece")) added"
                    : "Finished your last save: \(plural(added, "piece")) added, \(rejected) back in the cart")
            case .refused(let message):
                toasts.show(message, isError: true)
            default:
                break
            }
        }
    }

    private var isOnConfigurator: Bool {
        if case .type = path.last { true } else { false }
    }

    /// After "Add to cart": back to the type grid, like the web's `router.back()`,
    /// so the next type is one tap away.
    private func added(categoryId: String) {
        if path.count >= 2 {
            path.removeLast()
        } else {
            path = [.category(categoryId)]
        }
    }
}

extension View {
    /// Room at the end of a scrolling screen so the floating pill never
    /// covers the last row.
    func cartPillClearance(_ cart: CartStore) -> some View {
        contentMargins(.bottom, cart.isCompletelyEmpty ? 0 : 64, for: .scrollContent)
    }
}

private struct PruneTrigger: Equatable {
    var version: String?
    var confirmed: Bool
}
