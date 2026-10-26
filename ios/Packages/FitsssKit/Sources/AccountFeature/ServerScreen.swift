import FitsssCore
import FitsssUI
import SwiftUI

/// Which Fitsss server the app talks to: Production, the local dev server, or
/// a custom address (the Mac's LAN address from a phone). Pushed from the You
/// tab, and presented as a sheet from the sign-in screen so a bad choice can
/// always be undone.
///
/// Switching re-runs the session restore on the new server (each server keeps
/// its own sign-in), which replaces the whole UI, so while signed in a preset
/// asks first. A custom address is checked before the app switches to it.
struct ServerScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(\.dismiss) private var dismiss

    /// Whether the custom address section is open. The checkmark always
    /// shows the server the app is on, not a choice still being typed.
    @State private var showsCustom: Bool
    @State private var customText: String
    @State private var customError: String?
    @State private var isChecking = false
    @State private var pendingPreset: ServerChoice?
    @FocusState private var customFocused: Bool
    private let isSheet: Bool

    /// `isSheet`: presented modally (sign-in), so it closes itself before switching.
    init(current: URL, isSheet: Bool = false) {
        self.isSheet = isSheet
        let isCustom = ServerChoice(current) == .custom
        _showsCustom = State(initialValue: isCustom)
        _customText = State(initialValue: isCustom ? current.absoluteString : "")
    }

    private var current: URL { session.api.baseURL }
    private var isSignedIn: Bool { session.user != nil }

    var body: some View {
        Form {
            Section {
                presetRow(.production)
                presetRow(.local)
                choiceRow(.custom, detail: ServerChoice(current) == .custom ? ServerAddress.display(current) : nil) {
                    withAnimation(.easeOut(duration: 0.2)) { showsCustom = true }
                    customFocused = true
                }
            } footer: {
                // Verbatim: as a localized key, markdown would turn the
                // example address into a tappable link to nowhere.
                Text(verbatim: "Each server keeps its own sign-in. On an iPhone, localhost is the phone itself: to use the dev server on your Mac, choose Custom and enter the Mac’s Wi‑Fi address, like http://192.168.1.20:3100.")
            }

            if showsCustom {
                Section {
                    TextField("http://192.168.1.20:3100", text: $customText)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .submitLabel(.go)
                        .focused($customFocused)
                        .onSubmit(connect)
                        .onChange(of: customText) { customError = nil }
                        .disabled(isChecking)
                        .accessibilityLabel("Server address")
                        .accessibilityIdentifier("server.custom.field")

                    Button(action: connect) {
                        HStack {
                            Text(isChecking ? "Connecting…" : "Connect")
                            Spacer()
                            if isChecking { ProgressView() }
                        }
                    }
                    .disabled(isChecking || customText.trimmingCharacters(in: .whitespaces).isEmpty)
                    .accessibilityIdentifier("server.custom.connect")
                } header: {
                    Text("Custom server")
                } footer: {
                    if let customError {
                        Text(customError)
                            .foregroundStyle(Color.fitsssDestructive)
                            .accessibilityIdentifier("server.custom.error")
                    }
                }
            }
        }
        .navigationTitle("Server")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: - Rows

    private func presetRow(_ preset: ServerChoice) -> some View {
        let url = preset.presetURL!
        return choiceRow(preset, detail: ServerAddress.display(url)) {
            customError = nil
            if ServerAddress.same(url, current) {
                return
            } else if isSignedIn {
                pendingPreset = preset
            } else {
                switchTo(url)
            }
        }
        // Per row, so the iOS 26 popover points at the row that was tapped.
        .confirmationDialog(
            "Switch to \(preset.title)?",
            isPresented: Binding(get: { pendingPreset == preset }, set: { if !$0 { pendingPreset = nil } }),
            titleVisibility: .visible
        ) {
            Button("Switch to \(preset.title)") { switchTo(url) }
        } message: {
            Text("Fitsss reloads from this server. You stay signed in on \(ServerAddress.name(current)), for when you come back.")
        }
    }

    private func choiceRow(_ row: ServerChoice, detail: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.title).foregroundStyle(Color.fitsssLabel)
                    if let detail {
                        Text(detail)
                            .font(.subheadline)
                            .foregroundStyle(Color.fitsssLabel2)
                    }
                }
                Spacer()
                if ServerChoice(current) == row {
                    Image(systemName: "checkmark")
                        .font(.body.weight(.semibold))
                        .foregroundStyle(Color.fitsssTint)
                }
            }
            .contentShape(Rectangle())
        }
        .disabled(isChecking)
        .accessibilityAddTraits(ServerChoice(current) == row ? .isSelected : [])
        .accessibilityIdentifier("server.\(row)")
    }

    // MARK: - Switching

    private func connect() {
        guard !isChecking else { return }
        switch ServerAddress.parse(customText) {
        case .failure(let error):
            customError = error.message
        case .success(let url):
            customText = url.absoluteString
            if ServerAddress.same(url, current) {
                if isSheet { dismiss() }
                return
            }
            isChecking = true
            Task {
                let result = await ServerProbe.check(url)
                isChecking = false
                if let problem = ServerAddress.problem(result, at: url) {
                    customError = problem
                } else {
                    switchTo(url)
                }
            }
        }
    }

    /// The restore that follows replaces this screen (and, from the sign-in
    /// sheet, its presenter), so it runs detached from the view.
    private func switchTo(_ url: URL) {
        let session = session
        // The default is stored as "no choice", so it follows the build
        // (simulator: local, device: production).
        let stored: URL? = ServerAddress.same(url, ServerConfig.defaultURL) ? nil : url
        if isSheet { dismiss() }
        Task { await session.switchServer(to: stored) }
    }
}
