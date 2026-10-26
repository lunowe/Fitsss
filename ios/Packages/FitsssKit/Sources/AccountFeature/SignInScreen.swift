import FitsssCore
import FitsssUI
import SwiftUI

/// Shown whenever the session store is signed out: sign in, or create an
/// account. The web's `/login` and `/register` pair as one screen with a mode
/// switch; the server (`SessionStore`) keeps every rule, the screen only
/// mirrors the password minimum so the obvious mistake is caught before a
/// round trip.
public struct SignInScreen: View {
    @Environment(SessionStore.self) private var session

    @State private var mode: Mode = .signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isSubmitting = false
    @State private var showsServer = false
    @FocusState private var focus: Field?

    public init() {}

    enum Mode {
        case signIn, signUp

        var tagline: String {
            switch self {
            case .signIn: "Your closet, one tap away."
            case .signUp: "Build a closet you actually wear."
            }
        }
    }

    enum Field: Hashable { case name, email, password }

    /// better-auth's `minPasswordLength` (`src/lib/auth.ts`).
    static let minPasswordLength = 8

    public var body: some View {
        Form {
            Section {
                masthead
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets())

            Section {
                fields
                    .disabled(isSubmitting)
            } footer: {
                if let error {
                    Text(error)
                        .foregroundStyle(Color.fitsssDestructive)
                        .accessibilityIdentifier("signin.error")
                } else if mode == .signUp {
                    Text("Use at least \(Self.minPasswordLength) characters for your password.")
                }
            }

            Section {
                VStack(spacing: 16) {
                    modeSwitch
                    serverButton
                }
                .frame(maxWidth: .infinity)
            }
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 8, trailing: 0))
        }
        .scrollDismissesKeyboard(.interactively)
        // Pinned above the keyboard; the page is flat, so no bar material,
        // just the system scroll-edge effect if the form scrolls under it.
        .safeAreaBar(edge: .bottom, spacing: 0) {
            Button(action: submit) {
                HStack(spacing: 8) {
                    if isSubmitting {
                        ProgressView().tint(Color.fitsssInkForeground)
                    }
                    Text(primaryTitle)
                }
            }
            .buttonStyle(.fitsssPrimary)
            .disabled(!canSubmit || isSubmitting)
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, 8)
            .accessibilityIdentifier("signin.submit")
        }
        .sheet(isPresented: $showsServer) {
            NavigationStack {
                ServerScreen(current: session.api.baseURL, isSheet: true)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button(role: .close) { showsServer = false }
                        }
                    }
            }
            .presentationDetents([.medium, .large])
        }
        .onChange(of: error) { _, message in
            if let message { AccessibilityNotification.Announcement(message).post() }
        }
    }

    // MARK: - Pieces

    private var masthead: some View {
        VStack(spacing: 4) {
            Text("Fitsss")
                .font(.largeTitle.weight(.bold))
                .tracking(-1)
                .foregroundStyle(Color.fitsssLabel)
                .accessibilityAddTraits(.isHeader)
            Text(mode.tagline)
                .font(.callout)
                .foregroundStyle(Color.fitsssLabel2)
                .contentTransition(.opacity)
        }
        .multilineTextAlignment(.center)
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
        .padding(.bottom, 8)
    }

    @ViewBuilder
    private var fields: some View {
        if mode == .signUp {
            TextField("Name", text: $name)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                .submitLabel(.next)
                .focused($focus, equals: .name)
                .onSubmit { focus = .email }
                .accessibilityIdentifier("signin.name")
        }
        TextField("Email", text: $email)
            .textContentType(.username)
            .keyboardType(.emailAddress)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .submitLabel(.next)
            .focused($focus, equals: .email)
            .onSubmit { focus = .password }
            .accessibilityIdentifier("signin.email")
        SecureField("Password", text: $password)
            // `.password` in both modes, on purpose. With `.newPassword` the
            // iOS 27 simulator replaces the field's contents on every
            // keystroke (typing "abcdefgh" leaves "h"), so sign-up always
            // failed the length check. Strong-password suggestions need
            // associated domains (webcredentials), which the app does not
            // have yet; revisit `.newPassword` once it does, on a device.
            .textContentType(.password)
            .submitLabel(.go)
            .focused($focus, equals: .password)
            .onSubmit(submit)
            .accessibilityIdentifier("signin.password")
    }

    /// "New here? Create an account" on one line; stacked when large text
    /// would wrap it.
    private var modeSwitch: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 4) { modePrompt; modeButton }
            VStack(spacing: 4) { modePrompt; modeButton }
        }
        .font(.callout)
        .multilineTextAlignment(.center)
        .disabled(isSubmitting)
    }

    private var modePrompt: some View {
        Text(mode == .signIn ? "New here?" : "Already have an account?")
            .foregroundStyle(Color.fitsssLabel2)
    }

    private var modeButton: some View {
        Button(mode == .signIn ? "Create an account" : "Sign in") {
            withAnimation(.easeOut(duration: 0.2)) {
                mode = mode == .signIn ? .signUp : .signIn
                error = nil
            }
            if focus != nil { focus = mode == .signUp ? .name : .email }
        }
        .buttonStyle(.borderless)
        .foregroundStyle(Color.fitsssTint)
        .accessibilityIdentifier("signin.mode")
    }

    private var serverButton: some View {
        Button {
            showsServer = true
        } label: {
            HStack(spacing: 4) {
                Text("Server:").foregroundStyle(Color.fitsssLabel2)
                Text(ServerAddress.name(session.api.baseURL)).foregroundStyle(Color.fitsssTint)
            }
            .font(.footnote)
        }
        .buttonStyle(.borderless)
        .disabled(isSubmitting)
        .accessibilityLabel("Server, \(ServerAddress.name(session.api.baseURL))")
        .accessibilityHint("Choose which Fitsss server to sign in to.")
        .accessibilityIdentifier("signin.server")
    }

    // MARK: - Submitting

    private var primaryTitle: String {
        switch (mode, isSubmitting) {
        case (.signIn, false): "Sign in"
        case (.signIn, true): "Signing in…"
        case (.signUp, false): "Create account"
        case (.signUp, true): "Creating account…"
        }
    }

    private var trimmedName: String { name.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var canSubmit: Bool {
        !trimmedEmail.isEmpty && !password.isEmpty && (mode == .signIn || !trimmedName.isEmpty)
    }

    private func submit() {
        guard !isSubmitting else { return }
        // Return on the last field with something still empty: go there instead.
        if mode == .signUp, trimmedName.isEmpty { focus = .name; return }
        if trimmedEmail.isEmpty { focus = .email; return }
        if password.isEmpty { focus = .password; return }
        // JavaScript string length, which is what the server counts.
        if mode == .signUp, password.utf16.count < Self.minPasswordLength {
            error = "Use at least \(Self.minPasswordLength) characters for your password."
            focus = .password
            return
        }

        error = nil
        isSubmitting = true
        let mode = mode, name = trimmedName, email = trimmedEmail, password = password
        Task {
            do {
                switch mode {
                case .signIn: try await session.signIn(email: email, password: password)
                case .signUp: try await session.signUp(name: name, email: email, password: password)
                }
                // Signed in: RootView swaps this screen out.
            } catch {
                self.error = (error as? APIError)?.errorDescription ?? error.localizedDescription
            }
            isSubmitting = false
        }
    }
}
