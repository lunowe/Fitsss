import FitsssCore
import FitsssUI
import SwiftUI

/// One saved picture (the web's `/inspo/[id]`): the picture, what the read
/// saw in it ("In the picture"), each piece against the closet ("From your
/// closet"), outfits from the closet in its spirit, then filing it under a
/// style, its note, the original link, and Remove.
///
/// A picture that hasn't been read yet is read as soon as the page shows it
/// (once per appearance; the read is shared, so coming back while it runs
/// waits for the same one). The page closes itself when the picture is
/// gone (removed here, or found missing on the server).
public struct InspoDetailScreen: View {
    private let inspoId: String
    /// Shown as Done in the toolbar when the page lives in a sheet (Today's
    /// "Restyle a picture").
    private let onClose: (() -> Void)?

    @Environment(InspoStore.self) private var inspos
    @Environment(ClosetStore.self) private var closet
    @Environment(StylesStore.self) private var styles
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    @State private var readProblem: ReadProblem?
    @State private var choosingStyle: Inspo?
    @State private var editingNote: Inspo?
    @State private var removing: Inspo?
    /// Bumped after every stored write, for the success haptic.
    @State private var successTick = 0
    /// The picture as last shown, kept on screen while the page pops after a
    /// remove (the store drops it first), instead of "Picture not found".
    @State private var lastShown: Inspo?
    @State private var isLeaving = false
    @State private var viewportHeight: CGFloat = 0

    public init(inspoId: String, onClose: (() -> Void)? = nil) {
        self.inspoId = inspoId
        self.onClose = onClose
    }

    private var inspo: Inspo? { inspos.inspo(inspoId) ?? (isLeaving ? lastShown : nil) }

    public var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle(inspo?.name ?? "")
            .toolbar {
                if let onClose {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done", systemImage: "checkmark", action: onClose)
                            .accessibilityIdentifier("inspo.done")
                    }
                }
            }
            .sheet(item: $choosingStyle) { inspo in
                InspoStyleSheet(inspo: inspo) { successTick += 1 }
            }
            .sheet(item: $editingNote) { inspo in
                InspoNoteSheet(inspo: inspo) { successTick += 1 }
            }
            .sensoryFeedback(.success, trigger: successTick)
            .onChange(of: inspos.inspo(inspoId), initial: true) { _, current in
                if let current {
                    lastShown = current
                } else if lastShown != nil, !isLeaving {
                    // Gone from the store while shown (removed on another
                    // device, found out by a read or an edit): close, like a
                    // remove from here would.
                    choosingStyle = nil
                    editingNote = nil
                    isLeaving = true
                    dismiss()
                }
            }
            // Once per appearance, as soon as the picture is here: read it if
            // it hasn't been. Re-renders don't start another.
            .task(id: inspo.map { $0.analysis == nil } ?? false) {
                guard let inspo, inspo.analysis == nil else { return }
                await read(inspo.id)
            }
    }

    @ViewBuilder
    private var content: some View {
        if let inspo {
            details(inspo)
        } else if inspos.phase == .loaded {
            ContentUnavailableView(
                "Picture not found",
                systemImage: "photo",
                description: Text("It may have been removed.")
            )
        } else if case .failed(let error) = inspos.phase {
            ContentUnavailableView {
                Label("Can’t load this picture", systemImage: "wifi.exclamationmark")
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

    private func details(_ inspo: Inspo) -> some View {
        let catalog = catalogStore.catalog
        let pieces = closet.blocks + closet.archived
        let summary = inspo.analysis?.summary.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return List {
            // The web's header subtitle: plain text under the large title.
            if !summary.isEmpty {
                Section {
                    Text(summary)
                        .font(.callout)
                        .foregroundStyle(Color.fitsssLabel2)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .listRowBackground(Color.clear)
                        .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
                        .accessibilityIdentifier("inspo.summary")
                }
            }

            Section {
                DetailPicture(inspo: inspo, maxHeight: max(viewportHeight * 0.6, 280))
                    .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    .accessibilityIdentifier("inspo.picture")
            }

            if let analysis = inspo.analysis {
                if !analysis.pieces.isEmpty {
                    Section {
                        // Cards on the page, not in a card: the row is only the strip.
                        InspoPieceStrip(pieces: analysis.pieces, catalog: catalog)
                            .listRowInsets(EdgeInsets())
                            .listRowBackground(Color.clear)
                    } header: {
                        Text("In the picture")
                    }
                }
                if let match = inspo.match {
                    InspoClosetMatches(analysis: analysis, match: match, pieces: pieces, catalog: catalog)
                }
                InspoRestyleSections(inspo: inspo)
            } else {
                readingSection(inspo)
            }

            actionsSection(inspo)

            Section {
                Button("Remove picture", role: .destructive) { removing = inspo }
                    .accessibilityIdentifier("inspo.remove")
                    .removeInspoConfirmation(for: inspo, target: $removing) {
                        isLeaving = true
                        dismiss()
                    }
            }
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(Metrics.sectionSpacing)
        .refreshable { await reload() }
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { viewportHeight = $0 }
    }

    // MARK: - Reading

    @ViewBuilder
    private func readingSection(_ inspo: Inspo) -> some View {
        Section {
            if let readProblem, !inspos.analyzing.contains(inspo.id) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(readProblem.message)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("inspo.read.error")
                }
                .padding(.vertical, 4)
                if readProblem.canRetry {
                    Button {
                        Task { await read(inspo.id) }
                    } label: {
                        Text("Try again")
                            .foregroundStyle(Color.fitsssTint)
                            .frame(maxWidth: .infinity, minHeight: Metrics.minTapTarget, alignment: .leading)
                            .contentShape(Rectangle())
                    }
                    .accessibilityIdentifier("inspo.read.retry")
                }
            } else {
                HStack(spacing: 12) {
                    ProgressView()
                    Text("Reading the picture…")
                        .font(.body)
                        .foregroundStyle(Color.fitsssLabel2)
                }
                .frame(minHeight: Metrics.minTapTarget)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("inspo.reading")
            }
        }
    }

    private func read(_ id: String) async {
        readProblem = nil
        do {
            try await inspos.analyze(id)
        } catch where error.isQuiet {
            // Left, signed out or switched: nothing to say.
        } catch APIError.notFound {
            // Gone: the page closes itself.
        } catch let error as APIError {
            readProblem = ReadProblem(error)
        } catch {
            readProblem = ReadProblem(message: "Reading the picture did not work. Try again.", canRetry: true)
        }
    }

    // MARK: - Actions

    private func actionsSection(_ inspo: Inspo) -> some View {
        let styleName = inspo.styleId.flatMap { styles.style($0)?.name }
        let note = inspo.note?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return Section {
            Button {
                choosingStyle = inspo
            } label: {
                ActionRow(
                    systemImage: "bookmark",
                    title: "Use as reference for a style",
                    subtitle: styleName ?? "None",
                    trailing: AnyView(RowChevron())
                )
            }
            .accessibilityIdentifier("inspo.style")

            Button {
                editingNote = inspo
            } label: {
                ActionRow(
                    systemImage: "square.and.pencil",
                    title: "Note",
                    subtitle: note.isEmpty ? nil : note,
                    trailing: AnyView(RowChevron())
                )
            }
            .accessibilityIdentifier("inspo.note")

            if let url = originalURL(inspo) {
                Link(destination: url) {
                    ActionRow(
                        systemImage: "safari",
                        title: "Open original",
                        subtitle: url.host(),
                        trailing: AnyView(
                            Image(systemName: "arrow.up.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Color.fitsssLabel3)
                                .accessibilityHidden(true)
                        )
                    )
                }
                .accessibilityIdentifier("inspo.original")
            }
        }
    }

    private func reload() async {
        async let pictures: Void = inspos.load()
        async let closetLoad: Void = closet.load()
        async let styleList: Void = styles.load()
        _ = await (pictures, closetLoad, styleList)
    }
}

/// Why the read failed, and whether trying again can help.
struct ReadProblem: Equatable {
    var message: String
    var canRetry: Bool

    init(message: String, canRetry: Bool) {
        self.message = message
        self.canRetry = canRetry
    }

    init(_ error: APIError) {
        switch error {
        case .server(503, let message):
            self.init(message: "Reading pictures is not set up on this server. \(message)", canRetry: false)
        case .network:
            self.init(message: "Can’t reach Fitsss right now. Check your connection and try again.", canRetry: true)
        default:
            self.init(message: error.displayMessage, canRetry: true)
        }
    }
}

/// A row that opens something: icon, title, an optional second line.
private struct ActionRow: View {
    let systemImage: String
    let title: String
    let subtitle: String?
    let trailing: AnyView

    var body: some View {
        HStack(spacing: 12) {
            InspoRowIcon(systemName: systemImage)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .frame(minHeight: Metrics.minTapTarget)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// The picture, aspect-fit on a `card-2` well whose shape comes from the
/// stored dimensions, so nothing moves when the bytes arrive. Tall pictures
/// stop at `maxHeight` and sit centered.
private struct DetailPicture: View {
    let inspo: Inspo
    let maxHeight: CGFloat

    @State private var width: CGFloat = 0

    var body: some View {
        let natural = width > 0 ? width / inspo.aspectRatio : maxHeight
        InspoPicture(inspo: inspo, maxPixels: 1400, contentMode: .fit)
            .frame(maxWidth: .infinity)
            .frame(height: min(natural, maxHeight))
            .clipShape(RoundedRectangle(cornerRadius: Metrics.thumbRadius))
            .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    }
}
