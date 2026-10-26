import FitsssUI
import SwiftUI

/// The floating cart pill, bottom right on every step of the flow while the
/// cart has something in it. The count ticks to its new value and the pill
/// pops on every change, like the web's `CartPill`; Reduce Motion turns both off.
struct CartPill: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let count: Int
    let action: () -> Void

    var body: some View {
        let bounces = !reduceMotion
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: "bag")
                    .font(.body.weight(.semibold))
                HStack(spacing: 0) {
                    Text("Cart · ")
                    CountUpText(value: count)
                }
                .font(.subheadline.weight(.medium))
            }
            .foregroundStyle(Color.fitsssInkForeground)
            .padding(.horizontal, 16)
            .frame(minHeight: Metrics.minTapTarget)
            .background(Color.fitsssInk, in: Capsule())
            .contentShape(Capsule())
        }
        .buttonStyle(PillPressStyle())
        // The web remounts the pill per count and replays `zoom-in-90`.
        .keyframeAnimator(initialValue: 1.0, trigger: count) { content, scale in
            content.scaleEffect(bounces ? scale : 1)
        } keyframes: { _ in
            KeyframeTrack {
                LinearKeyframe(0.9, duration: 0.001)
                CubicKeyframe(1.0, duration: 0.2)
            }
        }
        // It floats over content: keep it compact at the largest text sizes
        // and offer the large content viewer instead (long press).
        .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
        .accessibilityShowsLargeContentViewer {
            Label("Cart · \(count)", systemImage: "bag")
        }
        .accessibilityLabel("Cart, \(plural(count, "piece"))")
        .accessibilityIdentifier("addflow.cartPill")
    }
}

/// `active:scale-[0.96]`.
private struct PillPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// A number that ticks up (or down) to its new value over 250ms with a cubic
/// ease-out, the native `useCountUp`. Reduce Motion shows the new value at once.
struct CountUpText: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let value: Int
    var duration: Duration = .milliseconds(250)

    @State private var shown: Int?
    @State private var ticker: Task<Void, Never>?

    var body: some View {
        Text(shown ?? value, format: .number)
            .monospacedDigit()
            .onChange(of: value) { old, new in tick(from: shown ?? old, to: new) }
            .onDisappear { ticker?.cancel() }
    }

    private func tick(from: Int, to: Int) {
        ticker?.cancel()
        guard !reduceMotion, from != to else {
            shown = nil
            return
        }
        shown = from
        ticker = Task {
            let clock = ContinuousClock()
            let start = clock.now
            while !Task.isCancelled {
                let t = min(1, (clock.now - start) / duration)
                let eased = 1 - pow(1 - t, 3)
                shown = Int((Double(from) + Double(to - from) * eased).rounded())
                if t >= 1 { break }
                try? await Task.sleep(for: .milliseconds(16))
            }
            if !Task.isCancelled { shown = nil }
        }
    }
}
