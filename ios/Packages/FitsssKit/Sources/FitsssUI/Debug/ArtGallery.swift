import FitsssCore
import GarmentArt
import SwiftUI

/// Every drawing in the catalog, in a few garment colors, for checking the
/// renderer against the web's `/dev/silhouettes`. Opened with
/// `-FitsssRoute dev/art`; `-FitsssRoute dev/art/puffer,sneakers` opens it
/// filtered (matches type ids, variants and art keys), and `dev/art/checks`
/// shows only the renderer checks.
///
/// Each entry is one type, or one variant of a type that draws differently,
/// at 44pt (all colors) and 120pt (scroll sideways), labeled with its art key.
public struct ArtGallery: View {
    @Environment(CatalogStore.self) private var catalogStore
    @State private var query: String

    public init() {
        let route = LaunchOptions.route
        _query = State(initialValue: route.count > 2 ? route[2] : "")
    }

    public var body: some View {
        content
            .navigationTitle("Drawings")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Type, variant or art key")
            .background(Color.fitsssBackground)
    }

    @ViewBuilder private var content: some View {
        if let catalog = catalogStore.catalog {
            let sections = Self.sections(catalog, matching: query)
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Metrics.sectionSpacing) {
                    Text(summary(catalog, sections))
                        .font(.footnote)
                        .foregroundStyle(Color.fitsssLabel2)
                        .padding(.horizontal, Metrics.pagePadding)
                    ForEach(sections, id: \.title) { section in
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader(section.title)
                            ForEach(section.entries) { entry in
                                EntryCard(entry: entry)
                            }
                        }
                    }
                    if Self.matches(query, ["checks", "renderer"]) {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionHeader("Renderer checks")
                            ForEach(RendererCheck.all) { check in
                                CheckCard(check: check)
                            }
                        }
                    }
                }
                .padding(.vertical, Metrics.pagePadding)
            }
        } else if let error = catalogStore.error {
            ContentUnavailableView("No catalog", systemImage: "exclamationmark.triangle", description: Text(error.localizedDescription))
        } else {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func summary(_ catalog: Catalog, _ sections: [GallerySection]) -> String {
        let shown = sections.reduce(0) { $0 + $1.entries.count }
        return "\(catalog.art.count) drawings in the catalog. Showing \(shown) types and variants."
    }

    // MARK: - Entries

    struct GallerySection {
        var title: String
        var entries: [Entry]
    }

    struct Entry: Identifiable {
        var id: String { variant.map { "\(typeId)/\($0)" } ?? typeId }
        var typeId: String
        var variant: String?
        var title: String
        var artKey: String
    }

    /// One entry per type, plus one per variant whose drawing differs, in
    /// catalog order.
    static func sections(_ catalog: Catalog, matching query: String) -> [GallerySection] {
        catalog.categories.compactMap { category in
            let entries = catalog.types(inCategory: category.id).flatMap { type -> [Entry] in
                var entries = [Entry(typeId: type.id, variant: nil, title: type.label, artKey: type.art.default)]
                for variant in type.variantOptions ?? [] {
                    guard let key = type.art.variants?[variant] else { continue }
                    entries.append(Entry(
                        typeId: type.id, variant: variant,
                        title: "\(type.label) · \(catalog.variantLabel(variant))", artKey: key
                    ))
                }
                return entries
            }
            .filter { matches(query, [$0.typeId, $0.variant ?? "", $0.artKey, $0.title]) }
            return entries.isEmpty ? nil : GallerySection(title: category.label, entries: entries)
        }
    }

    /// Comma-separated terms; an entry matches when any term is a substring
    /// of any of its fields. An empty query matches everything.
    static func matches(_ query: String, _ fields: [String]) -> Bool {
        let terms = query.lowercased().split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        if terms.isEmpty { return true }
        return terms.contains { term in fields.contains { $0.lowercased().contains(term) } }
    }

    /// The garment colors every entry is drawn in.
    struct Sample: Identifiable {
        var id: String { name }
        var name: String
        var color: String
        var secondaryColor: String?
    }

    static let samples: [Sample] = [
        Sample(name: "White", color: "#ffffff"),
        Sample(name: "Black", color: "#111111"),
        Sample(name: "Navy", color: "#1f2a44"),
        Sample(name: "Mustard", color: "#d1a12f"),
        Sample(name: "Navy, mustard trim", color: "#1f2a44", secondaryColor: "#d1a12f"),
    ]

    private struct EntryCard: View {
        let entry: Entry

        var body: some View {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(entry.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.fitsssLabel)
                    Spacer(minLength: 8)
                    Text(entry.artKey)
                        .font(.caption.monospaced())
                        .foregroundStyle(Color.fitsssLabel2)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
                .padding(.horizontal, 12)
                HStack(spacing: 8) {
                    ForEach(ArtGallery.samples) { sample in
                        tile(sample, size: 44)
                    }
                }
                .padding(.horizontal, 12)
                ScrollView(.horizontal) {
                    HStack(spacing: 8) {
                        ForEach(ArtGallery.samples) { sample in
                            tile(sample, size: 120)
                        }
                    }
                    .padding(.horizontal, 12)
                }
                .scrollIndicators(.hidden)
            }
            .padding(.vertical, 12)
            .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .padding(.horizontal, Metrics.pagePadding)
        }

        private func tile(_ sample: Sample, size: CGFloat) -> some View {
            Silhouette(typeId: entry.typeId, variant: entry.variant, color: sample.color, secondaryColor: sample.secondaryColor)
                .frame(width: size, height: size)
                .accessibilityLabel("\(entry.artKey), \(sample.name), \(Int(size)) points")
        }
    }

    private struct CheckCard: View {
        let check: RendererCheck

        var body: some View {
            let drawing = ArtDrawing.cached(key: "check:\(check.id)", viewBox: check.viewBox, body: check.body)
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline) {
                    Text(check.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Color.fitsssLabel)
                    Spacer(minLength: 8)
                    Text("check:\(check.id)")
                        .font(.caption.monospaced())
                        .foregroundStyle(Color.fitsssLabel2)
                }
                ForEach([44.0, 120.0], id: \.self) { size in
                    HStack(spacing: 8) {
                        ForEach([ArtGallery.samples[0], ArtGallery.samples[4]]) { sample in
                            GarmentArtView(drawing, inks: Silhouette.inks(color: sample.color, secondaryColor: sample.secondaryColor))
                                .frame(width: size, height: size)
                        }
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
            .padding(.horizontal, Metrics.pagePadding)
        }
    }
}

/// Synthetic drawings for the SVG features the catalog art barely uses
/// (arcs, rotate and skew, group opacity, clip unions, nested `svg`, `style`).
/// The same markup renders in a browser for comparison.
struct RendererCheck: Identifiable {
    var id: String
    var title: String
    var viewBox = "0 0 64 64"
    var body: String

    private static let ink = "stroke=\"var(--icon-stroke, #000)\" vector-effect=\"non-scaling-stroke\""

    static let all: [RendererCheck] = [
        RendererCheck(id: "arcs", title: "Arcs", body: """
        <path d="M6 30a13 13 0 0 1 26 0z" fill="var(--icon-fill, #b3b3b3)" \(ink)/>\
        <path d="M36 30a5 10 0 1 0 22 0" fill="var(--icon-fill-2, #8c8c8c)" \(ink)/>\
        <path d="M6 50a1 1 0 0124 0" fill="none" stroke-width="2" \(ink)/>\
        <path d="M38 56a12 5 45 1 1 18-10" fill="none" \(ink)/>\
        <path d="M40 8a0 4 0 0 1 10 6" fill="none" \(ink)/>
        """),
        RendererCheck(id: "transforms", title: "Transforms", body: """
        <rect x="8" y="8" width="16" height="16" transform="rotate(30 16 16)" fill="var(--icon-fill, #b3b3b3)" \(ink)/>\
        <rect x="36" y="8" width="16" height="16" transform="skewX(20)" fill="var(--icon-fill-2, #8c8c8c)" \(ink)/>\
        <g transform="translate(4,36)scale(.5)rotate(-15)"><rect width="40" height="40" fill="var(--icon-fill, #b3b3b3)" \(ink)/></g>\
        <ellipse cx="0" cy="0" rx="8" ry="4" transform="matrix(1 .4 -.4 1 46 48) skewY(10)" fill="var(--icon-fill-2, #8c8c8c)" \(ink)/>
        """),
        RendererCheck(id: "shapes", title: "Shapes and dashes", body: """
        <rect x="6" y="6" width="22" height="14" rx="5" fill="var(--icon-fill, #b3b3b3)" \(ink)/>\
        <ellipse cx="46" cy="13" rx="10" fill="var(--icon-fill-2, #8c8c8c)" \(ink)/>\
        <polygon points="6,30 28,30 17,46" fill="var(--icon-fill, #b3b3b3)" \(ink) stroke-linejoin="round"/>\
        <polyline points="36 30,46 44 56,30" fill="none" stroke-width="3" stroke-linecap="round" \(ink)/>\
        <line x1="6" y1="54" x2="58" y2="54" stroke-width="1.5" stroke-dasharray="3 2" \(ink)/>\
        <line x1="6" y1="59" x2="58" y2="59" stroke-dasharray="1" stroke="var(--icon-stroke, #000)"/>
        """),
        RendererCheck(id: "composite", title: "Clip, opacity, fill rule", body: """
        <defs><clipPath id="c" transform="translate(2 0)"><circle cx="14" cy="16" r="9"/><rect x="18" y="6" width="10" height="20" transform="rotate(10 23 16)"/></clipPath></defs>\
        <g clip-path="url(#c)"><rect x="0" y="0" width="34" height="34" fill="var(--icon-fill-2, #8c8c8c)"/><path d="M0 8h34M0 14h34M0 20h34M0 26h34" stroke-width="2" \(ink)/></g>\
        <g opacity=".5"><circle cx="44" cy="14" r="9" fill="var(--icon-fill, #b3b3b3)" \(ink)/><circle cx="52" cy="22" r="9" fill="var(--icon-fill-2, #8c8c8c)" \(ink)/></g>\
        <path d="M6 40h24v20H6zM12 46h12v8H12z" fill-rule="evenodd" fill="var(--icon-fill, #b3b3b3)" \(ink)/>\
        <path d="M36 40h24v20H36zM42 46h12v8H42z" style="fill: var(--icon-fill-2, #8c8c8c); stroke: currentColor; stroke-width: 2" vector-effect="non-scaling-stroke"/>
        """),
        RendererCheck(id: "strokes", title: "Scaling vs non-scaling strokes", body: """
        <g transform="scale(2 1)" stroke="var(--icon-stroke, #000)" stroke-width="2" fill="var(--icon-fill, #b3b3b3)">\
        <path d="M4 6h10v20H4z"/><path d="M18 6h10v20H18z" vector-effect="non-scaling-stroke"/></g>\
        <svg x="4" y="34" width="56" height="26" viewBox="0 0 28 13"><circle cx="6.5" cy="6.5" r="5.5" fill="var(--icon-fill-2, #8c8c8c)" stroke="#c0392b" stroke-width="1"/>\
        <rect x="15" y="1" width="11" height="11" fill="rgb(52 120 246 / .6)" stroke="black" stroke-width=".5" stroke-dasharray="1 .5"/></svg>
        """),
    ]
}
