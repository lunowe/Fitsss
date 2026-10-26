import FitsssCore
import FitsssUI
import SwiftUI
import UIKit

/// The share sheet inside the app, for screenshots and for trying the upload
/// without the system share sheet (like `ArtGallery`, behind a `dev/` route):
///
///     dev/share              a sample picture; Add to Inspo really uploads it
///     dev/share/link         a sample Pinterest link (the server fetches it)
///     dev/share/adding       …/failed, …/linkfailed, …/added, …/signedout:
///                            the sample in that state, nothing sent
///
/// It posts with `SharedCredentials`, exactly like the extension, so when
/// the Keychain group is not set up it shows the signed-out state.
public struct ShareSheetDemo: View {
    @State private var model: ShareModel
    @State private var isPresented = true
    private let state: String?

    public init(route: [String]) {
        let state = route.count > 2 ? route[2] : nil
        self.state = state
        let content: ShareContent = state == "link" || state == "linkfailed"
            ? .link(URL(string: "https://www.pinterest.com/pin/1155351829985172590/")!, title: "Relaxed linen layers")
            : .picture(jpeg: Self.samplePicture(), source: URL(string: "https://www.pinterest.com/pin/1155351829985172590/"))
        let credentials = state == "signedout" ? nil : SharedCredentials.load()
        _model = State(initialValue: ShareModel(content: content, credentials: credentials))
    }

    public var body: some View {
        Color.fitsssBackground
            .ignoresSafeArea()
            .overlay {
                if !isPresented {
                    Button("Share again") { isPresented = true }
                        .buttonStyle(.fitsssSecondary)
                        .padding(Metrics.pagePadding)
                        .accessibilityIdentifier("share.demo.again")
                }
            }
            .sheet(isPresented: $isPresented) {
                ShareSheet(model: model)
            }
            .task {
                model.onClose = { _ in isPresented = false }
                switch state {
                case "adding": model.showForScreenshot(.adding)
                case "failed": model.showForScreenshot(.failed(message: "Can’t reach Fitsss. Check your connection.", hint: nil))
                case "linkfailed":
                    model.showForScreenshot(.failed(message: "Could not get a picture from that link.", hint: ShareModel.screenshotHint))
                case "added": model.showForScreenshot(.added)
                default: break
                }
            }
    }

    /// A stand-in photo: a flat lay of a navy overshirt, beige trousers and
    /// white sneakers on a warm grey ground. The same bytes every time, so
    /// uploading it twice is one inspo.
    static func samplePicture() -> Data {
        let size = CGSize(width: 800, height: 1000)
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        // Garment colors, the only literal ones allowed.
        let ground = UIColor(Color(hex: "#E7E2DA"))
        let navy = UIColor(Color(hex: "#24304A"))
        let collar = UIColor(Color(hex: "#1A2236"))
        let beige = UIColor(Color(hex: "#CDBB9C"))
        let white = UIColor(Color(hex: "#F7F7F5"))
        let image = UIGraphicsImageRenderer(size: size, format: format).image { _ in
            func fill(_ color: UIColor, _ rect: CGRect, radius: CGFloat = 0) {
                color.setFill()
                UIBezierPath(roundedRect: rect, cornerRadius: radius).fill()
            }
            fill(ground, CGRect(origin: .zero, size: size))
            // Overshirt: body, sleeves, collar.
            fill(navy, CGRect(x: 250, y: 90, width: 300, height: 330), radius: 24)
            fill(navy, CGRect(x: 150, y: 110, width: 110, height: 260), radius: 30)
            fill(navy, CGRect(x: 540, y: 110, width: 110, height: 260), radius: 30)
            fill(collar, CGRect(x: 340, y: 80, width: 120, height: 40), radius: 12)
            // Trousers: a waistband and two legs.
            fill(beige, CGRect(x: 280, y: 460, width: 240, height: 50), radius: 10)
            fill(beige, CGRect(x: 280, y: 490, width: 112, height: 330), radius: 14)
            fill(beige, CGRect(x: 408, y: 490, width: 112, height: 330), radius: 14)
            // Sneakers.
            fill(white, CGRect(x: 230, y: 860, width: 150, height: 70), radius: 35)
            fill(white, CGRect(x: 420, y: 860, width: 150, height: 70), radius: 35)
        }
        let jpeg = image.jpegData(compressionQuality: 0.9) ?? Data()
        return PictureDownscaler.jpeg(from: jpeg) ?? jpeg
    }
}
