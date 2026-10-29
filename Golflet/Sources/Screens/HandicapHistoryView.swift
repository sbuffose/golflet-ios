import Charts
import SwiftUI

struct HandicapHistoryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    @State private var apiPoints: [TrendPoint]?
    @State private var start: Date?
    @State private var recordsTotal: Int?
    @State private var monthlyScores: [MonthlyScoreBar] = []

    var body: some View {
        let points = apiPoints ?? StatsEngine.handicapSeries(model.rounds)
        let home = model.home
        GScreen(id: "screen-metric-handicap") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Handicap index")
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(FormatAR.one(home.handicapIndex))
                                .font(GType.statL)
                                .tabular()
                                .foregroundStyle(p.ink)
                            if !home.trendSinceLabel.isEmpty {
                                HStack(spacing: 4) {
                                    Image(systemName: home.trendDelta <= 0 ? "arrow.down" : "arrow.up")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text("\(FormatAR.one(abs(home.trendDelta))) \(home.trendSinceLabel)")
                                        .font(GType.label)
                                }
                                .foregroundStyle(p.ink2)
                            }
                        }
                        Text(footnote)
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }

                    GCard(radius: 22, padding: 16) {
                        Sparkline(values: points.map(\.handicap), color: p.primary)
                            .frame(height: 72)
                            .accessibilityIdentifier("hcp-history-spark")
                    }

                    if showsMonthlyLegend {
                        monthlyCard
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Cambios")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        if points.isEmpty {
                            Text("No hay historial de hándicap en las tarjetas.")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        } else {
                            GCard(radius: 18, padding: 14) {
                                VStack(spacing: 10) {
                                    ForEach(Array(points.reversed().enumerated()), id: \.offset) { index, point in
                                        HStack {
                                            VStack(alignment: .leading, spacing: 2) {
                                                Text(FormatAR.longDate(point.date))
                                                    .font(GType.headline)
                                                    .foregroundStyle(p.ink)
                                                Text(point.course.isEmpty ? "Golflet" : point.course)
                                                    .font(GType.label)
                                                    .foregroundStyle(p.ink3)
                                                    .lineLimit(1)
                                            }
                                            Spacer()
                                            Text(FormatAR.one(point.handicap))
                                                .font(GType.headline)
                                                .tabular()
                                                .foregroundStyle(p.ink)
                                        }
                                        .accessibilityIdentifier("metric-hi-\(index)")
                                        if index < points.count - 1 {
                                            Hairline()
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-metric-handicap")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task {
            if let drill = try? await model.api.metricDrilldown(
                metric: "handicap",
                scope: "all",
                year: 2023,
                course: "all",
                sort: "date",
                order: "desc",
                range: StatsRange.all.query
            ) {
                start = drill.start
                recordsTotal = drill.recordsTotal ?? (drill.history.isEmpty ? nil : drill.history.count)
                monthlyScores = drill.monthlyScores
                if !drill.history.isEmpty {
                    apiPoints = drill.history.compactMap { item in
                        guard let date = item.date else { return nil }
                        return TrendPoint(date: date, handicap: item.hi, course: item.club ?? "")
                    }.reversed()
                }
            }
        }
    }

    private var showsMonthlyLegend: Bool {
        monthlyScores.contains(where: \.hasBars)
    }

    private var footnote: String {
        let count = recordsTotal ?? apiPoints?.count
        if let start, let count {
            return "\(count) registros semanales · desde \(FormatAR.monthYear(start))"
        }
        if let count, count > 0 {
            return "\(count) registros semanales · desde 2023"
        }
        return "Cada punto es el índice que venía en la tarjeta. El historial oficial empieza en 2023."
    }

    private var monthlyCard: some View {
        GCard(radius: 22, padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Birdies y pares")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Chart {
                    ForEach(monthlyScores) { row in
                        BarMark(
                            x: .value("Mes", FormatAR.dayMonth(row.date).month),
                            y: .value("Birdies", row.birdies)
                        )
                        .foregroundStyle(Color(hex: 0xC8A86A))
                        BarMark(
                            x: .value("Mes", FormatAR.dayMonth(row.date).month),
                            y: .value("Pares", row.pars)
                        )
                        .foregroundStyle(p.primary)
                    }
                }
                .frame(height: 140)
                .accessibilityIdentifier("hcp-monthly-bars")
                HStack(spacing: 16) {
                    legendDot(Color(hex: 0xC8A86A), "Birdies")
                    legendDot(p.primary, "Pares")
                }
                .accessibilityIdentifier("hcp-monthly-legend")
            }
        }
    }

    private func legendDot(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
        }
    }
}
