import FitsssCore
import FitsssUI
import SwiftUI

/// What the app shows while `SessionStore` checks the stored token (launch,
/// server switch): the plain grouped background, so a fast restore goes
/// straight from launch to content. Only if it takes a while does a spinner
/// fade in, with the server it is waiting on.
public struct SessionRestoringView: View {
    private let server: URL
    @State private var isSlow = false

    public init(server: URL) {
        self.server = server
    }

    public var body: some View {
        ZStack {
            Color.fitsssBackground.ignoresSafeArea()
            if isSlow {
                VStack(spacing: 12) {
                    ProgressView()
                    Text("Connecting to \(ServerAddress.display(server))…")
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, Metrics.pagePadding)
                .transition(.opacity)
            }
        }
        .accessibilityIdentifier("session.restoring")
        .task {
            guard (try? await Task.sleep(for: .milliseconds(700))) != nil else { return }
            withAnimation(.easeOut(duration: 0.2)) { isSlow = true }
        }
    }
}
