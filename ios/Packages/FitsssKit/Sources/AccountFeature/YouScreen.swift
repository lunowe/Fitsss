import FitsssCore
import FitsssUI
import SwiftUI

/// The You tab: account, appearance, taste notes, AI model, server, sign
/// out. Mirrors the web's `/you`; content admin stays on the web, behind one
/// link.
///
/// The Taste screen lives in `TasteFeature`, which this module does not
/// depend on; the app hands it in as `taste`, a view builder.
///
/// Routes (`-FitsssRoute`): `you/server` opens the server picker, `you/taste…`
/// the Taste screen (which reads the rest of the route itself), `you/model`
/// the AI model screen, `you/model/<task>` its model picker for a task.
public struct YouScreen: View {
    @Environment(SessionStore.self) private var session
    @Environment(TasteStore.self) private var taste
    @Environment(LLMSettingsStore.self) private var llm
    @AppStorage(AppearancePreference.storageKey) private var appearance: AppearancePreference = .system

    private let tasteScreen: () -> AnyView

    @State private var path: [Route]
    @State private var confirmsSignOut = false
    @State private var isSigningOut = false

    public init(taste: @escaping () -> AnyView) {
        self.tasteScreen = taste
        _path = State(initialValue: Self.launchPath(for: LaunchOptions.route))
    }

    enum Route: Hashable {
        case server, taste, model
        /// The model picker for a task id.
        case modelPicker(String)
    }

    static func launchPath(for route: [String]) -> [Route] {
        guard route.first == "you", route.count > 1 else { return [] }
        switch route[1] {
        case "server": return [.server]
        case "taste": return [.taste]
        case "model": return route.count > 2 ? [.model, .modelPicker(route[2])] : [.model]
        default: return []
        }
    }

    public var body: some View {
        NavigationStack(path: $path) {
            List {
                if let user = session.user {
                    Section("Account") {
                        AccountRow(user: user)
                    }
                }

                Section("Appearance") {
                    Picker("Appearance", selection: $appearance) {
                        ForEach(AppearancePreference.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .accessibilityIdentifier("you.appearance")
                }

                Section("Taste") {
                    NavigationLink(value: Route.taste) {
                        Label {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Taste notes").foregroundStyle(Color.fitsssLabel)
                                if let summary = tasteSummary {
                                    Text(summary)
                                        .font(.subheadline)
                                        .foregroundStyle(Color.fitsssLabel2)
                                        .accessibilityIdentifier("you.taste.summary")
                                }
                            }
                        } icon: {
                            RowIcon("sparkles")
                        }
                    }
                    .accessibilityIdentifier("you.taste")
                }

                Section {
                    NavigationLink(value: Route.model) {
                        LabeledContent {
                            if let provider = llm.current?.provider {
                                Text(provider.label)
                            }
                        } label: {
                            Label { Text("AI model") } icon: { RowIcon("cpu") }
                        }
                    }
                    .accessibilityIdentifier("you.model")

                    NavigationLink(value: Route.server) {
                        LabeledContent {
                            Text(ServerAddress.name(session.api.baseURL))
                        } label: {
                            Label { Text("Server") } icon: { RowIcon("server.rack") }
                        }
                    }
                    .accessibilityIdentifier("you.server")

                    if session.user?.isAdmin == true {
                        Link(destination: session.api.baseURL.appending(path: "you/content")) {
                            HStack {
                                Label {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("Manage catalog").foregroundStyle(Color.fitsssLabel)
                                        Text("Categories, piece types, artwork")
                                            .font(.subheadline)
                                            .foregroundStyle(Color.fitsssLabel2)
                                    }
                                } icon: {
                                    RowIcon("list.bullet.rectangle")
                                }
                                Spacer()
                                Image(systemName: "arrow.up.right")
                                    .font(.footnote.weight(.semibold))
                                    .foregroundStyle(Color.fitsssLabel3)
                                    .accessibilityHidden(true)
                            }
                        }
                        .accessibilityHint("Opens in Safari.")
                        .accessibilityIdentifier("you.catalog")
                    }
                } header: {
                    Text("Setup")
                } footer: {
                    if session.user?.isAdmin == true {
                        Text("The catalog is edited on the web. It opens in Safari, where you sign in separately.")
                    }
                }

                Section {
                    Button(role: .destructive) {
                        confirmsSignOut = true
                    } label: {
                        HStack(spacing: 8) {
                            if isSigningOut { ProgressView() }
                            Text(isSigningOut ? "Signing out…" : "Sign out")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(isSigningOut)
                    .accessibilityIdentifier("you.signout")
                    // On the button, so the iOS 26 popover points at it.
                    .confirmationDialog("Sign out of Fitsss?", isPresented: $confirmsSignOut, titleVisibility: .visible) {
                        Button("Sign out", role: .destructive, action: signOut)
                    } message: {
                        Text("Your closet stays saved on the server.")
                    }
                } footer: {
                    Text("Fitsss \(AppVersion.display)")
                        .monospacedDigit()
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                        .accessibilityLabel("Version \(AppVersion.display)")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("You")
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .server: ServerScreen(current: session.api.baseURL)
                case .taste: tasteScreen()
                case .model: ModelScreen()
                case .modelPicker(let task): ModelPickerScreen(taskId: task)
                }
            }
        }
    }

    /// "Nothing learned yet" or "4 learned lines": every scope's lines, liked
    /// and avoided. Nothing until the overview is in.
    private var tasteSummary: String? {
        guard let count = taste.overview?.learnedLineCount else { return nil }
        if count == 0 { return "Nothing learned yet" }
        return "\(count.formatted()) learned \(count == 1 ? "line" : "lines")"
    }

    private func signOut() {
        isSigningOut = true
        Task {
            await session.signOut()
            // RootView swaps to the sign-in screen; nothing left to reset here.
            isSigningOut = false
        }
    }
}
