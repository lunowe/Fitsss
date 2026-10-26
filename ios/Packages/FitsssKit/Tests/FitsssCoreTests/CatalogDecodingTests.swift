import Foundation
import Testing
@testable import FitsssCore

/// The catalog and blocks are the app's contract with the server; a field
/// renamed on one side shows up here instead of as an empty closet.
@Suite struct ContractTests {
    @Test func decodesBlockWithFractionalSecondDates() throws {
        let json = """
        {"data":[{"id":"577276f4-62f5-47e8-b63c-95fb172b844c","userId":"u","typeId":"necklace","category":"accessory",
        "color":{"hex":"#d1d0da","name":"Silver","family":"neutral"},"variant":"chain","material":"metal","pattern":"solid",
        "weight":"light","effectiveWeight":"light","quantity":1,"warmth":1,"formality":4,
        "seasons":["spring","summer","autumn","winter"],"label":"silver metal chain necklace",
        "createdAt":"2026-09-08T08:55:31.828Z","updatedAt":"2026-09-08T08:55:31.828Z","archivedAt":null}]}
        """
        struct Envelope: Decodable { var data: [Block] }
        let blocks = try APIClient.decoder.decode(Envelope.self, from: Data(json.utf8)).data
        #expect(blocks.count == 1)
        #expect(blocks[0].archivedAt == nil)
        #expect(blocks[0].input.variant == "chain")
    }

    @Test func encodesInputWithoutNulls() throws {
        let input = BlockInput(typeId: "t-shirt", color: BlockColor(name: "White", hex: "#ffffff", family: "neutral", paletteId: "white"), fit: "relaxed")
        let json = String(decoding: try APIClient.encoder.encode(input), as: UTF8.self)
        #expect(!json.contains("null"))
        #expect(json.contains("\"fit\":\"relaxed\""))
    }

    @Test func familyMatchesWebThresholds() {
        #expect(ColorMath.family(forHex: "#1f2a44") == "blue")
        #expect(ColorMath.family(forHex: "#7a5230") == "brown")
        #expect(ColorMath.family(forHex: "#8e8e93") == "neutral")
        #expect(ColorMath.family(forHex: "#e9a7b8") == "pink")
    }
}
