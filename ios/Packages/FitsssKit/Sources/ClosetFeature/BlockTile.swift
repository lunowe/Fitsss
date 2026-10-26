import FitsssCore
import FitsssUI
import SwiftUI

/// The card-2 well a piece's drawing sits in. Shared by the grid tile and the
/// detail hero so both read as the same object (the web's `BlockThumb`).
struct BlockThumb: View {
    let block: Block
    /// Width over height of the well.
    var aspectRatio: CGFloat = 1
    /// The drawing's size as a share of the well's height.
    var drawingScale: CGFloat = 0.46

    var body: some View {
        RoundedRectangle(cornerRadius: Metrics.thumbRadius)
            .fill(Color.fitsssCard2)
            .aspectRatio(aspectRatio, contentMode: .fit)
            .overlay {
                GeometryReader { geometry in
                    let side = geometry.size.height * drawingScale
                    Silhouette(block: block)
                        .frame(width: side, height: side)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
    }
}

/// One piece in the closet grid: drawing, headline, swatch dot and color line,
/// a quantity badge above one, and the nickname when there is one.
struct BlockTile: View {
    let block: Block
    let catalog: Catalog
    /// Wider than square when the grid is a single column (accessibility sizes).
    var thumbAspectRatio: CGFloat = 1

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            BlockThumb(block: block, aspectRatio: thumbAspectRatio, drawingScale: thumbAspectRatio > 1 ? 0.6 : 0.46)
                .overlay(alignment: .topTrailing) {
                    if block.quantity > 1 {
                        Text("×\(block.quantity)")
                            .font(.caption.weight(.medium))
                            .monospacedDigit()
                            .foregroundStyle(Color.fitsssLabel2)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.fitsssFill, in: Capsule())
                            .padding(6)
                            .accessibilityLabel("\(block.quantity) pieces")
                    }
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(catalog.headline(of: block))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.fitsssLabel)
                HStack(spacing: 6) {
                    SwatchDot(hex: block.color.hex, secondaryHex: block.secondaryColor?.hex, size: 10)
                    Text(catalog.colorLine(of: block))
                }
                .font(.footnote)
                .foregroundStyle(Color.fitsssLabel2)
                if let nickname = block.nickname, !nickname.isEmpty {
                    Text(nickname)
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel3)
                }
            }
            .lineLimit(1)
            .padding(.horizontal, 4)
            .padding(.top, 8)
            .padding(.bottom, 2)
        }
        .padding(8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(.contextMenuPreview, RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .contentShape(Rectangle())
    }
}

/// The small drawing well leading an archived row.
struct BlockRowThumb: View {
    let block: Block

    var body: some View {
        RoundedRectangle(cornerRadius: 8)
            .fill(Color.fitsssCard2)
            .frame(width: 36, height: 36)
            .overlay { Silhouette(block: block).frame(width: 26, height: 26) }
    }
}

// MARK: - Remove from closet

/// Asks before moving a piece to Archived (as the web does), then archives it
/// and confirms with a toast. Attach it to the control or tile that asks, so
/// the dialog's popover points at it; it shows while `target` is this piece.
struct RemoveFromClosetConfirmation: ViewModifier {
    let block: Block
    @Binding var target: Block?
    /// Runs after a successful archive, e.g. to pop the detail page.
    var onRemoved: () -> Void = {}

    @Environment(ClosetStore.self) private var closet
    @Environment(ToastCenter.self) private var toasts

    func body(content: Content) -> some View {
        content.confirmationDialog(
            Text("Remove \(block.label)?"),
            isPresented: Binding(
                get: { target?.id == block.id },
                set: { if !$0, target?.id == block.id { target = nil } }
            ),
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                Task { await remove() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("It moves to Archived, where you can restore or delete it for good.")
        }
    }

    private func remove() async {
        do {
            try await closet.archive(block.id)
            onRemoved()
            toasts.show("Moved to Archived")
        } catch where !error.isSuperseded {
            toasts.show("Could not remove this piece", isError: true)
        } catch {}
    }
}

extension View {
    func removeFromClosetConfirmation(
        for block: Block,
        target: Binding<Block?>,
        onRemoved: @escaping () -> Void = {}
    ) -> some View {
        modifier(RemoveFromClosetConfirmation(block: block, target: target, onRemoved: onRemoved))
    }
}
