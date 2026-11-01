import AccountFeature
import AddFlowFeature
import ClosetFeature
import FitsssCore
import FitsssUI
import InspoFeature
import LooksFeature
import ShareFeature
import StylesFeature
import SwiftUI
import TasteFeature
import TodayFeature
import TripsFeature

/// Signed out: the sign-in screen. Signed in: the tabs.
struct RootView: View {
    @Environment(SessionStore.self) private var session
    @Environment(CatalogStore.self) private var catalog
    @Environment(ClosetStore.self) private var closet
    @Environment(StylesStore.self) private var styles
    @Environment(LooksStore.self) private var looks
    @Environment(OutfitsStore.self) private var outfits
    @Environment(InspoStore.self) private var inspos
    @Environment(TasteStore.self) private var taste
    @Environment(LLMSettingsStore.self) private var llm
    @Environment(TripsStore.self) private var trips
    @Environment(TodayIntents.self) private var todayIntents
    @Environment(\.scenePhase) private var scenePhase

    /// Held here rather than in `MainTabs`, which is rebuilt on every server
    /// switch: switching from the You tab lands back on the You tab.
    @State private var tab: AppTab = AppTab.initial

    var body: some View {
        Group {
            switch session.state {
            case .restoring:
                SessionRestoringView(server: session.api.baseURL)
            case .signedOut:
                SignInScreen()
            case .signedIn(let user) where LaunchOptions.route.first == "dev":
                // Debug galleries, e.g. `-FitsssRoute dev/art`; `dev/share…`
                // is the share extension's sheet (see `ShareSheetDemo`).
                Group {
                    if LaunchOptions.route.dropFirst().first == "share" {
                        ShareSheetDemo(route: LaunchOptions.route)
                    } else {
                        NavigationStack { ArtGallery() }
                    }
                }
                    .task {
                        catalog.activate(userId: user.id)
                        await catalog.load()
                    }
            case .signedIn(let user):
                MainTabs(tab: $tab)
                    // Re-keyed per user and server, so switching either starts clean.
                    .id("\(user.id)@\(session.api.baseURL.absoluteString)")
                    .task {
                        // The catalog is per user: show this user's cached copy, never the last one's.
                        catalog.activate(userId: user.id)
                        async let catalogLoad: Void = catalog.load()
                        async let closetLoad: Void = closet.load()
                        async let stylesLoad: Void = styles.load()
                        async let looksLoad: Void = looks.load()
                        async let latestLoad: Void = outfits.loadLatest()
                        async let insposLoad: Void = inspos.load()
                        async let tasteLoad: Void = taste.load()
                        async let llmLoad: Void = llm.load()
                        async let tripsLoad: Void = trips.load()
                        _ = await (catalogLoad, closetLoad, stylesLoad, looksLoad, latestLoad, insposLoad, tasteLoad, llmLoad, tripsLoad)
                    }
            }
        }
        .task { await session.restore() }
        // Pictures shared to Fitsss (the share extension) while it was away.
        .onChange(of: scenePhase) { _, phase in
            if phase == .active, case .signedIn = session.state { Task { await inspos.load() } }
        }
        .onChange(of: todayIntents.openRequests) { tab = .today }
        // Today's "Add pieces" (empty closet, too few pieces for the weather).
        .onChange(of: todayIntents.closetRequests) { tab = .closet }
        .onChange(of: session.state) { _, state in
            switch state {
            case .signedOut:
                // Sign-out, a revoked token, or nothing to restore on a new
                // server: nothing of the last account may linger.
                resetStores()
                tab = .today
            case .restoring:
                // A server switch (launch starts here without a change): the
                // data belongs to the old server, and the catalog reloads the
                // new server's cached copy.
                resetStores()
            case .signedIn:
                break
            }
        }
    }

    private func resetStores() {
        closet.reset()
        catalog.reset()
        styles.reset()
        looks.reset()
        outfits.reset()
        inspos.reset()
        taste.reset()
        llm.reset()
        trips.reset()
        // Packing outcomes and pending packs belong to the old session.
        TripPacker.shared.reset()
        todayIntents.reset()
    }
}

/// The tabs, in order, like the web's tab bar.
enum AppTab: String, Hashable {
    case today, closet, looks, styles, you

    /// `-FitsssTab you`, or the first segment of `-FitsssRoute you/server`.
    static var initial: AppTab {
        LaunchOptions.tab.flatMap(AppTab.init(rawValue:))
            ?? LaunchOptions.route.first.flatMap(AppTab.init(rawValue:))
            ?? .today
    }
}

struct MainTabs: View {
    @Binding var tab: AppTab

    var body: some View {
        TabView(selection: $tab) {
            Tab("Today", systemImage: "sun.max", value: AppTab.today) {
                // "Restyle a picture": add one, then style it, in a sheet.
                // "Plan a trip": plan one, then watch it packed, in a sheet.
                TodayScreen(
                    restylePicture: { close in AnyView(AddInspoSheet(onClose: close)) },
                    planTrip: { close in AnyView(PlanTripSheet(onClose: close)) }
                )
            }
            Tab("Closet", systemImage: "tshirt", value: AppTab.closet) {
                ClosetScreen(addFlow: { close in AnyView(AddFlowView(onClose: close)) })
            }
            Tab("Looks", systemImage: "square.grid.2x2", value: AppTab.looks) {
                LooksScreen(
                    inspo: LooksInspo(
                        shelf: { open, add in AnyView(InspoShelf(onOpen: open, onAdd: add)) },
                        detail: { id in AnyView(InspoDetailScreen(inspoId: id)) },
                        add: { close, added in AnyView(AddInspoSheet(onClose: close, onAdded: added)) }
                    ),
                    trips: LooksTrips(
                        shelf: { open, plan in AnyView(TripsShelf(onOpen: open, onPlan: plan)) },
                        detail: { id in AnyView(TripDetailScreen(tripId: id)) },
                        plan: { close, created in AnyView(PlanTripSheet(onClose: close, onCreated: created)) }
                    )
                )
            }
            Tab("Styles", systemImage: "bookmark", value: AppTab.styles) {
                StylesScreen()
            }
            Tab("You", systemImage: "person.crop.circle", value: AppTab.you) {
                YouScreen(taste: { AnyView(TasteScreen()) })
            }
        }
    }
}
