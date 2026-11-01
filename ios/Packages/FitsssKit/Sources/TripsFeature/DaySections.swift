import FitsssCore
import FitsssUI
import SwiftUI

/// One section a day: the date and that day's weather in the header, the
/// outfit as a flat lay with its name, why it works and the tip, then its
/// pieces, each a row that offers to swap it. A slot whose piece has left
/// the closet still gets a row (the slot's name, "No longer in your closet")
/// so that day can be fixed without packing again.
struct DaySections: View {
    let trip: Trip
    let plan: TripPlan
    let pieces: [Block]
    let catalog: Catalog?
    /// Packing in progress: swaps wait.
    let isLocked: Bool
    let onSwap: (SwapTarget) -> Void

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let byId = Dictionary(pieces.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })

        ForEach(plan.days) { day in
            let entries = TripPieceEntry.entries(of: day.outfit, byId: byId, catalog: catalog)
            Section {
                DayCard(outfit: day.outfit, pieces: pieces, stacked: typeSize.isAccessibilitySize)
                    .accessibilityIdentifier("trip.day.\(day.date)")
                ForEach(entries) { entry in
                    Button {
                        onSwap(SwapTarget(date: day.date, entry: entry))
                    } label: {
                        PieceRow(entry: entry, catalog: catalog)
                    }
                    .buttonStyle(.plain)
                    .disabled(isLocked)
                    .accessibilityHint(entry.isInCloset ? "Swap this piece" : "Pick a piece for this slot")
                    .accessibilityIdentifier(entry.isInCloset
                        ? "trip.day.\(day.date).piece.\(entry.blockId)"
                        : "trip.day.\(day.date).slot.\(entry.id.replacingOccurrences(of: ":", with: "."))")
                }
            } header: {
                DayHeader(date: day.date, weather: trip.weather(on: day.date))
            }
        }
    }
}

/// "Sat, Nov 7" with the day's weather trailing: the symbol and the high
/// (a tilde before a typical day's).
private struct DayHeader: View {
    let date: String
    let weather: TripDayWeather?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(TripText.dayTitle(date))
            Spacer()
            if let weather {
                HStack(spacing: 4) {
                    Image(systemName: weatherSymbol(weather.condition))
                    Text((weather.isTypical ? "~" : "") + TripText.degrees(weather.tempC))
                        .monospacedDigit()
                }
                .accessibilityLabel(weatherText(weather))
            }
        }
    }

    private func weatherText(_ weather: TripDayWeather) -> String {
        "high \(TripText.degrees(weather.tempC))\(weather.isTypical ? ", typical for the date" : "")"
    }
}

/// The flat lay beside the outfit's name, why it works and the tip; stacked
/// at accessibility sizes so the text has the width.
private struct DayCard: View {
    let outfit: Outfit
    let pieces: [Block]
    let stacked: Bool

    var body: some View {
        let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12)) : AnyLayout(HStackLayout(alignment: .top, spacing: 12))
        layout {
            if stacked {
                SquareFlatLay(slots: outfit.slots, pieces: pieces, size: .medium)
            } else {
                SquareFlatLay(slots: outfit.slots, pieces: pieces, size: .small)
                    .frame(width: 132, height: 132)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(outfit.name)
                    .font(.headline)
                    .foregroundStyle(Color.fitsssLabel)
                    .accessibilityAddTraits(.isHeader)
                if !outfit.why.isEmpty {
                    Text(outfit.why)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                }
                if let tip = outfit.tip?.trimmed, !tip.isEmpty {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Image(systemName: "lightbulb")
                            .foregroundStyle(Color.fitsssLabel3)
                            .accessibilityHidden(true)
                        Text(tip)
                            .foregroundStyle(Color.fitsssLabel2)
                    }
                    .font(.footnote)
                    .padding(.top, 2)
                    .accessibilityLabel("Tip: \(tip)")
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, 4)
    }
}

/// `OutfitFlatLay` on a filled square: on its own the flat lay's well is
/// only as tall as its drawings wherever the height is open (a list row),
/// so the square sets the shape and the flat lay sits centered on it (as
/// `SquareFlatLay` in LooksFeature and InspoFeature).
private struct SquareFlatLay: View {
    let slots: OutfitSlots
    let pieces: [Block]
    let size: OutfitFlatLay.Size

    var body: some View {
        RoundedRectangle(cornerRadius: Metrics.thumbRadius)
            .fill(Color.fitsssCard2)
            .aspectRatio(1, contentMode: .fit)
            .overlay { OutfitFlatLay(slots: slots, blocks: pieces, size: size) }
            .accessibilityElement(children: .combine)
    }
}

/// A piece of the day: drawing, name, category, and the swap glyph. For a
/// piece that has left the closet (archived, still drawable; or deleted,
/// only its slot known): the slot's name and why it needs filling.
private struct PieceRow: View {
    let entry: TripPieceEntry
    let catalog: Catalog?

    var body: some View {
        let role = catalog?.roleLabel(entry.role) ?? entry.role.sentenceCased
        HStack(spacing: 12) {
            Group {
                if let block = entry.block {
                    Silhouette(block: block)
                        .frame(width: 32, height: 32)
                        .opacity(entry.isInCloset ? 1 : 0.5)
                } else {
                    Image(systemName: "questionmark")
                        .font(.body.weight(.medium))
                        .foregroundStyle(Color.fitsssLabel3)
                        .accessibilityHidden(true)
                }
            }
            .frame(width: 40, height: 40)
            .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                if let block = entry.block, entry.isInCloset {
                    Text(block.label.sentenceCased)
                        .font(.body)
                        .foregroundStyle(Color.fitsssLabel)
                    Text(role)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                } else {
                    Text(entry.block.map { "\(role): \($0.label)" } ?? role)
                        .font(.body)
                        .foregroundStyle(Color.fitsssLabel)
                    Text("No longer in your closet")
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                }
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "arrow.left.arrow.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.fitsssLabel3)
                .accessibilityHidden(true)
        }
        .padding(.vertical, 2)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One piece of an outfit, tagged with the slot it fills: what the swap
/// endpoint needs. The same mapping as Today's `PieceEntry`, except that a
/// piece the closet no longer knows keeps its row (`block` nil) so the slot
/// can be filled again.
struct TripPieceEntry: Identifiable, Hashable {
    /// The slot id, or `accessories:<blockId>` for each accessory.
    let id: String
    /// An outfit slot id from `Catalog.outfitSlots`, or `accessories`.
    let slot: String
    /// The role whose pieces may fill the slot (`Block.category`).
    let role: String
    /// What the day wears there, as the plan has it.
    let blockId: String
    /// The piece, when the closet (active or archived) still knows it.
    let block: Block?

    static let accessoriesSlot = "accessories"
    static let accessoryRole = "accessory"

    var isAccessory: Bool { slot == Self.accessoriesSlot }
    /// Still wearable: in the closet and not archived. Otherwise the slot
    /// needs another piece.
    var isInCloset: Bool { block.map { !$0.isArchived } ?? false }

    /// The outfit's pieces in the catalog's slot order, accessories last.
    static func entries(of outfit: Outfit, byId: [String: Block], catalog: Catalog?) -> [TripPieceEntry] {
        var entries: [TripPieceEntry] = []
        let slots = catalog?.allOutfitSlots ?? []
        if slots.isEmpty {
            // A catalog cached before slots were served: every built-in slot
            // is named after its role, which is the piece's category. A
            // piece it doesn't know has no slot to name, so it is left out.
            for id in outfit.slots.blockIds where !outfit.slots.accessories.contains(id) {
                if let block = byId[id] {
                    entries.append(TripPieceEntry(id: block.category, slot: block.category, role: block.category, blockId: id, block: block))
                }
            }
        } else {
            for slot in slots {
                if let id = outfit.slots[slot.id] {
                    entries.append(TripPieceEntry(id: slot.id, slot: slot.id, role: slot.role, blockId: id, block: byId[id]))
                }
            }
        }
        for id in outfit.slots.accessories {
            entries.append(TripPieceEntry(
                id: "\(accessoriesSlot):\(id)", slot: accessoriesSlot, role: accessoryRole, blockId: id, block: byId[id]
            ))
        }
        return entries
    }
}
