import FitsssCore
import FitsssUI
import SwiftUI

/// Step two: the types filed under one category, two to a row, each drawn in
/// its first suggested color with its first few suggestions as dots. The port
/// of `closet/add/[category]/page.tsx`.
struct TypeGridScreen: View {
    @Environment(CartStore.self) private var cart
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let categoryId: String

    var body: some View {
        CatalogGate { catalog in
            if let category = catalog.category(categoryId) {
                content(category: category, types: catalog.types(inCategory: category.id), catalog: catalog)
                    .navigationTitle(category.label)
                    .navigationSubtitle(category.hint)
            } else {
                ContentUnavailableView(
                    "No such category",
                    systemImage: "questionmark.folder",
                    description: Text("It may have been removed under You → Content.")
                )
                .background(Color.fitsssBackground)
            }
        }
    }

    @ViewBuilder
    private func content(category: CatalogCategory, types: [PieceType], catalog: Catalog) -> some View {
        if types.isEmpty {
            ContentUnavailableView(
                "Nothing in \(category.label) yet",
                systemImage: "hanger",
                description: Text("Add a piece type under You → Content.")
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.fitsssBackground)
        } else {
            ScrollView {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(types) { type in
                        NavigationLink(value: AddRoute.type(categoryId: category.id, typeId: type.id)) {
                            TypeTile(type: type, catalog: catalog)
                        }
                        .buttonStyle(TileButtonStyle())
                        .accessibilityIdentifier("addflow.type.\(type.id)")
                    }
                }
                .padding(.horizontal, Metrics.pagePadding)
                .padding(.top, 8)
                .padding(.bottom, Metrics.sectionSpacing)
            }
            .background(Color.fitsssBackground)
            .cartPillClearance(cart)
        }
    }

    /// Two columns, one at the largest text sizes so labels stay readable.
    private var columns: [GridItem] {
        Array(repeating: GridItem(.flexible(), spacing: 12), count: dynamicTypeSize.isAccessibilitySize ? 1 : 2)
    }
}

private struct TypeTile: View {
    let type: PieceType
    let catalog: Catalog

    var body: some View {
        VStack(spacing: 8) {
            Silhouette(typeId: type.id, color: type.drawingColor(in: catalog))
                .frame(width: 64, height: 64)
            Text(type.label)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Color.fitsssLabel)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
            HStack(spacing: 4) {
                ForEach(type.suggestedColors.prefix(4).compactMap(catalog.paletteColor)) { color in
                    SwatchDot(hex: color.hex, size: 10)
                }
            }
            .frame(height: 10)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(type.label)
        .accessibilityAddTraits(.isButton)
    }
}

/// Card press feedback: scale 0.98 and the card dims to `fill`, like the web tile.
private struct TileButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .overlay {
                RoundedRectangle(cornerRadius: Metrics.cardRadius)
                    .fill(Color.fitsssFill)
                    .opacity(configuration.isPressed ? 1 : 0)
            }
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
