import FitsssCore
import FitsssUI
import SwiftUI

/// The Trips shelf under Looks' Trips segment: upcoming trips soonest first,
/// then past ones, each a row that reads at a glance (where, when, the
/// weather, how much is packed). Pull to refresh; swipe or long-press to
/// delete. The host owns the navigation: `onOpen` gets a trip's id, `onPlan`
/// opens "Plan a trip".
public struct TripsShelf: View {
    private let onOpen: (String) -> Void
    private let onPlan: () -> Void

    @Environment(TripsStore.self) private var trips
    @Environment(ToastCenter.self) private var toasts

    public init(onOpen: @escaping (String) -> Void, onPlan: @escaping () -> Void) {
        self.onOpen = onOpen
        self.onPlan = onPlan
    }

    public var body: some View {
        Group {
            if isReady {
                if trips.trips.isEmpty {
                    TripsEmptyState(onPlan: onPlan)
                        .refreshable { await reload() }
                } else {
                    TripsList(onOpen: onOpen, onRefresh: reload)
                }
            } else if case .failed(let error) = trips.phase {
                ContentUnavailableView {
                    Label("Can’t load your trips", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error.displayMessage)
                } actions: {
                    Button("Try Again") { Task { await reload() } }
                        .buttonStyle(.fitsssSecondary)
                        .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
                        .accessibilityIdentifier("trips.retry")
                }
            } else {
                TripsSkeleton()
            }
        }
        .background(Color.fitsssBackground)
    }

    private var isReady: Bool { Self.isReady(trips) }

    static func isReady(_ trips: TripsStore) -> Bool { trips.phase == .loaded || !trips.trips.isEmpty }

    /// The large title's subtitle while this shelf shows: "2 upcoming".
    public static func subtitle(_ trips: TripsStore) -> String {
        guard isReady(trips) else { return "" }
        let upcoming = trips.upcoming().count
        if trips.trips.isEmpty { return "No trips yet" }
        if upcoming == 0 { return "\(trips.trips.count.formatted()) past" }
        return "\(upcoming.formatted()) upcoming"
    }

    private func reload() async {
        await trips.load()
        if case .failed(let error) = trips.phase, !trips.trips.isEmpty {
            toasts.show(error.displayMessage, isError: true)
        }
    }
}

// MARK: - List

private struct TripsList: View {
    let onOpen: (String) -> Void
    let onRefresh: () async -> Void

    @Environment(TripsStore.self) private var trips
    @Environment(ToastCenter.self) private var toasts
    @State private var removing: Trip?
    @State private var today = TripDay.today()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        let upcoming = trips.upcoming(today: today)
        let past = trips.past(today: today)

        List {
            if !upcoming.isEmpty {
                Section("Upcoming") {
                    ForEach(upcoming) { trip in row(trip, isPast: false) }
                }
            }
            if !past.isEmpty {
                Section("Past") {
                    ForEach(past) { trip in row(trip, isPast: true) }
                }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(Metrics.sectionSpacing)
        .refreshable { await onRefresh() }
        .accessibilityIdentifier("trips.shelf")
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { today = TripDay.today() }
        }
    }

    private func row(_ trip: Trip, isPast: Bool) -> some View {
        Button { onOpen(trip.id) } label: {
            TripRow(trip: trip, isPast: isPast, today: today)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("trips.row.\(trip.id)")
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button("Delete", systemImage: "trash", role: .destructive) { removing = trip }
        }
        .contextMenu {
            Button("Delete trip", systemImage: "trash", role: .destructive) { removing = trip }
        }
        .removeTripConfirmation(for: trip, target: $removing)
    }
}

/// One trip: a date tile like Calendar's, the name, where and when, the
/// weather at a glance, and how far the packing has got.
private struct TripRow: View {
    let trip: Trip
    let isPast: Bool
    let today: String

    @Environment(TripsStore.self) private var trips
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let stacked = typeSize.isAccessibilitySize
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))

        HStack(alignment: .top, spacing: 12) {
            layout {
                DateTile(date: trip.startDate, dimmed: isPast)
                VStack(alignment: .leading, spacing: 3) {
                    Text(trip.name)
                        .font(.headline)
                        .foregroundStyle(Color.fitsssLabel)
                    Text("\(TripText.placeLine(trip.place)) · \(TripText.dateRange(trip))")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                    HStack(spacing: 6) {
                        status
                        if !stacked, let hint = weatherHint {
                            Text("·").foregroundStyle(Color.fitsssLabel3)
                            hint
                        }
                    }
                    .font(.footnote)
                    if stacked, let hint = weatherHint {
                        hint.font(.footnote)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            RowChevron()
                .padding(.top, stacked ? 0 : 12)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isButton)
    }

    private var isPacking: Bool { trips.packing.contains(trip.id) }

    @ViewBuilder
    private var status: some View {
        if isPacking {
            HStack(spacing: 6) {
                ProgressView().controlSize(.mini)
                Text("Packing…")
            }
            .foregroundStyle(Color.fitsssLabel2)
        } else if isPast {
            Text(TripText.length(days: trip.dayCount))
                .foregroundStyle(Color.fitsssLabel2)
        } else if let plan = trip.plan, plan.packedCount == plan.packing.count, !plan.packing.isEmpty {
            Label("All packed", systemImage: "checkmark.circle.fill")
                .foregroundStyle(Color.fitsssSuccess)
        } else {
            Text(TripText.packedLine(trip))
                .foregroundStyle(trip.plan == nil ? Color.fitsssTint : Color.fitsssLabel2)
        }
    }

    private var weatherHint: Text? {
        guard let range = TripText.highsRange(trip.weather), let condition = TripText.dominantCondition(trip.weather) else { return nil }
        return Text("\(Image(systemName: weatherSymbol(condition))) \(range)")
            .foregroundStyle(Color.fitsssLabel2)
    }

    private var accessibilityText: String {
        var parts = [trip.name, TripText.placeLine(trip.place), "\(TripText.dateRange(trip)), \(TripText.length(days: trip.dayCount))"]
        if let range = TripText.highsRange(trip.weather) { parts.append("highs \(range)") }
        parts.append(isPacking ? "Packing" : (isPast ? "Past" : TripText.packedLine(trip)))
        return parts.joined(separator: ", ")
    }
}

/// The month over the day, on a `card-2` well: the trip's first day.
private struct DateTile: View {
    let date: String
    let dimmed: Bool

    @ScaledMetric(relativeTo: .title2) private var scaled: CGFloat = 52
    private var side: CGFloat { min(scaled, 72) }

    var body: some View {
        let (month, day) = TripText.monthAndDay(date)
        VStack(spacing: 0) {
            Text(month.uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(0.4)
                .foregroundStyle(dimmed ? Color.fitsssLabel3 : Color.fitsssLabel2)
            Text(day)
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(dimmed ? Color.fitsssLabel2 : Color.fitsssLabel)
        }
        .lineLimit(1)
        // As large as its text: at the biggest type the month and the day
        // outgrow the square, so the square grows with them.
        .fixedSize()
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .frame(minWidth: side, minHeight: side)
        .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius, style: .continuous))
        .accessibilityHidden(true)
    }
}

// MARK: - Empty and loading

private struct TripsEmptyState: View {
    let onPlan: () -> Void

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("Pack from what you own", systemImage: "suitcase")
                    .accessibilityIdentifier("trips.empty")
            } description: {
                Text("Pick a place and dates. Fitsss checks the weather for every day and packs a bag from your closet, with an outfit a day.")
            } actions: {
                Button(action: onPlan) {
                    Label("Plan a trip", systemImage: "plus")
                }
                .buttonStyle(.fitsssPrimary)
                .accessibilityIdentifier("trips.empty.plan")
                .containerRelativeFrame(.horizontal) { width, _ in width - 2 * Metrics.pagePadding - 32 }
            }
            .containerRelativeFrame(.vertical, alignment: .center) { height, _ in height * 0.8 }
        }
    }
}

private struct TripsSkeleton: View {
    var body: some View {
        List {
            Section("Upcoming") {
                ForEach(0..<2, id: \.self) { _ in
                    HStack(spacing: 12) {
                        RoundedRectangle(cornerRadius: Metrics.thumbRadius).fill(Color.fitsssCard2).frame(width: 52, height: 52)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Lisbon").font(.headline)
                            Text("Lisbon, Portugal · Sat 7 – Sat 14 Nov").font(.subheadline)
                            Text("Not packed yet").font(.footnote)
                        }
                    }
                    .padding(.vertical, 6)
                }
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your trips")
    }
}

// MARK: - Delete

/// Asks before deleting a trip, deletes it, and confirms with a toast.
/// Attach it to the control that asks; it shows while `target` is this trip.
struct RemoveTripConfirmation: ViewModifier {
    let trip: Trip
    @Binding var target: Trip?
    /// Runs after a successful delete, e.g. to pop the detail page.
    var onRemoved: () -> Void

    @Environment(TripsStore.self) private var trips
    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.confirmationDialog(
            Text("Delete \(trip.name)?"),
            isPresented: Binding(
                get: { target?.id == trip.id },
                set: { if !$0, target?.id == trip.id { target = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Delete Trip", role: .destructive) {
                Task { await remove() }
            }
            .accessibilityIdentifier("trip.delete.confirm")
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The plan and your ticks go with it. Your closet is not touched.")
        }
    }

    private func remove() async {
        do {
            try await trips.remove(trip.id)
            TripPacker.shared.dismissFailure(trip.id)
            onRemoved()
            toasts.show("Trip deleted")
        } catch where !error.isQuiet {
            toasts.show("Could not delete this trip", isError: true)
        } catch {}
    }
}

extension View {
    func removeTripConfirmation(for trip: Trip, target: Binding<Trip?>, onRemoved: @escaping () -> Void = {}) -> some View {
        modifier(RemoveTripConfirmation(trip: trip, target: target, onRemoved: onRemoved))
    }
}
