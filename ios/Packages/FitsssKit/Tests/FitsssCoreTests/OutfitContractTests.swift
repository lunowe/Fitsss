import Foundation
import Testing
@testable import FitsssCore

/// Phase 2's contract with the server, decoded from real answers of
/// `GET /api/v1/generations/latest` and `GET /api/v1/styles` (trimmed).
@Suite struct OutfitContractTests {
    nonisolated struct Envelope<T: Decodable>: Decodable { var data: T }

    @Test func decodesAStoredGeneration() throws {
        let json = #"{"data":{"id":"32fa4844-787b-453b-b1b7-343ace14bc97","request":{"count":3,"pinned":[],"styleId":"a25bdb4f-ef81-43d8-b661-09d109d9f025","weather":{"tempC":20,"source":"manual","condition":"cloudy"},"excluded":[],"occasion":"everyday"},"outfits":[{"id":"0d4ce1f7-b512-428d-9e11-ab39d15b181a","tip":"Let the tee sit slightly loose and wear the trousers low on the waist for a more relaxed shape.","why":"The black tee and wide trousers give you the closest available version of a Y2K loose-bottom silhouette, while white sneakers keep the wool trousers casual enough for errands. The cap and silver chain add the playful early-2000s punctuation without making the outfit polished.","name":"Black Wide Streetwear","slots":{"top":"bb345637-1860-49c1-b97a-c65d18791cf1","bottom":"4351bd8c-282c-41ed-abd6-138ef2308a74","footwear":"a340584b-734c-4f42-bc12-c73e17180ea2","accessories":["a1109fab-23a7-4599-ab51-fb5b5d56c883","577276f4-62f5-47e8-b63c-95fb172b844c"]}}],"filteredOutCount":8,"model":"openai/gpt-5.6-luna","createdAt":"2026-09-08T11:15:50.681Z"}}"#
        let result = try APIClient.decoder.decode(Envelope<GenerationResult>.self, from: Data(json.utf8)).data
        #expect(result.request.occasion == "everyday")
        #expect(result.request.weather.condition == "cloudy")
        #expect(result.outfits.first?.slots.accessories.count == 2)
        #expect(result.outfits.first?.slots.fullbody == nil)
        #expect(result.outfits.first?.slots.blockIds.count == 5)
    }

    @Test func decodesStyles() throws {
        let json = #"{"data":[{"id":"a25bdb4f-ef81-43d8-b661-09d109d9f025","name":"Y2K","description":"Early-2000s pop and mall style: low-rise baggy jeans or cargo pants, a cropped or fitted baby tee, a tank under a zip hoodie or a track jacket, denim on denim. Chunky or retro sneakers, a trucker cap or a dad cap, a tiny bag. Light-wash blue, white, pink, silver and metallics; logos and graphics are the point. Playful and a bit loud, never polished.","rules":"Bottoms baggy or wide, never\nNo blazers, no loafers, no wool coats","sortOrder":0,"createdAt":"2026-09-08T11:12:52.159Z","updatedAt":"2026-09-08T11:14:10.782Z"}]}"#
        let styles = try APIClient.decoder.decode(Envelope<[Style]>.self, from: Data(json.utf8)).data
        #expect(styles.first?.name == "Y2K")
    }

    @Test func encodesAGenerationRequestTheServerAccepts() throws {
        let request = GenerationRequest(occasion: "work", weather: WeatherSnapshot(tempC: 12, condition: "rain", source: "manual"))
        let json = String(decoding: try APIClient.encoder.encode(request), as: UTF8.self)
        #expect(!json.contains("null"))
        #expect(json.contains("\"pinned\":[]"))
    }
}
