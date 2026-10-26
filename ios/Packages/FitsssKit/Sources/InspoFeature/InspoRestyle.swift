import FitsssCore
import FitsssUI
import SwiftUI

/// "In this spirit": outfits from the user's own closet in the spirit of the
/// picture (the web's `RestylePanel`). The button stays after the results so
/// a second take is one tap away; each result can be saved to Looks.
///
/// The request belongs to `InspoStore` (it keeps going if the page closes,
/// and its result is kept in `restyles[id]`); the page only shows it.
/// Sections for an inset grouped `List`.
struct InspoRestyleSections: View {
    let inspo: Inspo

    @Environment(InspoStore.self) private var inspos
    @Environment(OutfitsStore.self) private var outfits
    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(TodayIntents.self) private var intents
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var failure: RestyleFailure?
    @State private var startedAt: Date?

    private var isRestyling: Bool { inspos.restyling.contains(inspo.id) }
    private var result: GenerationResult? { inspos.restyles[inspo.id] }

    var body: some View {
        Section {
            VStack(spacing: 12) {
                Button {
                    restyle()
                } label: {
                    HStack(spacing: 8) {
                        if isRestyling {
                            ProgressView().tint(Color.fitsssInkForeground)
                        } else {
                            Image(systemName: "sparkles")
                        }
                        Text(isRestyling ? "Styling…" : result == nil ? "Style it from my closet" : "Style it again")
                    }
                }
                .buttonStyle(.fitsssPrimary)
                .disabled(isRestyling)
                .accessibilityIdentifier("inspo.restyle")

                if isRestyling {
                    RestyleProgress(startedAt: startedAt ?? .now)
                        .transition(.opacity)
                }
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        } header: {
            Text("In this spirit")
        }

        if let failure, !isRestyling {
            Section {
                Text(failure.message)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("inspo.restyle.error")
                if failure.offersCloset {
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
                    .accessibilityIdentifier("inspo.restyle.addPieces")
                }
            }
        }

        if let result, !isRestyling {
            ForEach(Array(result.outfits.enumerated()), id: \.element.id) { index, outfit in
                RestyleResultSection(outfit: outfit, index: index, result: result)
            }
        }
    }

    private func restyle() {
        guard !isRestyling else { return }
        failure = nil
        let started = Date.now
        withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { startedAt = started }
        let id = inspo.id
        // Today's weather when there is one from today; otherwise the server
        // assumes a mild grey day.
        let weather = outfits.current.flatMap { current in
            Calendar.current.isDateInToday(current.createdAt) ? current.request.weather : nil
        }
        Task {
            do {
                try await inspos.restyle(id, weather: weather)
            } catch where error.isQuiet {
                return
            } catch APIError.notFound {
                // The picture is gone; the page closes itself.
                return
            } catch let error as APIError {
                failure = RestyleFailure(error)
            } catch {
                failure = RestyleFailure(message: "Something went wrong.", offersCloset: false)
            }
        }
    }
}

/// What went wrong with a restyle, and whether the closet is the way out.
struct RestyleFailure: Equatable {
    var message: String
    var offersCloset: Bool

    init(message: String, offersCloset: Bool) {
        self.message = message
        self.offersCloset = offersCloset
    }

    init(_ error: APIError) {
        switch error {
        case .server(409, let message):
            // empty_closet / too_few_pieces
            self.init(message: message, offersCloset: true)
        case .server(503, let message):
            self.init(message: "This server has no outfit model set up yet. \(message)", offersCloset: false)
        case .network:
            self.init(message: "Can’t reach Fitsss right now. Check your connection and try again.", offersCloset: false)
        default:
            self.init(message: error.displayMessage, offersCloset: false)
        }
    }
}

/// The web's staged status line: honest and in order (the closet and the
/// weather are quick, composing is the long part), with a second line once
/// the wait gets long. Like Today's `GeneratingView`, without the skeletons.
private struct RestyleProgress: View {
    let startedAt: Date

    static let stages = ["Reading your closet", "Checking the weather", "Composing looks"]
    static let stageInterval: TimeInterval = 1.5
    static let longWait: TimeInterval = 12

    @State private var elapsed: TimeInterval = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var stage: Int { min(Self.stages.count - 1, Int(elapsed / Self.stageInterval)) }

    var body: some View {
        VStack(spacing: 2) {
            HStack(spacing: 8) {
                ProgressView().controlSize(.small)
                Text("\(Self.stages[stage])…")
                    .contentTransition(.opacity)
            }
            if elapsed >= Self.longWait {
                Text("Good outfits take a moment. This can take up to a minute.")
                    .transition(.opacity)
            }
        }
        .font(.footnote)
        .foregroundStyle(Color.fitsssLabel2)
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("inspo.restyle.progress")
        .task(id: startedAt) {
            var announced = -1
            while !Task.isCancelled {
                let now = Date.now.timeIntervalSince(startedAt)
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

/// One restyled outfit as a card (the web's `ResultCard`): the large flat
/// lay, name, why and tip, its pieces, and Save to Looks.
private struct RestyleResultSection: View {
    let outfit: Outfit
    let index: Int
    let result: GenerationResult

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(LooksStore.self) private var looks
    @Environment(ToastCenter.self) private var toasts

    @State private var isSaving = false
    @State private var successTick = 0

    /// Saved from this result with these pieces: this session, or earlier.
    /// Removing the look in Looks makes it savable again.
    private var isSaved: Bool {
        looks.looks.contains { $0.generationId == result.id && $0.slots == outfit.slots }
    }

    var body: some View {
        let pieces = closet.blocks + closet.archived
        let why = outfit.why.trimmingCharacters(in: .whitespacesAndNewlines)
        let tip = outfit.tip?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        Section {
            SquareFlatLay(slots: outfit.slots, pieces: pieces, size: .large)
                .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                .accessibilityIdentifier("inspo.result.\(index).flatLay")

            VStack(alignment: .leading, spacing: 4) {
                Text(outfit.name)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("inspo.result.\(index).name")
                if !why.isEmpty {
                    Text(why)
                        .font(.callout)
                        .foregroundStyle(Color.fitsssLabel2)
                }
                if !tip.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "lightbulb")
                            .foregroundStyle(Color.fitsssLabel3)
                            .accessibilityHidden(true)
                        Text(tip)
                            .foregroundStyle(Color.fitsssLabel2)
                    }
                    .font(.footnote)
                    .padding(.top, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Tip: \(tip)")
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 4)

            OutfitPieceList(slots: outfit.slots, blocks: pieces, catalog: catalogStore.catalog)

            Button {
                Task { await save() }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: isSaved ? "bookmark.fill" : "bookmark")
                    Text(isSaved ? "Saved" : "Save to Looks")
                    Spacer(minLength: 0)
                    if isSaving { ProgressView() }
                }
                .font(.body)
                .foregroundStyle(isSaved ? Color.fitsssLabel2 : Color.fitsssTint)
                .frame(minHeight: Metrics.minTapTarget)
                .contentShape(Rectangle())
            }
            .disabled(isSaved || isSaving)
            .accessibilityLabel(isSaved ? "Saved" : "Save to Looks")
            .accessibilityIdentifier("inspo.result.\(index).save")
            .sensoryFeedback(.success, trigger: successTick)
        }
    }

    private func save() async {
        guard !isSaving, !isSaved else { return }
        isSaving = true
        defer { isSaving = false }
        do {
            try await looks.save(
                outfit,
                styleId: nil,
                occasion: result.request.occasion,
                weather: result.request.weather,
                generationId: result.id
            )
            successTick += 1
            toasts.show("Saved to Looks")
        } catch where error.isQuiet {
        } catch {
            toasts.show((error as? APIError)?.displayMessage ?? "Could not save this look", isError: true)
        }
    }
}
