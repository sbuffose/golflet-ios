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
                        GOverline(text: "Handicap Index")
                        GTitle(text: "Impacto en el hándicap")
                    }
                    impactHero(impact)
                    Text(impactFoot(impact))
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
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

    private func impactHero(_ impact: HcpImpact) -> some View {
        HStack(alignment: .center, spacing: 10) {
            heroColumn("Primer registro", impact.start, impact.startDate, "hcp-start", trailing: false)
            if impact.showsDelta {
                VStack(spacing: 2) {
                    Text("\(impact.delta < 0 ? "↓" : impact.delta > 0 ? "↑" : "")\(FormatAR.one(abs(impact.delta)))")
                        .font(GFont.ui(20, weight: .bold))
                        .tabular()
                        .foregroundStyle(Color(hex: impact.delta <= 0 ? 0xA8D5BA : 0xEBA593))
                    Text(impact.delta < 0 ? "bajó" : impact.delta > 0 ? "subió" : "igual")
                        .font(GFont.ui(12))
                        .foregroundStyle(Color.white.opacity(0.75))
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(Color.white.opacity(0.1))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("hcp-delta")
            }
            heroColumn("Ahora", impact.now, impact.nowDate, "hcp-now", trailing: true)
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 18)
        .frame(maxWidth: .infinity)
        .background(Color(hex: BrandHex.navy))
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func heroColumn(_ title: String, _ value: Double?, _ date: Date?, _ id: String, trailing: Bool) -> some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
            Text(title.uppercased())
                .font(GFont.ui(12, weight: .semibold))
                .foregroundStyle(Color(hex: BrandHex.red))
            Text(value.map(FormatAR.one) ?? "—")
                .font(GFont.ui(36, weight: .semibold))
                .tabular()
                .foregroundStyle(Color(hex: 0xF6F7F9))
            Text(date.map(FormatAR.webDay) ?? "")
                .font(GFont.ui(12))
                .foregroundStyle(Color.white.opacity(0.7))
        }
        .frame(maxWidth: .infinity, alignment: trailing ? .trailing : .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(id)
    }

    private func impactFoot(_ impact: HcpImpact) -> String {
        let source = impact.estimated
            ? "Estimado: mejores 8 de las últimas 20 con los diferenciales que calcula Golflet."
            : "Índice oficial que publica tu club."
        if let since = impact.startDate {
            return "\(source) Es el mismo tramo que el número de Inicio. Desde \(FormatAR.webMonthYear(since))."
        }
        return source
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
