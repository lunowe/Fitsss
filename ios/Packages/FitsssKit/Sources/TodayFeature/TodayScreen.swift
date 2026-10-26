import FitsssCore
import FitsssUI
import SwiftUI

// Routes (`-FitsssRoute`), read once when the tab is first shown:
//
//     today            the screen (the default tab)
//     today/weather    the manual weather sheet, open
//     today/results    scrolled to the outfits (the last set, once loaded)
//
// "Style this piece" in the Closet is not a route: it sets
// `TodayIntents.pinnedBlockId` and the app switches to this tab.

/// The Today tab: weather, style, occasion and mood in; three outfits out.
/// The native `src/app/(app)/today/page.tsx` and `TodayScreen.tsx`.
///
/// "Restyle a picture" (adding an inspiration picture and styling it from
/// the closet) lives in InspoFeature, which this module does not depend on:
/// the app hands it in as `restylePicture`, a sheet's content that receives
/// the action that closes it. Without it the row is left out.
public struct TodayScreen: View {
    @State private var model = TodayModel(route: LaunchOptions.route)
    private let restylePicture: ((_ close: @escaping () -> Void) -> AnyView)?

    public init(restylePicture: ((_ close: @escaping () -> Void) -> AnyView)? = nil) {
        self.restylePicture = restylePicture
    }

    public var body: some View {
        NavigationStack {
            TodayContent(model: model, restylePicture: restylePicture)
        }
    }
}

private struct TodayContent: View {
    @Bindable var model: TodayModel
    let restylePicture: ((_ close: @escaping () -> Void) -> AnyView)?

    @Environment(SessionStore.self) private var session
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ClosetStore.self) private var closet
    @Environment(StylesStore.self) private var styles
    @Environment(LooksStore.self) private var looks
    @Environment(OutfitsStore.self) private var outfits
    @Environment(TodayIntents.self) private var intents
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase

    @State private var today = Date.now
    @State private var isRestylingPicture = false

    private static let topID = "today.top"
    private static let resultsID = "today.results"

    var body: some View {
        Group {
            if closetIsTooThin {
                emptyCloset
            } else {
                screen
            }
        }
        .background(Color.fitsssBackground)
        .navigationTitle("Today")
        .navigationSubtitle(today.formatted(.dateTime.weekday(.wide).day().month(.wide)))
        .navigationBarTitleDisplayMode(.large)
        .task(id: session.user?.id) {
            guard let user = session.user else { return }
            model.activate(server: session.api.baseURL, userId: user.id)
            model.seedSteer(from: outfits.current)
            if model.pendingRoute == "weather" {
                _ = model.consumeRoute()
                try? await Task.sleep(for: .milliseconds(400))
                model.isWeatherSheetPresented = true
            }
            await model.loadWeather(outfits: outfits)
        }
        .onChange(of: outfits.current?.id) { model.seedSteer(from: outfits.current) }
        .onChange(of: scenePhase) { _, phase in
            guard phase == .active else { return }
            today = .now
            Task {
                async let latest: Void = outfits.loadLatest()
                async let weather: Void = model.refreshIfStale(outfits: outfits)
                _ = await (latest, weather)
            }
        }
        .sheet(isPresented: $model.isWeatherSheetPresented, onDismiss: { model.generatesAfterWeather = false }) {
            WeatherSheet(
                draft: model.draft(catalog: catalogStore.catalog),
                catalog: catalogStore.catalog,
                locationDenied: model.locationDenied,
                onDone: { snapshot in
                    model.setWeather(snapshot)
                    if model.generatesAfterWeather {
                        model.generatesAfterWeather = false
                        generate()
                    }
                },
                onUseLocation: {
                    Task {
                        let found = await model.loadWeather(outfits: outfits, force: true, replaceManual: true)
                        if !found, model.weather.snapshot != nil {
                            toasts.show(
                                model.locationDenied ? "Location is off for Fitsss" : "Couldn’t get the forecast here",
                                isError: true
                            )
                        }
                    }
                }
            )
        }
        .sensoryFeedback(.success, trigger: model.confirmations)
        .sheet(isPresented: $isRestylingPicture) {
            restylePicture?({ isRestylingPicture = false })
        }
        // "Add pieces" from inside the sheet switches to the Closet tab;
        // the sheet would otherwise stay up over it.
        .onChange(of: intents.closetRequests) { isRestylingPicture = false }
    }

    // MARK: - The screen

    private var screen: some View {
        let catalog = catalogStore.catalog
        let prefs = model.prefs(latest: outfits.current, styles: styles.styles, catalog: catalog)

        return ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: Metrics.sectionSpacing) {
                    WeatherRow(weather: model.weather, catalog: catalog) { openWeatherSheet() }
                        .id(Self.topID)

                    if let pinned {
                        PinnedRow(block: pinned, catalog: catalog) {
                            withAnimation(.easeOut(duration: 0.2)) { intents.pinnedBlockId = nil }
                        }
                        .transition(.opacity)
                    }

                    SteeringSection(
                        styles: styles.styles,
                        occasions: catalog?.allOccasions ?? [],
                        prefs: prefs,
                        steer: $model.steer,
                        onChoose: { next in
                            withAnimation(.easeOut(duration: 0.15)) { model.choose(next) }
                        }
                    )

                    if restylePicture != nil, !closet.blocks.isEmpty {
                        RestylePictureRow { isRestylingPicture = true }
                    }

                    results
                        .id(Self.resultsID)
                        .padding(.top, 8)
                }
                .padding(.top, 4)
                .padding(.bottom, Metrics.pagePadding)
            }
            .scrollDismissesKeyboard(.interactively)
            .refreshable { await refresh() }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    Button(action: generate) {
                        HStack(spacing: 8) {
                            if model.isGenerating {
                                ProgressView().tint(Color.fitsssInkForeground)
                            } else {
                                Image(systemName: "sparkles")
                            }
                            Text(model.isGenerating ? "Styling…" : "Style me")
                        }
                    }
                    .buttonStyle(.fitsssPrimary)
                    .disabled(model.isGenerating || prefs.occasion == nil)
                    .accessibilityIdentifier("today.generate")
                }
            }
            .onChange(of: model.arrivals) {
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                    proxy.scrollTo(Self.resultsID, anchor: .top)
                }
            }
            .onChange(of: intents.openRequests) {
                // "Style this piece" from the Closet: show the pin.
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) {
                    proxy.scrollTo(Self.topID, anchor: .top)
                }
            }
            .task(id: outfits.current?.id) {
                guard outfits.current != nil, model.pendingRoute == "results" else { return }
                _ = model.consumeRoute()
                try? await Task.sleep(for: .milliseconds(300))
                proxy.scrollTo(Self.resultsID, anchor: .top)
            }
        }
    }

    @ViewBuilder
    private var results: some View {
        if model.isGenerating, let startedAt = model.generationStartedAt {
            GeneratingView(startedAt: startedAt)
                .transition(.opacity)
        } else if let failure = model.failure {
            GenerationFailureView(
                failure: failure,
                closetHasPieces: !closet.blocks.isEmpty,
                onRetry: generate,
                onAddPieces: { intents.openCloset() },
                onSetWeather: openWeatherSheet
            )
        } else if let generation = outfits.current, !generation.outfits.isEmpty {
            VStack(spacing: 20) {
                OutfitCarousel(generation: generation, model: model)
                    .id(generation.id)

                VStack(spacing: 8) {
                    Button("Try again", action: generate)
                        .buttonStyle(.fitsssSecondary)
                        .disabled(model.isGenerating)
                        .accessibilityIdentifier("today.tryAgain")
                    if generation.filteredOutCount > 0 {
                        Text("Left out \(generation.filteredOutCount) \(generation.filteredOutCount == 1 ? "piece" : "pieces") that don’t fit the weather")
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssLabel2)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, Metrics.pagePadding)
            }
        } else {
            Text("Three outfits from what you own, for today.")
                .font(.footnote)
                .foregroundStyle(Color.fitsssLabel2)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, 32)
                .padding(.vertical, 40)
                .accessibilityIdentifier("today.hint")
        }
    }

    // MARK: - Empty closet

    /// Nothing can be generated without shoes and either a top and a bottom
    /// or a full-body piece: the floor the generator enforces, checked on the
    /// roles the server stored.
    private var closetIsTooThin: Bool {
        guard closet.phase == .loaded else { return false }
        let roles = Set(closet.blocks.map(\.category))
        return !(roles.contains("footwear") && ((roles.contains("top") && roles.contains("bottom")) || roles.contains("fullbody")))
    }

    private var emptyCloset: some View {
        ScrollView {
            ContentUnavailableView {
                Label("Add a few pieces first", systemImage: "sun.max")
            } description: {
                Text("Today needs at least a top, a bottom and a pair of shoes before it can put an outfit together.")
            } actions: {
                Button("Add pieces") { intents.openCloset() }
                    .buttonStyle(.fitsssPrimary)
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 320) }
                    .accessibilityIdentifier("today.addPieces")
            }
            .padding(.top, 60)
        }
        .refreshable { await refresh() }
    }

    // MARK: - Actions

    /// The pinned piece, only while it is still in the closet.
    private var pinned: Block? {
        intents.pinnedBlockId.flatMap { id in closet.blocks.first { $0.id == id } }
    }

    private func openWeatherSheet() {
        model.isWeatherSheetPresented = true
    }

    private func generate() {
        let prefs = model.prefs(latest: outfits.current, styles: styles.styles, catalog: catalogStore.catalog)
        guard let occasion = prefs.occasion, !model.isGenerating else { return }
        guard let weather = model.weather.snapshot else {
            // Never blocked on a permission prompt: set it by hand, then go.
            model.generatesAfterWeather = true
            openWeatherSheet()
            return
        }
        let steer = model.steer.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = GenerationRequest(
            styleId: prefs.styleId,
            occasion: occasion,
            weather: weather,
            steer: steer.isEmpty ? nil : steer,
            count: 3,
            pinned: pinned.map { [$0.id] } ?? [],
            excluded: []
        )
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) {
            model.generate(request, outfits: outfits, closet: closet)
        }
    }

    private func refresh() async {
        async let blocks: Void = closet.load()
        async let styleList: Void = styles.load()
        async let lookList: Void = looks.load()
        async let latest: Void = outfits.loadLatest()
        async let weather = model.loadWeather(outfits: outfits, force: true)
        _ = await (blocks, styleList, lookList, latest, weather)
    }
}
