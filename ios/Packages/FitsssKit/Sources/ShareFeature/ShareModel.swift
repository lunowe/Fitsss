import FitsssCore
import Foundation
import Observation
import UIKit

/// The share sheet's state: reading what was shared, adding it to Inspo
/// with the app's session (`SharedCredentials`), and how that went.
///
/// Adding always asks the server to read the picture right after it answers
/// (`?analyze=1`), so the sheet can close at once and the picture is read by
/// the time the app is opened. Sending the same picture again returns the one
/// already saved, so Try Again after a lost answer never makes a copy.
@MainActor
@Observable
public final class ShareModel {
    public enum Phase: Equatable, Sendable {
        /// Reading the shared picture or link.
        case reading
        case ready
        case adding
        /// Saved; the sheet closes itself a moment later.
        case added
        /// `hint` is the way out when a link gave nothing usable.
        case failed(message: String, hint: String?)
        /// The app is signed out (or its session ended): nothing to post as.
        case signedOut
        /// The share had neither a picture nor a web link.
        case nothing
        /// The app signed in to another account or server since the sheet
        /// opened: this share would go to the wrong place.
        case sessionChanged
    }

    public private(set) var phase: Phase
    public private(set) var content: ShareContent?
    /// The picture as it will be uploaded, for the preview.
    public private(set) var preview: UIImage?

    /// Called once, when the sheet should go away (`added` true after a save).
    @ObservationIgnored public var onClose: ((_ added: Bool) -> Void)?

    /// How long "Added to Inspo" stays before the sheet closes.
    public static let addedPause: Duration = .milliseconds(1100)
    static let screenshotHint = "Take a screenshot and share that instead."

    private let api: APIClient?
    private let credentials: SharedCredentials.Credentials?
    /// The app's session as it is now, asked again before every send.
    @ObservationIgnored private let currentCredentials: () -> SharedCredentials.Credentials?
    @ObservationIgnored private var closed = false

    /// For the extension: posts as whoever the app has signed in, and reads
    /// the share's attachments (unless there is nobody to post as).
    public convenience init(sharing items: [NSExtensionItem]) {
        let credentials = SharedCredentials.load()
        self.init(content: nil, credentials: credentials, current: SharedCredentials.load)
        guard credentials != nil else { return }
        phase = .reading
        Task {
            let content = await ShareContentLoader.load(items)
            show(content)
        }
    }

    /// Content already in hand (the in-app demo, `ShareSheetDemo`).
    /// `current` reports the app's session at send time (default: the same
    /// credentials throughout).
    public init(
        content: ShareContent?,
        credentials: SharedCredentials.Credentials?,
        current: (() -> SharedCredentials.Credentials?)? = nil
    ) {
        self.credentials = credentials
        self.currentCredentials = current ?? { credentials }
        api = credentials.map { APIClient(baseURL: $0.server, token: $0.token) }
        phase = credentials == nil ? .signedOut : .reading
        if credentials != nil, content != nil { show(content) }
    }

    private func show(_ content: ShareContent?) {
        self.content = content
        if case .picture(let jpeg, _) = content { preview = UIImage(data: jpeg) }
        phase = content == nil ? .nothing : .ready
    }

    public var canAdd: Bool {
        switch phase {
        case .ready, .failed: content != nil && api != nil
        default: false
        }
    }

    public func add() {
        guard canAdd, let api, let content else { return }
        // The sheet may have stayed open across a sign-out or a switch in the
        // app; never post with the session it started with after that.
        guard let now = currentCredentials() else {
            phase = .signedOut
            return
        }
        guard now == credentials else {
            phase = .sessionChanged
            return
        }
        phase = .adding
        Task {
            do {
                try await Self.upload(content, with: api)
                phase = .added
                try? await Task.sleep(for: Self.addedPause)
                close(added: true)
            } catch APIError.unauthorized {
                phase = .signedOut
            } catch let error as APIError {
                phase = Self.failure(error, for: content)
            } catch {
                phase = .failed(message: "Could not add that. Try again.", hint: nil)
            }
        }
    }

    public func cancel() { close(added: false) }

    private func close(added: Bool) {
        guard !closed else { return }
        closed = true
        onClose?(added)
    }

    private static func upload(_ content: ShareContent, with api: APIClient) async throws {
        let analyze = URLQueryItem(name: "analyze", value: "1")
        switch content {
        case .picture(let jpeg, let source):
            var query = [analyze]
            if let source { query.append(URLQueryItem(name: "sourceUrl", value: source.absoluteString)) }
            let _: Inspo = try await api.upload("api/v1/inspos", data: jpeg, contentType: "image/jpeg", query: query)
        case .link(let url, _):
            // The server fetches the page (a pin) before it answers.
            let _: Inspo = try await api.call(
                .post, "api/v1/inspos", query: [analyze], body: ["url": url.absoluteString], timeout: 45
            )
        }
    }

    /// The server's sentence; for a link it could not use (422, 413), the
    /// way out as well, unless the sentence already says it (as the web does).
    static func failure(_ error: APIError, for content: ShareContent) -> Phase {
        let message = error.errorDescription ?? "Something went wrong."
        let linkFailed: Bool = switch (content, error) {
        case (.link, .invalid), (.link, .server(413, _)): true
        default: false
        }
        let hint = linkFailed && !message.localizedCaseInsensitiveContains("instead") ? screenshotHint : nil
        return .failed(message: message, hint: hint)
    }

    /// Puts the sheet in a state for a screenshot (`ShareSheetDemo`).
    public func showForScreenshot(_ phase: Phase) {
        self.phase = phase
    }
}
