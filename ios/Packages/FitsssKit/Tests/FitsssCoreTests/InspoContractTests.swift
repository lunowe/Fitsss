import Foundation
import ImageIO
import Testing
@testable import FitsssCore

/// Phase 3's contract with the server, decoded from real answers of
/// `POST /api/v1/inspos/:id/analyze` (mock model) and `GET /api/v1/taste`.
@Suite struct InspoContractTests {
    nonisolated struct Envelope<T: Decodable>: Decodable { var data: T }

    @Test func decodesAnAnalysedPicture() throws {
        let json = ##"{"data":{"id":"190fa991-0da1-40d9-b057-cf56ba3edbf6","sourceUrl":"https://pin.it/x","imageUrl":"/api/v1/inspos/190fa991-0da1-40d9-b057-cf56ba3edbf6/image","width":4,"height":5,"analysis":{"vibe":["mock","loose","neutral"],"model":"mock","pieces":[{"fit":"oversized","color":{"hex":"#8e8e93","name":"Grey","family":"neutral","paletteId":"grey"},"typeId":"t-shirt","pattern":"solid","category":"top","material":"jersey","confidence":0.92},{"fit":"straight","color":{"hex":"#4c6d9c","name":"Denim blue","family":"blue","paletteId":"denim"},"typeId":"jeans","pattern":"solid","category":"bottom","material":"denim","confidence":0.8},{"color":{"hex":"#111111","name":"Black","family":"neutral","paletteId":"black"},"typeId":"boots","pattern":"solid","variant":"chelsea","category":"footwear","material":"leather","confidence":0.74},{"color":{"hex":"#e8853a","name":"Orange","family":"red","paletteId":"orange"},"typeId":"vest","pattern":"solid","category":"layer","confidence":0.6799999999999999}],"palette":["#8e8e93","#4c6d9c","#111111","#e8853a"],"summary":"A loose everyday look built from grey t shirt, denim blue jeans, black boots, orange vest.","formality":3,"silhouette":"oversized top, straight bottom, chelsea footwear, regular layer"},"match":{"gaps":[{"pieceIndex":3,"description":"an orange vest"}],"matches":[{"score":1,"blockId":"5c8a128c-2213-4624-86fe-6dac59d828a7","pieceIndex":0},{"score":1,"blockId":"22220ad3-beb7-4d6d-9aa7-5d1b0c754588","pieceIndex":1},{"score":1,"blockId":"3463689d-cab6-425e-918e-4ae21103ba0d","pieceIndex":2}],"coverage":0.783},"styleId":null,"note":null,"createdAt":"2026-10-13T09:06:44.324Z"}}"##
        let inspo = try APIClient.decoder.decode(Envelope<Inspo>.self, from: Data(json.utf8)).data
        #expect(inspo.imageUrl == "/api/v1/inspos/\(inspo.id)/image")
        #expect(inspo.analysis?.pieces.count == 4)
        #expect(inspo.analysis?.pieces[2].variant == "chelsea")
        #expect(inspo.match?.gaps.first?.pieceIndex == 3)
        #expect(inspo.match?.coverageText == "You own about 78% of this look.")
        #expect(inspo.name == "Mock Loose Neutral")
    }

    @Test func decodesAnUnreadPicture() throws {
        let json = #"{"data":{"id":"190fa991-0da1-40d9-b057-cf56ba3edbf6","sourceUrl":null,"imageUrl":"/api/v1/inspos/190fa991-0da1-40d9-b057-cf56ba3edbf6/image","width":0,"height":5,"analysis":null,"match":null,"styleId":null,"note":null,"createdAt":"2026-10-13T09:06:44.324Z"}}"#
        let inspo = try APIClient.decoder.decode(Envelope<Inspo>.self, from: Data(json.utf8)).data
        #expect(inspo.analysis == nil)
        #expect(inspo.name == "Inspiration")
        #expect(inspo.aspectRatio == 0.8)
    }

    @Test func decodesTaste() throws {
        let json = #"{"data":{"overall":{"styleId":null,"lines":[{"id":"0x1ab2c","text":"Loose tops, slim bottoms","source":"user","createdAt":"2026-10-13T09:06:44.324Z"},{"id":"1k2j3h4","text":"Reaches for navy","source":"learned","evidence":4,"createdAt":"1970-01-01T00:00:00.000Z"}],"avoid":[],"eventCount":3,"totalEvents":5,"lastRefreshedAt":"2026-10-13T09:06:44.324Z","favorites":[{"blockId":"b1","score":1.5,"saves":1,"wears":0,"likes":1,"dislikes":0,"swapsIn":0,"swapsOut":0}],"skipped":[]},"byStyle":{"a25bdb4f-ef81-43d8-b661-09d109d9f025":{"styleId":"a25bdb4f-ef81-43d8-b661-09d109d9f025","lines":[],"avoid":[{"id":"x","text":"No logos","source":"user","createdAt":"2026-10-13T09:06:44.324Z"}],"eventCount":0,"totalEvents":0,"lastRefreshedAt":null,"favorites":[],"skipped":[]}},"totalEvents":5}}"#
        let taste = try APIClient.decoder.decode(Envelope<TasteOverview>.self, from: Data(json.utf8)).data
        #expect(taste.overall.lines.first?.isUserStated == true)
        #expect(taste.overall.lines.last?.evidence == 4)
        #expect(taste.overall.favorites.first?.blockId == "b1")
        #expect(taste.learnedLineCount == 3)
        #expect(taste.byStyle.first?.value.lastRefreshedAt == nil)
    }

    @Test func downscalesToTheLongEdge() throws {
        // A 2000×1000 PNG becomes a 1024×512 JPEG.
        let png = try #require(Self.png(width: 2000, height: 1000))
        let jpeg = try #require(PictureDownscaler.jpeg(from: png))
        #expect(jpeg.starts(with: [0xFF, 0xD8]))
        let source = try #require(CGImageSourceCreateWithData(jpeg as CFData, nil))
        let properties = try #require(CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any])
        #expect(properties[kCGImagePropertyPixelWidth] as? Int == 1024)
        #expect(properties[kCGImagePropertyPixelHeight] as? Int == 512)
        #expect(PictureDownscaler.jpeg(from: Data("not a picture".utf8)) == nil)
    }

    private static func png(width: Int, height: Int) -> Data? {
        guard let context = CGContext(
            data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
            space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
        ) else { return nil }
        context.setFillColor(red: 0.8, green: 0.4, blue: 0.2, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        guard let image = context.makeImage() else { return nil }
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, "public.png" as CFString, 1, nil) else { return nil }
        CGImageDestinationAddImage(destination, image, nil)
        return CGImageDestinationFinalize(destination) ? output as Data : nil
    }
}
