import FitsssCore
import FitsssUI
import ImageIO
import SwiftUI
import UIKit

/// A saved picture, drawn from `InspoStore.imageData` (fetched once, then
/// kept in memory) and decoded off the main actor at the size it is shown.
/// Until the bytes are in it is a `card-2` well, so a grid never jumps; a
/// picture that can't be loaded shows a quiet photo symbol.
///
/// The view fills whatever frame it is given: `.fill` crops (grid tiles),
/// `.fit` letterboxes on the well (the detail).
struct InspoPicture: View {
    let inspo: Inspo
    /// Long edge, in pixels, to decode to.
    let maxPixels: Int
    let contentMode: ContentMode

    @Environment(InspoStore.self) private var inspos
    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        Color.fitsssCard2
            .overlay {
                if let image {
                    Image(uiImage: image)
                        .resizable()
                        .aspectRatio(contentMode: contentMode)
                        .transition(.opacity)
                } else if failed {
                    Image(systemName: "photo")
                        .font(.title2)
                        .foregroundStyle(Color.fitsssLabel3)
                }
            }
            .clipped()
            .animation(.easeOut(duration: 0.15), value: image != nil)
            .accessibilityElement()
            .accessibilityAddTraits(.isImage)
            .accessibilityLabel(inspo.analysis?.summary ?? "Inspiration picture")
            .task(id: inspo.id) { await load() }
    }

    private func load() async {
        guard image == nil else { return }
        do {
            let data = try await inspos.imageData(inspo.id)
            guard let decoded = await Self.decode(data, maxPixels: maxPixels) else {
                failed = true
                return
            }
            image = decoded
            failed = false
        } catch is CancellationError {
            // Scrolled away or left; the next appearance tries again.
        } catch {
            failed = true
        }
    }

    /// A thumbnail at most `maxPixels` on the long side, orientation applied.
    @concurrent
    nonisolated private static func decode(_ data: Data, maxPixels: Int) async -> UIImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxPixels,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let cgImage = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
