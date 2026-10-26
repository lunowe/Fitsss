import FitsssCore
import FitsssUI
import SwiftUI

/// Today's three dials, in the order you think about them: which version of
/// yourself, what you are doing, and anything special about today. Port of
/// `SteeringBlock.tsx`.
struct SteeringSection: View {
    let styles: [Style]
    let occasions: [Occasion]
    let prefs: TodayPrefs
    @Binding var steer: String
    let onChoose: (TodayPrefs) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("Style")
                if styles.isEmpty {
                    Text("No styles yet. Add some on the Styles tab to steer the stylist towards what you actually wear.")
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .padding(.horizontal, Metrics.pagePadding)
                } else {
                    ChipRow {
                        Chip("Any", isSelected: prefs.styleId == nil) {
                            onChoose(TodayPrefs(styleId: nil, occasion: prefs.occasion))
                        }
                        .accessibilityIdentifier("today.style.any")
                        ForEach(styles) { style in
                            Chip(style.name, isSelected: prefs.styleId == style.id) {
                                onChoose(TodayPrefs(styleId: style.id, occasion: prefs.occasion))
                            }
                            .accessibilityIdentifier("today.style.\(style.id)")
                        }
                    }
                }
            }

            VStack(alignment: .leading, spacing: 8) {
                SectionHeader("Occasion")
                ChipRow {
                    ForEach(occasions) { occasion in
                        Chip(occasion.label, isSelected: prefs.occasion == occasion.id) {
                            onChoose(TodayPrefs(styleId: prefs.styleId, occasion: occasion.id))
                        }
                        .accessibilityIdentifier("today.occasion.\(occasion.id)")
                        .accessibilityHint(occasion.hint)
                    }
                }
            }

            TextField(
                "Anything for today",
                text: $steer,
                prompt: Text("Anything for today? e.g. more relaxed, wear the new boots"),
                axis: .vertical
            )
            .lineLimit(1...4)
            .submitLabel(.done)
            .font(.body)
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .frame(minHeight: Metrics.primaryButtonHeight)
            .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .padding(.horizontal, Metrics.pagePadding)
            .accessibilityIdentifier("today.steer")
            .onChange(of: steer) { _, text in
                // Return means done, not a new line.
                if text.contains("\n") { steer = text.replacingOccurrences(of: "\n", with: " ").trimmingCharacters(in: .whitespaces); hideKeyboard() }
            }
        }
    }

    private func hideKeyboard() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
}

/// A horizontally scrolling row of chips, inset to the page gutter.
struct ChipRow<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) { content }
        }
        .scrollIndicators(.hidden)
        .contentMargins(.horizontal, Metrics.pagePadding, for: .scrollContent)
    }
}

/// Shown when Today was opened from a piece ("Style this piece"): every
/// outfit is built around it until the user removes the pin.
struct PinnedRow: View {
    let block: Block
    let catalog: Catalog?
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Silhouette(block: block)
                .frame(width: 26, height: 26)
                .frame(width: 36, height: 36)
                .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: 8))
            Text("Styling around: \(shortLabel)")
                .font(.body)
                .foregroundStyle(Color.fitsssLabel)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            Button("Remove", action: onRemove)
                .font(.body)
                .foregroundStyle(Color.fitsssTint)
                .frame(minHeight: Metrics.minTapTarget)
                .accessibilityIdentifier("today.pinned.remove")
        }
        .padding(.horizontal, Metrics.pagePadding)
        .padding(.vertical, 6)
        .frame(minHeight: Metrics.minTapTarget)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .padding(.horizontal, Metrics.pagePadding)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("today.pinned")
    }

    /// "light blue shirt", short enough to sit next to Remove.
    private var shortLabel: String {
        let type = catalog?.typeLabel(of: block) ?? block.label
        return "\(block.color.name.lowercased()) \(type.lowercased())"
    }
}

/// "Restyle a picture", under the steering block as on the web: opens
/// "Add a picture", which flows into styling it from the closet.
struct RestylePictureRow: View {
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                RowIcon(systemName: "photo")
                Text("Restyle a picture")
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel3)
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.vertical, 7)
            .frame(minHeight: Metrics.minTapTarget)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowPressStyle())
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .clipShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .padding(.horizontal, Metrics.pagePadding)
        .accessibilityHint("Add an inspiration picture and style it from your closet")
        .accessibilityIdentifier("today.restylePicture")
    }
}
