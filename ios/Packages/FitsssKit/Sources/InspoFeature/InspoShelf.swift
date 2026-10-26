import FitsssCore
import FitsssUI
import SwiftUI

/// The Inspo shelf (the web's `InspoGrid`, shown under Looks' Inspo
/// segment): two columns of pictures on cards, each captioned with what the
/// read saw, and "For <style>" when it is filed under one. Pull to refresh;
/// long-press to remove. The host owns the navigation: `onOpen` gets a
/// picture's id, `onAdd` opens "Add a picture".
public struct InspoShelf: View {
    private let onOpen: (String) -> Void
    private let onAdd: () -> Void

    @Environment(InspoStore.self) private var inspos
    @Environment(StylesStore.self) private var styles
    @Environment(ToastCenter.self) private var toasts

    public init(onOpen: @escaping (String) -> Void, onAdd: @escaping () -> Void) {
        self.onOpen = onOpen
        self.onAdd = onAdd
    }

    public var body: some View {
        Group {
            if isReady {
                if inspos.inspos.isEmpty {
                    InspoEmptyState(onAdd: onAdd)
                        .refreshable { await reload() }
                } else {
                    InspoGrid(onOpen: onOpen, onRefresh: reload)
                }
            } else if case .failed(let error) = inspos.phase {
                ContentUnavailableView {
                    Label("Can’t load your pictures", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(error.displayMessage)
                } actions: {
                    Button("Try Again") { Task { await reload() } }
                        .buttonStyle(.fitsssSecondary)
                        // The actions slot proposes a compact width.
                        .containerRelativeFrame(.horizontal) { width, _ in min(width - 64, 240) }
                        .accessibilityIdentifier("inspo.retry")
                }
            } else {
                InspoSkeleton()
            }
        }
        .background(Color.fitsssBackground)
    }

    private var isReady: Bool { inspos.phase == .loaded || !inspos.inspos.isEmpty }

    private func reload() async {
        async let pictures: Void = inspos.load()
        async let styleList: Void = styles.load()
        _ = await (pictures, styleList)
        // A failed refresh over a shelf already shown: keep it, say so.
        if case .failed(let error) = inspos.phase, !inspos.inspos.isEmpty {
            toasts.show(error.displayMessage, isError: true)
        }
    }
}

// MARK: - Grid

private struct InspoGrid: View {
    let onOpen: (String) -> Void
    let onRefresh: () async -> Void

    @Environment(InspoStore.self) private var inspos
    @Environment(StylesStore.self) private var styles
    @Environment(\.dynamicTypeSize) private var typeSize

    @State private var removing: Inspo?

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(inspos.inspos) { inspo in
                    let caption = inspoCaption(inspo, isReading: inspos.analyzing.contains(inspo.id))
                    let styleName = inspo.styleId.flatMap { styles.style($0)?.name }
                    Button { onOpen(inspo.id) } label: {
                        InspoTile(
                            inspo: inspo,
                            caption: caption,
                            styleName: styleName,
                            isSingleColumn: typeSize.isAccessibilitySize
                        )
                    }
                    .buttonStyle(PressableStyle())
                    .accessibilityIdentifier("inspo.tile.\(inspo.id)")
                    .contextMenu {
                        if let url = originalURL(inspo) {
                            Link(destination: url) {
                                Label("Open original", systemImage: "safari")
                            }
                        }
                        Button("Remove picture", systemImage: "trash", role: .destructive) { removing = inspo }
                    }
                    .removeInspoConfirmation(for: inspo, target: $removing)
                }
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.top, 8)
            .padding(.bottom, Metrics.pagePadding)
            .accessibilityIdentifier("inspo.shelf")
        }
        .refreshable { await onRefresh() }
    }

    private var columns: [GridItem] {
        let count = typeSize.isAccessibilitySize ? 1 : 2
        return Array(repeating: GridItem(.flexible(), spacing: 12, alignment: .top), count: count)
    }
}

/// One picture: a 4:5 crop on a card, then its caption and the style it is
/// filed under.
private struct InspoTile: View {
    let inspo: Inspo
    let caption: String
    let styleName: String?
    /// One tile per row at accessibility text sizes: text wraps instead of
    /// truncating.
    let isSingleColumn: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            InspoPicture(inspo: inspo, maxPixels: isSingleColumn ? 900 : 600, contentMode: .fill)
                .aspectRatio(4.0 / 5.0, contentMode: .fit)
                .clipShape(RoundedRectangle(cornerRadius: Metrics.thumbRadius))
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(caption)
                    .font(.footnote)
                    .foregroundStyle(Color.fitsssLabel2)
                    .lineLimit(isSingleColumn ? nil : 2)
                if let styleName {
                    Text("For \(styleName)")
                        .font(.caption)
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(isSingleColumn ? nil : 1)
                }
            }
            .multilineTextAlignment(.leading)
            .padding(.horizontal, 4)
            .padding(.top, 8)
            .padding(.bottom, 2)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(8)
        // Tiles in a row share its height, whichever caption wraps.
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityAddTraits(.isImage)
    }

    private var accessibilityText: String {
        var parts = [inspo.analysis == nil ? "Picture" : inspo.name, caption]
        if let styleName { parts.append("For \(styleName)") }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Empty and loading

private struct InspoEmptyState: View {
    let onAdd: () -> Void

    var body: some View {
        ScrollView {
            ContentUnavailableView {
                Label("Bring a look you like", systemImage: "photo.on.rectangle.angled")
                    // Here, not on the whole view: there it would replace the button's.
                    .accessibilityIdentifier("inspo.empty")
            } description: {
                Text("Paste a Pinterest link or add a photo. Fitsss finds the closest pieces you own and styles the rest.")
            } actions: {
                Button(action: onAdd) {
                    Label("Add a picture", systemImage: "plus")
                }
                .buttonStyle(.fitsssPrimary)
                .accessibilityIdentifier("inspo.empty.add")
                // The actions slot proposes a compact width; give the primary
                // button most of the page, like the web's full-width button.
                .containerRelativeFrame(.horizontal) { width, _ in width - 2 * Metrics.pagePadding - 32 }
            }
            .containerRelativeFrame(.vertical, alignment: .center) { height, _ in height * 0.8 }
        }
    }
}

/// The grid drained of color, pulsing as one, like the looks skeleton.
private struct InspoSkeleton: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var dimmed = false

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                ForEach(0..<4, id: \.self) { _ in card }
            }
            .padding(.horizontal, Metrics.pagePadding)
            .padding(.top, 8)
            // On the content, not the scroll view: that hosts the large title.
            .opacity(dimmed ? 0.45 : 1)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: dimmed)
            .onAppear { dimmed = true }
        }
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your pictures")
    }

    private var card: some View {
        VStack(alignment: .leading, spacing: 0) {
            RoundedRectangle(cornerRadius: Metrics.thumbRadius)
                .fill(Color.fitsssCard2)
                .aspectRatio(4.0 / 5.0, contentMode: .fit)
            VStack(alignment: .leading, spacing: 6) {
                RoundedRectangle(cornerRadius: 3).fill(Color.fitsssFill).frame(height: 11)
                RoundedRectangle(cornerRadius: 3).fill(Color.fitsssFill).frame(height: 11).padding(.trailing, 50)
            }
            .padding(.horizontal, 4)
            .padding(.top, 10)
            .padding(.bottom, 4)
        }
        .padding(8)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
    }
}

// MARK: - Remove

/// Asks before removing a picture (as the web does), removes it, and
/// confirms with a toast. Attach it to the control that asks, so the dialog
/// points at it; it shows while `target` is this picture.
private struct RemoveInspoConfirmation: ViewModifier {
    let inspo: Inspo
    @Binding var target: Inspo?
    /// Runs after a successful remove, e.g. to pop the detail page.
    var onRemoved: () -> Void

    @Environment(InspoStore.self) private var inspos
    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.confirmationDialog(
            Text("Remove this picture?"),
            isPresented: Binding(
                get: { target?.id == inspo.id },
                set: { if !$0, target?.id == inspo.id { target = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove picture", role: .destructive) {
                Task { await remove() }
            }
            .accessibilityIdentifier("inspo.remove.confirm")
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The picture and its analysis are deleted. Looks you saved from it stay.")
        }
    }

    private func remove() async {
        do {
            try await inspos.remove(inspo.id)
            onRemoved()
            toasts.show("Picture removed")
        } catch where !error.isQuiet {
            toasts.show("Could not remove this picture", isError: true)
        } catch {}
    }
}

extension View {
    func removeInspoConfirmation(
        for inspo: Inspo,
        target: Binding<Inspo?>,
        onRemoved: @escaping () -> Void = {}
    ) -> some View {
        modifier(RemoveInspoConfirmation(inspo: inspo, target: target, onRemoved: onRemoved))
    }
}
