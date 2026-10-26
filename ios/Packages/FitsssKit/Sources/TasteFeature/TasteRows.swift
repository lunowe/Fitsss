import FitsssCore
import FitsssUI
import SwiftUI

// MARK: - Scope

/// Overall, then each style in the user's order: which scope the screen shows.
struct ScopeChips: View {
    let styles: [Style]
    @Binding var selection: String?

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                Chip("Overall", isSelected: selection == nil) { selection = nil }
                    .accessibilityIdentifier("taste.scope.overall")
                ForEach(styles) { style in
                    Chip(style.name, isSelected: selection == style.id) { selection = style.id }
                        .accessibilityIdentifier("taste.scope.\(style.id)")
                }
            }
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
        // At rest the first chip lines up with the cards' edge.
        .contentMargins(.horizontal, Metrics.pagePadding, for: .scrollContent)
    }
}

// MARK: - Lines

/// One taste line: the text, where it came from, and a way to delete it
/// (the visible button, a swipe, or the row's accessibility action).
struct TasteLineRow: View {
    let line: TasteLine
    let onDelete: () -> Void

    var body: some View {
        HStack(spacing: 4) {
            VStack(alignment: .leading, spacing: 2) {
                Text(line.text)
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                Text(source)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
            }
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 2)
            .accessibilityElement(children: .combine)
            // Here, not on the row: on the row it would replace the button's.
            .accessibilityIdentifier("taste.line.\(line.id)")

            Button(action: onDelete) {
                Image(systemName: "xmark")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.fitsssLabel3)
                    .frame(width: Metrics.minTapTarget, height: Metrics.minTapTarget)
                    .contentShape(Rectangle())
            }
            // Borderless, so only the button deletes, not a tap anywhere on the row.
            .buttonStyle(.borderless)
            .padding(.trailing, -10)
            .accessibilityLabel("Delete “\(line.text)”")
            .accessibilityIdentifier("taste.line.\(line.id).delete")
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button("Delete", systemImage: "trash", role: .destructive, action: onDelete)
        }
    }

    /// "You said this" or "Seen 4×".
    private var source: String {
        if line.isUserStated { return "You said this" }
        let seen = Int((line.evidence ?? 0).rounded())
        return "Seen \(seen.formatted())×"
    }
}

/// "Add a line", which opens into a text field with an Add button. The
/// field keeps to the server's 120 characters; Add waits for some text.
struct AddLineRow: View {
    let kind: TasteLineKind
    let isOpen: Bool
    @Binding var text: String
    let isAdding: Bool
    let error: String?
    var focus: FocusState<TasteLineKind?>.Binding
    let onOpen: () -> Void
    let onSubmit: () -> Void

    var body: some View {
        if isOpen {
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 8) {
                    TextField("Something you know about yourself", text: $text)
                        .font(.body)
                        .focused(focus, equals: kind)
                        .submitLabel(.done)
                        .onSubmit(onSubmit)
                        .textLimit($text, TasteStore.lineLengths.upperBound)
                        .disabled(isAdding)
                        .accessibilityLabel(kind == .like ? "A new like" : "Something to avoid")
                        .accessibilityIdentifier("taste.\(kind.rawValue).field")
                        .onAppear { focus.wrappedValue = kind }

                    if isAdding {
                        ProgressView()
                            .frame(minWidth: Metrics.minTapTarget, minHeight: Metrics.minTapTarget)
                            .accessibilityLabel("Adding")
                    } else {
                        Button("Add", action: onSubmit)
                            .font(.body.weight(.semibold))
                            .buttonStyle(.borderless)
                            .disabled(text.trimmed.isEmpty)
                            .frame(minWidth: Metrics.minTapTarget, minHeight: Metrics.minTapTarget)
                            .accessibilityIdentifier("taste.\(kind.rawValue).submit")
                    }
                }
                if let error {
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssDestructive)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.bottom, 6)
                        .accessibilityIdentifier("taste.\(kind.rawValue).error")
                }
            }
            .sensoryFeedback(.error, trigger: error) { _, new in new != nil }
        } else {
            Button(action: onOpen) {
                Label("Add a line", systemImage: "plus")
                    .foregroundStyle(Color.fitsssTint)
                    .frame(maxWidth: .infinity, minHeight: Metrics.minTapTarget - 8, alignment: .leading)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel(kind == .like ? "Add a like" : "Add something to avoid")
            .accessibilityIdentifier("taste.\(kind.rawValue).add")
        }
    }
}

// MARK: - Pieces

/// "You reach for" / "You tend to skip": a caption and a scrolling row of
/// the pieces, each its drawing over the type's name.
struct PieceStrip: View {
    let title: String
    let blocks: [Block]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.footnote)
                .foregroundStyle(Color.fitsssLabel2)
                .padding(.horizontal, Metrics.pagePadding)
                .accessibilityAddTraits(.isHeader)
            ScrollView(.horizontal) {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(blocks) { block in
                        PieceTile(block: block)
                    }
                }
            }
            .scrollIndicators(.hidden)
            .contentMargins(.horizontal, Metrics.pagePadding, for: .scrollContent)
        }
        .padding(.vertical, 12)
        .listRowInsets(EdgeInsets())
        .accessibilityElement(children: .contain)
    }
}

/// A 72pt tile (it grows with Dynamic Type, up to a point): the piece's
/// drawing on `card-2`, and the type's catalog label under it.
struct PieceTile: View {
    let block: Block

    @Environment(CatalogStore.self) private var catalog
    @ScaledMetric(relativeTo: .caption) private var scaledSide: CGFloat = 72
    private var side: CGFloat { min(scaledSide, 112) }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Silhouette(block: block)
                .frame(width: side * 0.62, height: side * 0.62)
                .frame(width: side, height: side)
                .background(Color.fitsssCard2, in: RoundedRectangle(cornerRadius: Metrics.thumbRadius, style: .continuous))
            Text(catalog.catalog?.typeLabel(of: block) ?? block.label)
                .font(.caption)
                .foregroundStyle(Color.fitsssLabel2)
                .lineLimit(1)
        }
        .frame(width: side, alignment: .leading)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(block.label)
    }
}

// MARK: - Refresh

/// "Refresh now" and what the last refresh considered:
/// "Refreshed 2 hr. ago · 3 of 5 choices considered".
struct RefreshControl: View {
    let profile: TasteProfile
    let isRefreshing: Bool
    let onRefresh: () -> Void

    var body: some View {
        VStack(spacing: 8) {
            Button(action: onRefresh) {
                HStack(spacing: 8) {
                    if isRefreshing {
                        ProgressView().tint(Color.fitsssTint)
                    }
                    Text(isRefreshing ? "Reading your choices…" : "Refresh now")
                }
            }
            .buttonStyle(.fitsssSecondary)
            .disabled(isRefreshing)
            .accessibilityIdentifier("taste.refresh")

            // Re-rendered every half minute, so "just now" moves on.
            TimelineView(.periodic(from: .now, by: 30)) { context in
                Text(Self.status(profile, now: context.date))
                    .font(.footnote)
                    .foregroundStyle(Color.fitsssLabel2)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("taste.refreshed")
            }
        }
        .padding(.top, 4)
    }

    static func status(_ profile: TasteProfile, now: Date) -> String {
        let total = profile.totalEvents
        let considered = "\(profile.eventCount.formatted()) of \(total.formatted()) \(total == 1 ? "choice" : "choices") considered"
        guard let refreshed = profile.lastRefreshedAt else { return "Never refreshed · \(considered)" }
        return "Refreshed \(ago(refreshed, now: now)) · \(considered)"
    }

    /// "just now" under a minute (and for a clock running ahead), else the
    /// system's relative wording: "12 min. ago", "2 hr. ago", "3 days ago".
    private static func ago(_ date: Date, now: Date) -> String {
        guard now.timeIntervalSince(date) >= 60 else { return "just now" }
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .abbreviated
        formatter.dateTimeStyle = .named
        return formatter.localizedString(for: date, relativeTo: now)
    }
}

// MARK: - Loading

/// Placeholder rows in the screen's own shape while the overview loads.
struct TasteSkeleton: View {
    var body: some View {
        List {
            Section("Likes") {
                ForEach(0..<3, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Wide trousers with a short top").font(.body)
                        Text("Seen 4×").font(.subheadline)
                    }
                    .padding(.vertical, 2)
                }
            }
            Section("Avoid") {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Logos on the chest").font(.body)
                    Text("You said this").font(.subheadline)
                }
                .padding(.vertical, 2)
            }
        }
        .listStyle(.insetGrouped)
        .redacted(reason: .placeholder)
        .scrollDisabled(true)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Loading your taste notes")
    }
}
