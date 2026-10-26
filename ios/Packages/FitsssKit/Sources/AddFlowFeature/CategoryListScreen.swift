import FitsssCore
import FitsssUI
import SwiftUI

/// Step one: every category in the catalog, built-in and custom, with a
/// drawing of a representative type, its hint, and how many pieces the closet
/// already has filed under it. The port of `closet/add/page.tsx`.
struct CategoryListScreen: View {
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ClosetStore.self) private var closet
    @Environment(CartStore.self) private var cart

    let onClose: () -> Void

    var body: some View {
        CatalogGate { catalog in
            let owned = ownedCounts(catalog)
            List {
                Section {
                    ForEach(catalog.categories) { category in
                        NavigationLink(value: AddRoute.category(category.id)) {
                            CategoryRow(
                                category: category,
                                representative: catalog.types(inCategory: category.id).first,
                                // Unknown until the closet has loaded; never a false 0.
                                owned: closet.phase == .loaded ? owned[category.id] ?? 0 : nil,
                                catalog: catalog
                            )
                        }
                        .accessibilityIdentifier("addflow.category.\(category.id)")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .cartPillClearance(cart)
        }
        .navigationTitle("Add pieces")
        .navigationSubtitle("Pick a category, then a type")
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(role: .close, action: onClose)
                    .accessibilityIdentifier("addflow.close")
            }
        }
    }

    /// Pieces per filed-under category, counting quantities, like the web's
    /// `closetSummary().byCategoryId`.
    private func ownedCounts(_ catalog: Catalog) -> [String: Int] {
        var counts: [String: Int] = [:]
        for block in closet.blocks {
            let categoryId = catalog.type(block.typeId)?.categoryId ?? block.category
            counts[categoryId, default: 0] += block.quantity
        }
        return counts
    }
}

private struct CategoryRow: View {
    let category: CatalogCategory
    let representative: PieceType?
    let owned: Int?
    let catalog: Catalog

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let representative {
                    Silhouette(typeId: representative.id, color: representative.drawingColor(in: catalog))
                } else {
                    Image(systemName: "hanger")
                        .font(.title2)
                        .foregroundStyle(Color.fitsssLabel3)
                }
            }
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(category.label)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                if !category.hint.isEmpty {
                    Text(category.hint)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                }
                // At accessibility sizes the count moves under the text, so
                // the label keeps the row's width instead of breaking mid-word.
                if typeSize.isAccessibilitySize, let owned {
                    Text("\(owned.formatted()) in your closet")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .accessibilityHidden(true)
                }
            }
            Spacer(minLength: 8)
            if !typeSize.isAccessibilitySize, let owned {
                Text(owned, format: .number)
                    .font(.body)
                    .monospacedDigit()
                    .foregroundStyle(Color.fitsssLabel2)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
        .accessibilityValue(owned.map { "\($0) in your closet" } ?? "")
    }
}

extension PieceType {
    /// The garment color a type is drawn in before the user picks one: its
    /// first suggested palette color.
    func drawingColor(in catalog: Catalog) -> String {
        suggestedColors.lazy.compactMap(catalog.paletteColor).first?.hex
            ?? catalog.palette.first?.hex
            ?? ""
    }
}

/// Shows its content once the catalog is there; a spinner while the first
/// download runs, and a retry when it failed with nothing cached.
struct CatalogGate<Content: View>: View {
    @Environment(CatalogStore.self) private var catalogStore
    @ViewBuilder let content: (Catalog) -> Content

    var body: some View {
        if let catalog = catalogStore.catalog {
            content(catalog)
        } else if let error = catalogStore.error, !catalogStore.isLoading {
            ContentUnavailableView {
                Label("Can’t load the catalog", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.localizedDescription)
            } actions: {
                Button("Try Again") { Task { await catalogStore.load() } }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.fitsssBackground)
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.fitsssBackground)
                .task { await catalogStore.load() }
        }
    }
}
