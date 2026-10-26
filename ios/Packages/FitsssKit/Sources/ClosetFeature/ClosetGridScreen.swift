import FitsssCore
import FitsssUI
import SwiftUI

/// The closet grid (the web's `/closet` page and `ClosetBrowser`): a large
/// title with the piece count, search, category filter chips, a two-column
/// grid per category, the Archived link, and a sticky "Add pieces" button.
struct ClosetGridScreen: View {
    let onAdd: () -> Void

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts

    var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle("Closet")
            .navigationSubtitle(subtitle)
    }

    @ViewBuilder
    private var content: some View {
        if let catalog = catalogStore.catalog, closet.phase == .loaded || !closet.blocks.isEmpty {
            if closet.blocks.isEmpty {
                ClosetEmptyState(archivedCount: closet.archived.count, onAdd: onAdd)
                    .refreshable { await reload() }
            } else {
                ClosetGrid(catalog: catalog, onAdd: onAdd, onRefresh: reload)
            }
        } else if let error = failure {
            ContentUnavailableView {
                Label("Can’t load your closet", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await reload() } }
                    .buttonStyle(.fitsssSecondary)
                    // The actions slot proposes a compact width.
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
            }
        } else {
            ClosetSkeleton()
        }
    }

    /// Why nothing can be shown: the closet or the catalog failed and there is
    /// no copy to fall back on.
    private var failure: APIError? {
        if case .failed(let error) = closet.phase, closet.blocks.isEmpty { return error }
        if catalogStore.catalog == nil, !catalogStore.isLoading { return catalogStore.error }
        return nil
    }

    private var subtitle: String {
        guard closet.phase == .loaded || !closet.blocks.isEmpty else { return "" }
        return closet.blocks.isEmpty ? "No pieces yet" : piecesText(closet.pieceCount)
    }

    private func reload() async {
        async let blocks: Void = closet.load()
        async let catalog: Void = catalogStore.load()
        _ = await (blocks, catalog)
        if case .failed(let error) = closet.phase, !closet.blocks.isEmpty {
            toasts.show(error.displayMessage, isError: true)
        }
    }
}

// MARK: - Grid

private struct ClosetGrid: View {
    let catalog: Catalog
    let onAdd: () -> Void
    let onRefresh: () async -> Void

    @Environment(ClosetStore.self) private var closet
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var query = ""
    @State private var isSearching = false
    /// The selected category id; nil is All.
    @State private var selected: String?
    @State private var editing: Block?
    @State private var removing: Block?
    /// Reset to the top whenever the search or filter changes: the results
    /// are usually far shorter than the closet, and a position kept from
    /// scrolling down would leave them off screen.
    @State private var position = ScrollPosition(edge: .top)

    var body: some View {
        let index = ClosetIndex(blocks: closet.blocks, catalog: catalog)
        let active = selected.flatMap { id in index.present.contains { $0.category.id == id } ? id : nil }
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let groups = index.groups(in: active, matching: trimmed)

        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0, pinnedViews: .sectionHeaders) {
                Section {
                    VStack(alignment: .leading, spacing: Metrics.sectionSpacing) {
                        if groups.isEmpty {
                            Group {
                                if trimmed.isEmpty {
                                    ContentUnavailableView("Nothing here yet", systemImage: "tshirt")
                                } else {
                                    ContentUnavailableView.search(text: trimmed)
                                }
                            }
                            .padding(.top, 40)
                        } else {
                            ForEach(groups) { group in
                                section(group, showsHeader: active == nil)
                            }
                        }

                        if !closet.archived.isEmpty {
                            ArchivedLink(count: closet.archived.count)
                                .padding(.top, 8)
                        }
                    }
                    .padding(.top, 4)
                    .padding(.bottom, Metrics.pagePadding)
                } header: {
                    // Pinned under the navigation bar, like the web's filter row.
                    FilterChips(present: index.present, selected: active) { id in
                        withAnimation(.easeOut(duration: 0.15)) { selected = id }
                    }
                    .background(Color.fitsssBackground)
                }
            }
        }
        .scrollPosition($position)
        .onChange(of: query) { position.scrollTo(edge: .top) }
        .onChange(of: selected) { position.scrollTo(edge: .top) }
        .scrollDismissesKeyboard(.immediately)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            AddPiecesBar(onAdd: onAdd)
        }
        .toolbar {
            // The web's search button; pulling the grid down reveals the field too.
            ToolbarItem(placement: .primaryAction) {
                Button("Search closet", systemImage: "magnifyingglass") { isSearching = true }
                    .accessibilityIdentifier("closet.search")
            }
        }
        .searchable(
            text: $query,
            isPresented: $isSearching,
            placement: .navigationBarDrawer(displayMode: .automatic),
            prompt: "Search your closet"
        )
        .refreshable { await onRefresh() }
        .sheet(item: $editing) { block in
            EditPieceSheet(block: block)
        }
    }

    private var columns: [GridItem] {
        let count = typeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: count)
    }

    private func section(_ group: ClosetIndex.Group, showsHeader: Bool) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if showsHeader {
                SectionHeader(group.label)
            }
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(group.blocks) { block in
                    NavigationLink(value: ClosetDestination.piece(id: block.id)) {
                        BlockTile(block: block, catalog: catalog, thumbAspectRatio: typeSize.isAccessibilitySize ? 3 / 2 : 1)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityIdentifier("closet.tile.\(block.id)")
                    .contextMenu {
                        Button("Edit", systemImage: "pencil") { editing = block }
                        Button("Remove from closet", systemImage: "archivebox", role: .destructive) {
                            removing = block
                        }
                    }
                    .removeFromClosetConfirmation(for: block, target: $removing)
                }
            }
            .padding(.horizontal, Metrics.pagePadding)
        }
    }
}

/// The sticky primary action. Hidden while searching, so it doesn't ride
/// on top of the keyboard.
private struct AddPiecesBar: View {
    let onAdd: () -> Void
    @Environment(\.isSearching) private var isSearching

    var body: some View {
        if !isSearching {
            BottomActionBar {
                Button(action: onAdd) {
                    Label("Add pieces", systemImage: "plus")
                }
                .buttonStyle(.fitsssPrimary)
                .accessibilityIdentifier("closet.add")
            }
        }
    }
}

/// The category filter: All, then each category that has pieces, with counts.
private struct FilterChips: View {
    let present: [ClosetIndex.Presence]
    let selected: String?
    let select: (String?) -> Void

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                FilterChip(title: "All", count: nil, isSelected: selected == nil) { select(nil) }
                    .accessibilityIdentifier("closet.filter.all")
                ForEach(present, id: \.category.id) { entry in
                    FilterChip(title: entry.category.label, count: entry.count, isSelected: selected == entry.category.id) {
                        select(entry.category.id)
                    }
                    .accessibilityIdentifier("closet.filter.\(entry.category.id)")
                }
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, 6)
        }
        .scrollIndicators(.hidden)
        // A horizontal scroll view takes every point of height it is offered.
        .fixedSize(horizontal: false, vertical: true)
    }
}

/// `Chip` with a dimmed count after the title, as on the web's filter row.
private struct FilterChip: View {
    let title: String
    let count: Int?
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Text(title)
                if let count {
                    Text("\(count)").monospacedDigit().opacity(0.6)
                }
            }
            .font(.subheadline)
            .lineLimit(1)
            .padding(.horizontal, 14)
            .frame(minHeight: Metrics.chipHeight)
            .foregroundStyle(isSelected ? Color.fitsssInkForeground : Color.fitsssLabel)
            .background(isSelected ? Color.fitsssInk : Color.fitsssFill, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(count.map { "\(title), \($0)" } ?? title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

/// The inset row at the foot of the grid that opens Archived.
private struct ArchivedLink: View {
    let count: Int

    var body: some View {
        NavigationLink(value: ClosetDestination.archived) {
            HStack {
                Text("Archived").foregroundStyle(Color.fitsssLabel)
                Spacer()
                Text("\(count)").monospacedDigit().foregroundStyle(Color.fitsssLabel2)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel3)
            }
            .font(.body)
            .padding(.horizontal, Metrics.pagePadding)
            .frame(minHeight: Metrics.minTapTarget)
            .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        }
        .buttonStyle(PressableStyle())
        .padding(.horizontal, Metrics.pagePadding)
        .accessibilityIdentifier("closet.archived")
    }
}

// MARK: - Empty and loading

private struct ClosetEmptyState: View {
    let archivedCount: Int
    let onAdd: () -> Void

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("Your closet is empty", systemImage: "tshirt")
            } description: {
                Text("Add what you own as simple building blocks: a white relaxed tee, black chelsea boots. No photos needed.")
            } actions: {
                VStack(spacing: 12) {
                    Button(action: onAdd) {
                        Label("Add pieces", systemImage: "plus")
                    }
                    .buttonStyle(.fitsssPrimary)
                    .accessibilityIdentifier("closet.add")
                    if archivedCount > 0 {
                        NavigationLink("Archived (\(archivedCount))", value: ClosetDestination.archived)
                            .font(.headline)
                            .frame(minHeight: Metrics.minTapTarget)
                    }
                }
                // The actions slot proposes a compact width; give the primary
                // button the page width like the web's full-width button.
                .containerRelativeFrame(.horizontal) { width, _ in width - 2 * Metrics.pagePadding - 32 }
            }
            .containerRelativeFrame(.vertical, alignment: .center) { height, _ in height * 0.8 }
        }
    }
}

/// The real layout drained of color, pulsing as one, like the web's
/// `closet/loading.tsx`.
private struct ClosetSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Metrics.sectionSpacing) {
                HStack(spacing: 8) {
                    ForEach([44, 78, 92, 84], id: \.self) { width in
                        Capsule().fill(Color.fitsssFill).frame(width: CGFloat(width), height: Metrics.chipHeight)
                    }
                }
                .padding(.horizontal, Metrics.pagePadding)

                ForEach(0..<2, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 8) {
                        RoundedRectangle(cornerRadius: 3).fill(Color.fitsssFill).frame(width: 64, height: 12)
                            .padding(.horizontal, Metrics.pagePadding)
                        LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                            ForEach(0..<4, id: \.self) { _ in tile }
                        }
                        .padding(.horizontal, Metrics.pagePadding)
                    }
                }
            }
            .padding(.top, 6)
            // On the content, not the scroll view: that hosts the large title.
            .opacity(dimmed ? 0.45 : 1)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: dimmed)
            .onAppear { dimmed = true }
        }
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your closet")
    }

    private var tile: some View {
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

// MARK: - Grouping

/// The closet sorted into the categories pieces are filed under, in catalog
/// order. Mirrors `ClosetBrowser`'s grouping on the web.
struct ClosetIndex {
    struct Presence {
        let category: CatalogCategory
        /// Pieces, counting quantities.
        let count: Int
    }

    struct Group: Identifiable {
        let id: String
        let label: String
        var blocks: [Block]
    }

    let catalog: Catalog
    let blocks: [Block]
    /// Every category with at least one piece, in catalog order.
    let present: [Presence]

    private let categoryOf: [String: String]

    init(blocks: [Block], catalog: Catalog) {
        self.catalog = catalog
        self.blocks = blocks
        var categoryOf: [String: String] = [:]
        var counts: [String: Int] = [:]
        for block in blocks {
            // A type's own (possibly custom) category; the stored role for a type that is gone.
            let id = catalog.type(block.typeId)?.categoryId ?? block.category
            categoryOf[block.id] = id
            counts[id, default: 0] += block.quantity
        }
        self.categoryOf = categoryOf
        self.present = catalog.categories.compactMap { category in
            counts[category.id].flatMap { $0 > 0 ? Presence(category: category, count: $0) : nil }
        }
    }

    /// The pieces in `category` (nil for all) whose search text contains
    /// `query`, grouped by category in catalog order, server order within.
    func groups(in category: String?, matching query: String) -> [Group] {
        let needle = query.lowercased()
        let order = Dictionary(catalog.categories.enumerated().map { ($1.id, $0) }, uniquingKeysWith: { first, _ in first })
        let matches = blocks.enumerated()
            .filter { _, block in
                (category == nil || categoryOf[block.id] == category)
                    && (needle.isEmpty || catalog.searchHaystack(of: block).contains(needle))
            }
            .sorted { lhs, rhs in
                let left = order[categoryOf[lhs.element.id] ?? ""] ?? 99
                let right = order[categoryOf[rhs.element.id] ?? ""] ?? 99
                return left == right ? lhs.offset < rhs.offset : left < right
            }
            .map(\.element)

        var groups: [Group] = []
        for block in matches {
            let id = categoryOf[block.id] ?? block.category
            if groups.last?.id == id {
                groups[groups.count - 1].blocks.append(block)
            } else {
                groups.append(Group(id: id, label: catalog.category(id)?.label ?? id, blocks: [block]))
            }
        }
        return groups
    }
}
