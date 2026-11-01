import FitsssCore
import FitsssUI
import SwiftUI

/// "Plan a trip" in a sheet with its own navigation stack, Cancel at the top
/// and "Pack my bag" pinned at the bottom. Where the new trip goes is the
/// host's call:
///
/// - with `onCreated` (the Looks shelf's "+"), the id is handed back and the
///   host closes the sheet and shows the trip on its own stack, which packs it;
/// - without (Today's "Plan a trip"), the sheet flows into the trip's detail
///   itself, which packs it, with Done to close.
///
/// Creating is quick (the server fetches the weather); packing is the slow
/// part and belongs to the detail, so a trip whose packing fails still exists
/// and can be packed again from there.
public struct PlanTripSheet: View {
    private let onClose: () -> Void
    private let onCreated: ((String) -> Void)?

    @Environment(ToastCenter.self) private var toasts
    @State private var path: [PlanRoute] = []
    /// Chosen on the search screen, shown on the form.
    @State private var place: TripPlace?
    /// Creating the trip: the form is frozen and the sheet can't be closed.
    @State private var isCreating = false
    /// This presentation of the sheet. A create that answers after the
    /// sheet went away (closed by the app, or torn down and shown again)
    /// must not close or navigate whatever is on screen now; the trip it
    /// made is kept and announced instead.
    @State private var session = PlanSession()

    public init(onClose: @escaping () -> Void, onCreated: ((String) -> Void)? = nil) {
        self.onClose = onClose
        self.onCreated = onCreated
    }

    public var body: some View {
        NavigationStack(path: $path) {
            PlanTripForm(place: $place, path: $path, isCreating: $isCreating, session: session) { trip in
                guard session.isLive else {
                    toasts.show("Trip to \(trip.place.name) saved, not packed yet")
                    return
                }
                TripPacker.shared.requestPack(trip.id)
                if let onCreated {
                    onCreated(trip.id)
                } else {
                    path = [.detail(trip.id)]
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel, action: onClose)
                        .disabled(isCreating)
                        .accessibilityIdentifier("trip.plan.cancel")
                }
            }
            .navigationDestination(for: PlanRoute.self) { route in
                switch route {
                case .place(let query):
                    PlaceSearchScreen(initialQuery: query) { chosen in
                        place = chosen
                        path.removeAll()
                    }
                case .detail(let id):
                    TripDetailScreen(tripId: id, onClose: onClose)
                        .navigationBarBackButtonHidden()
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(Color.fitsssBackground)
        .interactiveDismissDisabled(isCreating)
        .onDisappear { session.isLive = false }
        // Toasts from the detail show over the sheet.
        .toastHost(toasts)
    }
}

/// Whether the sheet that started an operation is still the one on screen.
@MainActor
final class PlanSession {
    var isLive = true
}

enum PlanRoute: Hashable {
    case place(query: String)
    case detail(String)
}

// MARK: - The form

/// Where, when, what for, the bag, laundry, a style and a note. Every
/// vocabulary (activities, bags, limits) comes from the catalog.
struct PlanTripForm: View {
    @Binding var place: TripPlace?
    @Binding var path: [PlanRoute]
    @Binding var isCreating: Bool
    let session: PlanSession
    let onCreated: (Trip) -> Void

    @Environment(TripsStore.self) private var trips
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(StylesStore.self) private var styles
    @Environment(\.dynamicTypeSize) private var typeSize

    /// Wall dates, `YYYY-MM-DD`: what the server stores. The pickers show
    /// them as the device's local midnight and write them back the same way.
    @State private var start: String
    @State private var end: String
    @State private var activities: Set<String> = []
    /// Nil until the person picks a bag: until then it follows the length.
    @State private var pickedLuggage: String?
    @State private var laundry = false
    @State private var styleId: String?
    @State private var note = ""
    @State private var error: String?

    static let maxNoteLength = 200

    init(
        place: Binding<TripPlace?>, path: Binding<[PlanRoute]>, isCreating: Binding<Bool>, session: PlanSession,
        onCreated: @escaping (Trip) -> Void
    ) {
        _place = place
        _path = path
        _isCreating = isCreating
        self.session = session
        self.onCreated = onCreated
        let today = TripDay.today()
        _start = State(initialValue: today)
        _end = State(initialValue: TripDay.adding(2, to: today))
    }

    private var vocabulary: TripVocabulary? { catalogStore.catalog?.trips }
    private var maxDays: Int { vocabulary?.maxDays ?? 21 }
    private var maxLeadDays: Int { vocabulary?.maxLeadDays ?? 366 }

    /// Today where the trip goes (the device's today until a place is
    /// chosen): the server judges the dates by the destination's calendar.
    private var destinationToday: String {
        place.map { TripDay.today(in: $0.timezone) } ?? TripDay.today()
    }

    /// The server's rule: a trip may start the day before the destination's
    /// today (it is already today somewhere), up to `maxLeadDays` ahead,
    /// and run `maxDays` at most.
    private var earliestStart: String { TripDay.adding(-1, to: destinationToday) }
    private var latestStart: String { TripDay.adding(maxLeadDays, to: destinationToday) }
    private var latestEnd: String { TripDay.adding(maxDays - 1, to: start) }

    private var days: Int { TripDay.days(from: start, to: end) + 1 }
    private var luggage: String? { pickedLuggage ?? vocabulary?.defaultLuggage(days: max(days, 1)) }
    private var datesValid: Bool { start >= earliestStart && start <= latestStart && end >= start && end <= latestEnd }
    private var canPack: Bool { place != nil && datesValid && luggage != nil && !isCreating }

    var body: some View {
        Form {
            whereSection
            whenSection
            if let vocabulary {
                activitiesSection(vocabulary)
                bagSection(vocabulary)
                laundrySection
            }
            if !styles.styles.isEmpty { styleSection }
            noteSection
        }
        .scrollDismissesKeyboard(.interactively)
        // Frozen while the trip is being created.
        .disabled(isCreating)
        .navigationTitle("Plan a trip")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar {
                VStack(spacing: 8) {
                    if let error {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssDestructive)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("trip.plan.error")
                    }
                    Button {
                        Task { await create() }
                    } label: {
                        HStack(spacing: 8) {
                            if isCreating {
                                ProgressView().tint(Color.fitsssInkForeground)
                            } else {
                                Image(systemName: "suitcase")
                            }
                            Text(isCreating ? "Checking the weather…" : "Pack my bag")
                        }
                    }
                    .buttonStyle(.fitsssPrimary)
                    .disabled(!canPack)
                    .accessibilityIdentifier("trip.plan.pack")
                }
            }
        }
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        // The message was about what was sent; once that changes it is stale.
        .onChange(of: place) {
            error = nil
            clampDates()
        }
        .onChange(of: start) { clampDates() }
        .onChange(of: note) { _, text in
            if text.contains("\n") { note = text.replacingOccurrences(of: "\n", with: " ") }
        }
        .textLimit($note, Self.maxNoteLength)
        .task {
            if vocabulary == nil { await catalogStore.load() }
        }
    }

    // MARK: Where

    private var whereSection: some View {
        Section {
            Button {
                path.append(.place(query: place?.name ?? ""))
            } label: {
                HStack(spacing: 12) {
                    TripRowIcon(systemName: "mappin.and.ellipse")
                    VStack(alignment: .leading, spacing: 2) {
                        if let place {
                            Text(place.name)
                                .font(.body)
                                .foregroundStyle(Color.fitsssLabel)
                            if !place.detail.isEmpty {
                                Text(place.detail)
                                    .font(.subheadline)
                                    .foregroundStyle(Color.fitsssLabel2)
                            }
                        } else {
                            Text("Where to?")
                                .font(.body)
                                .foregroundStyle(Color.fitsssTint)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    RowChevron()
                }
                .frame(minHeight: Metrics.minTapTarget)
                .contentShape(Rectangle())
            }
            .accessibilityLabel(place.map { "Where: \($0.name), \($0.detail)" } ?? "Where to?")
            .accessibilityIdentifier("trip.plan.place")
        } header: {
            Text("Where")
        }
    }

    // MARK: When

    private var whenSection: some View {
        Section {
            DatePicker("Start", selection: dateBinding($start), in: dateRange(earliestStart, latestStart), displayedComponents: .date)
                .accessibilityIdentifier("trip.plan.start")
            DatePicker("End", selection: dateBinding($end), in: dateRange(start, latestEnd), displayedComponents: .date)
                .accessibilityIdentifier("trip.plan.end")
        } header: {
            Text("When")
        } footer: {
            Text(datesValid ? TripText.lengthWithNights(days: days) : "Plan up to \(maxDays) days at a time, up to a year ahead.")
                .accessibilityIdentifier("trip.plan.length")
        }
    }

    /// The wall date as the device's local midnight, for the picker; what
    /// it picks is written back as a wall date.
    private func dateBinding(_ day: Binding<String>) -> Binding<Date> {
        Binding(
            get: { TripDay.date(from: day.wrappedValue) ?? .now },
            set: { day.wrappedValue = TripDay.string(from: $0) }
        )
    }

    private func dateRange(_ from: String, _ to: String) -> ClosedRange<Date> {
        let a = TripDay.date(from: from) ?? .now
        let b = TripDay.date(from: to) ?? a
        return a...max(a, b)
    }

    /// Keeps both dates inside the rules after the start or the destination
    /// changed: the end follows the start forward and never runs past the
    /// longest trip; a start outside the window moves to its nearest edge.
    private func clampDates() {
        if start < earliestStart { start = earliestStart }
        if start > latestStart { start = latestStart }
        if end < start { end = start }
        if end > latestEnd { end = latestEnd }
    }

    // MARK: What for

    private func activitiesSection(_ vocabulary: TripVocabulary) -> some View {
        Section {
            FlowLayout(spacing: 8, lineSpacing: 8) {
                ForEach(vocabulary.activities) { activity in
                    Chip(activity.label, isSelected: activities.contains(activity.id)) {
                        if activities.contains(activity.id) { activities.remove(activity.id) } else { activities.insert(activity.id) }
                    }
                    .accessibilityHint(activity.hint)
                    .accessibilityIdentifier("trip.plan.activity.\(activity.id)")
                }
            }
            .padding(.vertical, 4)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4))
        } header: {
            Text("What for")
        } footer: {
            Text(activityFootnote(vocabulary))
                .accessibilityIdentifier("trip.plan.activities.footnote")
        }
    }

    /// The hints of what is chosen, "City: walking, sights, cafés", else a
    /// nudge.
    private func activityFootnote(_ vocabulary: TripVocabulary) -> String {
        let chosen = vocabulary.activities.filter { activities.contains($0.id) }
        guard !chosen.isEmpty else { return "Optional. Tells the stylist what the days are for." }
        return chosen.map { "\($0.label): \($0.hint.lowercased())" }.joined(separator: " · ")
    }

    // MARK: Bag and laundry

    private func bagSection(_ vocabulary: TripVocabulary) -> some View {
        Section {
            Picker("Bag", selection: Binding(
                get: { luggage ?? vocabulary.luggage.first?.id ?? "" },
                set: { pickedLuggage = $0 }
            )) {
                ForEach(vocabulary.luggage) { option in
                    Text(option.label).tag(option.id)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .accessibilityIdentifier("trip.plan.bag")
        } header: {
            Text("Bag")
        } footer: {
            Text(bagFootnote(vocabulary))
        }
    }

    private func bagFootnote(_ vocabulary: TripVocabulary) -> String {
        let hint = vocabulary.luggage.first { $0.id == luggage }?.hint ?? ""
        let nights = vocabulary.carryOnMaxNights
        let rule = "Up to \(nights) \(nights == 1 ? "night" : "nights") fits a carry-on; longer trips get a checked bag unless you choose."
        return hint.isEmpty ? rule : "\(hint). \(rule)"
    }

    private var laundrySection: some View {
        Section {
            Toggle("Laundry on the way", isOn: $laundry)
                .accessibilityIdentifier("trip.plan.laundry")
        } footer: {
            Text("Washing halfway means fewer tops to pack.")
        }
    }

    // MARK: Style

    private var styleSection: some View {
        Section {
            Picker("Style", selection: $styleId) {
                Text("Any").tag(String?.none)
                ForEach(styles.styles) { style in
                    Text(style.name).tag(String?.some(style.id))
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("trip.plan.style")
        } footer: {
            Text("Optional. Packs the version of you that wears this style.")
        }
    }

    // MARK: Note

    private var noteSection: some View {
        Section {
            TextField(
                "Note",
                text: $note,
                prompt: Text("Anything special? e.g. a wedding on Saturday"),
                axis: .vertical
            )
            .lineLimit(2...5)
            .submitLabel(.done)
            .accessibilityLabel("Note")
            .accessibilityIdentifier("trip.plan.note")
        } header: {
            Text("Note")
        } footer: {
            let count = note.serverLength
            if count >= Self.maxNoteLength - 40 {
                Text("\(count) / \(Self.maxNoteLength)")
                    .monospacedDigit()
                    .foregroundStyle(count >= Self.maxNoteLength ? Color.fitsssDestructive : Color.fitsssLabel2)
            }
        }
    }

    // MARK: Create

    private func create() async {
        guard let place, let luggage, canPack else { return }
        error = nil
        isCreating = true
        defer { if session.isLive { isCreating = false } }
        let draft = TripDraft(
            place: place,
            startDate: start,
            endDate: end,
            activities: Array(activities).sorted { a, b in
                (vocabulary?.activities.firstIndex { $0.id == a } ?? 0) < (vocabulary?.activities.firstIndex { $0.id == b } ?? 0)
            },
            luggage: luggage,
            laundry: laundry,
            styleId: styleId,
            steer: note.trimmed.isEmpty ? nil : note.trimmed
        )
        do {
            let trip = try await trips.create(draft)
            onCreated(trip)
        } catch where error.isQuiet {
        } catch let apiError as APIError {
            if session.isLive { error = Self.message(for: apiError) }
        } catch {
            if session.isLive { self.error = "Could not plan this trip. Try again." }
        }
    }

    /// The server's sentence, with the way out where there is one.
    static func message(for error: APIError) -> String {
        switch error {
        case .server(503, let message):
            // No weather for those dates: nothing here can fix it right now.
            return message
        case .server(409, let message):
            return message
        default:
            return error.displayMessage
        }
    }
}

// MARK: - Place search

/// Search as you type: places with their region and country, so two
/// Lisbons can be told apart. Pushed from the form; picking one pops back.
/// Results stay while the next search runs, so the list never flickers.
struct PlaceSearchScreen: View {
    let initialQuery: String
    let onPick: (TripPlace) -> Void

    @Environment(TripsStore.self) private var trips

    @State private var query: String
    /// The last answer, for the text it was for; nil before the first.
    @State private var places: [TripPlace]?
    @State private var isSearching = false
    @State private var failure: (message: String, retryable: Bool)?
    @State private var showsSearch = true

    init(initialQuery: String, onPick: @escaping (TripPlace) -> Void) {
        self.initialQuery = initialQuery
        self.onPick = onPick
        _query = State(initialValue: initialQuery)
    }

    private var trimmed: String { query.trimmed }

    var body: some View {
        List {
            if let failure {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(failure.message)
                            .font(.subheadline)
                            .foregroundStyle(Color.fitsssLabel2)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("trip.place.error")
                        if failure.retryable {
                            Button("Try again") { Task { await search(trimmed) } }
                                .font(.body)
                                .foregroundStyle(Color.fitsssTint)
                                .accessibilityIdentifier("trip.place.retry")
                        }
                    }
                    .padding(.vertical, 4)
                }
            } else if let places {
                if places.isEmpty {
                    Section {
                        ContentUnavailableView.search(text: trimmed)
                            .listRowBackground(Color.clear)
                            .accessibilityIdentifier("trip.place.none")
                    }
                } else {
                    Section {
                        ForEach(Array(places.enumerated()), id: \.element.id) { index, place in
                            Button { onPick(place) } label: {
                                HStack(spacing: 12) {
                                    TripRowIcon(systemName: "mappin")
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(place.name)
                                            .font(.body)
                                            .foregroundStyle(Color.fitsssLabel)
                                        if !place.detail.isEmpty {
                                            Text(place.detail)
                                                .font(.subheadline)
                                                .foregroundStyle(Color.fitsssLabel2)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                }
                                .frame(minHeight: Metrics.minTapTarget)
                                .contentShape(Rectangle())
                            }
                            .accessibilityLabel("\(place.name), \(place.detail)")
                            .accessibilityIdentifier("trip.place.\(index)")
                        }
                    } header: {
                        if isSearching {
                            HStack(spacing: 6) {
                                ProgressView().controlSize(.mini)
                                Text("Searching")
                            }
                        }
                    }
                }
            } else if isSearching {
                Section {
                    HStack(spacing: 12) {
                        ProgressView()
                        Text("Searching…")
                            .font(.body)
                            .foregroundStyle(Color.fitsssLabel2)
                    }
                    .frame(minHeight: Metrics.minTapTarget)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("trip.place.searching")
                }
            } else {
                Section {
                    Text("Type a city or town.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .listRowBackground(Color.clear)
                        .accessibilityIdentifier("trip.place.hint")
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Where to?")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $query, isPresented: $showsSearch, prompt: "City or town")
        .autocorrectionDisabled()
        .textInputAutocapitalization(.words)
        // Debounced: a search per pause in typing, not per keystroke.
        .task(id: trimmed) {
            guard trimmed.count >= 2 else {
                places = nil
                failure = nil
                isSearching = false
                return
            }
            isSearching = true
            try? await Task.sleep(for: .milliseconds(300))
            guard !Task.isCancelled else { return }
            await search(trimmed)
        }
    }

    private func search(_ text: String) async {
        isSearching = true
        failure = nil
        do {
            let found = try await trips.searchPlaces(text)
            guard !Task.isCancelled else { return }
            places = found
            isSearching = false
        } catch where error.isQuiet {
        } catch APIError.network {
            isSearching = false
            failure = ("You’re offline. Check your connection and try again.", true)
        } catch let error as APIError {
            isSearching = false
            // Refused input (a query too long) won't pass on a second try.
            if case .invalid = error {
                failure = (error.displayMessage, false)
            } else {
                failure = (error.displayMessage, true)
            }
        } catch {
            isSearching = false
            failure = ("Something went wrong.", true)
        }
    }
}
