// swift-tools-version: 6.2
import PackageDescription

/// Everything except the app's entry point lives here, one module per area, so
/// each feature builds (and fails) on its own:
///
///     FitsssCore      models, API client, stores. Foundation only.
///     GarmentArt      the SVG subset renderer for garment drawings.
///     FitsssUI        design tokens, shared components, `Silhouette`.
///     *Feature        one screen family each, depending on Core and UI only.
///                     `ShareFeature` is the share extension's sheet; the
///                     `FitsssShare` extension links it on its own.
///
/// The app target links the single `FitsssKit` product; per-module products
/// exist so `xcodebuild -scheme <Module>` can build one area in isolation.
let mainActorByDefault: [SwiftSetting] = [
    .defaultIsolation(MainActor.self),
]

let features = [
    "ClosetFeature", "AddFlowFeature", "AccountFeature", "TodayFeature", "LooksFeature", "StylesFeature",
    "InspoFeature", "TasteFeature", "ShareFeature", "TripsFeature",
]
let modules = ["FitsssCore", "GarmentArt", "FitsssUI"] + features

let package = Package(
    name: "FitsssKit",
    defaultLocalization: "en",
    platforms: [.iOS(.v26)],
    products: [.library(name: "FitsssKit", targets: modules)]
        + modules.map { .library(name: $0, targets: [$0]) },
    targets: [
        .target(name: "FitsssCore", swiftSettings: mainActorByDefault),
        .target(name: "GarmentArt", swiftSettings: mainActorByDefault),
        .target(name: "FitsssUI", dependencies: ["FitsssCore", "GarmentArt"], swiftSettings: mainActorByDefault),
    ] + features.map {
        .target(name: $0, dependencies: ["FitsssCore", "FitsssUI"], swiftSettings: mainActorByDefault)
    } + [
        .testTarget(name: "FitsssCoreTests", dependencies: ["FitsssCore"]),
        .testTarget(name: "GarmentArtTests", dependencies: ["GarmentArt"]),
        .testTarget(name: "AddFlowFeatureTests", dependencies: ["AddFlowFeature"]),
    ]
)
