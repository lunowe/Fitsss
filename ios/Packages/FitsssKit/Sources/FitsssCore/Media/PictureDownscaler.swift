import Foundation
import ImageIO
import UniformTypeIdentifiers

/// Makes a picture small enough to upload as an inspo: at most 1024 points
/// on the long side, JPEG at 0.82, the web's numbers (`AddInspo.tsx`).
///
/// ImageIO rather than UIKit, so the share extension can use it too and a
/// 48-megapixel photo is never decoded at full size (a share extension has
/// little memory to spare). Orientation is applied, so the result is upright.
nonisolated public enum PictureDownscaler {
    public static let maxEdge = 1024
    public static let quality = 0.82

    /// JPEG bytes, or nil when the data is not a picture ImageIO can read.
    public static func jpeg(from data: Data) -> Data? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        return jpeg(from: source)
    }

    /// The same, read from a file (a shared photo) without loading it whole.
    public static func jpeg(contentsOf url: URL) -> Data? {
        guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
        return jpeg(from: source)
    }

    private static func jpeg(from source: CGImageSource) -> Data? {
        guard CGImageSourceGetCount(source) > 0 else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxEdge,
            kCGImageSourceShouldCacheImmediately: true,
        ]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else { return nil }

        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil)
        else { return nil }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { return nil }
        return output as Data
    }
}
