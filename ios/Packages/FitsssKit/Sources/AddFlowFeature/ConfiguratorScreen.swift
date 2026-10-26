import FitsssCore
import FitsssUI
import SwiftUI

/// Step three: everything that varies about a piece type on one screen
/// (colors, fits or styles, materials, pattern, weight, nickname and notes),
/// then the whole cartesian product into the cart in one tap. The port of
/// `Configurator.tsx`.
struct ConfiguratorScreen: View {
    let categoryId: String
    let typeId: String
    let onAdded: () -> Void
    let onBarHeight: (CGFloat) -> Void

    var body: some View {
        CatalogGate { catalog in
            if let type = catalog.type(typeId), type.categoryId == categoryId {
                Configurator(type: type, catalog: catalog, onAdded: onAdded, onBarHeight: onBarHeight)
                    // A different type is a fresh draft.
                    .id(type.id)
            } else {
                ContentUnavailableView(
                    "No such piece type",
                    systemImage: "questionmark.folder",
                    description: Text("It may have been removed under You → Content.")
                )
                .background(Color.fitsssBackground)
            }
        }
    }
}

private struct Configurator: View {
    @Environment(CartStore.self) private var cart
    @Environment(ToastCenter.self) private var toasts

    let type: PieceType
    let catalog: Catalog
    let onAdded: () -> Void
    let onBarHeight: (CGFloat) -> Void

    // Defaults as on the web: nothing picked, solid, the type's own weight.
    @State private var colors: [BlockColor] = []
    @State private var picked: [String] = []
    @State private var materials: [String] = []
    @State private var pattern: String
    @State private var weight: String
    @State private var nickname = ""
    @State private var notes = ""
    @State private var showsMore = false
    @State private var showsCustomColor = false
    /// Set by "Add to cart": the screen is on its way out, ignore further taps.
    @State private var didAdd = false

    init(type: PieceType, catalog: Catalog, onAdded: @escaping () -> Void, onBarHeight: @escaping (CGFloat) -> Void) {
        self.type = type
        self.catalog = catalog
        self.onAdded = onAdded
        self.onBarHeight = onBarHeight
        _pattern = State(initialValue: type.patternOptions.contains("solid") ? "solid" : type.patternOptions.first ?? "solid")
        _weight = State(initialValue: type.defaultWeight)
    }

    private var usesFit: Bool { type.isGarment }
    /// "fit" for garments, "style" for footwear and accessories.
    private var optionWord: String { usesFit ? "fit" : "style" }

    private var draft: Draft {
        Draft(
            typeId: type.id,
            colors: colors,
            options: picked,
            materials: materials,
            pattern: pattern,
            weight: weight,
            nickname: nickname.trimmed,
            notes: notes.trimmed
        )
    }

    var body: some View {
        List {
            Section {
                PreviewLineup(type: type, colors: colors, variant: usesFit ? nil : picked.last, fallback: type.drawingColor(in: catalog))
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
            }

            Section("Colors") {
                ColorSection(
                    suggested: type.suggestedColors,
                    selected: $colors,
                    catalog: catalog,
                    onAddCustom: { showsCustomColor = true }
                )
            }

            Section(usesFit ? "Fit" : "Style") {
                ChipGroup(options: type.options, label: { catalog.optionLabel($0, for: type) }, isSelected: { picked.contains($0) }) { option in
                    picked.toggle(option)
                }
            }

            Section {
                ChipGroup(options: type.materialOptions, label: { catalog.materialLabel($0) }, isSelected: { materials.contains($0) }) { material in
                    materials.toggle(material)
                }
            } header: {
                Text("Material")
            } footer: {
                Text("Optional. Leave empty and the piece has no material.")
            }

            Section("Pattern") {
                ChipGroup(options: type.patternOptions, label: { catalog.patternLabel($0) }, isSelected: { $0 == pattern }) { option in
                    pattern = option
                }
            }

            if usesFit {
                Section {
                    Picker("Weight", selection: $weight) {
                        ForEach(catalog.weights) { option in
                            Text(option.label).tag(option.id)
                        }
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("addflow.weight")
                } header: {
                    Text("Weight")
                } footer: {
                    Text("Affects which weather this piece is suggested for.")
                }
            }

            Section {
                DisclosureGroup(isExpanded: $showsMore) {
                    TextField("Nickname", text: $nickname, prompt: Text("e.g. the Uniqlo one"))
                        .textInputAutocapitalization(.never)
                        .onChange(of: nickname) { _, value in
                            let limited = value.prefix(serverLimit: Cart.nicknameLimit)
                            if limited != value { nickname = limited }
                        }
                        .accessibilityIdentifier("addflow.nickname")
                    TextField("Notes", text: $notes, prompt: Text("Notes"), axis: .vertical)
                        .lineLimit(2...6)
                        .onChange(of: notes) { _, value in
                            let limited = value.prefix(serverLimit: Cart.notesLimit)
                            if limited != value { notes = limited }
                        }
                        .accessibilityIdentifier("addflow.notes")
                } label: {
                    Text("Nickname & notes")
                        .foregroundStyle(Color.fitsssLabel)
                }
            } header: {
                Text("More")
            } footer: {
                if nickname.trimmed != nil || notes.trimmed != nil {
                    Text("Applied to every piece added.")
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollDismissesKeyboard(.interactively)
        .cartPillClearance(cart)
        .navigationTitle(type.label)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            bottomBar
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { onBarHeight($0) }
        }
        .sheet(isPresented: $showsCustomColor) {
            CustomColorSheet(catalog: catalog) { color in
                if !colors.contains(where: { Cart.colorKey($0) == Cart.colorKey(color) }) {
                    colors.append(color)
                }
            }
        }
    }

    // MARK: - Bottom bar

    private var bottomBar: some View {
        BottomActionBar {
            VStack(spacing: 8) {
                Text(caption)
                    .font(.footnote)
                    .monospacedDigit()
                    .foregroundStyle(Color.fitsssLabel2)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
                    .contentTransition(.opacity)
                    .accessibilityIdentifier("addflow.summary")
                Button(action: addToCart) {
                    Text(draft.count > 0 ? "Add \(draft.count) to cart" : "Add to cart")
                        .monospacedDigit()
                        .contentTransition(.numericText(value: Double(draft.count)))
                }
                .buttonStyle(.fitsssPrimary)
                .disabled(draft.count == 0)
                .accessibilityIdentifier("addflow.addToCart")
                .accessibilityHint(draft.count == 0 ? caption : "")
            }
            .animation(.easeOut(duration: 0.15), value: draft.count)
        }
    }

    /// What will be created, or what is still missing.
    private var caption: String {
        if colors.isEmpty && picked.isEmpty { return "Pick colors and a \(optionWord)" }
        if colors.isEmpty { return "Pick a color" }
        if picked.isEmpty { return "Pick a \(optionWord)" }
        return summary
    }

    /// "2 colors · 2 fits · cotton · striped", like the web's subtitle.
    private var summary: String {
        var parts: [String] = []
        if !colors.isEmpty { parts.append(plural(colors.count, "color")) }
        if !picked.isEmpty { parts.append(plural(picked.count, optionWord)) }
        if materials.count == 1, let material = materials.first {
            parts.append(catalog.materialLabel(material).lowercased())
        } else if materials.count > 1 {
            parts.append(plural(materials.count, "material"))
        }
        if pattern != "solid" { parts.append(catalog.patternLabel(pattern).lowercased()) }
        return parts.joined(separator: " · ")
    }

    private func addToCart() {
        let count = draft.count
        guard count > 0, !didAdd else { return }
        didAdd = true
        let added = cart.add(draft.expand(usesFit: usesFit))
        if added == count {
            toasts.show("\(plural(count, "piece")) added to cart")
        } else if cart.cart.lines.count >= Cart.maxLines {
            toasts.show(added > 0
                ? "\(plural(added, "piece")) added; the cart is full, save it first"
                : "The cart is full. Save it first")
        } else if added > 0 {
            toasts.show("\(plural(added, "piece")) added to cart; some lines are at \(Cart.maxQuantity)")
        } else {
            toasts.show("Already \(Cart.maxQuantity) in the cart")
        }
        onAdded()
    }
}

// MARK: - Preview

/// The type drawn in every color picked so far, newest last; the type's
/// first suggested color while nothing is picked. Decorative.
private struct PreviewLineup: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let type: PieceType
    let colors: [BlockColor]
    let variant: String?
    let fallback: String

    var body: some View {
        let size: CGFloat = switch colors.count {
        case 0, 1: 104
        case 2: 92
        case 3: 80
        default: 68
        }
        let shown: [(key: String, hex: String)] = colors.isEmpty
            ? [("fallback", fallback)]
            : colors.map { (Cart.colorKey($0), $0.hex) }

        ViewThatFits(in: .horizontal) {
            lineup(shown, size: size)
                .frame(maxWidth: .infinity)
            ScrollView(.horizontal) {
                lineup(shown, size: size)
            }
            .scrollIndicators(.hidden)
            .defaultScrollAnchor(.trailing)
        }
        .frame(height: 108)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: colors)
        .accessibilityHidden(true)
    }

    private func lineup(_ shown: [(key: String, hex: String)], size: CGFloat) -> some View {
        HStack(spacing: 12) {
            ForEach(shown, id: \.key) { item in
                Silhouette(typeId: type.id, variant: variant, color: item.hex)
                    .frame(width: size, height: size)
                    .transition(reduceMotion ? .opacity : .scale(scale: 0.8).combined(with: .opacity))
            }
        }
    }
}

// MARK: - Chips

/// A wrapping group of toggle chips, for fits, materials and patterns.
private struct ChipGroup: View {
    let options: [String]
    let label: (String) -> String
    let isSelected: (String) -> Bool
    let toggle: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8, lineSpacing: 8) {
            ForEach(options, id: \.self) { option in
                Chip(label(option), isSelected: isSelected(option)) { toggle(option) }
                    .accessibilityIdentifier("addflow.chip.\(option)")
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Helpers

extension Array where Element: Equatable {
    /// Adds the value, or removes it when it is already there.
    mutating func toggle(_ value: Element) {
        if let index = firstIndex(of: value) {
            remove(at: index)
        } else {
            append(value)
        }
    }
}

extension String {
    /// Trimmed, or nil when nothing is left.
    var trimmed: String? {
        let value = trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}

/// "1 piece", "4 pieces".
func plural(_ count: Int, _ word: String) -> String {
    "\(count.formatted()) \(word)\(count == 1 ? "" : "s")"
}
