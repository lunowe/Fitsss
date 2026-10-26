import FitsssCore
import FitsssUI
import SwiftUI

/// While the server composes: the web's staged status line over skeleton
/// cards. The stages are honest and in order (reading the closet and the
/// weather filter are quick; composing is the long part), so the last one
/// holds for most of the 20 to 60 seconds, and a second line says so once the
/// wait gets long.
///
/// The ticker belongs to the view: leaving the screen stops it, coming back
/// picks up from the real start time. The request itself is not touched.
struct GeneratingView: View {
    let startedAt: Date

    static let stages = ["Reading your closet", "Checking the weather", "Composing looks"]
    static let stageInterval: TimeInterval = 1.5
    static let longWait: TimeInterval = 12

    @State private var elapsed: TimeInterval = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dynamicTypeSize) private var typeSize

    private var stage: Int { min(Self.stages.count - 1, Int(elapsed / Self.stageInterval)) }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("\(Self.stages[stage])…")
                        .contentTransition(.opacity)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: stage)
                }
                if elapsed >= Self.longWait {
                    Text("Good outfits take a moment. This can take up to a minute.")
                        .transition(.opacity)
                }
            }
            .font(.footnote)
            .foregroundStyle(Color.fitsssLabel2)
            .padding(.horizontal, Metrics.pagePadding)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("today.generating")

            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(0..<3, id: \.self) { _ in
                        CardSkeleton()
                            .containerRelativeFrame(.horizontal) { length, _ in
                                OutfitCarousel.cardWidth(length, accessibilitySize: typeSize.isAccessibilitySize)
                            }
                    }
                }
            }
            .scrollDisabled(true)
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, Metrics.pagePadding, for: .scrollContent)
            .accessibilityHidden(true)
        }
        .task(id: startedAt) {
            var announced = -1
            while !Task.isCancelled {
                let now = Date.now.timeIntervalSince(startedAt)
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { elapsed = now }
                if stage != announced {
                    announced = stage
                    AccessibilityNotification.Announcement("\(Self.stages[stage])").post()
                }
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }
}

/// The shape of an outfit card while it is being composed.
private struct CardSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: Metrics.thumbRadius)
                .fill(Color.fitsssFill)
                .aspectRatio(1, contentMode: .fit)
            bar(widthFraction: 0.4, height: 20).padding(.top, 4)
            bar(widthFraction: 1, height: 16)
            bar(widthFraction: 0.75, height: 16)
            RoundedRectangle(cornerRadius: Metrics.cardRadius).fill(Color.fitsssFill).frame(height: 52).padding(.top, 4)
            HStack(spacing: 8) {
                ForEach(0..<4, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: Metrics.cardRadius).fill(Color.fitsssFill).frame(height: 44)
                }
            }
        }
        .padding(12)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .opacity(dimmed ? 0.55 : 1)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dimmed = true }
        }
    }

    private func bar(widthFraction: CGFloat, height: CGFloat) -> some View {
        GeometryReader { geometry in
            RoundedRectangle(cornerRadius: 6)
                .fill(Color.fitsssFill)
                .frame(width: geometry.size.width * widthFraction)
        }
        .frame(height: height)
    }
}

/// What went wrong, and the one or two things that help.
struct GenerationFailureView: View {
    let failure: GenerationFailure
    /// Whether the closet has pieces at all (then the weather may be what left too little).
    let closetHasPieces: Bool
    let onRetry: () -> Void
    let onAddPieces: () -> Void
    let onSetWeather: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Label(title, systemImage: symbol)
                    .font(.headline)
                    .foregroundStyle(Color.fitsssLabel)
                Text(detail)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, 12)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("today.failure")

            switch failure.kind {
            case .closet:
                action("Add pieces", identifier: "today.failure.addPieces", perform: onAddPieces)
                if closetHasPieces {
                    action("Set the weather by hand", identifier: "today.failure.weather", perform: onSetWeather)
                }
            case .retry, .offline:
                action("Try again", identifier: "today.failure.retry", perform: onRetry)
            case .notConfigured:
                EmptyView()
            }
        }
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .padding(.horizontal, Metrics.pagePadding)
    }

    private var title: String {
        switch failure.kind {
        case .closet: "Can’t put an outfit together"
        case .retry: "The stylist got stuck"
        case .notConfigured: "Outfit generation is off"
        case .offline: "You’re offline"
        }
    }

    private var symbol: String {
        switch failure.kind {
        case .closet: "tshirt"
        case .retry: "exclamationmark.circle"
        case .notConfigured: "power"
        case .offline: "wifi.slash"
        }
    }

    private var detail: String {
        switch failure.kind {
        case .notConfigured:
            "This server has no outfit model set up yet, so Today can’t put outfits together. \(failure.message)"
        default:
            failure.message
        }
    }

    private func action(_ title: String, identifier: String, perform: @escaping () -> Void) -> some View {
        VStack(spacing: 0) {
            Divider().padding(.leading, Metrics.pagePadding)
            Button(action: perform) {
                HStack {
                    Text(title).foregroundStyle(Color.fitsssTint)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.fitsssLabel3)
                }
                .font(.body)
                .padding(.horizontal, Metrics.pagePadding)
                .frame(minHeight: Metrics.minTapTarget)
                .contentShape(Rectangle())
            }
            .buttonStyle(RowPressStyle())
            .accessibilityIdentifier(identifier)
        }
    }
}
