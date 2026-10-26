import FitsssCore
import Foundation

/// One piece of an outfit, tagged with the slot it fills: what the pieces
/// strip shows and what Swap offers to change. Port of `pieceEntries` in
/// `TodayOutfitCard.tsx`.
struct PieceEntry: Identifiable, Hashable {
    /// The slot id, or `accessories:<blockId>` for each accessory.
    let id: String
    /// An outfit slot id from `Catalog.outfitSlots`, or `accessories`.
    let slot: String
    /// The role whose pieces may fill the slot (`Block.category`).
    let role: String
    let block: Block

    /// The swap endpoint's name for the accessories slot, and the role that fills it.
    static let accessoriesSlot = "accessories"
    static let accessoryRole = "accessory"

    var isAccessory: Bool { slot == Self.accessoriesSlot }

    /// The outfit's pieces in the catalog's slot order, accessories last.
    /// Pieces the closet no longer knows are left out.
    static func entries(of outfit: Outfit, byId: [String: Block], catalog: Catalog?) -> [PieceEntry] {
        var entries: [PieceEntry] = []
        let slots = catalog?.allOutfitSlots ?? []
        if slots.isEmpty {
            // A catalog cached before slots were served: every built-in slot is
            // named after its role, which is the piece's category.
            for id in outfit.slots.blockIds where !outfit.slots.accessories.contains(id) {
                if let block = byId[id] {
                    entries.append(PieceEntry(id: block.category, slot: block.category, role: block.category, block: block))
                }
            }
        } else {
            for slot in slots {
                if let id = outfit.slots[slot.id], let block = byId[id] {
                    entries.append(PieceEntry(id: slot.id, slot: slot.id, role: slot.role, block: block))
                }
            }
        }
        for id in outfit.slots.accessories {
            if let block = byId[id] {
                entries.append(PieceEntry(
                    id: "\(accessoriesSlot):\(id)", slot: accessoriesSlot, role: accessoryRole, block: block
                ))
            }
        }
        return entries
    }
}
