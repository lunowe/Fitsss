import FitsssCore
import Foundation
import Testing
@testable import AddFlowFeature

// Port of `src/components/closet/add/cart.test.ts`, plus the native-only
// behavior (quantity cap, partial-save handling, custom-category grouping,
// persistence round trip). The cart is what gets written to the closet, so a
// silent bug here means wrong or missing pieces.

private let white = BlockColor(name: "White", hex: "#ffffff", family: "neutral", paletteId: "white")
private let black = BlockColor(name: "Black", hex: "#111111", family: "neutral", paletteId: "black")

private func draft(
    typeId: String = "t-shirt",
    colors: [BlockColor] = [white, black],
    options: [String] = ["regular", "relaxed"],
    materials: [String] = [],
    pattern: String = "solid",
    weight: String? = nil,
    nickname: String? = nil,
    notes: String? = nil
) -> Draft {
    Draft(
        typeId: typeId, colors: colors, options: options, materials: materials,
        pattern: pattern, weight: weight, nickname: nickname, notes: notes
    )
}

/// A server failure as `POST /api/v1/blocks` reports it.
private func failure(_ index: Int, _ errors: [String]) -> CreateBlocksResult.Failure {
    let json = try! JSONEncoder().encode(["index": AnyCodable.int(index), "errors": .strings(errors)])
    return try! JSONDecoder().decode(CreateBlocksResult.Failure.self, from: json)
}

private enum AnyCodable: Encodable {
    case int(Int), strings([String])

    func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .int(let value): try container.encode(value)
        case .strings(let value): try container.encode(value)
        }
    }
}

private func cart(_ inputs: [CartInput]...) -> Cart {
    var cart = Cart()
    for batch in inputs { cart.add(batch) }
    return cart
}

/// Just enough catalog for grouping and restoring: two built-in categories
/// and one custom one filed as an accessory.
private let catalog: Catalog = {
    let json = """
    {"version":"test","categories":[
      {"id":"top","label":"Tops","hint":"","role":"top","custom":false},
      {"id":"footwear","label":"Shoes","hint":"","role":"footwear","custom":false},
      {"id":"jewelry","label":"Jewelry","hint":"","role":"accessory","custom":true}],
     "types":[
      {"id":"t-shirt","role":"top","categoryId":"top","custom":false,"label":"T-shirt","plural":"T-shirts",
       "fitOptions":["regular","relaxed"],"materialOptions":["cotton","linen"],"defaultWeight":"light",
       "patternOptions":["solid"],"suggestedColors":["white"],"art":{"default":"tee"}},
      {"id":"sneakers","role":"footwear","categoryId":"footwear","custom":false,"label":"Sneakers","plural":"Sneakers",
       "variantOptions":["low-top"],"materialOptions":["leather"],"defaultWeight":"mid",
       "patternOptions":["solid"],"suggestedColors":["white"],"art":{"default":"sneaker"}},
      {"id":"necklace","role":"accessory","categoryId":"jewelry","custom":true,"label":"Necklace","plural":"Necklaces",
       "variantOptions":["chain"],"materialOptions":["metal"],"defaultWeight":"light",
       "patternOptions":["solid"],"suggestedColors":["white"],"art":{"default":"necklace"}}],
     "fitLabels":{},"variantLabels":{},"materials":[],"patterns":[],"weights":[],"colorFamilies":[],
     "palette":[],"art":{}}
    """
    return try! JSONDecoder().decode(Catalog.self, from: Data(json.utf8))
}()

@Suite struct ExpandDraftTests {
    @Test func multipliesColorsByFitsAndLeavesMaterialUnsetWhenNoneIsPicked() {
        let inputs = draft().expand(usesFit: true)

        #expect(inputs.count == 4)
        #expect(draft().count == 4)
        #expect(inputs.allSatisfy { $0.material == nil })
        #expect(inputs.map { "\($0.color.name)/\($0.fit ?? "")" } == [
            "White/regular", "White/relaxed", "Black/regular", "Black/relaxed",
        ])
    }

    @Test func multipliesByMaterialsWhenSomeArePicked() {
        let d = draft(materials: ["cotton", "linen"])

        #expect(d.expand(usesFit: true).count == 8)
        #expect(d.count == 8)
    }

    @Test func nothingPickedCreatesNothing() {
        #expect(draft(colors: []).expand(usesFit: true).isEmpty)
        #expect(draft(colors: []).count == 0)
        #expect(draft(options: []).count == 0)
    }

    @Test func writesVariantInsteadOfFitForFootwearAndAccessories() throws {
        let d = draft(typeId: "sneakers", colors: [white], options: ["low-top"])
        let input = try #require(d.expand(usesFit: false).first)

        #expect(input.variant == "low-top")
        #expect(input.fit == nil)
    }

    @Test func appliesNicknameNotesAndWeightToEveryGeneratedLine() {
        let inputs = draft(weight: "mid", nickname: "the Uniqlo one", notes: "hem").expand(usesFit: true)

        #expect(inputs.allSatisfy { $0.nickname == "the Uniqlo one" && $0.notes == "hem" && $0.weight == "mid" })
    }

    @Test func emptyNicknameAndNotesAreLeftOut() {
        let inputs = draft(nickname: "", notes: "").expand(usesFit: true)

        #expect(inputs.allSatisfy { $0.nickname == nil && $0.notes == nil })
    }
}

@Suite struct AddToCartTests {
    @Test func mergesIdenticalLinesByIncrementingQuantity() {
        let one = draft(colors: [white], options: ["regular"]).expand(usesFit: true)
        let lines = cart(one, one).lines

        #expect(lines.count == 1)
        #expect(lines[0].quantity == 2)
        #expect(cart(one, one).count == 2)
    }

    @Test func keepsLinesThatDifferInAnyAttributeApart() {
        let plain = draft(colors: [white], options: ["regular"]).expand(usesFit: true)
        let withMaterial = draft(colors: [white], options: ["regular"], materials: ["cotton"]).expand(usesFit: true)
        let withPattern = draft(colors: [white], options: ["regular"], pattern: "stripe").expand(usesFit: true)
        let withNickname = draft(colors: [white], options: ["regular"], nickname: "x").expand(usesFit: true)
        let both = cart(plain, withMaterial, withPattern, withNickname)

        #expect(both.lines.count == 4)
        #expect(both.count == 4)
    }

    @Test func doesNotMutateTheCartItWasCopiedFrom() {
        let one = draft(colors: [white], options: ["regular"]).expand(usesFit: true)
        let first = cart(one)
        var second = first
        second.add(one)

        #expect(first.lines[0].quantity == 1)
        #expect(second.lines[0].quantity == 2)
    }

    @Test func capsMergedQuantityAt99() {
        let one = draft(colors: [white], options: ["regular"]).expand(usesFit: true)
        var lines = Cart()
        for _ in 0..<120 { lines.add(one) }

        #expect(lines.lines.count == 1)
        #expect(lines.count == Cart.maxQuantity)
    }

    @Test func customColorsWithTheSameHexButDifferentNamesStayApart() {
        let rose = BlockColor(name: "Rose", hex: "#c48a8a", family: "pink")
        let blush = BlockColor(name: "Blush", hex: "#c48a8a", family: "pink")
        let lines = cart(draft(colors: [rose, blush], options: ["regular"]).expand(usesFit: true))

        #expect(lines.lines.count == 2)
    }
}

@Suite struct SetQuantityTests {
    let lines = cart(draft().expand(usesFit: true))

    @Test func updatesOneLine() {
        var next = lines
        next.setQuantity(4, forLine: lines.lines[1].key)

        #expect(next.lines[1].quantity == 4)
        #expect(next.lines.map(\.quantity) == [1, 4, 1, 1])
    }

    @Test func removesTheLineWhenTheQuantityDropsBelowOne() {
        var next = lines
        next.setQuantity(0, forLine: lines.lines[0].key)

        #expect(next.lines.count == 3)
        #expect(!next.lines.contains { $0.key == lines.lines[0].key })
    }

    @Test func capsAt99() {
        var next = lines
        next.setQuantity(150, forLine: lines.lines[0].key)

        #expect(next.lines[0].quantity == 99)
    }
}

@Suite struct CartInputsTests {
    @Test func foldsTheQuantityBackIntoEachBlockInput() {
        var lines = cart(draft(colors: [white], options: ["regular"]).expand(usesFit: true))
        lines.setQuantity(3, forLine: Cart.lineKey(CartInput(typeId: "t-shirt", color: white, fit: "regular", pattern: "solid")))

        #expect(lines.inputs == [
            BlockInput(typeId: "t-shirt", color: white, fit: "regular", pattern: "solid", quantity: 3),
        ])
    }
}

@Suite struct GroupByCategoryTests {
    @Test func bucketsLinesByTheirCategoryInCartOrder() {
        let lines = cart(
            draft(colors: [white], options: ["regular"]).expand(usesFit: true),
            draft(typeId: "sneakers", colors: [black], options: ["low-top"]).expand(usesFit: false),
            draft(colors: [black], options: ["regular"]).expand(usesFit: true)
        )
        let groups = lines.grouped(in: catalog)

        #expect(groups.map(\.categoryId) == ["top", "footwear"])
        #expect(groups[0].lines.map(\.input.color.name) == ["White", "Black"])
    }

    @Test func filesCustomCategoryTypesUnderTheirOwnCategory() {
        let lines = cart(draft(typeId: "necklace", colors: [white], options: ["chain"]).expand(usesFit: false))

        #expect(lines.grouped(in: catalog).map(\.categoryId) == ["jewelry"])
    }
}

@Suite struct PendingSaveTests {
    @Test func submittingMovesEveryLineOutOfTheCart() throws {
        var lines = cart(draft().expand(usesFit: true))
        lines.setQuantity(3, forLine: lines.lines[0].key)
        let expected = lines.inputs

        let submitted = lines.submit(key: "k1")
        let pending = try #require(submitted)

        #expect(lines.isEmpty)
        #expect(pending.key == "k1")
        #expect(pending.inputs == expected)
        #expect(pending.count == 6)
    }

    @Test func submittingCanSkipLinesTheServerJustRejected() throws {
        var lines = cart(draft().expand(usesFit: true))
        let first = lines.submit(limit: 2)
        let sent = try #require(first)
        lines.putBack(sent.rejectedLines([failure(0, ["Bad"])]))

        let next = lines.submit(skippingRejected: true)
        let batch = try #require(next)

        #expect(batch.lines.count == 2, "the two lines never sent")
        #expect(lines.lines.count == 1)
        #expect(lines.lines[0].errors == ["Bad"], "the rejected line waits in the cart")
    }

    @Test func nothingToSubmitFromAnEmptyCart() {
        var empty = Cart()
        #expect(empty.submit() == nil)
    }

    @Test func rejectedLinesComeBackByIndexWithTheirErrors() throws {
        var lines = cart(draft().expand(usesFit: true))
        let keys = lines.lines.map(\.key)
        let submitted = lines.submit()
        let pending = try #require(submitted)

        let rejected = pending.rejectedLines([failure(3, ["Black is not offered"]), failure(1, ["Bad fit"]), failure(9, ["?"])])

        #expect(rejected.map(\.key) == [keys[1], keys[3]])
        #expect(rejected.map(\.errors) == [["Bad fit"], ["Black is not offered"]])
    }

    @Test func puttingBackMergesWithLinesAddedMeanwhile() throws {
        var lines = cart(draft(colors: [white], options: ["regular"]).expand(usesFit: true))
        let submitted = lines.submit()
        let pending = try #require(submitted)
        // Added again while the save was out.
        lines.add(draft(colors: [white, black], options: ["regular"]).expand(usesFit: true))

        lines.putBack(pending.cartLines)

        #expect(lines.lines.count == 2)
        #expect(lines.count == 3)
    }
}

/// `CartStore` against a fake server: what is persisted and what is resent
/// is what keeps a lost answer from losing or duplicating pieces.
@MainActor
@Suite struct CartStoreSaveTests {
    let defaults: UserDefaults
    let key = "fitsss.cart.test"

    init() {
        defaults = UserDefaults(suiteName: "CartStoreSaveTests-\(UUID().uuidString)")!
    }

    private func store() -> CartStore { CartStore(storageKey: key, defaults: defaults) }

    /// What the server answers: every input stored except the failed indexes.
    private func created(_ inputs: [BlockInput], failed: [CreateBlocksResult.Failure] = []) -> CreateBlocksResult {
        let failedIndexes = Set(failed.map(\.index))
        let blocks: [[String: Any]] = inputs.enumerated().filter { !failedIndexes.contains($0.offset) }.map { _, input in
            [
                "id": UUID().uuidString, "typeId": input.typeId, "category": "top",
                "color": ["name": input.color.name, "hex": input.color.hex, "family": input.color.family],
                "pattern": input.pattern, "effectiveWeight": "light", "quantity": input.quantity,
                "warmth": 1, "formality": 2, "seasons": [String](), "label": "x",
                "createdAt": "2026-10-12T10:00:00.000Z", "updatedAt": "2026-10-12T10:00:00.000Z",
            ]
        }
        let json: [String: Any] = [
            "created": blocks,
            "failed": failed.map { ["index": $0.index, "errors": $0.errors] },
        ]
        let data = try! JSONSerialization.data(withJSONObject: json)
        return try! APIClient.decoder.decode(CreateBlocksResult.self, from: data)
    }

    @Test func aConfirmedSaveEmptiesCartAndPendingSave() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))

        let outcome = await cart.save { inputs, _ in created(inputs) }

        #expect(outcome == .saved(added: 4, rejected: 0))
        #expect(cart.isCompletelyEmpty)
        #expect(store().isCompletelyEmpty, "nothing left in storage")
    }

    @Test func aLostAnswerIsResentUnchangedWithTheSameKey() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))
        var sent: [(inputs: [BlockInput], key: String)] = []

        let lost = await cart.save { inputs, key in
            sent.append((inputs, key))
            throw APIError.network("timed out")
        }
        #expect(lost == .unconfirmed("Can’t reach Fitsss. Check your connection."))
        #expect(cart.pendingSave?.count == 4)

        // The user keeps shopping while the save is unresolved.
        cart.add(draft(colors: [white], options: ["regular"], nickname: "new").expand(usesFit: true))
        #expect(cart.count == 1)

        // The app is killed and relaunched: the pending save survives as it was.
        let relaunched = store()
        let first = await relaunched.save { inputs, key in
            sent.append((inputs, key))
            return created(inputs)
        }
        #expect(first == .saved(added: 4, rejected: 0))
        #expect(sent.count == 2)
        #expect(sent[1].key == sent[0].key)
        #expect(sent[1].inputs == sent[0].inputs, "the resend is the original batch, not the edited cart")
        #expect(relaunched.pendingSave == nil)
        #expect(relaunched.count == 1, "the piece added meanwhile is still in the cart")

        // The next save sends the new piece under a new key.
        _ = await relaunched.save { inputs, key in
            sent.append((inputs, key))
            return created(inputs)
        }
        #expect(sent.count == 3)
        #expect(sent[2].key != sent[0].key)
        #expect(sent[2].inputs.map(\.nickname) == ["new"])
        #expect(relaunched.isCompletelyEmpty)
    }

    @Test func aRefusedSavePutsEverythingBack() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))
        let before = cart.cart.inputs

        let outcome = await cart.save { _, _ in throw APIError.invalid(message: "No", errors: ["typeId: unknown piece type"]) }

        #expect(outcome == .refused("typeId: unknown piece type"))
        #expect(cart.pendingSave == nil)
        #expect(cart.cart.inputs == before)
    }

    @Test func rejectedLinesStayWithTheirErrors() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))

        let outcome = await cart.save { inputs, _ in created(inputs, failed: [failure(2, ["Bad"])]) }

        #expect(outcome == .saved(added: 3, rejected: 1))
        #expect(cart.pendingSave == nil)
        #expect(cart.cart.lines.map(\.errors) == [["Bad"]])
    }

    // Regression: a resend that got a 401 used to put the lines back, and the
    // next save stored them a second time under a new key.
    @Test func aSessionEndingDoesNotSettleASentBatch() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))
        var keys: [String] = []

        _ = await cart.save { _, key in keys.append(key); throw APIError.network("lost") }
        let resend = await cart.save { _, key in keys.append(key); throw APIError.unauthorized }

        #expect(resend == .unconfirmed("Your session ended. Sign in again."))
        #expect(cart.pendingSave != nil, "still pending")
        #expect(cart.isEmpty, "not back in the cart")
        _ = await cart.save { inputs, key in keys.append(key); return created(inputs) }
        #expect(Set(keys).count == 1, "every attempt used the one key")
    }

    // Regression: a 500 used to leave the batch pending with no way out.
    @Test func aStuckSaveCanBePutBackOnlyOnADefiniteNo() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))
        let before = cart.cart.inputs
        _ = await cart.save { _, _ in throw APIError.server(status: 500, message: "boom") }
        #expect(cart.pendingSave != nil)

        let unreachable = await cart.putBackPending { _ in throw APIError.network("offline") }
        #expect(unreachable == .stillUnknown("Can’t reach Fitsss. Check your connection."))
        #expect(cart.pendingSave != nil, "can't check, so nothing moves")

        let neverStored = await cart.putBackPending { _ in nil }
        #expect(neverStored == .putBack)
        #expect(cart.pendingSave == nil)
        #expect(cart.cart.inputs == before)
    }

    @Test func aStuckSaveTheServerHadStoredIsSettledNotPutBack() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))
        _ = await cart.save { _, _ in throw APIError.server(status: 502, message: "gateway") }
        let pending = cart.pendingSave!

        let outcome = await cart.putBackPending { key in
            #expect(key == pending.key)
            return created(pending.inputs)
        }

        #expect(outcome == .wasSaved(added: 4, rejected: 0))
        #expect(cart.isCompletelyEmpty, "nothing to save twice")
    }

    @Test func aCartHoldsAtMost500Lines() {
        var lines = Cart()
        let many = (0..<600).map { index in
            CartInput(typeId: "t-shirt", color: white, fit: "regular", pattern: "solid", nickname: "n\(index)")
        }
        lines.add(many)
        #expect(lines.lines.count == Cart.maxLines)
        lines.add([many[0]])
        #expect(lines.lines[0].quantity == 2, "existing lines still merge when full")
    }

    @Test func concurrentSavesShareOneRequest() async {
        let cart = store()
        cart.add(draft().expand(usesFit: true))
        var calls = 0
        let send: CartStore.Create = { inputs, _ in
            calls += 1
            try await Task.sleep(for: .milliseconds(50))
            return created(inputs)
        }

        async let a = cart.save(using: send)
        async let b = cart.save(using: send)
        let outcomes = await [a, b]

        #expect(calls == 1)
        #expect(outcomes.allSatisfy { $0 == .saved(added: 4, rejected: 0) })
    }
}

@Suite struct RestoreTests {
    private func json(_ value: String) -> Data { Data(value.utf8) }

    @Test func restoresValidLinesAndRecomputesTheirKeys() throws {
        let restored = Cart.restore(from: json("""
        [{"key":"stale","input":{"typeId":"t-shirt","color":{"name":"White","hex":"#ffffff","family":"neutral","paletteId":"white"},
          "fit":"regular","pattern":"solid"},"quantity":2}]
        """), catalog: catalog)

        #expect(restored.lines.count == 1)
        #expect(restored.lines[0].key == Cart.lineKey(CartInput(typeId: "t-shirt", color: white, fit: "regular", pattern: "solid")))
        #expect(restored.lines[0].quantity == 2)
    }

    @Test func dropsUnknownTypesBrokenColorsBadQuantitiesAndNonArrays() {
        #expect(Cart.restore(from: json("\"nope\"")).isEmpty)
        #expect(Cart.restore(from: json("not json")).isEmpty)
        let restored = Cart.restore(from: json("""
        [{"input":{"typeId":"flux-capacitor","color":{"name":"White","hex":"#ffffff","family":"neutral"},"pattern":"solid"},"quantity":1},
         {"input":{"typeId":"t-shirt","color":{"name":"X"},"pattern":"solid"},"quantity":1},
         {"input":{"typeId":"t-shirt","color":{"name":"X","hex":"red","family":"red"},"pattern":"solid"},"quantity":1},
         {"input":{"typeId":"t-shirt","color":{"name":"White","hex":"#ffffff","family":"neutral"},"pattern":"solid"},"quantity":0},
         {"input":{"typeId":"t-shirt","color":{"name":"White","hex":"#ffffff","family":"neutral"},"pattern":"solid"},"quantity":100},
         {"input":{"typeId":"t-shirt","color":{"name":"White","hex":"#ffffff","family":"neutral"}},"quantity":1},
         null]
        """), catalog: catalog)

        #expect(restored.isEmpty)
    }

    @Test func roundTripsThroughStorage() {
        var original = cart(
            draft(materials: ["cotton"], weight: "mid", nickname: "work").expand(usesFit: true),
            draft(typeId: "sneakers", colors: [BlockColor(name: "Rose", hex: "#c48a8a", family: "pink")], options: ["low-top"])
                .expand(usesFit: false)
        )
        original.setQuantity(7, forLine: original.lines[2].key)
        let restored = Cart.restore(from: original.encoded(), catalog: catalog)

        #expect(restored == original)
        #expect(restored.inputs == original.inputs)
    }

    @Test func pruneDropsTypesTheCatalogNoLongerHas() {
        var lines = cart(
            draft(colors: [white], options: ["regular"]).expand(usesFit: true),
            draft(typeId: "deleted-type", colors: [white], options: ["regular"]).expand(usesFit: true)
        )

        let droppedFirst = lines.prune(using: catalog)
        let droppedAgain = lines.prune(using: catalog)

        #expect(droppedFirst)
        #expect(lines.lines.map(\.input.typeId) == ["t-shirt"])
        #expect(!droppedAgain)
    }
}

@Suite struct ServerLimitTests {
    @Test func cutsByCodePointsLikeTheServerWithoutSplittingCharacters() {
        // One code point each: 41 dresses, cut to the server's 40.
        let dresses = "b" + String(repeating: "👗", count: 40)
        #expect(dresses.prefix(serverLimit: 40) == "b" + String(repeating: "👗", count: 39))

        // A family emoji is five code points but one character: it is kept
        // whole or left out, never cut to a lone person.
        let family = String(repeating: "a", count: 38) + "👨‍👩‍👧"
        #expect(family.prefix(serverLimit: 40) == String(repeating: "a", count: 38))
        #expect("short".prefix(serverLimit: 40) == "short")
    }

    @Test func expandTrimsAndLimitsNicknameAndNotes() throws {
        let long = "  " + String(repeating: "👗", count: 70) + "  "
        let input = try #require(draft(colors: [white], options: ["regular"], nickname: long, notes: "   ").expand(usesFit: true).first)

        #expect(input.nickname == String(repeating: "👗", count: 60))
        #expect(input.notes == nil)
    }

    @Test func restoredHexesAreNormalizedSoTheyMergeWithFreshLines() {
        let restored = Cart.restore(from: Data("""
        [{"input":{"typeId":"t-shirt","color":{"name":"Ink","hex":"#1F2A44","family":"blue"},"fit":"regular","pattern":"solid"},"quantity":1}]
        """.utf8), catalog: catalog)
        var merged = restored
        merged.add([CartInput(typeId: "t-shirt", color: BlockColor(name: "Ink", hex: "#1f2a44", family: "blue"), fit: "regular", pattern: "solid")])

        #expect(restored.lines[0].input.color.hex == "#1f2a44")
        #expect(merged.lines.count == 1)
        #expect(merged.count == 2)
    }
}
