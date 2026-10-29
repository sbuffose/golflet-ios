import SwiftUI

struct HcpImpactSheet: View {
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
                        indexCard("Índice al inicio", impact.start)
                        indexCard("Ahora", impact.now)
                    }
                    GCard(radius: 18, padding: 16) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(impact.delta <= 0 ? "Bajó" : "Subió")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                            Text("\(impact.delta < 0 ? "↓" : "↑") \(FormatAR.one(abs(impact.delta)))")
                                .font(GType.statM)
                                .tabular()
                                .foregroundStyle(impact.delta <= 0 ? p.positive : p.negative)
                        }
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

    private func indexCard(_ title: String, _ value: Double?) -> some View {
        GCard(radius: 18, padding: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                Text(value.map(FormatAR.one) ?? "—")
                    .font(GType.statM)
                    .tabular()
                    .foregroundStyle(p.ink)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
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
