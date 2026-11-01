import FitsssCore
import FitsssUI
import SwiftUI

/// The suitcase: how much is packed, what the plan could not satisfy, the
/// tips, then every piece grouped by category with its drawing. Tap a row to
/// tick it; the count badge (or a long press, or a swipe) changes how many
/// to bring or takes a spare out. The server refuses to go below what the
/// days wear; its sentence goes to `onRefused`.
struct SuitcaseSections: View {
    let trip: Trip
    let plan: TripPlan
    let pieces: [Block]
    let catalog: Catalog?
    /// Packing in progress: ticks and counts wait.
    let isLocked: Bool
    let onRefused: (RefusedChange) -> Void

    @Environment(TripsStore.self) private var trips
    @Environment(ToastCenter.self) private var toasts
    /// Pieces whose count is being written.
    @State private var changing: Set<String> = []

    var body: some View {
        let byId = Dictionary(pieces.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        Section {
            progress
        }

        if !plan.warnings.isEmpty {
            Section {
                ForEach(Array(plan.warnings.enumerated()), id: \.offset) { _, warning in
                    noteRow(warning, systemImage: "exclamationmark.triangle")
                }
            } header: {
                Text("Heads up")
            }
            .accessibilityIdentifier("trip.warnings")
        }

        if !plan.tips.isEmpty {
            Section {
                ForEach(Array(plan.tips.enumerated()), id: \.offset) { _, tip in
                    noteRow(tip, systemImage: "lightbulb")
                }
            } header: {
                Text("Tips")
            }
            .accessibilityIdentifier("trip.tips")
        }

        ForEach(groups(byId: byId)) { group in
            Section {
                ForEach(group.items) { item in
                    PackingRow(
                        item: item,
                        block: byId[item.blockId],
                        isLocked: isLocked,
                        isChanging: changing.contains(item.blockId),
                        onToggle: { toggle(item) },
                        onCount: { count in setCount(item, to: count) }
                    )
                }
            } header: {
                Text(group.label)
            }
        }
    }

    // MARK: - Progress

    private var progress: some View {
        let total = plan.packing.count
        let packed = plan.packedCount
        let done = total > 0 && packed == total

        return VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(TripText.packedLine(trip))
                    .font(.headline)
                    .foregroundStyle(done ? Color.fitsssSuccess : Color.fitsssLabel)
                    .contentTransition(.numericText())
                Spacer()
                if done {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(Color.fitsssSuccess)
                        .accessibilityHidden(true)
                }
            }
            ProgressView(value: Double(packed), total: Double(max(total, 1)))
                .tint(done ? Color.fitsssSuccess : Color.fitsssInk)
                .animation(.easeOut(duration: 0.2), value: packed)
            Text(optionsLine)
                .font(.footnote)
                .foregroundStyle(Color.fitsssLabel2)
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(TripText.packedLine(trip)). \(optionsLine)")
        .accessibilityIdentifier("trip.progress")
    }

    /// "Checked bag · City, Evenings out · No laundry".
    private var optionsLine: String {
        var parts = [catalog?.luggageLabel(trip.options.luggage) ?? trip.options.luggage.sentenceCased]
        if !trip.options.activities.isEmpty {
            parts.append(trip.options.activities.map { catalog?.activityLabel($0) ?? $0.sentenceCased }.joined(separator: ", "))
        }
        parts.append(trip.options.laundry ? "Laundry on the way" : "No laundry")
        return parts.joined(separator: " · ")
    }

    private func noteRow(_ text: String, systemImage: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: systemImage)
                .font(.subheadline)
                .foregroundStyle(Color.fitsssLabel2)
                .frame(width: 20)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(Color.fitsssLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.vertical, 2)
    }

    // MARK: - Groups

    private struct PackingGroup: Identifiable {
        let role: String
        let label: String
        var items: [PackingItem]
        var id: String { role }
    }

    /// The packing list by category, in the server's order (outerwear
    /// first, accessories last); pieces the closet no longer knows go last.
    private func groups(byId: [String: Block]) -> [PackingGroup] {
        var groups: [PackingGroup] = []
        var index: [String: Int] = [:]
        for item in plan.packing {
            let role = byId[item.blockId]?.category ?? "missing"
            if let at = index[role] {
                groups[at].items.append(item)
            } else {
                let label = role == "missing" ? "No longer in your closet" : (catalog?.roleLabel(role) ?? role.sentenceCased)
                index[role] = groups.count
                groups.append(PackingGroup(role: role, label: label, items: [item]))
            }
        }
        if let missing = index["missing"], missing != groups.count - 1 {
            groups.append(groups.remove(at: missing))
        }
        return groups
    }

    // MARK: - Writes

    private func toggle(_ item: PackingItem) {
        guard !isLocked else { return }
        Task {
            do {
                try await trips.setPacked(trip.id, blockId: item.blockId, packed: !item.packed)
            } catch where !error.isQuiet {
                toasts.show("Couldn’t save that tick", isError: true)
            } catch {}
        }
    }

    private func setCount(_ item: PackingItem, to count: Int) {
        guard !isLocked, !changing.contains(item.blockId), count != item.count else { return }
        changing.insert(item.blockId)
        Task {
            defer { changing.remove(item.blockId) }
            do {
                try await trips.setCount(trip.id, blockId: item.blockId, count: count)
            } catch let error as APIError where !error.isQuiet {
                onRefused(RefusedChange(
                    title: count == 0 ? "Can’t take that out" : "Can’t change the count",
                    message: error.displayMessage
                ))
            } catch where !error.isQuiet {
                toasts.show("Couldn’t change that", isError: true)
            } catch {}
        }
    }
}

// MARK: - Row

/// One piece in the suitcase: the tick, the drawing, its name, and how many
/// of it to bring when that matters.
private struct PackingRow: View {
    let item: PackingItem
    let block: Block?
    let isLocked: Bool
    let isChanging: Bool
    let onToggle: () -> Void
    let onCount: (Int) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var quantity: Int { block?.quantity ?? item.count }
    private var showsCount: Bool { quantity > 1 || item.count > 1 }

    var body: some View {
        Button(action: onToggle) {
            HStack(spacing: 12) {
                Image(systemName: item.packed ? "checkmark.circle.fill" : "circle")
                    .font(.title2)
                    .foregroundStyle(item.packed ? Color.fitsssInk : Color.fitsssLabel3)
                    .contentTransition(reduceMotion ? .identity : .symbolEffect(.replace))
                    .frame(width: 28)
                    .accessibilityHidden(true)

                if let block {
                    Silhouette(block: block)
                        .frame(width: 32, height: 32)
                        .frame(width: 40, height: 40)
                        .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.body)
                        .foregroundStyle(item.packed ? Color.fitsssLabel2 : Color.fitsssLabel)
                    if let subtitle {
                        Text(subtitle)
                            .font(.subheadline)
                            .foregroundStyle(Color.fitsssLabel2)
                    }
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

                if isChanging {
                    ProgressView()
                        .accessibilityLabel("Changing the count")
                } else if showsCount {
                    countMenu
                }
            }
            .padding(.vertical, 2)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(isLocked || block == nil)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityValue(item.packed ? "Packed" : "Not packed")
        .accessibilityHint(block == nil ? "" : "Double tap to \(item.packed ? "untick" : "tick")")
        .accessibilityIdentifier("trip.item.\(item.blockId)")
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if block != nil {
                Button("Take out", systemImage: "minus.circle") { onCount(0) }
                    .tint(Color.fitsssTint)
            }
        }
        .contextMenu {
            if block != nil { countActions }
        }
        .animation(.easeOut(duration: 0.15), value: item.packed)
    }

    /// The nickname when there is one, else the piece's label.
    private var title: String {
        guard let block else { return "A piece no longer in your closet" }
        if let nickname = block.nickname?.trimmed, !nickname.isEmpty { return nickname }
        return block.label.sentenceCased
    }

    private var subtitle: String? {
        guard let block, let nickname = block.nickname?.trimmed, !nickname.isEmpty else { return nil }
        return block.label.sentenceCased
    }

    /// "×2 of 4": a menu of counts.
    private var countMenu: some View {
        Menu {
            countActions
        } label: {
            Text("×\(item.count) of \(quantity)")
                .font(.footnote.weight(.medium))
                .monospacedDigit()
                .foregroundStyle(Color.fitsssLabel2)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.fitsssFill, in: Capsule())
                .frame(minHeight: Metrics.minTapTarget)
                .contentShape(Rectangle())
        }
        .disabled(isLocked)
        .accessibilityLabel("Bringing \(item.count) of \(quantity)")
        .accessibilityHint("Change how many to bring")
        .accessibilityIdentifier("trip.item.\(item.blockId).count")
    }

    @ViewBuilder
    private var countActions: some View {
        if quantity > 1 {
            ForEach(1...quantity, id: \.self) { count in
                Button {
                    onCount(count)
                } label: {
                    if count == item.count {
                        Label("Bring \(count)", systemImage: "checkmark")
                    } else {
                        Text("Bring \(count)")
                    }
                }
                .disabled(count == item.count)
            }
            Divider()
        }
        Button("Take out of the bag", systemImage: "minus.circle", role: .destructive) { onCount(0) }
    }

    private var accessibilityLabel: String {
        var parts = [title]
        if let subtitle { parts.append(subtitle) }
        if showsCount { parts.append("bringing \(item.count) of \(quantity)") }
        return parts.joined(separator: ", ")
    }
}
