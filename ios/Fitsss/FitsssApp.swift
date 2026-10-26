import AccountFeature
import AddFlowFeature
import ClosetFeature
import FitsssCore
import InspoFeature
import LooksFeature
import StylesFeature
import TasteFeature
import TodayFeature
import FitsssUI
import SwiftUI

@main
struct FitsssApp: App {
    @State private var app = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app.session)
                .environment(app.catalog)
                .environment(app.closet)
                .environment(app.styles)
                .environment(app.looks)
                .environment(app.outfits)
                .environment(app.inspos)
                .environment(app.taste)
                .environment(app.llm)
                .environment(app.todayIntents)
                .toastHost(app.toasts, baseInset: 64)
                // System / Light / Dark from the You tab, for the whole window.
                .appearancePreference()
        }
    }
}

/// The stores, created once and shared through the environment. One API
/// client underneath, so a 401 anywhere signs the whole app out.
@MainActor
@Observable
final class AppModel {
    let api: APIClient
    let session: SessionStore
    let catalog: CatalogStore
    let closet: ClosetStore
    let styles: StylesStore
    let looks: LooksStore
    let outfits: OutfitsStore
    let inspos: InspoStore
    let taste: TasteStore
    let llm: LLMSettingsStore
    let todayIntents = TodayIntents()
    let toasts = ToastCenter()

    init() {
        let api = APIClient()
        self.api = api
        self.session = SessionStore(api: api)
        self.catalog = CatalogStore(api: api)
        self.closet = ClosetStore(api: api)
        self.styles = StylesStore(api: api)
        self.looks = LooksStore(api: api)
        self.outfits = OutfitsStore(api: api)
        self.inspos = InspoStore(api: api)
        self.taste = TasteStore(api: api)
        self.llm = LLMSettingsStore(api: api)
    }
}
