import FitsssCore
import FitsssUI
import SwiftUI

/// One saved look (the web's `/looks/[id]`): the large flat lay, why it
/// works and the tip, its pieces, then "Wore this today" with the count and
/// the last-worn date, Rename, and Remove.
struct LookDetailScreen: View {
    let lookId: String
    /// Open the rename sheet as soon as the look is loaded (the `…/rename` route).
    let opensRename: Bool

    @Environment(LooksStore.self) private var looks
    @Environment(ClosetStore.self) private var closet
    @Environment(StylesStore.self) private var styles
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    @State private var renaming: Look?
    @State private var removing: Look?
    @State private var isWearing = false
    @State private var didOpenRename = false
    /// Bumped after every stored write, for the success haptic.
    @State private var successTick = 0
    /// The look as last shown, kept on screen while the page pops after a
    /// remove (the store drops it first), instead of "Look not found".
    @State private var lastShown: Look?
    @State private var isLeaving = false

    private var look: Look? { looks.look(lookId) ?? (isLeaving ? lastShown : nil) }

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle(look?.name ?? "")
            .navigationSubtitle(look.map { lookMeta($0, catalog: catalogStore.catalog, styles: styles) } ?? "")
            .toolbar {
                if let look {
                    ToolbarItem(placement: .primaryAction) {
                        Menu("More", systemImage: "ellipsis") {
                            Button("Rename", systemImage: "pencil") { renaming = look }
                            Button("Remove look", systemImage: "trash", role: .destructive) { removing = look }
                        }
                        .accessibilityIdentifier("look.more")
                    }
                }
            }
            .sheet(item: $renaming) { look in
                RenameLookSheet(look: look) { successTick += 1 }
            }
            .sensoryFeedback(.success, trigger: successTick)
            .onChange(of: looks.look(lookId), initial: true) { _, current in
                if let current {
                    lastShown = current
                } else if lastShown != nil, !isLeaving {
                    // Gone from the store while shown (removed on another
                    // device, found out by a wear or rename): close, like a
                    // remove from here would.
                    renaming = nil
                    isLeaving = true
                    dismiss()
                }
            }
            .task(id: look != nil) {
                guard opensRename, !didOpenRename, let look else { return }
                didOpenRename = true
                renaming = look
            }
    }

    @ViewBuilder
    private var content: some View {
        if let look, closet.phase == .loaded || !closet.lookPieces.isEmpty {
            details(look)
        } else if looks.phase == .loaded, look == nil {
            ContentUnavailableView(
                "Look not found",
                systemImage: "questionmark.square.dashed",
                description: Text("It may have been removed.")
            )
        } else if let error = failure {
            ContentUnavailableView {
                Label("Can’t load this look", systemImage: "wifi.exclamationmark")
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

    private var failure: APIError? {
        if case .failed(let error) = looks.phase, look == nil { return error }
        if case .failed(let error) = closet.phase, closet.lookPieces.isEmpty { return error }
        return nil
    }

    private func details(_ look: Look) -> some View {
        let pieces = closet.lookPieces
        let why = look.why.trimmingCharacters(in: .whitespacesAndNewlines)
        let tip = look.tip?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""

        return List {
            Section {
                SquareFlatLay(slots: look.slots, pieces: pieces, size: .large)
                    .listRowInsets(EdgeInsets(top: 12, leading: 12, bottom: 12, trailing: 12))
                    .accessibilityIdentifier("look.flatLay")
            }

            if !why.isEmpty || !tip.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        if !why.isEmpty {
                            Text(why)
                                .font(.callout)
                                .foregroundStyle(Color.fitsssLabel2)
                        }
                        if !tip.isEmpty {
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Image(systemName: "lightbulb")
                                    .foregroundStyle(Color.fitsssLabel3)
                                    .accessibilityHidden(true)
                                Text(tip)
                                    .foregroundStyle(Color.fitsssLabel2)
                            }
                            .font(.footnote)
                            .accessibilityElement(children: .combine)
                            .accessibilityLabel("Tip: \(tip)")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // Plain text on the page, as on the web, not another card.
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 0, leading: 4, bottom: 0, trailing: 4))
                }
            }

            Section {
                OutfitPieceList(slots: look.slots, blocks: pieces, catalog: catalogStore.catalog)
            } header: {
                Text("Pieces")
            } footer: {
                let missing = look.slots.blockIds.filter { id in !pieces.contains { $0.id == id } }.count
                if missing > 0 {
                    Text(missing == 1
                        ? "One piece of this look is no longer in your closet."
                        : "\(missing) pieces of this look are no longer in your closet.")
                }
            }

            Section {
                Button {
                    Task { await wear(look) }
                } label: {
                    LabeledContent {
                        Text(wornLabel(look.wornCount))
                            .monospacedDigit()
                            .contentTransition(.numericText())
                    } label: {
                        Text("Wore this today")
                            .foregroundStyle(Color.fitsssTint)
                    }
                }
                .disabled(isWearing)
                .accessibilityIdentifier("look.wear")

                Button {
                    renaming = look
                } label: {
                    HStack {
                        Text("Rename").foregroundStyle(Color.fitsssTint)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.fitsssLabel3)
                    }
                    .contentShape(Rectangle())
                }
                .accessibilityIdentifier("look.rename")
            } footer: {
                if let lastWorn = look.lastWornAt {
                    Text("Last worn \(lastWornText(lastWorn)).")
                        .accessibilityIdentifier("look.lastWorn")
                }
            }

            Section {
                Button("Remove look", role: .destructive) { removing = look }
                    .accessibilityIdentifier("look.remove")
            }
        }
        // Once for the page: both the row and the toolbar menu ask through it.
        .removeLookConfirmation(for: look, target: $removing) {
            isLeaving = true
            dismiss()
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(Metrics.sectionSpacing)
        .refreshable { await reload() }
    }

    private func wear(_ look: Look) async {
        guard !isWearing else { return }
        isWearing = true
        defer { isWearing = false }
        if await wearLook(look.id, looks: looks, toasts: toasts) { successTick += 1 }
    }

    private func reload() async {
        async let looksLoad: Void = looks.load()
        async let piecesLoad: Void = closet.load()
        async let stylesLoad: Void = styles.load()
        _ = await (looksLoad, piecesLoad, stylesLoad)
    }
}
