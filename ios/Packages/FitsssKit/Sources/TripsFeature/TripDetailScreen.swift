import FitsssCore
import FitsssUI
import SwiftUI

/// One trip: the place and the weather for every day up top, then either the
/// suitcase (what to pack, ticked off as you go) or the days (an outfit each,
/// with any piece swappable). The menu packs again, edits the trip or deletes
/// it. Unpacked, the page packs it: on its own when it was just planned, or
/// from the pinned button.
///
/// The page closes itself when the trip is gone (deleted here, or found
/// missing on the server). With `onClose` it lives in the plan sheet and
/// shows Done.
public struct TripDetailScreen: View {
    private let tripId: String
    private let onClose: (() -> Void)?

    @Environment(TripsStore.self) private var trips
    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(StylesStore.self) private var styles
    @Environment(TodayIntents.self) private var intents
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    enum ViewMode: Hashable { case suitcase, days }

    @State private var mode: ViewMode = .suitcase
    @State private var editing: Trip?
    @State private var repacking: Trip?
    @State private var removing: Trip?
    @State private var swapping: SwapTarget?
    @State private var refused: RefusedChange?
    /// Set by the edit sheet when its change affects the plan; the offer is
    /// raised once the sheet is gone (raising it while the sheet dismisses
    /// would be dropped).
    @State private var repackOfferPending = false
    @State private var offersRepack = false
    /// Bumped after every stored write, for the success haptic.
    @State private var successTick = 0
    /// The trip as last shown, kept on screen while the page pops after a
    /// delete (the store drops it first), instead of "Trip not found".
    @State private var lastShown: Trip?
    @State private var isLeaving = false

    private var packer: TripPacker { .shared }

    public init(tripId: String, onClose: (() -> Void)? = nil) {
        self.tripId = tripId
        self.onClose = onClose
    }

    private var trip: Trip? { trips.trip(tripId) ?? (isLeaving ? lastShown : nil) }
    private var isPacking: Bool { trips.packing.contains(tripId) }

    public var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle(trip?.name ?? "")
            .navigationSubtitle(trip.map(TripText.subtitle) ?? "")
            .toolbar {
                if let onClose {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", systemImage: "checkmark", action: onClose)
                            .accessibilityIdentifier("trip.done")
                    }
                }
                if let trip {
                    ToolbarItem(placement: .primaryAction) {
                        Menu("More", systemImage: "ellipsis") {
                            if trip.plan != nil {
                                Button("Pack again…", systemImage: "arrow.clockwise") { repacking = trip }
                                    .accessibilityIdentifier("trip.repack")
                            }
                            Button("Edit trip", systemImage: "pencil") { editing = trip }
                                .accessibilityIdentifier("trip.edit")
                            Divider()
                            Button("Delete trip", systemImage: "trash", role: .destructive) { removing = trip }
                                .accessibilityIdentifier("trip.delete")
                        }
                        .disabled(isPacking)
                        .accessibilityIdentifier("trip.more")
                    }
                }
            }
            .sheet(item: $editing, onDismiss: {
                if repackOfferPending {
                    repackOfferPending = false
                    offersRepack = true
                }
            }) { trip in
                TripEditSheet(trip: trip) { affectsPlan in
                    successTick += 1
                    if affectsPlan, trips.trip(trip.id)?.plan != nil { repackOfferPending = true }
                }
            }
            .sheet(item: $repacking) { trip in
                RepackSheet(trip: trip) { note in pack(steer: note) }
            }
            .sheet(item: $swapping) { target in
                TripSwapSheet(tripId: tripId, target: target) { successTick += 1 }
            }
            .confirmationDialog("Pack again with these changes?", isPresented: $offersRepack, titleVisibility: .visible) {
                Button("Pack Again") { pack() }
                    .accessibilityIdentifier("trip.repack.offer.yes")
                // Not the cancel role: a popover drops that button, and the
                // choice to keep the plan should be visible, not implied.
                Button("Keep the Plan") {}
                    .accessibilityIdentifier("trip.repack.offer.no")
            } message: {
                Text("The suitcase and the days are planned again. Ticks on pieces that stay packed are kept.")
            }
            .alert(refused?.title ?? "", isPresented: Binding(get: { refused != nil }, set: { if !$0 { refused = nil } }), presenting: refused) { _ in
                Button("OK", role: .cancel) {}
            } message: { change in
                Text(change.message)
            }
            .sensoryFeedback(.success, trigger: successTick)
            .onChange(of: trips.trip(tripId), initial: true) { _, current in
                if let current {
                    lastShown = current
                } else if lastShown != nil, !isLeaving {
                    // Gone from the store while shown (deleted elsewhere,
                    // found out by an edit): close, like a delete from here.
                    editing = nil
                    repacking = nil
                    swapping = nil
                    isLeaving = true
                    close()
                }
            }
            // Just planned: pack it as soon as the page shows it.
            .task(id: tripId) {
                guard packer.consumePack(tripId) else { return }
                await packer.pack(tripId, trips: trips)
            }
            // "Add pieces" switched the app to the Closet tab.
            .onChange(of: intents.closetRequests) { onClose?() }
    }

    @ViewBuilder
    private var content: some View {
        if let trip {
            details(trip)
        } else if trips.phase == .loaded {
            ContentUnavailableView("Trip not found", systemImage: "suitcase", description: Text("It may have been deleted."))
        } else if case .failed(let error) = trips.phase {
            ContentUnavailableView {
                Label("Can’t load this trip", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await reload() } }
                    .buttonStyle(.fitsssSecondary)
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
            }
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    // MARK: - The page

    private func details(_ trip: Trip) -> some View {
        let catalog = catalogStore.catalog
        let pieces = closet.blocks + closet.archived
        let failure = packer.failures[trip.id]
        let unpacked = trip.plan == nil && !isPacking

        return List {
            headerSection(trip, catalog: catalog)

            if isPacking {
                PackingSection(startedAt: packer.started[trip.id] ?? ContinuousClock.now, again: trip.plan != nil)
            } else if let failure {
                failureSection(trip, failure)
            } else if trip.plan == nil {
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Not packed yet")
                            .font(.headline)
                            .foregroundStyle(Color.fitsssLabel)
                        Text("Fitsss packs a bag from your closet for these days, with an outfit for each.")
                            .font(.subheadline)
                            .foregroundStyle(Color.fitsssLabel2)
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("trip.unpacked")
                }
            }

            if let plan = trip.plan {
                Section {
                    Picker("View", selection: $mode) {
                        Text("Suitcase").tag(ViewMode.suitcase)
                        Text("Days").tag(ViewMode.days)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .accessibilityLabel("Suitcase or days")
                    .accessibilityIdentifier("trip.view")
                }
                .listSectionSpacing(12)

                switch mode {
                case .suitcase:
                    SuitcaseSections(trip: trip, plan: plan, pieces: pieces, catalog: catalog, isLocked: isPacking) { refused = $0 }
                case .days:
                    DaySections(trip: trip, plan: plan, pieces: pieces, catalog: catalog, isLocked: isPacking) { swapping = $0 }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(Metrics.sectionSpacing)
        .refreshable {
            // A fresh look: a stale failure (packing turned on since, a
            // busy server) must not stand in the way.
            packer.dismissFailure(trip.id)
            await reload()
        }
        .animation(.easeOut(duration: 0.2), value: isPacking)
        .removeTripConfirmation(for: trip, target: $removing) {
            isLeaving = true
            close()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if unpacked {
                BottomActionBar {
                    Button {
                        pack()
                    } label: {
                        Label(failure == nil ? "Pack my bag" : "Try again", systemImage: failure == nil ? "suitcase" : "arrow.clockwise")
                    }
                    .buttonStyle(.fitsssPrimary)
                    .accessibilityIdentifier("trip.pack")
                }
            }
        }
        .accessibilityIdentifier("trip.detail")
    }

    private func headerSection(_ trip: Trip, catalog: Catalog?) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 6) {
                    Image(systemName: "mappin.and.ellipse")
                        .accessibilityHidden(true)
                    Text(TripText.placeLine(trip.place))
                        .accessibilityIdentifier("trip.place")
                }
                .font(.footnote)
                .foregroundStyle(Color.fitsssLabel2)
                .padding(.horizontal, 4)
                if !trip.weather.isEmpty {
                    TripWeatherStrip(days: trip.weather, catalog: catalog)
                }
            }
            .listRowInsets(EdgeInsets(top: 12, leading: 8, bottom: 8, trailing: 8))
        } footer: {
            if let note = TripWeatherStrip.typicalNote(trip.weather) {
                Text(note)
                    .accessibilityIdentifier("trip.weather.note")
            }
        }
    }

    private func failureSection(_ trip: Trip, _ failure: PackFailure) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 4) {
                Label(failure.title, systemImage: failure.symbol)
                    .font(.headline)
                    .foregroundStyle(Color.fitsssLabel)
                Text(failure.detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("trip.failure")

            if failure.kind == .closet {
                Button {
                    intents.openCloset()
                } label: {
                    HStack {
                        Text("Add pieces").foregroundStyle(Color.fitsssTint)
                        Spacer()
                        RowChevron()
                    }
                    .contentShape(Rectangle())
                }
                .accessibilityIdentifier("trip.failure.addPieces")
            }
        }
    }

    // MARK: - Actions

    private func pack(steer: String? = nil) {
        guard !isPacking else { return }
        Task { await packer.pack(tripId, steer: steer, trips: trips) }
    }

    private func close() {
        if let onClose { onClose() } else { dismiss() }
    }

    private func reload() async {
        async let tripsLoad: Void = trips.load()
        async let closetLoad: Void = closet.load()
        async let stylesLoad: Void = styles.load()
        _ = await (tripsLoad, closetLoad, stylesLoad)
    }
}

extension PackFailure {
    var title: String {
        switch kind {
        case .closet: "Can’t dress every day"
        case .busy: "Not right now"
        case .weather: "No weather for these dates"
        case .notConfigured: "Packing is off"
        case .retry: "The stylist got stuck"
        case .offline: "You’re offline"
        }
    }

    var symbol: String {
        switch kind {
        case .closet: "tshirt"
        case .busy: "clock"
        case .weather: "cloud.sun"
        case .notConfigured: "power"
        case .retry: "exclamationmark.circle"
        case .offline: "wifi.slash"
        }
    }

    var detail: String {
        switch kind {
        case .notConfigured: "This server has no outfit model set up yet, so it can’t pack a bag. \(message)"
        default: message
        }
    }
}

/// A change the server refused, shown in an alert with its sentence.
struct RefusedChange: Identifiable {
    let id = UUID()
    var title: String
    var message: String
}

/// A piece of one day's outfit to swap: the day and the slot it fills.
struct SwapTarget: Identifiable, Hashable {
    let date: String
    let entry: TripPieceEntry

    var id: String { "\(date)/\(entry.id)" }
}

// MARK: - Packing

/// While the server packs: an honest, staged line (the weather and the
/// closet are quick; planning the days is the long part, so the last stage
/// holds), and a second line once the wait gets long. No percentage: there
/// is none to show.
private struct PackingSection: View {
    let startedAt: ContinuousClock.Instant
    /// Packing again over an existing plan.
    let again: Bool

    static let stages = ["Checking the weather for every day", "Reading your closet", "Packing the bag and planning each day"]
    static let stageInterval: TimeInterval = 1.5
    static let longWait: TimeInterval = 12

    @State private var elapsed: TimeInterval = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Clamped at both ends: a negative or absurd `elapsed` must never index
    /// outside `stages`.
    private var stage: Int {
        guard elapsed.isFinite, elapsed > 0 else { return 0 }
        return min(Self.stages.count - 1, max(0, Int(elapsed / Self.stageInterval)))
    }

    var body: some View {
        Section {
            HStack(alignment: .top, spacing: 12) {
                ProgressView()
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 4) {
                    Text(again ? "Packing again" : "Packing your bag")
                        .font(.headline)
                        .foregroundStyle(Color.fitsssLabel)
                    Text("\(Self.stages[stage])…")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .contentTransition(.opacity)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: stage)
                    if elapsed >= Self.longWait {
                        Text("A good plan takes a moment. This can take up to a minute.")
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssLabel2)
                            .transition(.opacity)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 4)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("trip.packing")
            // On the row, not the section: a section's modifiers don't run tasks.
            .task(id: startedAt) {
                var announced = -1
                while !Task.isCancelled {
                    let now = Double(startedAt.duration(to: .now).components.seconds)
                    withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { elapsed = now }
                    if stage != announced {
                        announced = stage
                        AccessibilityNotification.Announcement(Self.stages[stage]).post()
                    }
                    try? await Task.sleep(for: .milliseconds(500))
                }
            }
        }
    }
}
