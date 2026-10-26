import Observation
import SwiftUI

/// One-line confirmations at the bottom, above the tab bar: one at a time,
/// gone after 2.5 seconds. Inject one `ToastCenter` at the root with
/// `.toastHost(_:)` and call `show` from anywhere that reads it from the
/// environment.
@MainActor
@Observable
public final class ToastCenter {
    public struct Toast: Equatable, Identifiable {
        public let id = UUID()
        public var message: String
        public var isError: Bool
    }

    public private(set) var current: Toast?
    private var dismissal: Task<Void, Never>?

    public init() {}

    public func show(_ message: String, isError: Bool = false) {
        let toast = Toast(message: message, isError: isError)
        current = toast
        dismissal?.cancel()
        dismissal = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2.5))
            guard !Task.isCancelled, self?.current?.id == toast.id else { return }
            self?.current = nil
        }
    }

    public func dismiss() { current = nil }
}

public extension View {
    /// Shows `center`'s toasts over this view: once at the root, and again
    /// inside full-screen covers and sheets that should show toasts of their
    /// own. `baseInset` is the gap to the bottom when nothing is pinned there;
    /// the root passes the tab bar's height.
    func toastHost(_ center: ToastCenter, baseInset: CGFloat = 16) -> some View {
        modifier(ToastHost(center: center, baseInset: baseInset))
    }

    /// Keeps toasts above this view. Apply to anything pinned to the bottom
    /// edge (`BottomActionBar` does it already); heights of several such views
    /// add up, so a floating button above a bar reports only itself.
    func reservesToastClearance() -> some View {
        background {
            GeometryReader { proxy in
                Color.clear.preference(key: ToastClearanceKey.self, value: proxy.size.height)
            }
        }
    }
}

/// Total height of the controls pinned to the bottom of the screen.
struct ToastClearanceKey: PreferenceKey {
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value += nextValue()
    }
}

private struct ToastHost: ViewModifier {
    let center: ToastCenter
    let baseInset: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var clearance: CGFloat = 0

    func body(content: Content) -> some View {
        content
            .environment(center)
            .overlay(alignment: .bottom) {
                if let toast = center.current {
                    HStack(spacing: 8) {
                        if toast.isError {
                            Image(systemName: "exclamationmark.circle.fill").foregroundStyle(Color.fitsssDestructive)
                        }
                        Text(toast.message).font(.subheadline.weight(.medium)).lineLimit(1)
                    }
                    .padding(.horizontal, 16)
                    .frame(minHeight: 44)
                    .glassEffect(.regular, in: Capsule())
                    .padding(.bottom, baseInset + (clearance > 0 ? clearance + 8 : 0))
                    .padding(.horizontal, Metrics.pagePadding)
                    .onTapGesture { center.dismiss() }
                    .transition(reduceMotion ? .opacity : .move(edge: .bottom).combined(with: .opacity))
                    .id(toast.id)
                    .accessibilityAddTraits(.updatesFrequently)
                }
            }
            .onPreferenceChange(ToastClearanceKey.self) { height in
                clearance = height
            }
            .animation(.easeOut(duration: 0.2), value: center.current)
    }
}
