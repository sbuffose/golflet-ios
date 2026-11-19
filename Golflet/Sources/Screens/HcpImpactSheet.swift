import SwiftUI

struct HcpImpactSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let impact: HcpImpact

    var body: some View {
        GScreen(id: "screen-hcp-impact") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: impact.estimated ? "Estimado" : "Oficial")
                        GTitle(text: "Impacto de handicap")
                    }
                    HStack(spacing: 12) {
                        indexCard("Índice al inicio", impact.start, impact.startDate, "hcp-start")
                        indexCard("Ahora", impact.now, impact.nowDate, "hcp-now")
                    }
                    if impact.showsDelta {
                        GCard(radius: 18, padding: 16) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(impact.delta <= 0 ? "Bajó" : "Subió")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                Text("\(impact.delta < 0 ? "↓" : "↑") \(FormatAR.one(abs(impact.delta)))")
                                    .font(GType.statM)
                                    .tabular()
                                    .foregroundStyle(impact.delta <= 0 ? p.positive : p.negative)
                                if let since = impact.startDate {
                                    Text("Desde \(FormatAR.webMonthYear(since)). El mismo tramo que Inicio.")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                }
                            }
                        }
                        .accessibilityIdentifier("hcp-delta")
                    }
                    if impact.series.count > 1 {
                        chart(impact.series)
                    }
                    if !impact.movers.isEmpty {
                        movers(impact.movers)
                    } else if impact.unidentified {
                        Text(HIChangeLabel.unidentified)
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("hcp-unidentified")
                    }
                    if !impact.counting.isEmpty {
                        cards("Entró en las 8", impact.counting)
                    }
                    if !impact.dropped.isEmpty {
                        cards("No entró", impact.dropped)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-hcp-impact")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-hcp-impact") }
    }

    private func indexCard(_ title: String, _ value: Double?, _ date: Date?, _ id: String) -> some View {
        GCard(radius: 18, padding: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                Text(value.map(FormatAR.one) ?? "—")
                    .font(GType.statM)
                    .tabular()
                    .foregroundStyle(p.ink)
                if let date {
                    Text(FormatAR.webDay(date))
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityIdentifier(id)
    }

    private func chart(_ series: [HIPoint]) -> some View {
        let values = series.map(\.handicap)
        let low = (values.min() ?? 0) - 0.4
        let high = (values.max() ?? 1) + 0.4
        let span = max(high - low, 0.4)
        return VStack(alignment: .leading, spacing: 8) {
            Text("Evolución")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GeometryReader { geo in
                let w = geo.size.width
                let h = geo.size.height
                Path { path in
                    for (index, point) in series.enumerated() {
                        let x = series.count == 1 ? w / 2 : w * CGFloat(index) / CGFloat(series.count - 1)
                        let y = h * CGFloat((high - point.handicap) / span)
                        if index == 0 { path.move(to: CGPoint(x: x, y: y)) }
                        else { path.addLine(to: CGPoint(x: x, y: y)) }
                    }
                }
                .stroke(p.primary, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
            }
            .frame(height: 120)
        }
        .accessibilityIdentifier("hcp-chart")
    }

    private func movers(_ items: [HcpMover]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Las que más lo movieron")
                .font(GType.section)
                .foregroundStyle(p.ink)
            ForEach(items) { card in
                Button {
                    if let round = model.rounds.first(where: { $0.roundId == card.roundId }) {
                        dismiss()
                        model.presentedRound = round
                    }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(card.course.isEmpty ? "Tarjeta" : card.course)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text(FormatAR.webDay(card.date))
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(FormatAR.one(card.differential))
                                .font(GType.headline)
                                .tabular()
                                .foregroundStyle(p.ink)
                            Text(FormatAR.signedOne(card.impact))
                                .font(GType.label)
                                .foregroundStyle(card.impact <= 0 ? p.positive : p.negative)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("hcp-mover-\(card.roundId)")
            }
        }
    }

    private func cards(_ title: String, _ items: [HcpImpactCard]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(GType.section)
                .foregroundStyle(p.ink)
            ForEach(items) { card in
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.course ?? "Tarjeta")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        if let date = card.date {
                            Text(FormatAR.dayMonth(date).day + " " + FormatAR.dayMonth(date).month)
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                    }
                    Spacer()
                    Text(card.differential.map(FormatAR.one) ?? "—")
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                }
                .padding(.vertical, 4)
            }
        }
    }
}
