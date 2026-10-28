import SwiftUI

struct HandicapHistoryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        let points = StatsEngine.handicapSeries(model.rounds)
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
                        Text("Cada punto es el índice que venía en la tarjeta. Golfistics no publica el historial oficial de las últimas 26 semanas.")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }

                    GCard(radius: 22, padding: 16) {
                        Sparkline(values: points.map(\.handicap), color: p.primary)
                            .frame(height: 72)
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
    }
}