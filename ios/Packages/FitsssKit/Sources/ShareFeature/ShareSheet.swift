import FitsssCore
import FitsssUI
import SwiftUI

/// "Share → Fitsss": the shared picture (or link), Add to Inspo, Cancel.
/// The share extension hosts it; `-FitsssRoute dev/share` shows it in the app.
///
/// Signed out it says so and offers nothing else; adding shows progress in
/// the button, then "Added to Inspo" with a check, and closes itself. A
/// failure keeps the preview, says the server's sentence, and offers Try Again.
public struct ShareSheet: View {
    private let model: ShareModel

    public init(model: ShareModel) {
        self.model = model
    }

    public var body: some View {
        NavigationStack {
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(Color.fitsssBackground)
                .navigationTitle("Fitsss")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button([.signedOut, .nothing, .sessionChanged].contains(model.phase) ? "Close" : "Cancel",
                               systemImage: "xmark", role: .cancel) { model.cancel() }
                            .disabled(model.phase == .added)
                            .accessibilityIdentifier("share.cancel")
                    }
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    if showsAddButton { addBar }
                }
        }
        .sensoryFeedback(.success, trigger: model.phase) { _, new in new == .added }
        .sensoryFeedback(.error, trigger: model.phase) { _, new in
            if case .failed = new { true } else { false }
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .signedOut:
            ContentUnavailableView {
                Label("Not signed in", systemImage: "person.crop.circle.badge.exclamationmark")
            } description: {
                Text("Sign in to Fitsss first, then share again.")
                    .accessibilityIdentifier("share.signedOut")
            }
        case .nothing:
            ContentUnavailableView {
                Label("Nothing to add", systemImage: "photo.badge.exclamationmark")
            } description: {
                Text("Fitsss can add a picture or a link to one.")
                    .accessibilityIdentifier("share.nothing")
            }
        case .sessionChanged:
            ContentUnavailableView {
                Label("Signed in elsewhere", systemImage: "person.crop.circle.badge.exclamationmark")
            } description: {
                Text("Fitsss switched to another account or server while this was open. Share again to add it there.")
                    .accessibilityIdentifier("share.sessionChanged")
            }
        case .added:
            AddedConfirmation()
        default:
            // The picture takes the room there is; what happens next and any
            // failure sit with the button, below.
            preview
                .padding(Metrics.pagePadding)
        }
    }

    @ViewBuilder
    private var preview: some View {
        switch model.content {
        case .picture:
            if let image = model.preview {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityLabel("The shared picture")
                    .accessibilityIdentifier("share.picture")
            }
        case .link(let url, let title):
            LinkPreview(url: url, title: title)
                .frame(maxHeight: .infinity, alignment: .top)
        case nil:
            // Still reading what was shared.
            RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
                .fill(Color.fitsssCard)
                .overlay { ProgressView() }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .accessibilityLabel("Reading what you shared")
        }
    }

    @ViewBuilder
    private var status: some View {
        if case .failed(let message, let hint) = model.phase {
            VStack(alignment: .leading, spacing: 4) {
                Text(message)
                    .foregroundStyle(Color.fitsssDestructive)
                    .accessibilityIdentifier("share.error")
                if let hint {
                    Text(hint)
                        .foregroundStyle(Color.fitsssLabel2)
                        .accessibilityIdentifier("share.hint")
                }
            }
            .font(.footnote)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        } else if model.content != nil {
            Text("It goes to Inspo on the Looks tab, and Fitsss reads the pieces in it.")
                .font(.footnote)
                .foregroundStyle(Color.fitsssLabel2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // MARK: - Add

    private var showsAddButton: Bool {
        switch model.phase {
        case .reading, .ready, .adding, .failed: true
        case .added, .signedOut, .nothing, .sessionChanged: false
        }
    }

    private var addBar: some View {
        BottomActionBar {
            VStack(spacing: 8) {
                status
                addButton
            }
        }
    }

    private var addButton: some View {
        Button(action: model.add) {
            HStack(spacing: 8) {
                if model.phase == .adding {
                    ProgressView().tint(Color.fitsssInkForeground)
                }
                Text(buttonTitle)
            }
        }
        .buttonStyle(.fitsssPrimary)
        .disabled(!model.canAdd)
        .accessibilityIdentifier("share.add")
    }

    private var buttonTitle: String {
        switch model.phase {
        case .adding: "Adding…"
        case .failed: "Try Again"
        default: "Add to Inspo"
        }
    }
}

/// A shared link: the page's title (or its site) over the address.
private struct LinkPreview: View {
    let url: URL
    let title: String?

    @ScaledMetric(relativeTo: .body) private var iconSide: CGFloat = 44

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "link")
                .font(.system(size: min(iconSide, 64) * 0.45, weight: .medium))
                .foregroundStyle(Color.fitsssLabel)
                .frame(width: min(iconSide, 64), height: min(iconSide, 64))
                .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius, style: .continuous))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(title ?? site)
                    .font(.headline)
                    .foregroundStyle(Color.fitsssLabel)
                    .lineLimit(2)
                Text(url.absoluteString)
                    .font(.footnote)
                    .foregroundStyle(Color.fitsssLabel2)
                    .lineLimit(2)
                    .truncationMode(.middle)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(12)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("share.link")
    }

    /// "pinterest.com" from "https://www.pinterest.com/pin/…".
    private var site: String {
        let host = url.host() ?? url.absoluteString
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}

/// The check and "Added to Inspo", shown for a moment before the sheet closes.
private struct AddedConfirmation: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var appeared = false

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 56, weight: .regular))
                .foregroundStyle(Color.fitsssSuccess)
                .scaleEffect(appeared || reduceMotion ? 1 : 0.8)
                .opacity(appeared ? 1 : 0)
                .accessibilityHidden(true)
            Text("Added to Inspo")
                .font(.title3.weight(.semibold))
                .foregroundStyle(Color.fitsssLabel)
                .accessibilityIdentifier("share.added")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            withAnimation(.easeOut(duration: 0.2)) { appeared = true }
            AccessibilityNotification.Announcement("Added to Inspo").post()
        }
    }
}
