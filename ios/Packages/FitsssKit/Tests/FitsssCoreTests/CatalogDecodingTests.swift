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

    @Test func blockPatternColorRoundTrips() throws {
        let json = """
        {"id":"b1","typeId":"t-shirt","category":"top","color":{"hex":"#ffffff","name":"White","family":"neutral","paletteId":"white"},
        "fit":"relaxed","pattern":"stripe","patternColor":{"hex":"#1f2a44","name":"Navy","family":"blue","paletteId":"navy"},
        "effectiveWeight":"light","quantity":1,"warmth":1,"formality":2,"seasons":["summer"],
        "label":"white cotton t-shirt with navy stripes","createdAt":"2026-11-01T08:00:00.000Z","updatedAt":"2026-11-01T08:00:00.000Z"}
        """
        let block = try APIClient.decoder.decode(Block.self, from: Data(json.utf8))
        #expect(block.patternColor?.paletteId == "navy")
        let sent = String(decoding: try APIClient.encoder.encode(block.input), as: UTF8.self)
        #expect(sent.contains("\"patternColor\":{"))

        // An older server sends null, or nothing at all.
        let none = try APIClient.decoder.decode(Block.self, from: Data(json.replacingOccurrences(
            of: ##""patternColor":{"hex":"#1f2a44","name":"Navy","family":"blue","paletteId":"navy"},"##, with: #""patternColor":null,"#).utf8))
        #expect(none.patternColor == nil)
        #expect(!String(decoding: try APIClient.encoder.encode(none.input), as: UTF8.self).contains("patternColor"))
    }

    private func catalogJSON(art: String, ref: String, extra: String = "") -> Data {
        Data("""
        {"version":"v1","categories":[],"fitLabels":{},"variantLabels":{},"materials":[],"patterns":[],"weights":[],
        "colorFamilies":[],"palette":[],\(extra)
        "types":[{"id":"jeans","role":"bottom","categoryId":"bottom","custom":false,"label":"Jeans","plural":"Jeans",
        "fitOptions":["slim","baggy"],"materialOptions":["denim"],"defaultWeight":"mid","patternOptions":["solid","stripe"],
        "suggestedColors":[],"art":\(ref)}],
        "art":\(art)}
        """.utf8)
    }

    @Test func decodesKitLayersFitsAndTiles() throws {
        let art = """
        {"kit:jeans:a1":{"viewBox":"0 0 100 100","body":"<path d=\\"M0 0h1v1z\\"/>",
          "layers":{"base":"<g/>","lines":"<g/>","clip":"M0 0h10v10H0Z","box":[0,0,10,10.5],"stripe":"v","graphic":[5,5,4]}},
         "kit:jeans@baggy:b2":{"viewBox":"0 0 100 100","body":"<g/>"},
         "kit:jeans~raw:c3":{"viewBox":"0 0 100 100","body":"<g/>"}}
        """
        let ref = #"{"default":"kit:jeans:a1","fits":{"baggy":"kit:jeans@baggy:b2"},"variants":{"raw":"kit:jeans~raw:c3"}}"#
        let tiles = #""patternTiles":{"stripe":{"kind":"field","markup":"<rect/>","markupV":"<rect x=\"1\"/>"},"logo":{"kind":"motif","anchor":"logo","markup":"<path/>"}},"#
        let catalog = try APIClient.decoder.decode(Catalog.self, from: catalogJSON(art: art, ref: ref, extra: tiles))

        let layers = try #require(catalog.art["kit:jeans:a1"]?.layers)
        #expect(layers.box == [0, 0, 10, 10.5])
        #expect(layers.stripe == "v")
        #expect(layers.graphic == [5, 5, 4])
        #expect(layers.logo == nil && layers.block == nil)
        #expect(catalog.patternTile("stripe")?.markupV == #"<rect x="1"/>"#)
        #expect(catalog.patternTile("logo")?.anchor == "logo")
        #expect(catalog.patternTile("solid") == nil)

        // Variant first, then fit, then the type's own drawing.
        #expect(catalog.art(typeId: "jeans")?.key == "kit:jeans:a1")
        #expect(catalog.art(typeId: "jeans", fit: "baggy")?.key == "kit:jeans@baggy:b2")
        #expect(catalog.art(typeId: "jeans", fit: "slim")?.key == "kit:jeans:a1")
        #expect(catalog.art(typeId: "jeans", variant: "raw", fit: "baggy")?.key == "kit:jeans~raw:c3")
    }

    /// What the server sends today: `split` cuts `body` into base and lines,
    /// and a malformed layers object drops only the pattern support.
    @Test func decodesSplitLayersAndPanels() throws {
        let art = """
        {"kit:jeans:a1":{"viewBox":"0 0 100 100","body":"<g a=\\"é\\"/><path/>",
          "layers":{"split":10,"clip":"M0 0h10v10H0Z","box":[0,0,10,10],
            "panels":[{"clip":"M0 0h2v2H0Z","box":[0,0,2,2],"angle":-20}]}},
         "kit:jeans@baggy:b2":{"viewBox":"0 0 100 100","body":"<g/>","layers":{"split":99,"clip":"","box":[]}}}
        """
        let ref = #"{"default":"kit:jeans:a1","fits":{"baggy":"kit:jeans@baggy:b2"}}"#
        let catalog = try APIClient.decoder.decode(Catalog.self, from: catalogJSON(art: art, ref: ref))

        let layers = try #require(catalog.art["kit:jeans:a1"]?.layers)
        #expect(layers.base == #"<g a="é"/>"#)
        #expect(layers.lines == "<path/>")
        #expect(layers.panels?.first?.angle == -20)
        #expect(catalog.art["kit:jeans@baggy:b2"]?.layers == nil)
        #expect(catalog.art["kit:jeans@baggy:b2"]?.body == "<g/>")
    }

    @Test func decodesCatalogWithoutKitFields() throws {
        let catalog = try APIClient.decoder.decode(Catalog.self, from: catalogJSON(
            art: #"{"jeans":{"viewBox":"0 0 64 64","body":"<g/>"}}"#,
            ref: #"{"default":"jeans"}"#
        ))
        #expect(catalog.patternTiles == nil)
        #expect(catalog.art["jeans"]?.layers == nil)
        #expect(catalog.art(typeId: "jeans", fit: "baggy")?.key == "jeans")
    }

    @Test func familyMatchesWebThresholds() {
        #expect(ColorMath.family(forHex: "#1f2a44") == "blue")
        #expect(ColorMath.family(forHex: "#7a5230") == "brown")
        #expect(ColorMath.family(forHex: "#8e8e93") == "neutral")
        #expect(ColorMath.family(forHex: "#e9a7b8") == "pink")
    }
}
