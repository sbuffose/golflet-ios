import SwiftUI

struct RecurringErrorsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        let report = model.recurring ?? RecurringReport(roundsConsidered: 0, lastN: 10, items: [])
        GScreen(id: "screen-recurring") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Últimas \(report.lastN) rondas")
                        GTitle(text: "Errores que se repiten", size: 30)
                        Text("En \(report.roundsConsidered) rondas con recap.")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                    if report.items.isEmpty {
                        Text("Todavía no hay un patrón claro. Grabá el recap después de cada ronda.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                    ForEach(report.items) { item in
                        GCard(radius: 18, padding: 16) {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack {
                                    Text(item.label)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Spacer()
                                    Text("\(item.rounds) de \(item.of)")
                                        .font(GType.headline)
                                        .tabular()
                                        .foregroundStyle(p.ink)
                                }
                                Text(item.text)
                                    .font(GType.body)
                                    .foregroundStyle(p.ink2)
                                if !item.holes.isEmpty {
                                    Text(item.holes.map { "Hoyo \($0.hole) · \($0.mentions)" }.joined(separator: "  "))
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                }
                                ForEach(Array(item.examples.enumerated()), id: \.offset) { _, example in
                                    Text("\(example.date)\(example.hole.map { " · Hoyo \($0)" } ?? "") · \(example.text)")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                            }
                        }
                        .accessibilityIdentifier("recurring-\(item.category)")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-recurring")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task {
            if model.recurring == nil {
                model.recurring = try? await model.api.recurringMistakes()
            }
        }
    }
}
