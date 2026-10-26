import ShareFeature
import SwiftUI
import UIKit

/// The share extension's principal class (`NSExtensionPrincipalClass` in
/// `Config/FitsssShare-Info.plist`): hosts `ShareSheet` and hands the outcome
/// back to the sharing app. Reading the share, the session and the upload
/// all live in `ShareFeature`, so the app can show the same sheet
/// (`-FitsssRoute dev/share`).
///
/// The system decides the sheet's size (a full-height sheet on iOS 26 and
/// 27; detents set here are ignored), so the sheet lays itself out for that.
///
/// A share extension gets about 120 MB: the picture is scaled down from the
/// file the sharing app hands over (ImageIO) and only the 1024-pixel JPEG
/// that gets uploaded is ever decoded, for the preview.
final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let items = extensionContext?.inputItems.compactMap { $0 as? NSExtensionItem } ?? []
        let model = ShareModel(sharing: items)
        model.onClose = { [weak self] added in self?.finish(added: added) }

        let host = UIHostingController(rootView: ShareSheet(model: model))
        addChild(host)
        host.view.frame = view.bounds
        host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(host.view)
        host.didMove(toParent: self)
    }

    private func finish(added: Bool) {
        if added {
            extensionContext?.completeRequest(returningItems: nil)
        } else {
            extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
        }
    }
}
