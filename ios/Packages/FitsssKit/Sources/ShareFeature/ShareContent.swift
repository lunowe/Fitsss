import FitsssCore
import FitsssUI
import Foundation
import UIKit
import UniformTypeIdentifiers

/// What a share brings that Fitsss can add to Inspo.
nonisolated public enum ShareContent: Equatable, Sendable {
    /// A picture, already small enough to upload (`PictureDownscaler`), and
    /// the page it came from when the share said (Pinterest and Safari do).
    case picture(jpeg: Data, source: URL?)
    /// A link to a picture or to a page that has one (a Pinterest pin); the
    /// server fetches it. `title` is what the sharing app called it, if anything.
    case link(URL, title: String?)
}

/// Reads a share's attachments into `ShareContent`, the way the web's share
/// target does (`src/app/api/share/route.ts`): the picture when there is one,
/// with the shared link as its source, otherwise the link.
///
/// Pictures are read from the file the sharing app hands over, through ImageIO,
/// so a 48-megapixel photo is never decoded whole: a share extension gets about
/// 120 MB. Bytes and `UIImage`s (screenshots, some apps) are the fallbacks.
///
/// On the main actor, like the extension's view controller that owns the
/// items (`NSItemProvider` is not `Sendable`); the providers call back on
/// their own queues, and the pictures are scaled down right there.
public enum ShareContentLoader {
    public static func load(_ items: [NSExtensionItem]) async -> ShareContent? {
        let providers = items.flatMap { $0.attachments ?? [] }
        let itemText = items.compactMap { $0.attributedContentText?.string } + items.compactMap { $0.attributedTitle?.string }
        let title = items.lazy.compactMap { $0.attributedContentText?.string ?? $0.attributedTitle?.string }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty && webURL(in: $0) == nil }

        var link: URL?
        for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
            if let url = await webURL(from: provider) {
                link = url
                break
            }
        }
        if link == nil {
            // Some apps share the link inside text ("Look at this https://pin.it/…").
            for provider in providers where provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                if let text = await string(from: provider), let url = webURL(in: text) {
                    link = url
                    break
                }
            }
        }
        if link == nil { link = itemText.lazy.compactMap(webURL(in:)).first }

        if let provider = providers.first(where: { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }),
           let jpeg = await jpeg(from: provider) {
            return .picture(jpeg: jpeg, source: link)
        }
        return link.map { .link($0, title: title) }
    }

    // MARK: - Pictures

    static func jpeg(from provider: NSItemProvider) async -> Data? {
        let type = UTType.image.identifier
        // A file, read in place.
        let fromFile: Data? = await withCheckedContinuation { continuation in
            _ = provider.loadFileRepresentation(forTypeIdentifier: type) { url, _ in
                // The file is gone once this returns, so read it here.
                continuation.resume(returning: url.flatMap(PictureDownscaler.jpeg(contentsOf:)))
            }
        }
        if let fromFile { return fromFile }

        let fromData: Data? = await withCheckedContinuation { continuation in
            _ = provider.loadDataRepresentation(forTypeIdentifier: type) { data, _ in
                continuation.resume(returning: data.flatMap(PictureDownscaler.jpeg(from:)))
            }
        }
        if let fromData { return fromData }

        // Whatever object the app registered: a file URL, bytes, a UIImage.
        return await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: type, options: nil) { item, _ in
                let jpeg: Data? = switch item {
                case let url as URL where url.isFileURL: PictureDownscaler.jpeg(contentsOf: url)
                case let data as Data: PictureDownscaler.jpeg(from: data)
                case let image as UIImage: PictureDownscaler.jpeg(from: image)
                default: nil
                }
                continuation.resume(returning: jpeg)
            }
        }
    }

    // MARK: - Links

    /// The provider's URL when it is a web one (a photo's file URL is not).
    static func webURL(from provider: NSItemProvider) async -> URL? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { item, _ in
                let url: URL? = switch item {
                case let url as URL: url
                case let text as String: URL(string: text.trimmingCharacters(in: .whitespacesAndNewlines))
                case let data as Data: URL(dataRepresentation: data, relativeTo: nil)
                default: nil
                }
                continuation.resume(returning: url.flatMap(isWeb))
            }
        }
    }

    static func string(from provider: NSItemProvider) async -> String? {
        await withCheckedContinuation { continuation in
            provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { item, _ in
                let text: String? = switch item {
                case let text as String: text
                case let data as Data: String(data: data, encoding: .utf8)
                case let text as NSAttributedString: text.string
                default: nil
                }
                continuation.resume(returning: text)
            }
        }
    }

    /// The first http(s) link in some text.
    nonisolated static func webURL(in text: String) -> URL? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue) else { return nil }
        let range = NSRange(text.startIndex..., in: text)
        return detector.matches(in: text, range: range).lazy.compactMap { $0.url.flatMap(isWeb) }.first
    }

    nonisolated private static func isWeb(_ url: URL) -> URL? {
        guard let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https", url.host() != nil else { return nil }
        return url
    }
}
