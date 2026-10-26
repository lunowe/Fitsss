import FitsssCore
import FitsssUI
import SwiftUI

// Routes (`-FitsssRoute`). The You tab (AccountFeature) pushes this screen;
// the app hands it in, since AccountFeature does not depend on this module.
//
//     you/taste              the Taste screen, overall
//     you/taste/<styleId>    the Taste screen on that style's scope

/// What Fitsss has learned about the person's taste, the web's `/you/taste`
/// (`TasteScreen.tsx`): per scope (overall, or one style) a short list of
/// likes and things to avoid, the pieces they reach for and skip, and
/// "Refresh now", which has the model read the latest choices again.
/// Every line can be deleted, and the person can write their own.
public struct TasteScreen: View {
    @Environment(TasteStore.self) private var taste
    @Environment(StylesStore.self) private var styles
    @Environment(ClosetStore.self) private var closet
    @Environment(ToastCenter.self) private var toasts

    /// nil is the overall scope.
    @State private var scope: String?
    /// The "Add a line" row that is open, if any, and what is typed in it.
    @State private var composing: TasteLineKind?
    @State private var draft = ""
    @State private var addError: String?
    @State private var isAdding = false
    @FocusState private var focused: TasteLineKind?
    /// Lines on their way out (`scopeKey/lineId`): hidden at once, back if
    /// the server refuses.
    @State private var removing: Set<String> = []
    /// The last refresh failure per scope (`TasteStore.scopeKey`), shown
    /// above the button until the next try.
    @State private var refreshErrors: [String: String] = [:]
    /// Bumped after every stored write, for the success haptic.
    @State private var successTick = 0

    public init() {
        _scope = State(initialValue: Self.consumeLaunchScope())
    }

    public var body: some View {
        content
            .background(Color.fitsssBackground)
            .navigationTitle("Taste")
            .navigationSubtitle(subtitle)
            // The overview is loaded at sign-in; choices made since then
            // (saves, wears, nopes) change the counts, so read it again.
            .task { await taste.load() }
            .onChange(of: scope) { closeComposer() }
            .onChange(of: StyleList(ids: styles.styles.map(\.id), loaded: styles.phase == .loaded), initial: true) { _, list in
                // The style was deleted (on the Styles tab, or elsewhere and
                // seen on a reload): back to Overall. Only once the list is
                // loaded, so a launch route's scope isn't dropped before it,
                // but then even when it was the last style.
                if let scope, list.loaded, !list.ids.contains(scope) { self.scope = nil }
            }
            .onChange(of: focused) { old, new in
                // Leaving an empty field closes it, like Escape on the web;
                // switching to the other list's field does not.
                if new == nil, let old, old == composing, !isAdding, draft.trimmed.isEmpty { closeComposer() }
            }
            .sensoryFeedback(.success, trigger: successTick)
    }

    /// "Learned from 12 choices": every choice recorded, all scopes.
    private var subtitle: String {
        guard let overview = taste.overview else { return "" }
        let count = overview.totalEvents
        return "Learned from \(count.formatted()) \(count == 1 ? "choice" : "choices")"
    }

    @ViewBuilder
    private var content: some View {
        if let overview = taste.overview {
            list(overview)
        } else if case .failed(let error) = taste.phase {
            ContentUnavailableView {
                Label("Can’t load your taste notes", systemImage: "wifi.exclamationmark")
            } description: {
                Text(error.displayMessage)
            } actions: {
                Button("Try Again") { Task { await reload() } }
                    .buttonStyle(.fitsssSecondary)
                    .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
                    .accessibilityIdentifier("taste.retry")
            }
        } else {
            TasteSkeleton()
        }
    }

    // MARK: - The list

    private func list(_ overview: TasteOverview) -> some View {
        let profile = taste.profile(scope) ?? TasteProfile(styleId: scope)
        let key = TasteStore.scopeKey(scope)
        let likes = profile.lines.filter { !removing.contains("\(key)/\($0.id)") }
        let avoid = profile.avoid.filter { !removing.contains("\(key)/\($0.id)") }
        let byId = Dictionary(closet.blocks.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        // Only pieces still in the closet: an archived or deleted one has no tile.
        let favorites = profile.favorites.compactMap { byId[$0.blockId] }
        let skipped = profile.skipped.compactMap { byId[$0.blockId] }

        return List {
            if overview.learnedLineCount == 0 {
                Section {
                } footer: {
                    Text("Fitsss keeps a short list of what you tend to like and skip, per style. It shapes every outfit. You can delete anything or add your own.")
                        .accessibilityIdentifier("taste.intro")
                }
            }

            lineSection("Likes", kind: .like, lines: likes)
            lineSection("Avoid", kind: .avoid, lines: avoid)

            if !favorites.isEmpty || !skipped.isEmpty {
                Section("Pieces") {
                    if !favorites.isEmpty {
                        PieceStrip(title: "You reach for", blocks: favorites)
                            .accessibilityIdentifier("taste.favorites")
                    }
                    if !skipped.isEmpty {
                        PieceStrip(title: "You tend to skip", blocks: skipped)
                            .accessibilityIdentifier("taste.skipped")
                    }
                }
            }

            if let message = refreshErrors[key] {
                Section {
                    Text(message)
                        .font(.subheadline)
                        .foregroundStyle(Color.fitsssLabel2)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("taste.refreshError")
                }
            }

            Section {
                RefreshControl(
                    profile: profile,
                    isRefreshing: taste.refreshing.contains(key),
                    onRefresh: refresh
                )
                .listRowInsets(EdgeInsets())
                .listRowBackground(Color.clear)
            }
        }
        .listStyle(.insetGrouped)
        // Pinned under the title, full width: the scope stays in view while
        // its lists scroll, and the chips scroll out to the screen edge.
        .safeAreaBar(edge: .top) {
            ScopeChips(styles: styles.styles, selection: $scope)
                .padding(.vertical, 8)
        }
        .refreshable { await reload() }
        .animation(.easeOut(duration: 0.2), value: removing)
        .animation(.easeOut(duration: 0.2), value: composing)
    }

    private func lineSection(_ title: String, kind: TasteLineKind, lines: [TasteLine]) -> some View {
        Section {
            ForEach(lines) { line in
                TasteLineRow(line: line) { remove(line) }
            }
            AddLineRow(
                kind: kind,
                isOpen: composing == kind,
                text: $draft,
                isAdding: isAdding && composing == kind,
                error: composing == kind ? addError : nil,
                focus: $focused,
                onOpen: { openComposer(kind) },
                onSubmit: { add(kind) }
            )
        } header: {
            Text(title)
        } footer: {
            if lines.isEmpty {
                Text("Nothing learned yet. Save, wear, or nope a few outfits and refresh.")
                    .accessibilityIdentifier("taste.\(kind.rawValue).empty")
            }
        }
    }

    // MARK: - Actions

    /// The field focuses itself when it appears.
    private func openComposer(_ kind: TasteLineKind) {
        if composing != kind { draft = "" }
        addError = nil
        composing = kind
    }

    private func closeComposer() {
        composing = nil
        draft = ""
        addError = nil
        focused = nil
    }

    private func add(_ kind: TasteLineKind) {
        let text = draft.trimmed
        guard !text.isEmpty, !isAdding else { return }
        let scope = self.scope
        isAdding = true
        addError = nil
        Task {
            defer { isAdding = false }
            do {
                try await taste.addLine(text, kind: kind.rawValue, styleId: scope)
                successTick += 1
                if composing == kind, self.scope == scope { closeComposer() }
            } catch let error as APIError {
                switch error {
                case .superseded, .unauthorized:
                    // Signed out or switched: this screen is going away.
                    break
                case .invalid:
                    // Too short or long, already there, style gone: say so by the field.
                    addError = error.displayMessage
                    // Deleted elsewhere: the reloaded list drops the chip, and
                    // the scope check above goes back to Overall.
                    if scope != nil, error.displayMessage.contains("style is gone") { await styles.load() }
                default:
                    toasts.show(error.displayMessage, isError: true)
                }
            } catch {
                toasts.show("Could not add that line", isError: true)
            }
        }
    }

    private func remove(_ line: TasteLine) {
        let scope = self.scope
        let token = "\(TasteStore.scopeKey(scope))/\(line.id)"
        guard !removing.contains(token) else { return }
        removing.insert(token)
        Task {
            defer { removing.remove(token) }
            do {
                try await taste.removeLine(line.id, styleId: scope)
                successTick += 1
            } catch where !error.isSuperseded && (error as? APIError) != .unauthorized {
                toasts.show("Could not delete that line", isError: true)
            } catch {}
        }
    }

    private func refresh() {
        let scope = self.scope
        let key = TasteStore.scopeKey(scope)
        guard !taste.refreshing.contains(key) else { return }
        refreshErrors[key] = nil
        Task {
            do {
                try await taste.refresh(scope)
                successTick += 1
                // A refresh answers with its scope; the overview's count of
                // every choice (the subtitle) may have moved on too.
                await taste.load()
            } catch let error as APIError {
                switch error {
                case .superseded, .unauthorized:
                    break
                case .notFound:
                    toasts.show("That style is gone", isError: true)
                    if self.scope == scope { self.scope = nil }
                    await reload()
                case .network:
                    toasts.show(error.displayMessage, isError: true)
                default:
                    // 409 not enough choices yet (says how many more), 502 the
                    // model failed, 503 not set up: the server's sentence.
                    refreshErrors[key] = error.displayMessage
                }
            } catch is CancellationError {
            } catch {
                toasts.show("Could not refresh", isError: true)
            }
        }
    }

    private func reload() async {
        async let overview: Void = taste.load()
        async let styleList: Void = styles.load()
        _ = await (overview, styleList)
        if case .failed(let error) = taste.phase, taste.overview != nil {
            toasts.show(error.displayMessage, isError: true)
        }
    }

    // MARK: - Launch route

    /// `you/taste/<styleId>` opens on that style, once: pushing the screen
    /// again later starts on Overall.
    private static var launchScopeConsumed = false

    private static func consumeLaunchScope() -> String? {
        guard !launchScopeConsumed else { return nil }
        launchScopeConsumed = true
        let route = LaunchOptions.route
        guard route.count > 2, route[0] == "you", route[1] == "taste" else { return nil }
        return route[2]
    }
}

/// Which list a line goes in; the raw value is the API's `kind`.
enum TasteLineKind: String, Hashable {
    case like, avoid
}

// MARK: - Shared bits

extension String {
    var trimmed: String { trimmingCharacters(in: .whitespacesAndNewlines) }
}

extension Error {
    /// The answer arrived after a sign-out, sign-in or server switch.
    var isSuperseded: Bool { (self as? APIError) == .superseded }
}

extension APIError {
    /// The validator's messages for invalid input, a plain sentence otherwise.
    var displayMessage: String { errorDescription ?? "Something went wrong." }
}

/// What the scope check watches: the styles there are, and whether that is
/// the loaded list or just nothing yet.
private struct StyleList: Equatable {
    var ids: [String]
    var loaded: Bool
}
