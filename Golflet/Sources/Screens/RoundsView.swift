import SwiftUI

struct RoundsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var filter: CourseFilter = .all

    var body: some View {
        GScreen(id: "screen-rondas") {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    GOverline(text: "\(filtered.count) tarjetas · \(model.clubs.count > 1 ? "\(model.clubs.count) clubes" : (model.clubs.first?.name ?? "Golflet"))")
                    GTitle(text: "Rondas")
                }
                FilterPills(
                    options: CourseFilter.allCases.map(\.rawValue),
                    selection: Binding(
                        get: { filter.rawValue },
                        set: { filter = CourseFilter(rawValue: $0) ?? .all }
                    )
                )
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 10) {
                        ForEach(Array(filtered.enumerated()), id: \.element.id) { index, round in
                            Button { model.presentedRound = round } label: {
                                RoundRow(round: round, style: .list)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("round-row-\(index)")
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .accessibilityIdentifier("screen-rondas")
    }

    private var filtered: [Round] {
        StatsEngine.apply(model.rounds.sorted { $0.date > $1.date }, filter: filter)
    }
}
