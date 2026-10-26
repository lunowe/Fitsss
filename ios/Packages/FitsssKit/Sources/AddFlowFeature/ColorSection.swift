import FitsssCore
import FitsssUI
import SwiftUI

/// Multi-select color picker: what is selected (tap to remove), the type's
/// suggested colors, the whole palette by family, then custom colors. The
/// port of `ColorSection.tsx`. Emits list rows; put it in a `Section`.
struct ColorSection: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// Palette ids the catalog suggests for the type.
    let suggested: [String]
    @Binding var selected: [BlockColor]
    let catalog: Catalog
    let onAddCustom: () -> Void

    var body: some View {
        let selectedKeys = Set(selected.map(Cart.colorKey))
        let customs = selected.filter { $0.paletteId == nil }

        Group {
            if !selected.isEmpty {
                group("Selected") {
                    FlowLayout(spacing: 8, lineSpacing: 8) {
                        ForEach(selected, id: \.self) { color in
                            SelectedColorChip(color: color) { toggle(color) }
                        }
                    }
                }
            }

            let suggestedColors = suggested.compactMap(catalog.paletteColor)
            if !suggestedColors.isEmpty {
                group("Suggested") {
                    FlowLayout(spacing: 4, lineSpacing: 8) {
                        ForEach(suggestedColors) { color in
                            SwatchButton(
                                hex: color.hex,
                                name: color.name,
                                showsName: false,
                                isSelected: selectedKeys.contains("p:\(color.id)"),
                                identifier: "addflow.suggested.\(color.id)"
                            ) { toggle(BlockColor(color)) }
                        }
                    }
                }
            }

            ForEach(catalog.colorFamilies) { family in
                let colors = catalog.palette(inFamily: family.id)
                if !colors.isEmpty {
                    group(family.label) {
                        LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                            ForEach(colors) { color in
                                SwatchButton(
                                    hex: color.hex,
                                    name: color.name,
                                    isSelected: selectedKeys.contains("p:\(color.id)"),
                                    identifier: "addflow.color.\(color.id)"
                                ) { toggle(BlockColor(color)) }
                            }
                        }
                    }
                }
            }

            group("Custom") {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 12) {
                    ForEach(customs, id: \.self) { color in
                        SwatchButton(hex: color.hex, name: color.name, isSelected: true, identifier: "addflow.custom.\(color.name)") {
                            toggle(color)
                        }
                    }
                    AddCustomButton(action: onAddCustom)
                }
            }
        }
    }

    /// Five columns on a phone, fewer at the largest text sizes.
    private var columns: [GridItem] {
        [GridItem(.adaptive(minimum: dynamicTypeSize.isAccessibilitySize ? 96 : 56), spacing: 8, alignment: .top)]
    }

    private func group(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.caption)
                .foregroundStyle(Color.fitsssLabel2)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 16, bottom: 8, trailing: 16))
        .listRowSeparator(.hidden)
    }

    private func toggle(_ color: BlockColor) {
        let key = Cart.colorKey(color)
        if let index = selected.firstIndex(where: { Cart.colorKey($0) == key }) {
            selected.remove(at: index)
        } else {
            selected.append(color)
        }
    }
}

/// A 44pt swatch target with the color's name under it.
private struct SwatchButton: View {
    let hex: String
    let name: String
    var showsName = true
    let isSelected: Bool
    let identifier: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Swatch(hex: hex, isSelected: isSelected)
                if showsName {
                    Text(name)
                        .font(.caption)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
            .frame(maxWidth: showsName ? .infinity : nil)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel(name)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier(identifier)
    }
}

/// A selected color as a removable chip: dot, name, x.
private struct SelectedColorChip: View {
    let color: BlockColor
    let remove: () -> Void

    var body: some View {
        Button(action: remove) {
            HStack(spacing: 6) {
                SwatchDot(hex: color.hex, size: 16)
                // Truncated by length, like the web's `max-w-[10ch]`: the flow
                // layout sizes chips at their ideal width.
                Text(color.name.count > 14 ? String(color.name.prefix(13)) + "…" : color.name)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel)
                    .lineLimit(1)
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(Color.fitsssLabel2)
            }
            .padding(.leading, 8)
            .padding(.trailing, 10)
            .frame(minHeight: Metrics.chipHeight)
            .background(Color.fitsssFill, in: Capsule())
            .frame(minHeight: Metrics.minTapTarget)
            .contentShape(Capsule())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Remove \(color.name)")
        .accessibilityIdentifier("addflow.selected.\(color.name)")
    }
}

/// The dashed "+" that opens the custom color sheet.
private struct AddCustomButton: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 2) {
                Image(systemName: "plus")
                    .font(.body.weight(.medium))
                    .foregroundStyle(Color.fitsssLabel2)
                    .frame(width: Metrics.swatchSize, height: Metrics.swatchSize)
                    .overlay {
                        Circle().strokeBorder(Color.fitsssLabel3, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                    }
                    .padding(4)
                Text("Custom")
                    .font(.caption)
                    .foregroundStyle(Color.fitsssLabel2)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressableStyle())
        .accessibilityLabel("Add a custom color")
        .accessibilityIdentifier("addflow.addCustomColor")
    }
}
