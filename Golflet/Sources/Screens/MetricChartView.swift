import Charts
import SwiftUI

struct MetricChartView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let query: MetricChartQuery
    @State private var remotePoints: [MetricPoint] = []

    var body: some View {
        let points = series
        let rolling = query.kind.showsRolling ? StatsEngine.rollingAverage(points) : []
        GScreen(id: "screen-metric-chart") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "\(query.range.title) · \(points.count) \(points.count == 1 ? "ronda" : "rondas")")
                        GTitle(text: query.title, size: 34)
                    }
                    if points.isEmpty {
                        RangeEmptyState(range: query.range)
                    } else {
                        GCard(radius: 22, padding: 16) {
                            VStack(alignment: .leading, spacing: 12) {
                                MetricLineChart(
                                    points: points,
                                    rolling: rolling,
                                    valueTitle: query.kind.valueTitle
                                )
                                .frame(maxWidth: .infinity)
                                .frame(height: 220)
                                .accessibilityIdentifier("metric-chart")
                                if query.kind.showsRolling {
                                    HStack(spacing: 16) {
                                        legend(p.ink, "Cada ronda")
                                        legend(p.primary, "Promedio móvil")
                                    }
                                }
                            }
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Rondas")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            ForEach(points.reversed()) { point in
                                HStack {
                                    Text(FormatAR.longDate(point.date))
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                        .lineLimit(1)
                                    Spacer()
                                    Text(query.kind.format(point.value))
                                        .font(GType.headline)
                                        .tabular()
                                        .foregroundStyle(p.ink)
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
        .accessibilityIdentifier("screen-metric-chart")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task(id: query) {
            remotePoints = await model.metricChartPoints(query)
        }
    }

    private var series: [MetricPoint] {
        if !remotePoints.isEmpty { return remotePoints }
        let rounds = StatsEngine.ranged(model.rounds, range: query.range)
        return StatsEngine.series(from: rounds, kind: query.kind, courseName: query.courseName)
    }

    private func legend(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 6) {
            Capsule().fill(color).frame(width: 14, height: 3)
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
        }
    }
}

struct MetricLineChart: View {
    @Environment(\.palette) private var p
    var points: [MetricPoint]
    var rolling: [MetricPoint] = []
    var valueTitle: String

    var body: some View {
        Chart {
            ForEach(points) { point in
                LineMark(
                    x: .value("Fecha", point.date),
                    y: .value(valueTitle, point.value)
                )
                .foregroundStyle(p.ink)
                .interpolationMethod(.linear)
                PointMark(
                    x: .value("Fecha", point.date),
                    y: .value(valueTitle, point.value)
                )
                .foregroundStyle(p.teeColor(point.course))
                .symbolSize(28)
            }
            ForEach(rolling) { point in
                LineMark(
                    x: .value("Fecha", point.date),
                    y: .value("Promedio", point.value)
                )
                .foregroundStyle(p.primary)
                .lineStyle(StrokeStyle(lineWidth: 2, dash: [5, 4]))
                .interpolationMethod(.linear)
            }
        }
        .chartXAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { _ in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6))
                    .foregroundStyle(p.hairline)
                AxisValueLabel()
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
        }
        .chartYAxis {
            AxisMarks(values: .automatic(desiredCount: 4)) { value in
                AxisGridLine(stroke: StrokeStyle(lineWidth: 0.6))
                    .foregroundStyle(p.hairline)
                AxisValueLabel {
                    if let number = value.as(Double.self) {
                        Text(FormatAR.one(number))
                            .font(GType.label)
                            .tabular()
                            .foregroundStyle(p.ink2)
                    }
                }
            }
        }
        .chartYScale(domain: .automatic(includesZero: false))
    }
}

private extension MetricChartKind {
    var showsRolling: Bool {
        switch self {
        case .gross, .net, .differential, .handicap: return true
        case .scoreKind, .hole: return false
        }
    }

    var valueTitle: String {
        switch self {
        case .gross: return "Gross"
        case .net: return "Neto"
        case .differential: return "Diferencial"
        case .scoreKind: return "Cantidad"
        case .hole: return "Golpes"
        case .handicap: return "Índice"
        }
    }

    func format(_ value: Double) -> String {
        switch self {
        case .scoreKind, .hole:
            return FormatAR.int(Int(value.rounded()))
        default:
            return FormatAR.one(value)
        }
    }
}
