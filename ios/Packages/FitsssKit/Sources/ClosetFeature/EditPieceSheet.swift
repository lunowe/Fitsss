import FitsssCore
import FitsssUI
import SwiftUI

/// Edits one piece (the web's `EditBlockSheet`). The type is fixed: every
/// option comes from that type's catalog entry, so changing the type means
/// removing and re-adding. Save sends the whole `BlockInput`; the server
/// validates it and derives everything else.
///
/// State is seeded from `block` when the sheet is created, so a cancelled
/// edit is simply dropped.
struct EditPieceSheet: View {
    let block: Block

    @Environment(ClosetStore.self) private var closet
    @Environment(CatalogStore.self) private var catalogStore
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    private let original: Draft
    @State private var draft: Draft
    @State private var error: String?
    @State private var isSaving = false
    @State private var confirmingDiscard = false

    init(block: Block) {
        self.block = block
        let draft = Draft(block)
        self.original = draft
        _draft = State(initialValue: draft)
    }

    private var isDirty: Bool { draft != original }

    var body: some View {
        NavigationStack {
            Group {
                if let catalog = catalogStore.catalog, let type = catalog.type(block.typeId) {
                    form(catalog, type)
                } else {
                    ContentUnavailableView(
                        "Can’t edit this piece",
                        systemImage: "exclamationmark.triangle",
                        description: Text("Its type is no longer in the catalog.")
                    )
                }
            }
            .navigationTitle("Edit")
            .navigationSubtitle(block.label.sentenceCased)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) {
                        if isDirty { confirmingDiscard = true } else { dismiss() }
                    }
                    .confirmationDialog("Discard your changes?", isPresented: $confirmingDiscard, titleVisibility: .visible) {
                        Button("Discard Changes", role: .destructive) { dismiss() }
                        Button("Keep Editing", role: .cancel) {}
                    }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isDirty || isSaving)
    }

    private func form(_ catalog: Catalog, _ type: PieceType) -> some View {
        Form {
            ColorPickerSection(title: "Color", catalog: catalog, suggested: type.suggestedColors, value: $draft.color)

            if let secondary = draft.secondary {
                ColorPickerSection(
                    title: "Second color",
                    catalog: catalog,
                    suggested: [],
                    value: Binding(get: { draft.secondary ?? secondary }, set: { draft.secondary = $0 })
                ) {
                    Button("Remove second color", role: .destructive) {
                        withAnimation { draft.secondary = nil }
                    }
                    .accessibilityIdentifier("edit.removeSecondColor")
                }
            } else {
                Section("Second color") {
                    Button("Add second color", systemImage: "plus") {
                        withAnimation { draft.secondary = defaultSecondary(catalog) }
                    }
                    .accessibilityIdentifier("edit.addSecondColor")
                }
            }

            if type.isGarment {
                Section("Fit") {
                    ChipGroup(
                        options: Self.options(type.fitOptions ?? [], keeping: draft.fit),
                        label: catalog.fitLabel,
                        selection: $draft.fit
                    )
                }
            } else {
                Section("Style") {
                    ChipGroup(
                        options: Self.options(type.variantOptions ?? [], keeping: draft.variant),
                        label: catalog.variantLabel,
                        selection: $draft.variant
                    )
                }
            }

            Section("Material") {
                ChipGroup(
                    options: Self.options(type.materialOptions, keeping: draft.material),
                    label: catalog.materialLabel,
                    noneLabel: "None",
                    selection: $draft.material
                )
            }

            Section("Pattern") {
                ChipGroup(
                    options: Self.options(type.patternOptions, keeping: draft.pattern),
                    label: catalog.patternLabel,
                    selection: $draft.pattern
                )
            }

            if type.isGarment {
                Section("Weight") {
                    Picker("Weight", selection: $draft.weight) {
                        ForEach(Self.weightOptions(catalog, keeping: draft.weight), id: \.id) { option in
                            Text(option.label).tag(option.id)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                }
            }

            Section {
                Stepper(value: $draft.quantity, in: 1...99) {
                    LabeledContent("Quantity") {
                        Text("\(draft.quantity)").monospacedDigit()
                    }
                }
                .accessibilityIdentifier("edit.quantity")
            }

            Section("Nickname") {
                TextField("Uniqlo U", text: $draft.nickname)
                    .textLimit($draft.nickname, 60)
                    .accessibilityIdentifier("edit.nickname")
            }

            Section("Notes") {
                TextField("Collar stretches, only wear it under a layer.", text: $draft.notes, axis: .vertical)
                    .lineLimit(3...8)
                    .textLimit($draft.notes, 500)
                    .accessibilityIdentifier("edit.notes")
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            BottomActionBar {
                VStack(spacing: 8) {
                    if let error {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(Color.fitsssDestructive)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("edit.error")
                    }
                    Button(isSaving ? "Saving…" : "Save") {
                        Task { await save(type) }
                    }
                    .buttonStyle(.fitsssPrimary)
                    .disabled(isSaving)
                    .accessibilityIdentifier("edit.save")
                }
            }
        }
        .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
    }

    /// The second color a fresh "Add second color" starts from: the first
    /// palette color that differs from the main one (the web starts at white).
    private func defaultSecondary(_ catalog: Catalog) -> BlockColor? {
        (catalog.palette.first { $0.id != draft.color.paletteId } ?? catalog.palette.first).map(BlockColor.init)
    }

    private func save(_ type: PieceType) async {
        error = nil
        isSaving = true
        defer { isSaving = false }
        do {
            try await closet.update(block.id, with: draft.input(for: block, type: type))
            dismiss()
            toasts.show("Saved")
        } catch APIError.superseded {
            // Signed out or switched while saving: this sheet is going away.
        } catch let apiError as APIError {
            error = apiError.displayMessage
        } catch {
            self.error = "Could not save this piece"
        }
    }

    /// A type's options, plus the current value if the catalog no longer
    /// offers it, so the stored choice is still visible and kept.
    static func options(_ options: [String], keeping current: String?) -> [String] {
        guard let current, !current.isEmpty, !options.contains(current) else { return options }
        return options + [current]
    }

    static func weightOptions(_ catalog: Catalog, keeping current: String) -> [(id: String, label: String)] {
        let weights = catalog.weights.map { (id: $0.id, label: $0.label) }
        guard !weights.contains(where: { $0.id == current }) else { return weights }
        return weights + [(id: current, label: catalog.weightLabel(current))]
    }
}

// MARK: - Draft

/// Everything the sheet edits, seeded from the stored piece.
private struct Draft: Equatable {
    var color: BlockColor
    var secondary: BlockColor?
    var fit: String
    var variant: String
    var material: String?
    var pattern: String
    var weight: String
    var quantity: Int
    var nickname: String
    var notes: String

    init(_ block: Block) {
        color = block.color
        secondary = block.secondaryColor
        fit = block.fit ?? ""
        variant = block.variant ?? ""
        material = block.material
        pattern = block.pattern
        weight = block.effectiveWeight
        quantity = block.quantity
        nickname = block.nickname ?? ""
        notes = block.notes ?? ""
    }

    /// The whole input for `PATCH`, shaped like the web's: a fit for garments,
    /// a variant otherwise; weight only overridable on garments.
    ///
    /// The server stores exactly this: an optional field left out (no
    /// material, second color, nickname or notes) is cleared. Picking the
    /// type's default weight clears the override instead of pinning it.
    func input(for block: Block, type: PieceType) -> BlockInput {
        let nickname = nickname.trimmingCharacters(in: .whitespacesAndNewlines)
        let notes = notes.trimmingCharacters(in: .whitespacesAndNewlines)
        return BlockInput(
            typeId: block.typeId,
            color: color,
            secondaryColor: secondary,
            fit: type.isGarment && !fit.isEmpty ? fit : nil,
            variant: !type.isGarment && !variant.isEmpty ? variant : nil,
            material: material,
            pattern: pattern,
            weight: type.isGarment ? (weight == type.defaultWeight ? nil : weight) : block.weight,
            quantity: quantity,
            nickname: nickname.isEmpty ? nil : nickname,
            notes: notes.isEmpty ? nil : notes
        )
    }
}

// MARK: - Chips

/// Single-choice chips that wrap, inside a form row. With `noneLabel`, a
/// leading chip clears the selection.
private struct ChipGroup: View {
    let options: [String]
    let label: (String) -> String
    var noneLabel: String?
    @Binding var selection: String?

    init(options: [String], label: @escaping (String) -> String, noneLabel: String? = nil, selection: Binding<String?>) {
        self.options = options
        self.label = label
        self.noneLabel = noneLabel
        _selection = selection
    }

    /// For required choices stored as a plain string ("" when unset).
    init(options: [String], label: @escaping (String) -> String, selection: Binding<String>) {
        self.init(
            options: options,
            label: label,
            selection: Binding(get: { selection.wrappedValue.isEmpty ? nil : selection.wrappedValue },
                               set: { if let value = $0 { selection.wrappedValue = value } })
        )
    }

    var body: some View {
        FlowLayout(spacing: 8, lineSpacing: 8) {
            if let noneLabel {
                Chip(noneLabel, isSelected: selection == nil) { selection = nil }
            }
            ForEach(options, id: \.self) { option in
                Chip(label(option), isSelected: selection == option) { selection = option }
            }
        }
        .padding(.vertical, 6)
    }
}

// MARK: - Color picker

/// The palette by family, the type's suggested colors first, then a custom
/// color by name and hex. One form section; `footer` adds rows at its end.
private struct ColorPickerSection<Footer: View>: View {
    let title: String
    let catalog: Catalog
    let suggested: [String]
    @Binding var value: BlockColor
    let footer: Footer

    @State private var customName: String
    @State private var customHex: String
    @Environment(\.dynamicTypeSize) private var typeSize
    /// Room for "#7a5230" at any text size.
    @ScaledMetric(relativeTo: .body) private var hexWidth: CGFloat = 112

    init(
        title: String,
        catalog: Catalog,
        suggested: [String],
        value: Binding<BlockColor>,
        @ViewBuilder footer: () -> Footer = { EmptyView() }
    ) {
        self.title = title
        self.catalog = catalog
        self.suggested = suggested
        _value = value
        self.footer = footer()
        let color = value.wrappedValue
        _customName = State(initialValue: color.paletteId == nil ? color.name : "")
        _customHex = State(initialValue: color.paletteId == nil ? color.hex : "")
    }

    var body: some View {
        Section {
            let suggestedColors = suggested.compactMap(catalog.paletteColor)
            if !suggestedColors.isEmpty {
                swatchRow("Suggested", suggestedColors)
            }
            ForEach(catalog.colorFamilies) { family in
                let colors = catalog.palette(inFamily: family.id)
                if !colors.isEmpty {
                    swatchRow(family.label, colors)
                }
            }
            customRow
            footer
        } header: {
            // Side by side when it fits; stacked when the title and a long
            // custom name would otherwise break mid-word at large sizes.
            ViewThatFits(in: .horizontal) {
                HStack {
                    Text(title).fixedSize()
                    Spacer()
                    colorName.fixedSize()
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                    colorName
                }
            }
        }
    }

    private var colorName: some View {
        Text(value.name)
            .textCase(nil)
            .lineLimit(1)
            .truncationMode(.tail)
            .accessibilityIdentifier("edit.colorName.\(title)")
    }

    private func swatchRow(_ label: String, _ colors: [PaletteColor]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.caption)
                .foregroundStyle(Color.fitsssLabel2)
            FlowLayout(spacing: 2, lineSpacing: 2) {
                ForEach(colors) { color in
                    let isSelected = value.paletteId == color.id
                    Button {
                        value = BlockColor(color)
                    } label: {
                        Swatch(hex: color.hex, isSelected: isSelected)
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityLabel(color.name)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, -4)
        }
        .padding(.vertical, 4)
    }

    private var customRow: some View {
        let preview = ColorMath.customColor(name: customName, hex: customHex)
        let isSelected = preview != nil && value.paletteId == nil && value.hex == preview?.hex
        return VStack(alignment: .leading, spacing: 6) {
            Text("Custom")
                .font(.caption)
                .foregroundStyle(Color.fitsssLabel2)
            let layout = typeSize.isAccessibilitySize
                ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
                : AnyLayout(HStackLayout(spacing: 8))
            layout {
                TextField("Name", text: $customName)
                    .textInputAutocapitalization(.words)
                    .padding(.horizontal, 10)
                    .frame(minHeight: Metrics.minTapTarget)
                    .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius))
                    .accessibilityLabel("Custom color name")
                HStack(spacing: 8) {
                TextField("#7a5230", text: $customHex)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .keyboardType(.asciiCapable)
                    .monospacedDigit()
                    .padding(.horizontal, 10)
                    .frame(width: hexWidth)
                    .frame(minHeight: Metrics.minTapTarget)
                    .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius))
                    .accessibilityLabel("Custom color hex")
                Group {
                    if let preview {
                        Swatch(hex: preview.hex, isSelected: isSelected)
                    } else {
                        Circle()
                            .strokeBorder(Color.fitsssSeparator, style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .frame(width: Metrics.swatchSize, height: Metrics.swatchSize)
                            .padding(4)
                    }
                }
                .accessibilityHidden(true)
                }
            }
        }
        .padding(.vertical, 4)
        .textLimit($customName, 40)
        .onChange(of: customName) { _, name in
            if name.serverLength <= 40 { applyCustom() }
        }
        .onChange(of: customHex) { _, hex in
            if hex.count > 7 { customHex = String(hex.prefix(7)) } else { applyCustom() }
        }
    }

    private func applyCustom() {
        if let custom = ColorMath.customColor(name: customName, hex: customHex) {
            value = custom
        }
    }
}
