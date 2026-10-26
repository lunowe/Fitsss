import FitsssCore
import FitsssUI
import SwiftUI

/// For a color the palette does not cover: a name and a hex, typed or picked
/// with the system color picker. The port of `CustomColorSheet.tsx`; the
/// color itself is built by `ColorMath.customColor`, like the web's
/// `customColor`. Every presentation starts from a clean slate.
struct CustomColorSheet: View {
    /// Where the web's sheet starts too: a neutral mid grey.
    private static let defaultHex = "#8e8e93"

    @Environment(\.dismiss) private var dismiss
    @Environment(\.self) private var environment

    let catalog: Catalog
    let onAdd: (BlockColor) -> Void

    @State private var name = ""
    @State private var hex = Self.defaultHex
    /// The last valid hex, kept on screen while a hex is half-typed.
    @State private var preview = Self.defaultHex
    @FocusState private var focusedField: Field?

    private enum Field { case name, hex }

    private var color: BlockColor? { ColorMath.customColor(name: name, hex: hex) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    HStack(spacing: 16) {
                        Circle()
                            .fill(Color(hex: preview))
                            .overlay {
                                Circle().strokeBorder(Color.fitsssSeparator, lineWidth: ColorMath.isLight(preview) ? 1 : 0)
                            }
                            .frame(width: 64, height: 64)
                            .accessibilityHidden(true)
                        VStack(spacing: 0) {
                            TextField("Name", text: $name, prompt: Text("Name, e.g. Dusty rose"))
                                .focused($focusedField, equals: .name)
                                .submitLabel(.next)
                                .onSubmit { focusedField = .hex }
                                .frame(minHeight: Metrics.minTapTarget)
                                .onChange(of: name) { _, value in
                                    let limited = value.prefix(serverLimit: Cart.colorNameLimit)
                                    if limited != value { name = limited }
                                }
                                .accessibilityIdentifier("addflow.customName")
                            Divider()
                            TextField("Hex", text: $hex, prompt: Text("#rrggbb"))
                                .font(.body.monospaced())
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .keyboardType(.asciiCapable)
                                .focused($focusedField, equals: .hex)
                                .submitLabel(.done)
                                .onSubmit(add)
                                .frame(minHeight: Metrics.minTapTarget)
                                .onChange(of: hex) { _, value in
                                    if let normalized = ColorMath.normalizeHex(value) { preview = normalized }
                                }
                                .accessibilityIdentifier("addflow.customHex")
                        }
                    }
                    ColorPicker("Pick visually", selection: pickerColor, supportsOpacity: false)
                } footer: {
                    Text(footer)
                }
            }
            .navigationTitle("Custom color")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Add", action: add)
                        .disabled(color == nil)
                        .accessibilityIdentifier("addflow.customAdd")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .onAppear { focusedField = .name }
    }

    private var footer: String {
        guard let color else { return "Enter a hex like #7a5230." }
        return "Filed under \(catalog.familyLabel(color.family).lowercased())."
    }

    /// The system picker, read back into a hex. Wide-gamut picks are clamped to sRGB.
    private var pickerColor: Binding<Color> {
        Binding {
            Color(hex: preview)
        } set: { picked in
            let resolved = picked.resolve(in: environment)
            let channel = { (value: Float) in Int((min(max(Double(value), 0), 1) * 255).rounded()) }
            let next = String(format: "#%02x%02x%02x", channel(resolved.red), channel(resolved.green), channel(resolved.blue))
            hex = next
            preview = next
        }
    }

    private func add() {
        guard let color else { return }
        onAdd(color)
        dismiss()
    }
}
