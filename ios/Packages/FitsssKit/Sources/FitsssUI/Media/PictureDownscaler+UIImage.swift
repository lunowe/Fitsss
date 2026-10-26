import FitsssCore
import UIKit

public extension PictureDownscaler {
    /// A picture already in memory (the camera, an app that shares a
    /// `UIImage`), drawn once at upload size, upright, on white. Never
    /// encoded at full size first: a 48-megapixel photo would need ~200 MB
    /// for that, more than a share extension has.
    nonisolated static func jpeg(from image: UIImage) -> Data? {
        let pixels = CGSize(width: image.size.width * image.scale, height: image.size.height * image.scale)
        guard pixels.width >= 1, pixels.height >= 1 else { return nil }
        let factor = min(1, CGFloat(maxEdge) / max(pixels.width, pixels.height))
        let target = CGSize(width: max(1, (pixels.width * factor).rounded()), height: max(1, (pixels.height * factor).rounded()))

        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: target, format: format)
        return renderer.jpegData(withCompressionQuality: quality) { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: target))
            image.draw(in: CGRect(origin: .zero, size: target))
        }
    }
}
