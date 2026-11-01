import FitsssCore
import FitsssUI
import SwiftUI

// MARK: - Swap a piece

/// The closet's pieces that can fill one slot of one day, the current one
/// outlined. Picking one swaps it in (the suitcase follows); picking the
/// current one just closes. A layer, outerwear or an accessory can also be
/// taken off; a full-body piece can give way to a top and a bottom. The
/// server's sentence shows when it refuses.
struct TripSwapSheet: View {
    let tripId: String
    let target: SwapTarget
    var onSwapped: () -> Void = {}

    @Environment(TripsStore.self) private var trips
    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var path: [SwapRoute] = []
    @State private var swappingTo: String?
    @State private var isTakingOff = false
    @State private var error: String?

    private enum SwapRoute: Hashable { case separates }

    private var isBusy: Bool { swappingTo != nil || isTakingOff }
    private var canTakeOff: Bool { ["layer", "outerwear", TripPieceEntry.accessoriesSlot].contains(target.entry.slot) }
    private var canSplit: Bool { target.entry.slot == "fullbody" }

    var body: some View {
        NavigationStack(path: $path) {
            SwapOptions(
                role: target.entry.role,
                currentId: target.entry.blockId,
                swappingTo: swappingTo,
                error: error,
                isBusy: isBusy,
                intro: "For \(TripText.dayTitle(target.date)). The suitcase follows.",
                onPick: { block in Task { await pick(block) } }
            ) {
                if canTakeOff || canSplit {
                    VStack(spacing: 8) {
                        if canSplit {
                            Button {
                                path.append(.separates)
                            } label: {
                                Label("Top and bottom instead", systemImage: "square.split.1x2")
                            }
                            .buttonStyle(.fitsssSecondary)
                            .accessibilityIdentifier("trip.swap.separates")
                        }
                        if canTakeOff {
                            Button {
                                Task { await takeOff() }
                            } label: {
                                HStack(spacing: 8) {
                                    if isTakingOff { ProgressView().tint(Color.fitsssTint) }
                                    Label("Take it off", systemImage: "minus.circle")
                                }
                            }
                            .buttonStyle(.fitsssSecondary)
                            .accessibilityIdentifier("trip.swap.takeOff")
                        }
                    }
                    .disabled(isBusy)
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                        .disabled(isBusy)
                        .accessibilityIdentifier("trip.swap.cancel")
                }
            }
            .navigationDestination(for: SwapRoute.self) { _ in
                SeparatesPicker(tripId: tripId, date: target.date) {
                    onSwapped()
                    dismiss()
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isBusy)
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
    }

    /// "Swap the t-shirt" from the piece's own type; "Pick a top" for a
    /// slot whose piece is gone.
    private var title: String {
        if let block = target.entry.block, target.entry.isInCloset {
            let type = catalogStore.catalog?.typeLabel(of: block) ?? block.label
            return "Swap the \(type.lowercased())"
        }
        let role = catalogStore.catalog?.roleLabel(target.entry.role) ?? target.entry.role.sentenceCased
        return "Pick from \(role.lowercased())"
    }

    private func pick(_ block: Block) async {
        guard !isBusy else { return }
        guard block.id != target.entry.blockId else {
            dismiss()
            return
        }
        swappingTo = block.id
        error = nil
        defer { swappingTo = nil }
        do {
            let from: String? = target.entry.isAccessory ? target.entry.blockId : nil
            try await trips.swap(tripId, date: target.date, slot: target.entry.slot, to: block.id, from: from)
            onSwapped()
            dismiss()
        } catch {
            report(error, fallback: "Couldn’t swap that piece.")
        }
    }

    private func takeOff() async {
        guard !isBusy else { return }
        isTakingOff = true
        error = nil
        defer { isTakingOff = false }
        do {
            let from: String? = target.entry.isAccessory ? target.entry.blockId : nil
            try await trips.takeOff(tripId, date: target.date, slot: target.entry.slot, from: from)
            onSwapped()
            dismiss()
        } catch {
            report(error, fallback: "Couldn’t take that off.")
        }
    }

    private func report(_ error: any Error, fallback: String) {
        if error.isQuiet { return }
        if let apiError = error as? APIError {
            self.error = apiError.displayMessage
            if case .notFound = apiError { dismiss() }
        } else {
            self.error = fallback
        }
    }
}

/// A top, then a bottom, in place of a day's full-body piece.
private struct SeparatesPicker: View {
    let tripId: String
    let date: String
    let onDone: () -> Void

    @Environment(TripsStore.self) private var trips
    @State private var top: Block?
    @State private var isSending = false
    @State private var error: String?

    var body: some View {
        let pickingTop = top == nil
        SwapOptions(
            role: pickingTop ? "top" : "bottom",
            currentId: nil,
            swappingTo: isSending ? "sending" : nil,
            error: error,
            isBusy: isSending,
            intro: pickingTop
                ? "For \(TripText.dayTitle(date)): first the top, then the bottom."
                : "With the \(top?.label ?? "top"): now the bottom.",
            onPick: { block in
                if pickingTop {
                    top = block
                } else {
                    Task { await send(bottom: block) }
                }
            }
        ) {
            EmptyView()
        }
        .navigationTitle(pickingTop ? "Pick a top" : "Pick a bottom")
        .navigationBarTitleDisplayMode(.inline)
        .navigationBarBackButtonHidden(isSending)
        .accessibilityIdentifier(pickingTop ? "trip.swap.separates.top" : "trip.swap.separates.bottom")
    }

    private func send(bottom: Block) async {
        guard let top, !isSending else { return }
        isSending = true
        error = nil
        defer { isSending = false }
        do {
            try await trips.swapToSeparates(tripId, date: date, top: top.id, bottom: bottom.id)
            onDone()
        } catch where error.isQuiet {
        } catch let apiError as APIError {
            error = apiError.displayMessage
        } catch {
            self.error = "Couldn’t swap that."
        }
    }
}

/// The grid of a role's pieces, with room above it for the sheet's own
/// actions and the server's last word.
private struct SwapOptions<Extra: View>: View {
    let role: String
    let currentId: String?
    let swappingTo: String?
    let error: String?
    let isBusy: Bool
    let intro: String
    let onPick: (Block) -> Void
    @ViewBuilder let extra: Extra

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let options = closet.blocks.filter { $0.category == role }
        let columns = [GridItem(.adaptive(minimum: typeSize.isAccessibilitySize ? 150 : 100), spacing: 12)]

        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(intro)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
                    .fixedSize(horizontal: false, vertical: true)
                if let error {
                    Label(error, systemImage: "exclamationmark.circle")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssDestructive)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("trip.swap.error")
                }
                extra
                if options.isEmpty {
                    Text("Nothing of that kind in your closet yet.")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .padding(.vertical, 12)
                        .accessibilityIdentifier("trip.swap.none")
                }
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(options) { block in
                        OptionTile(
                            block: block,
                            headline: catalogStore.catalog?.headline(of: block) ?? block.label.sentenceCased,
                            isCurrent: block.id == currentId,
                            isSwapping: swappingTo == block.id
                        ) {
                            onPick(block)
                        }
                        .disabled(isBusy)
                    }
                }
            }
            .padding(Metrics.pagePadding)
        }
        .background(Color.fitsssBackground)
    }
}

private struct OptionTile: View {
    let block: Block
    let headline: String
    let isCurrent: Bool
    let isSwapping: Bool
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: Metrics.thumbRadius)
                    .fill(Color.fitsssCard2)
                    .aspectRatio(1, contentMode: .fit)
                    .overlay { Silhouette(block: block).padding(14) }
                    .overlay { if isSwapping { ProgressView() } }
                Text(headline)
                    .font(.caption)
                    .foregroundStyle(Color.fitsssLabel2)
                    .lineLimit(2)
                HStack(spacing: 4) {
                    SwatchDot(hex: block.color.hex, secondaryHex: block.secondaryColor?.hex, size: 8)
                    Text(block.color.name)
                        .font(.caption)
                        .foregroundStyle(Color.fitsssLabel3)
                        .lineLimit(1)
                }
            }
            .padding(8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .overlay {
                if isCurrent {
                    RoundedRectangle(cornerRadius: Metrics.cardRadius).strokeBorder(Color.fitsssTint, lineWidth: 2)
                }
            }
            .opacity(isEnabled || isSwapping ? 1 : 0.5)
            .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(block.label.sentenceCased)
        .accessibilityValue(isCurrent ? "In this outfit" : "")
        .accessibilityAddTraits(isCurrent ? .isSelected : [])
        .accessibilityIdentifier("trip.swap.option.\(block.id)")
    }
}

// MARK: - Edit the trip

/// Name, what the days are for, the bag, laundry and the style. Only what
/// changed is sent. Afterwards the host offers to pack again when the change
/// affects the plan (`affectsPlan`).
struct TripEditSheet: View {
    let trip: Trip
    /// Runs after the server stored the change, before the sheet closes.
    var onSaved: (_ affectsPlan: Bool) -> Void

    @Environment(TripsStore.self) private var trips
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(StylesStore.self) private var styles
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    private struct Draft: Equatable {
        var name: String
        var activities: Set<String>
        var luggage: String
        var laundry: Bool
        var styleId: String?

        init(_ trip: Trip) {
            name = trip.name
            activities = Set(trip.options.activities)
            luggage = trip.options.luggage
            laundry = trip.options.laundry
            styleId = trip.options.styleId
        }
    }

    static let maxNameLength = 60

    private let original: Draft
    @State private var draft: Draft
    @State private var error: String?
    @State private var isSaving = false
    @State private var confirmingDiscard = false
    @FocusState private var nameFocused: Bool

    init(trip: Trip, onSaved: @escaping (_ affectsPlan: Bool) -> Void) {
        self.trip = trip
        self.onSaved = onSaved
        let draft = Draft(trip)
        original = draft
        _draft = State(initialValue: draft)
    }

    private var isDirty: Bool { draft != original }
    private var vocabulary: TripVocabulary? { catalogStore.catalog?.trips }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Name", text: $draft.name, prompt: Text(trip.place.name))
                        .textInputAutocapitalization(.words)
                        .submitLabel(.done)
                        .focused($nameFocused)
                        .textLimit($draft.name, Self.maxNameLength)
                        .accessibilityLabel("Name")
                        .accessibilityIdentifier("trip.edit.name")
                } header: {
                    Text("Name")
                } footer: {
                    Text("\(TripText.placeLine(trip.place)) · \(TripText.dateRange(trip)). The place and dates can’t change: plan a new trip for those.")
                }

                if let vocabulary {
                    Section {
                        FlowLayout(spacing: 8, lineSpacing: 8) {
                            ForEach(vocabulary.activities) { activity in
                                Chip(activity.label, isSelected: draft.activities.contains(activity.id)) {
                                    if draft.activities.contains(activity.id) {
                                        draft.activities.remove(activity.id)
                                    } else {
                                        draft.activities.insert(activity.id)
                                    }
                                }
                                .accessibilityHint(activity.hint)
                                .accessibilityIdentifier("trip.edit.activity.\(activity.id)")
                            }
                        }
                        .padding(.vertical, 4)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 4, trailing: 4))
                    } header: {
                        Text("What for")
                    }

                    Section {
                        Picker("Bag", selection: $draft.luggage) {
                            ForEach(vocabulary.luggage) { option in
                                Text(option.label).tag(option.id)
                            }
                        }
                        .pickerStyle(.segmented)
                        .labelsHidden()
                        .accessibilityIdentifier("trip.edit.bag")
                        Toggle("Laundry on the way", isOn: $draft.laundry)
                            .accessibilityIdentifier("trip.edit.laundry")
                    } header: {
                        Text("Bag")
                    } footer: {
                        if let hint = vocabulary.luggage.first(where: { $0.id == draft.luggage })?.hint {
                            Text(hint)
                        }
                    }
                }

                if !styles.styles.isEmpty || draft.styleId != nil {
                    Section {
                        Picker("Style", selection: $draft.styleId) {
                            Text("Any").tag(String?.none)
                            ForEach(styles.styles) { style in
                                Text(style.name).tag(String?.some(style.id))
                            }
                        }
                        .pickerStyle(.menu)
                        .accessibilityIdentifier("trip.edit.style")
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Edit trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) {
                        if isDirty { confirmingDiscard = true } else { dismiss() }
                    }
                    .accessibilityIdentifier("trip.edit.cancel")
                    .confirmationDialog("Discard your changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                        Button("Discard Changes", role: .destructive) { dismiss() }
                        Button("Keep Editing", role: .cancel) {}
                    }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    VStack(spacing: 8) {
                        if let error {
                            Text(error)
                                .font(.footnote)
                                .foregroundStyle(Color.fitsssDestructive)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("trip.edit.error")
                        }
                        Button(isSaving ? "Saving…" : "Save") {
                            Task { await save() }
                        }
                        .buttonStyle(.fitsssPrimary)
                        .disabled(isSaving || !isDirty)
                        .accessibilityIdentifier("trip.edit.save")
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isDirty || isSaving)
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        .onChange(of: draft) { error = nil }
    }

    private func save() async {
        guard !isSaving, isDirty else { return }
        error = nil
        isSaving = true
        defer { isSaving = false }
        let order = vocabulary?.activities.map(\.id) ?? []
        let activities = draft.activities.sorted { (order.firstIndex(of: $0) ?? 0) < (order.firstIndex(of: $1) ?? 0) }
        let name = draft.name.trimmed
        let patch = TripPatch(
            name: name != original.name ? (name.isEmpty ? trip.place.name : name) : nil,
            activities: draft.activities != original.activities ? activities : nil,
            luggage: draft.luggage != original.luggage ? draft.luggage : nil,
            laundry: draft.laundry != original.laundry ? draft.laundry : nil,
            styleId: draft.styleId != original.styleId ? draft.styleId : nil,
            clearsStyle: draft.styleId != original.styleId && draft.styleId == nil
        )
        let affectsPlan = draft.activities != original.activities || draft.luggage != original.luggage
            || draft.laundry != original.laundry || draft.styleId != original.styleId
        do {
            try await trips.update(trip.id, patch)
            onSaved(affectsPlan)
            dismiss()
            toasts.show("Saved")
        } catch where error.isQuiet {
        } catch let apiError as APIError {
            error = apiError.displayMessage
            if case .notFound = apiError { dismiss() }
        } catch {
            self.error = "Could not save this trip"
        }
    }
}

// MARK: - Pack again

/// A note for the stylist, prefilled with the trip's, then "Pack again".
struct RepackSheet: View {
    let trip: Trip
    let onPack: (_ note: String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var note: String
    @FocusState private var focused: Bool

    static let maxNoteLength = 200

    init(trip: Trip, onPack: @escaping (_ note: String) -> Void) {
        self.trip = trip
        self.onPack = onPack
        _note = State(initialValue: trip.options.steer ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(
                        "Note",
                        text: $note,
                        prompt: Text("What should change? e.g. a wedding on Saturday"),
                        axis: .vertical
                    )
                    .lineLimit(3...6)
                    .focused($focused)
                    .submitLabel(.done)
                    .textLimit($note, Self.maxNoteLength)
                    .accessibilityLabel("Note for the stylist")
                    .accessibilityIdentifier("trip.repack.note")
                } header: {
                    Text("Note")
                } footer: {
                    Text("The suitcase and every day are planned again from your closet. Ticks on pieces that stay packed are kept.")
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Pack again")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                        .accessibilityIdentifier("trip.repack.cancel")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    Button {
                        onPack(note.trimmed)
                        dismiss()
                    } label: {
                        Label("Pack again", systemImage: "arrow.clockwise")
                    }
                    .buttonStyle(.fitsssPrimary)
                    .accessibilityIdentifier("trip.repack.go")
                }
            }
            .onChange(of: note) { _, text in
                if text.contains("\n") {
                    note = text.replacingOccurrences(of: "\n", with: " ")
                    focused = false
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { focused = true }
    }
}
