import FitsssCore
import FitsssUI
import SwiftUI

/// The saved looks (the web's `/looks` Saved shelf): a two-column grid of
/// cards, each a small flat lay, the look's name and its meta line, under
/// the tab's large title (`LooksScreen` sets it, with `subtitle`). Pull to
/// refresh; long-press for wear, rename and remove.
struct LooksGridScreen: View {
    @Environment(LooksStore.self) private var looks
    @Environment(ClosetStore.self) private var closet
    @Environment(StylesStore.self) private var styles
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts

    var body: some View {
        content
            .background(Color.fitsssBackground)
    }

    @ViewBuilder
    private var content: some View {
        if isReady {
            if looks.looks.isEmpty {
                LooksEmptyState()
                    .refreshable { await reload() }
            } else {
                LooksGrid(onRefresh: reload)
            }
        } else if let error = failure {
            ContentUnavailableView {
                Label("Can’t load your looks", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await reload() } }
                    .buttonStyle(.fitsssSecondary)
                    // The actions slot proposes a compact width.
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
                    .accessibilityIdentifier("looks.retry")
            }
        } else {
            LooksSkeleton()
        }
    }

    private var isReady: Bool { Self.isReady(looks: looks, closet: closet) }

    /// Looks are in, and so are the pieces they are drawn from (an empty list
    /// needs no pieces).
    static func isReady(looks: LooksStore, closet: ClosetStore) -> Bool {
        let haveLooks = looks.phase == .loaded || !looks.looks.isEmpty
        let havePieces = closet.phase == .loaded || !closet.lookPieces.isEmpty
        return haveLooks && (looks.looks.isEmpty || havePieces)
    }

    /// Why nothing can be shown: the looks or the pieces failed and there is
    /// no copy to fall back on.
    private var failure: APIError? {
        if case .failed(let error) = looks.phase, looks.looks.isEmpty { return error }
        if case .failed(let error) = closet.phase, closet.lookPieces.isEmpty { return error }
        return nil
    }

    /// The large title's subtitle while this shelf shows: "3 saved".
    static func subtitle(looks: LooksStore, closet: ClosetStore) -> String {
        guard isReady(looks: looks, closet: closet) else { return "" }
        return looks.looks.isEmpty ? "Nothing saved yet" : "\(looks.looks.count.formatted()) saved"
    }

    private func reload() async {
        async let looksLoad: Void = looks.load()
        async let piecesLoad: Void = closet.load()
        async let stylesLoad: Void = styles.load()
        async let catalogLoad: Void = catalogStore.load()
        _ = await (looksLoad, piecesLoad, stylesLoad, catalogLoad)
        // A failed refresh over a list already shown: keep the list, say so.
        if case .failed(let error) = looks.phase, !looks.looks.isEmpty {
            toasts.show(error.displayMessage, isError: true)
        }
    }
}

// MARK: - Grid

private struct LooksGrid: View {
    let onRefresh: () async -> Void

    @Environment(LooksStore.self) private var looks
    @Environment(ClosetStore.self) private var closet
    @Environment(StylesStore.self) private var styles
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var renaming: Look?
    @State private var removing: Look?
    @State private var successTick = 0

    var body: some View {
        let pieces = closet.lookPieces
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(looks.looks) { look in
                    NavigationLink(value: LooksDestination.look(id: look.id)) {
                        LookCard(
                            look: look,
                            pieces: pieces,
                            meta: lookMeta(look, catalog: catalogStore.catalog, styles: styles),
                            isSingleColumn: typeSize.isAccessibilitySize
                        )
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityIdentifier("looks.card.\(look.id)")
                    .contextMenu {
                        Button("Wore this today", systemImage: "checkmark.circle") {
                            Task { if await wearLook(look.id, looks: looks, toasts: toasts) { successTick += 1 } }
                        }
                        Button("Rename", systemImage: "pencil") { renaming = look }
                        Button("Remove look", systemImage: "trash", role: .destructive) { removing = look }
                    }
                    .removeLookConfirmation(for: look, target: $removing)
                }
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.top, 8)
            .padding(.bottom, Metrics.pagePadding)
        }
        .refreshable { await onRefresh() }
        .sheet(item: $renaming) { look in
            RenameLookSheet(look: look) { successTick += 1 }
        }
        .sensoryFeedback(.success, trigger: successTick)
    }

    private var columns: [GridItem] {
        let count = typeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: count)
    }
}

/// One look in the grid, the web's `OutfitCard`: the flat lay on a card,
/// the name, the meta line.
private struct LookCard: View {
    let look: Look
    let pieces: [Block]
    let meta: String
    /// One card per row at accessibility text sizes: a wider, shorter drawing
    /// and text that wraps instead of truncating.
    let isSingleColumn: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SquareFlatLay(slots: look.slots, pieces: pieces, size: isSingleColumn ? .large : .small)
            VStack(alignment: .leading, spacing: 2) {
                Text(look.name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.fitsssLabel)
                    .lineLimit(isSingleColumn ? nil : 1)
                if !meta.isEmpty {
                    // Two lines in the grid, so the temperature at the end
                    // isn't the part that gets cut.
                    Text(meta)
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(isSingleColumn ? nil : 2)
                }
            }
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 4)
            .padding(.top, 8)
            .padding(.bottom, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(8)
        // Cards in a row share its height, whichever meta wraps.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .accessibilityElement(children: .combine)
        .accessibilityLabel(meta.isEmpty ? look.name : "\(look.name), \(meta)")
    }
}

// MARK: - Empty and loading

private struct LooksEmptyState: View {
    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("No saved looks", systemImage: "square.grid.2x2")
            } description: {
                Text("Outfits you save on the Today tab land here. Generate a few there and keep the ones you’d wear.")
            }
            .containerRelativeFrame(.vertical, alignment: .center) { height, _ in height * 0.8 }
            .accessibilityIdentifier("looks.empty")
        }
    }
}

/// The grid drained of color, pulsing as one, like the closet's skeleton.
private struct LooksSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in card }
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.top, 8)
            // On the content, not the scroll view: that hosts the large title.
            .opacity(dimmed ? 0.45 : 1)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: dimmed)
            .onAppear { dimmed = true }
        }
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your looks")
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            RoundedRectangle(cornerRadius: Metrics.thumbRadius).fill(Color.fitsssCard2).aspectRatio(1, contentMode: .fit)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 3).fill(Color.fitsssFill).frame(height: 14).padding(.trailing, 30)
                RoundedRectangle(cornerRadius: 3).fill(Color.fitsssFill).frame(height: 11).padding(.trailing, 60)
            }
            .padding(.horizontal, 4)
            .padding(.top, 10)
            .padding(.bottom, 4)
        }
        .padding(8)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
    }
}
