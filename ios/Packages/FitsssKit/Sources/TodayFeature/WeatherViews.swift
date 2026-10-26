import FitsssCore
import FitsssUI
import SwiftUI
import UIKit

/// SF Symbol per weather condition id (the web's `CONDITION_ICON`). The
/// conditions and their labels come from the catalog; this only draws them.
func weatherSymbol(_ condition: String) -> String {
    switch condition {
    case "clear": "sun.max"
    case "cloudy": "cloud"
    case "rain": "cloud.rain"
    case "snow": "snowflake"
    case "wind": "wind"
    case "storm": "cloud.bolt"
    default: "thermometer.medium"
    }
}

/// The small rounded icon well at the start of a Today row (the web's `RowIcon`).
struct RowIcon: View {
    let systemName: String

    var body: some View {
        Image(systemName: systemName)
            .font(.body)
            .foregroundStyle(Color.fitsssLabel)
            .frame(width: 30, height: 30)
            .background(Color.fitsssFill, in: RoundedRectangle(cornerRadius: 7))
            .accessibilityHidden(true)
    }
}

/// The weather line at the top of Today. Three states, as on the web: still
/// asking, a known snapshot (tap Edit to change it), and nothing known, which
/// says why and taps straight into the manual sheet, so generating is never
/// blocked on a permission prompt.
struct WeatherRow: View {
    let weather: TodayModel.Weather
    let catalog: Catalog?
    let onEdit: () -> Void

    @Environment(\.openURL) private var openURL

    var body: some View {
        VStack(spacing: 0) {
            switch weather {
            case .locating:
                row(symbol: "location", title: Text("Finding today’s weather…"), subtitle: "Using your location", action: nil)
                    .accessibilityIdentifier("today.weather.locating")
            case .known(let snapshot):
                row(
                    symbol: weatherSymbol(snapshot.condition),
                    title: Text("\(snapshot.temperatureText) · \(catalog?.weatherLabel(snapshot.condition) ?? "")").monospacedDigit(),
                    subtitle: snapshot.source == "manual" ? "Set by you" : (snapshot.place ?? "Your location"),
                    action: "Edit"
                )
            case .needsManual(let reason):
                row(symbol: "thermometer.medium", title: Text("Set your weather"), subtitle: subtitle(reason), action: "Set")
                if reason == .denied {
                    Divider().padding(.leading, 58)
                    Button {
                        if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                    } label: {
                        Text("Allow location in Settings")
                            .font(.body)
                            .foregroundStyle(Color.fitsssTint)
                            .frame(maxWidth: .infinity, minHeight: Metrics.minTapTarget, alignment: .leading)
                            .padding(.leading, 58)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("today.weather.settings")
                }
            }
        }
        .background(Color.fitsssCard, in: RoundedRectangle(cornerRadius: Metrics.cardRadius))
        .padding(.horizontal, Metrics.pagePadding)
    }

    private func subtitle(_ reason: TodayModel.ManualReason) -> String {
        switch reason {
        case .denied: "Location is off for Fitsss"
        case .unavailable: "Couldn’t find your location"
        case .forecastFailed: "Couldn’t get the forecast"
        }
    }

    @ViewBuilder
    private func row(symbol: String, title: Text, subtitle: String, action: String?) -> some View {
        let content = HStack(spacing: 12) {
            RowIcon(systemName: symbol)
            VStack(alignment: .leading, spacing: 2) {
                title
                    .font(.body)
                    .foregroundStyle(Color.fitsssLabel)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(Color.fitsssLabel2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if let action {
                Text(action)
                    .font(.body)
                    .foregroundStyle(Color.fitsssTint)
            } else {
                ProgressView()
            }
        }
        .padding(.horizontal, Metrics.pagePadding)
        .padding(.vertical, 10)
        .frame(minHeight: Metrics.minTapTarget)
        .contentShape(Rectangle())

        if action != nil {
            Button(action: onEdit) { content }
                .buttonStyle(RowPressStyle())
                .accessibilityIdentifier("today.weather")
                .accessibilityHint(action == "Edit" ? "Change today’s weather" : "Set today’s weather by hand")
        } else {
            content.accessibilityElement(children: .combine)
        }
    }
}

/// A row's press state: the pressed fill, like a list row.
struct RowPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.fitsssFill : Color.clear)
            .animation(.easeOut(duration: 0.15), value: configuration.isPressed)
    }
}

/// Set today's weather by hand: a temperature from -30 to 45 °C and one
/// condition from the catalog. Opens with today's numbers.
struct WeatherSheet: View {
    static let range = -30...45

    static func clamp(_ value: Double) -> Int {
        guard value.isFinite else { return 16 }
        return min(range.upperBound, max(range.lowerBound, WeatherSnapshot.wholeDegrees(value)))
    }

    let catalog: Catalog?
    let locationDenied: Bool
    let onDone: (WeatherSnapshot) -> Void
    let onUseLocation: () -> Void

    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var tempC: Int
    @State private var condition: String

    init(
        draft: (tempC: Int, condition: String), catalog: Catalog?, locationDenied: Bool,
        onDone: @escaping (WeatherSnapshot) -> Void, onUseLocation: @escaping () -> Void
    ) {
        self.catalog = catalog
        self.locationDenied = locationDenied
        self.onDone = onDone
        self.onUseLocation = onUseLocation
        _tempC = State(initialValue: draft.tempC)
        _condition = State(initialValue: draft.condition)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Stepper(value: $tempC, in: Self.range) {
                        Text("\(tempC)°")
                            .font(.largeTitle.weight(.bold))
                            .monospacedDigit()
                            .contentTransition(.numericText(value: Double(tempC)))
                            .animation(.easeOut(duration: 0.15), value: tempC)
                    }
                    .accessibilityLabel("Temperature")
                    .accessibilityValue("\(tempC) degrees Celsius")
                    .accessibilityIdentifier("today.weather.temperature")
                } footer: {
                    Text("Used to filter your closet before anything else.")
                }

                Section("Condition") {
                    ForEach(catalog?.allWeatherConditions ?? []) { option in
                        Button {
                            condition = option.id
                        } label: {
                            HStack {
                                Label(option.label, systemImage: weatherSymbol(option.id))
                                    .foregroundStyle(Color.fitsssLabel)
                                Spacer()
                                if condition == option.id {
                                    Image(systemName: "checkmark")
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(Color.fitsssTint)
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .accessibilityAddTraits(condition == option.id ? .isSelected : [])
                        .accessibilityIdentifier("today.weather.condition.\(option.id)")
                    }
                }

                Section {
                    if locationDenied {
                        Button("Allow location in Settings") {
                            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
                        }
                    } else {
                        Button {
                            dismiss()
                            onUseLocation()
                        } label: {
                            Label("Use my location", systemImage: "location")
                        }
                        .accessibilityIdentifier("today.weather.useLocation")
                    }
                } footer: {
                    Text(locationDenied
                         ? "Fitsss can fill this in from the forecast where you are."
                         : "Gets today’s forecast for where you are.")
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Today’s weather")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", role: .cancel) { dismiss() }
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                BottomActionBar {
                    Button("Done") {
                        onDone(WeatherSnapshot(tempC: Double(tempC), condition: condition, source: "manual"))
                        dismiss()
                    }
                    .buttonStyle(.fitsssPrimary)
                    .disabled(condition.isEmpty)
                    .accessibilityIdentifier("today.weather.done")
                }
            }
        }
    }
}
