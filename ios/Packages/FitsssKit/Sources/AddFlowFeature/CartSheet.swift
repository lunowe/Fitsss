import FitsssCore
import FitsssUI
import SwiftUI

/// Cart review: everything queued up, grouped by category, before it is
/// written in one batch. The port of `CartSheet.tsx`.
///
/// On a full save it clears the cart and closes the flow. When the server
/// rejects some lines, only those stay, each with the server's reason. When
/// the request is refused, the cart is kept as it was. When the answer never
/// arrives, the batch stays pending (shown read-only at the top) and the next
/// tap resends exactly it, under the same idempotency key.
struct CartSheet: View {
    @Environment(CartStore.self) private var cart
    @Environment(ClosetStore.self) private var closet
    @Environment(ToastCenter.self) private var toasts
    @Environment(\.dismiss) private var dismiss

    /// Called after everything was saved; closes the whole flow.
    let onSaved: () -> Void

    @State private var isSaving = false
    @State private var failure: String?
    @State private var confirmsClear = false
    @State private var errorFeedback = 0

    var body: some View {
        NavigationStack {
            CatalogGate { catalog in
                List {
                    if let pending = cart.pendingSave {
                        PendingSection(pending: pending, catalog: catalog, isSending: isBusy) {
                            guard !isSaving else { return }
                            isSaving = true
                            Task { await putBack() }
                        }
                    }
                    if let failure {
                        Section {
                            Label {
                                Text(failure)
                                    .foregroundStyle(Color.fitsssLabel)
                            } icon: {
                                Image(systemName: "exclamationmark.circle.fill")
                                    .foregroundStyle(Color.fitsssDestructive)
                            }
                            .font(.subheadline)
                            .accessibilityIdentifier("addflow.cartError")
                        }
                    }
                    ForEach(cart.cart.grouped(in: catalog)) { group in
                        Section(catalog.category(group.categoryId)?.label ?? "Other") {
                            ForEach(group.lines) { line in
                                CartLineRow(line: line, catalog: catalog) { quantity in
                                    withAnimation(.easeOut(duration: 0.15)) {
                                        cart.setQuantity(quantity, forLine: line.key)
                                    }
                                }
                                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                    Button(role: .destructive) {
                                        withAnimation(.easeOut(duration: 0.15)) { cart.remove(line.key) }
                                    } label: {
                                        Label("Remove", systemImage: "trash")
                                    }
                                }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
                .disabled(isBusy)
            }
            .navigationTitle("Cart")
            .navigationSubtitle(plural(cart.totalCount, "piece"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(role: .close) { dismiss() }
                        .disabled(isBusy)
                }
                ToolbarItem(placement: .primaryAction) {
                    Button("Clear", role: .destructive) { confirmsClear = true }
                        .disabled(isBusy || cart.isEmpty)
                        .confirmationDialog("Clear the cart?", isPresented: $confirmsClear, titleVisibility: .visible) {
                            Button("Clear Cart", role: .destructive) { cart.clear() }
                        } message: {
                            Text("Nothing has been added to your closet yet.")
                        }
                        .accessibilityIdentifier("addflow.clearCart")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    Button {
                        // Flipped before the task starts, so a second tap can
                        // never send the batch twice.
                        guard !isSaving else { return }
                        isSaving = true
                        Task { await save() }
                    } label: {
                        if isBusy {
                            HStack(spacing: 8) {
                                ProgressView().tint(Color.fitsssInkForeground)
                                Text("Adding…")
                            }
                        } else {
                            Text("Add \(plural(cart.totalCount, "piece")) to closet")
                                .monospacedDigit()
                        }
                    }
                    .buttonStyle(.fitsssPrimary)
                    .disabled(isBusy || cart.isCompletelyEmpty)
                    .accessibilityIdentifier("addflow.saveCart")
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .interactiveDismissDisabled(isBusy)
        .sensoryFeedback(.error, trigger: errorFeedback)
    }

    /// Saving here, or the flow resending an unanswered save on its own.
    private var isBusy: Bool { isSaving || cart.isSending }

    /// Call with `isSaving` already set. Sends an unanswered earlier save
    /// first (exactly as it was), then whatever is in the cart now.
    private func save() async {
        defer { isSaving = false }
        failure = nil
        var added = 0
        var rejectedAny = false

        // The unanswered save first (if any), then the cart in batches of at
        // most `Cart.maxLines`; lines the server rejects are skipped for the
        // rest of this save. Bounded so a misbehaving server can't spin it.
        for _ in 0..<((cart.cart.lines.count / Cart.maxLines) + 3) {
            let outcome = await cart.save(skippingRejected: rejectedAny) { inputs, key in
                try await closet.create(inputs, idempotencyKey: key)
            }
            switch outcome {
            case .nothingToSend:
                break
            case .saved(let count, let rejected):
                added += count
                if rejected > 0 { rejectedAny = true }
                continue
            case .unconfirmed:
                failure = Self.unconfirmedMessage
                errorFeedback += 1
                return
            case .refused(let message):
                failure = added > 0 ? "\(plural(added, "piece")) added. \(message)" : message
                errorFeedback += 1
                return
            }
            break
        }

        if rejectedAny {
            let notAdded = cart.cart.lines.filter { !$0.errors.isEmpty }.reduce(0) { $0 + $1.quantity }
            failure = "\(plural(added, "piece")) added. \(plural(notAdded, "piece")) couldn’t be added; see below."
            toasts.show("Added \(added.formatted()) of \((added + notAdded).formatted()) pieces", isError: true)
            errorFeedback += 1
            return
        }
        if cart.isCompletelyEmpty, added > 0 { finish(added: added) }
    }

    private static let unconfirmedMessage =
        "Couldn’t confirm the save. Try again; nothing will be added twice. If it keeps failing, put the pieces back in your cart."

    /// "Put back in cart": asks the server whether the unanswered save was
    /// stored, and only puts the pieces back on a definite no.
    private func putBack() async {
        defer { isSaving = false }
        failure = nil
        let outcome = await cart.putBackPending { key in
            try await closet.abandonSave(idempotencyKey: key)
        }
        switch outcome {
        case .wasSaved(let added, 0):
            if cart.isCompletelyEmpty {
                finish(added: added)
            } else {
                toasts.show("That save went through: \(plural(added, "piece")) added")
            }
        case .wasSaved(let added, _):
            failure = "That save went through: \(plural(added, "piece")) added. The rest are back below."
        case .putBack:
            toasts.show("Back in your cart")
        case .stillUnknown:
            failure = "Can’t reach Fitsss to check that save. Try again later."
            errorFeedback += 1
        case .nothingPending:
            break
        }
    }

    private func finish(added: Int) {
        toasts.show("\(plural(added, "piece")) added")
        onSaved()
    }
}

/// The batch of an unanswered save, read-only above the cart until the
/// server confirms it.
private struct PendingSection: View {
    let pending: PendingSave
    let catalog: Catalog
    let isSending: Bool
    let onPutBack: () -> Void

    var body: some View {
        Section {
            // A few lines and a count, so "Put back in cart" below stays in reach
            // however big the batch was.
            ForEach(pending.cartLines.prefix(5)) { line in
                CartLineRow(line: line, catalog: catalog, onQuantity: nil)
            }
            if pending.lines.count > 5 {
                let rest = pending.lines.dropFirst(5).reduce(0) { $0 + $1.quantity }
                Text("and \(plural(rest, "more piece"))")
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
            }
        } header: {
            HStack(spacing: 6) {
                if isSending { ProgressView().controlSize(.mini) }
                Text(isSending ? "Finishing your last save…" : "Last save not confirmed")
            }
            .accessibilityIdentifier("addflow.pending")
        } footer: {
            VStack(alignment: .leading, spacing: 8) {
                Text("These were sent but no answer came back. Adding again finishes that save without adding anything twice.")
                if !isSending {
                    Button("Put back in cart", action: onPutBack)
                        .font(.footnote.weight(.semibold))
                        .accessibilityIdentifier("addflow.putBack")
                }
            }
        }
    }
}

private struct CartLineRow: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let line: CartLine
    let catalog: Catalog
    /// Nil for a line that can't be edited (part of a save in flight).
    let onQuantity: ((Int) -> Void)?

    var body: some View {
        let headline = catalog.headline(typeId: line.input.typeId, fit: line.input.fit, variant: line.input.variant)
        // What VoiceOver calls the line on its stepper: enough to tell lines apart.
        let spoken = "\(headline), \(catalog.colorLine(color: line.input.color, secondaryColor: line.input.secondaryColor, material: line.input.material))"
        if dynamicTypeSize.isAccessibilitySize {
            // The stepper gets its own line so the text is not squeezed to nothing.
            VStack(alignment: .leading, spacing: 8) {
                details(headline: headline)
                HStack {
                    Spacer()
                    stepper(spoken: spoken)
                }
            }
            .padding(.vertical, 4)
        } else {
            HStack(spacing: 12) {
                details(headline: headline)
                Spacer(minLength: 4)
                stepper(spoken: spoken)
            }
            .padding(.vertical, 2)
        }
    }

    @ViewBuilder
    private func stepper(spoken: String) -> some View {
        if let onQuantity {
            QuantityStepper(quantity: line.quantity, label: spoken, onChange: onQuantity)
        } else {
            Text("×\(line.quantity)")
                .font(.subheadline.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(Color.fitsssLabel2)
                .accessibilityLabel("\(line.quantity) \(spoken)")
        }
    }

    private func details(headline: String) -> some View {
        let input = line.input
        var colorLine = catalog.colorLine(color: input.color, secondaryColor: input.secondaryColor, material: input.material)
        if input.pattern != "solid" { colorLine += " · \(catalog.patternLabel(input.pattern))" }

        return HStack(spacing: 12) {
            Silhouette(
                typeId: input.typeId,
                variant: input.variant,
                color: input.color.hex,
                secondaryColor: input.secondaryColor?.hex
            )
            .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(headline)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                HStack(spacing: 6) {
                    SwatchDot(hex: input.color.hex, secondaryHex: input.secondaryColor?.hex)
                    Text(colorLine)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? 3 : 1)
                }
                if let nickname = input.nickname {
                    Text("“\(nickname)”")
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(1)
                }
                ForEach(line.errors, id: \.self) { error in
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssDestructive)
                }
            }
            .accessibilityElement(children: .combine)
        }
    }
}

/// Compact minus / count / plus. At 1 the minus becomes a trash can, because
/// tapping it removes the line. The port of `QuantityStepper.tsx`.
private struct QuantityStepper: View {
    @ScaledMetric(relativeTo: .subheadline) private var buttonWidth: CGFloat = 40
    @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 44

    let quantity: Int
    /// What is being counted, for VoiceOver.
    let label: String
    /// Called with the new quantity; 0 means "remove this line".
    let onChange: (Int) -> Void

    var body: some View {
        let atMin = quantity <= 1
        HStack(spacing: 0) {
            Button { onChange(quantity - 1) } label: {
                Image(systemName: atMin ? "trash" : "minus")
                    .font(.subheadline.weight(.semibold))
                    .frame(width: buttonWidth, height: height)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(atMin ? "Remove \(label)" : "One fewer \(label)")
            .accessibilityIdentifier("addflow.decrement")

            Text(quantity, format: .number)
                .font(.subheadline.weight(.medium))
                .monospacedDigit()
                .frame(minWidth: buttonWidth / 2)
                .contentTransition(.numericText(value: Double(quantity)))
                .accessibilityLabel("\(quantity) \(label)")
                .accessibilityIdentifier("addflow.quantity")

            Button { onChange(quantity + 1) } label: {
                Image(systemName: "plus")
                    .font(.subheadline.weight(.semibold))
                    .frame(width: buttonWidth, height: height)
                    .contentShape(Rectangle())
            }
            .disabled(quantity >= Cart.maxQuantity)
            .accessibilityLabel("One more \(label)")
            .accessibilityIdentifier("addflow.increment")
        }
        .buttonStyle(StepperPressStyle())
        .foregroundStyle(Color.fitsssLabel)
        .background(Color.fitsssFill, in: Capsule())
    }
}

/// `active:scale-90` on the glyph, and dimmed when disabled.
private struct StepperPressStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .opacity(isEnabled ? 1 : 0.4)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}
