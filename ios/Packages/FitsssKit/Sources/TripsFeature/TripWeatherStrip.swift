import FitsssCore
import FitsssUI
import SwiftUI

/// One column a day: weekday and date, the condition, the high over the
/// low. Days beyond the forecast show what is typical for the date instead;
/// they are drawn quieter, their high carries a tilde, and a dashed line
/// marks where the forecast ends. `typicalNote` says so, once, under the
/// strip. Fits the width when it can (up to about a week); longer trips
/// scroll sideways. At accessibility text sizes the days are rows instead,
/// so nothing is hidden off the edge.
struct TripWeatherStrip: View {
    let days: [TripDayWeather]
    let catalog: Catalog?

    @Environment(\.dynamicTypeSize) private var typeSize
    @ScaledMetric(relativeTo: .subheadline) private var scaledColumn: CGFloat = 44
    private var columnWidth: CGFloat { min(scaledColumn, 72) }

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                rows
            } else {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 0) { columns(flexible: true) }
                    ScrollView(.horizontal) {
                        HStack(alignment: .top, spacing: 0) { columns(flexible: false) }
                    }
                    .scrollIndicators(.hidden)
                    .scrollBounceBehavior(.basedOnSize)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Weather by day")
        .accessibilityIdentifier("trip.weather")
    }

    @ViewBuilder
    private func columns(flexible: Bool) -> some View {
        let firstTypical = days.firstIndex(where: \.isTypical)
        ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
            HStack(spacing: 0) {
                if index == firstTypical, index > 0 {
                    ForecastEdge()
                }
                // Never narrower than its text: at large type a column grows
                // and the strip scrolls, instead of clipping "~20°".
                DayColumn(day: day, label: catalog?.weatherLabel(day.condition) ?? day.condition)
                    .fixedSize(horizontal: true, vertical: false)
                    .frame(minWidth: columnWidth, maxWidth: flexible ? .infinity : nil)
            }
        }
    }

    /// A row a day: the strip's columns laid flat, every word wrapping.
    private var rows: some View {
        let firstTypical = days.firstIndex(where: \.isTypical)
        return VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(days.enumerated()), id: \.element.id) { index, day in
                if index == firstTypical, index > 0 {
                    Divider().padding(.vertical, 6)
                }
                DayRow(day: day, label: catalog?.weatherLabel(day.condition) ?? day.condition)
            }
        }
    }

    /// Under the strip when some days are typical: where the forecast ends
    /// and what the rest shows.
    static func typicalNote(_ days: [TripDayWeather]) -> String? {
        guard days.contains(where: \.isTypical) else { return nil }
        if let lastForecast = days.last(where: { !$0.isTypical }) {
            return "The forecast reaches \(TripText.dayTitle(lastForecast.date)). Days after it show what’s typical for the date in recent years, marked ~."
        }
        return "These dates are beyond the forecast: each day shows what’s typical for the date in recent years, marked ~."
    }
}

/// What one day says to VoiceOver, shared by the column and the row.
private func dayAccessibilityText(_ day: TripDayWeather, label: String) -> String {
    var parts = ["\(TripText.dayTitleLong(day.date)): \(label), high \(TripText.degrees(day.tempC))"]
    if let low = day.lowC { parts.append("low \(TripText.degrees(low))") }
    if day.isTypical { parts.append("typical for the date, not a forecast") }
    return parts.joined(separator: ", ")
}

private struct DayColumn: View {
    let day: TripDayWeather
    let label: String

    private var typical: Bool { day.isTypical }

    var body: some View {
        let (_, dayNumber) = TripText.monthAndDay(day.date)
        VStack(spacing: 3) {
            Text(TripText.weekday(day.date).uppercased())
                .font(.caption2.weight(.semibold))
                .tracking(0.3)
                .foregroundStyle(typical ? Color.fitsssLabel3 : Color.fitsssLabel2)
            Text(dayNumber)
                .font(.footnote)
                .monospacedDigit()
                .foregroundStyle(typical ? Color.fitsssLabel2 : Color.fitsssLabel)
            Image(systemName: weatherSymbol(day.condition))
                .font(.title3)
                .frame(height: 28)
                .foregroundStyle(typical ? Color.fitsssLabel3 : Color.fitsssLabel)
            Text(typical ? "~\(TripText.degrees(day.tempC))" : TripText.degrees(day.tempC))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(typical ? Color.fitsssLabel2 : Color.fitsssLabel)
            if let low = day.lowC {
                Text(TripText.degrees(low))
                    .font(.caption)
                    .monospacedDigit()
                    .foregroundStyle(typical ? Color.fitsssLabel3 : Color.fitsssLabel2)
            }
        }
        .lineLimit(1)
        .padding(.vertical, 6)
        .padding(.horizontal, 2)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(dayAccessibilityText(day, label: label))
        .accessibilityIdentifier("trip.weather.\(day.date)")
    }
}

/// The same day as a row: "Sat, Nov 7 · cloud · 19° / 15°".
private struct DayRow: View {
    let day: TripDayWeather
    let label: String

    private var typical: Bool { day.isTypical }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(TripText.dayTitle(day.date))
                .font(.subheadline)
                .foregroundStyle(typical ? Color.fitsssLabel2 : Color.fitsssLabel)
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: weatherSymbol(day.condition))
                .font(.subheadline)
                .foregroundStyle(typical ? Color.fitsssLabel3 : Color.fitsssLabel)
            Text(typical ? "~\(TripText.degrees(day.tempC))" : TripText.degrees(day.tempC))
                .font(.subheadline.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(typical ? Color.fitsssLabel2 : Color.fitsssLabel)
            if let low = day.lowC {
                Text(TripText.degrees(low))
                    .font(.subheadline)
                    .monospacedDigit()
                    .foregroundStyle(typical ? Color.fitsssLabel3 : Color.fitsssLabel2)
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .padding(.vertical, 4)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(dayAccessibilityText(day, label: label))
        .accessibilityIdentifier("trip.weather.\(day.date)")
    }
}

/// The dashed line between the last forecast day and the first typical one.
private struct ForecastEdge: View {
    var body: some View {
        Rectangle()
            .strokeBorder(style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            .foregroundStyle(Color.fitsssSeparator)
            .frame(width: 1)
            .padding(.vertical, 8)
            .accessibilityHidden(true)
    }
}
