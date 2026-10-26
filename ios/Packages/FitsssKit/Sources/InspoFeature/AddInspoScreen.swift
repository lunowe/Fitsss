import FitsssCore
import FitsssUI
import PhotosUI
import SwiftUI
import UIKit

/// "Add a picture" in a sheet with its own navigation stack, Cancel at the
/// top. Where the new picture goes is the host's call:
///
/// - with `onAdded` (the Looks shelf's "+"), the id is handed back and the
///   host closes the sheet and shows the picture on its own stack;
/// - without (Today's "Restyle a picture"), the sheet flows into the
///   picture's detail itself, with Done to close it.
public struct AddInspoSheet: View {
    private let onClose: () -> Void
    private let onAdded: ((String) -> Void)?

    @Environment(ToastCenter.self) private var toasts
    @State private var path: [AddedPicture] = []
    /// Half height for the two short sections; full height once it flows
    /// into a picture's detail.
    @State private var detent: PresentationDetent = .medium

    public init(onClose: @escaping () -> Void, onAdded: ((String) -> Void)? = nil) {
        self.onClose = onClose
        self.onAdded = onAdded
    }

    public var body: some View {
        NavigationStack(path: $path) {
            AddInspoScreen { id in
                if let onAdded {
                    onAdded(id)
                } else {
                    path.append(AddedPicture(id: id))
                }
            }
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel, action: onClose)
                        .accessibilityIdentifier("inspo.add.cancel")
                }
            }
            .navigationDestination(for: AddedPicture.self) { picture in
                InspoDetailScreen(inspoId: picture.id, onClose: onClose)
            }
        }
        .presentationDetents([.medium, .large], selection: $detent)
        .presentationDragIndicator(.visible)
        // Opaque: at half height the system glass let the shelf's pictures
        // bleed through as color blotches behind the link field.
        .presentationBackground(Color.fitsssBackground)
        .onChange(of: path) { _, path in
            if !path.isEmpty { withAnimation { detent = .large } }
        }
        // Toasts from the detail ("Saved to Looks") show over the sheet.
        .toastHost(toasts)
    }
}

/// The detail pushed inside the sheet once a picture is in.
private struct AddedPicture: Hashable {
    let id: String
}

/// The two ways a picture gets in (the web's `AddInspo`): a pasted link, or
/// a photo from the camera or the library, resized on the phone first. Both
/// hand the stored picture on; reading it happens on its detail page.
struct AddInspoScreen: View {
    let onAdded: (String) -> Void

    @Environment(InspoStore.self) private var inspos

    private enum Busy { case link, photo }

    @State private var url = ""
    @State private var busy: Busy?
    @State private var progress = ""
    @State private var linkProblem: String?
    @State private var photoProblem: String?
    @State private var libraryItem: PhotosPickerItem?
    @State private var showsLibrary = false
    @State private var showsCamera = false
    /// Loading and shrinking a photo, cancelled when the sheet goes away.
    @State private var photoTask: Task<Void, Never>?
    @FocusState private var linkFocused: Bool

    /// "Take a screenshot …" goes under a link that gave nothing usable.
    static let screenshotHint = "Take a screenshot and add it as a photo instead."

    private let hasCamera = UIImagePickerController.isSourceTypeAvailable(.camera)

    var body: some View {
        List {
            linkSection
            photoSection
        }
        .listStyle(.insetGrouped)
        .listSectionSpacing(Metrics.sectionSpacing)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle("Add a picture")
        .navigationBarTitleDisplayMode(.inline)
        .photosPicker(isPresented: $showsLibrary, selection: $libraryItem, matching: .images, preferredItemEncoding: .compatible)
        .onChange(of: libraryItem) { _, item in
            guard let item else { return }
            libraryItem = nil
            let session = inspos.sessionMark
            photoTask = Task { await addLibraryPhoto(item, session: session) }
        }
        .fullScreenCover(isPresented: $showsCamera) {
            CameraPicker { image in
                showsCamera = false
                guard let image else { return }
                let session = inspos.sessionMark
                photoTask = Task { await addCameraPhoto(image, session: session) }
            }
            .ignoresSafeArea()
        }
        .sensoryFeedback(.error, trigger: linkProblem ?? photoProblem) { _, new in new != nil }
        // The message was about what was sent; once the link changes it is stale.
        .onChange(of: url) { linkProblem = nil }
        .interactiveDismissDisabled(busy != nil)
        // Cancel can close the sheet while a photo is still being prepared.
        .onDisappear { photoTask?.cancel() }
    }

    // MARK: - Link

    private var linkSection: some View {
        Section {
            HStack(spacing: 8) {
                TextField("Picture link", text: $url, prompt: Text("Paste a Pinterest or image link"))
                    .font(.body)
                    .keyboardType(.URL)
                    .textContentType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .submitLabel(.go)
                    .focused($linkFocused)
                    .onSubmit { Task { await addLink() } }
                    .disabled(busy != nil)
                    .accessibilityLabel("Picture link")
                    .accessibilityIdentifier("inspo.add.link")

                if busy == .link {
                    ProgressView()
                        .accessibilityLabel("Adding the link")
                } else if trimmedURL.isEmpty {
                    PasteButton(payloadType: String.self) { strings in
                        guard let pasted = strings.first?.trimmingCharacters(in: .whitespacesAndNewlines),
                              !pasted.isEmpty else { return }
                        Task { @MainActor in
                            url = pasted
                            await addLink()
                        }
                    }
                    .labelStyle(.iconOnly)
                    .buttonBorderShape(.capsule)
                    .disabled(busy != nil)
                    .accessibilityIdentifier("inspo.add.paste")
                } else {
                    Button("Add") { Task { await addLink() } }
                        .font(.body)
                        .foregroundStyle(busy == nil ? Color.fitsssTint : Color.fitsssLabel3)
                        .buttonStyle(.borderless)
                        .disabled(busy != nil)
                        .accessibilityIdentifier("inspo.add.link.submit")
                }
            }
            .frame(minHeight: Metrics.minTapTarget)
        } header: {
            Text("Link")
        } footer: {
            if let linkProblem {
                Text(linkProblem)
                    .foregroundStyle(Color.fitsssDestructive)
                    .accessibilityIdentifier("inspo.add.link.error")
            }
        }
    }

    private var trimmedURL: String { url.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func addLink() async {
        let link = trimmedURL
        guard !link.isEmpty, busy == nil else { return }
        linkFocused = false
        linkProblem = nil
        photoProblem = nil
        busy = .link
        defer { busy = nil }
        do {
            let inspo = try await inspos.add(link: link)
            onAdded(inspo.id)
        } catch {
            linkProblem = Self.linkMessage(for: error)
        }
    }

    /// The server's sentence, and the screenshot way out when the link itself
    /// gave nothing usable, unless the sentence already offers one ("…
    /// upload it instead"): saying it twice reads like a stutter.
    static func linkMessage(for error: any Error) -> String? {
        guard !error.isQuiet else { return nil }
        guard let api = error as? APIError else { return "Something went wrong." }
        switch api {
        case .invalid, .server(413, _):
            let message = api.displayMessage
            return message.localizedCaseInsensitiveContains("instead") ? message : "\(message) \(screenshotHint)"
        default:
            return api.displayMessage
        }
    }

    // MARK: - Photo

    private var photoSection: some View {
        Section {
            if hasCamera {
                Button {
                    showsCamera = true
                } label: {
                    photoRow("Take a photo", systemImage: "camera")
                }
                .disabled(busy != nil)
                .accessibilityIdentifier("inspo.add.camera")
            }
            Button {
                showsLibrary = true
            } label: {
                photoRow("Choose from library", systemImage: "photo.on.rectangle")
            }
            .disabled(busy != nil)
            .accessibilityIdentifier("inspo.add.library")
        } header: {
            Text("Photo")
        } footer: {
            if busy == .photo {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text(progress)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("inspo.add.photo.status")
            } else if let photoProblem {
                Text(photoProblem)
                    .foregroundStyle(Color.fitsssDestructive)
                    .accessibilityIdentifier("inspo.add.photo.error")
            }
        }
    }

    private func photoRow(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 12) {
            InspoRowIcon(systemName: systemImage)
            Text(title)
                .font(.body)
                .foregroundStyle(busy == nil ? Color.fitsssLabel : Color.fitsssLabel3)
            Spacer(minLength: 0)
            RowChevron()
        }
        .frame(minHeight: Metrics.minTapTarget)
        .contentShape(Rectangle())
    }

    /// `session`: the `sessionMark` when the photo was chosen. Preparing it
    /// can take a while; if the account or server changes meanwhile, it is
    /// not sent with the new session.
    private func addLibraryPhoto(_ item: PhotosPickerItem, session: Int) async {
        guard busy == nil else { return }
        start("Preparing the picture…")
        let data: Data?
        do {
            data = try await item.loadTransferable(type: Data.self)
        } catch {
            data = nil
        }
        if Task.isCancelled { return finish() }
        guard let data else {
            finish(problem: "That photo could not be opened. Try another one.")
            return
        }
        await upload(Self.shrink(data), session: session)
    }

    private func addCameraPhoto(_ image: UIImage, session: Int) async {
        guard busy == nil else { return }
        start("Preparing the picture…")
        await upload(Self.shrink(image), session: session)
    }

    private func start(_ message: String) {
        linkProblem = nil
        photoProblem = nil
        progress = message
        busy = .photo
    }

    private func finish(problem: String? = nil) {
        busy = nil
        progress = ""
        photoProblem = problem
    }

    private func upload(_ jpeg: Data?, session: Int) async {
        if Task.isCancelled { return finish() }
        guard let jpeg else {
            finish(problem: "That picture could not be read. Try another one.")
            return
        }
        progress = "Uploading…"
        do {
            let inspo = try await inspos.add(imageData: jpeg, session: session)
            finish()
            onAdded(inspo.id)
        } catch where error.isQuiet {
            finish()
        } catch let error as APIError {
            finish(problem: error.displayMessage)
        } catch {
            finish(problem: "Something went wrong.")
        }
    }

    /// 1024 px on the long side, JPEG: what every upload is.
    @concurrent
    nonisolated private static func shrink(_ data: Data) async -> Data? {
        PictureDownscaler.jpeg(from: data)
    }

    @concurrent
    nonisolated private static func shrink(_ image: UIImage) async -> Data? {
        PictureDownscaler.jpeg(from: image)
    }
}

// MARK: - Camera

/// The system camera. Hidden where there is none (the simulator).
private struct CameraPicker: UIViewControllerRepresentable {
    /// Nil when the user cancelled.
    let onFinish: (UIImage?) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onFinish: (UIImage?) -> Void

        init(onFinish: @escaping (UIImage?) -> Void) { self.onFinish = onFinish }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            onFinish(info[.originalImage] as? UIImage)
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onFinish(nil)
        }
    }
}
