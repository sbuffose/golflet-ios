import SwiftUI

struct ScoreKindDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let kind: ScoreKind
    let query: RoundListQuery

    @State private var period: MetricPeriod
    @State private var course: MetricCourseBucket
    @State private var apiSnapshot: ScoreKindSnapshot?

    init(kind: ScoreKind, query: RoundListQuery) {
        self.kind = kind
        self.query = query
        _period = State(initialValue: query.periodDefault)
        _course = State(initialValue: .all)
    }

    var body: some View {
        let snap = snapshot
        GScreen(id: "screen-metric-scores") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    header(snap)
                    if query.showPeriod {
                        FilterPills(
                            options: MetricPeriod.allCases.map(\.rawValue),
                            selection: Binding(
                                get: { period.rawValue },
                                set: { period = MetricPeriod(rawValue: $0) ?? .all }
                            )
                        )
                    }
                    if query.showCourseFilter {
                        ScrollFilterPills(
                            options: MetricCourseBucket.allCases.map(\.rawValue),
                            selection: Binding(
                                get: { course.rawValue },
                                set: { course = MetricCourseBucket(rawValue: $0) ?? .all }
                            )
                        )
                    }
                    tally(snap)
                    rounds(snap)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-metric-scores")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task(id: "\(period.rawValue)-\(course.rawValue)") {
            await loadAPI()
        }
    }

    private var snapshot: ScoreKindSnapshot {
        if let apiSnapshot, apiSnapshot.total > 0 || !apiSnapshot.rounds.isEmpty { return apiSnapshot }
        return StatsEngine.scoreKind(kind, rounds: model.rounds, query: query, period: period, course: course)
    }

    private func loadAPI() async {
        let (scope, year) = MetricAPIMap.scope(period, sinceYear: query.sinceYear)
        guard let drill = try? await model.api.metricDrilldown(
            metric: MetricAPIMap.score(kind),
            scope: scope,
            year: year,
            course: MetricAPIMap.course(course),
            sort: "count",
            order: "desc"
        ), drill.total != nil || !drill.rounds.isEmpty else {
            apiSnapshot = nil
            return
        }
        let rows = drill.rounds.map { item -> ScoreKindRound in
            let local = model.rounds.first { $0.roundId == item.roundId }
            let round = local ?? item.asRound()
            let holes = item.holes.map { number in
                local?.holes.first { $0.number == number } ?? HoleScore(
                    number: number,
                    par: 4,
                    handicap: number,
                    yards: nil,
                    strokes: nil,
                    toPar: nil,
                    result: kind.holeResult
                )
            }
            return ScoreKindRound(
                round: round,
                count: item.count ?? holes.count,
                holes: holes,
                usedHoleDetail: item.holesKnown && !item.holes.isEmpty
            )
        }
        apiSnapshot = ScoreKindSnapshot(
            total: drill.total ?? rows.reduce(0) { $0 + $1.count },
            rounds: rows,
            tally: drill.perHole.map { HoleTally(course: $0.courseLabel, hole: $0.hole, count: $0.count) }
                .sorted { $0.count > $1.count },
            roundsMissingHoles: rows.filter { !$0.usedHoleDetail }.count
        )
    }

    private func header(_ snap: ScoreKindSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: query.title)
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text("\(snap.total)")
                    .font(GType.statL)
                    .tabular()
                    .foregroundStyle(p.ink)
                Text(kind.title)
                    .font(GType.section)
                    .foregroundStyle(p.ink2)
            }
            if snap.roundsMissingHoles > 0 {
                Text("\(snap.roundsMissingHoles) tarjetas no traen el detalle hoyo por hoyo; el total usa el resumen de la tarjeta.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
        }
    }

    private func tally(_ snap: ScoreKindSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(kind.tallyTitle)
                .font(GType.section)
                .foregroundStyle(p.ink)
            if snap.tally.isEmpty {
                Text("No hay hoyos con \(kind.title.lowercased()) en este filtro.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            } else {
                GCard(radius: 18, padding: 14) {
                    VStack(spacing: 10) {
                        ForEach(Array(snap.tally.prefix(12).enumerated()), id: \.element.id) { index, row in
                            HStack {
                                Text("\(row.hole)")
                                    .font(GFont.ui(18, weight: .semibold))
                                    .tabular()
                                    .foregroundStyle(p.ink)
                                    .frame(width: 28, alignment: .leading)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(row.course)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                        .lineLimit(1)
                                    Text("Hoyo \(row.hole)")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                }
                                Spacer()
                                Text("\(row.count)")
                                    .font(GType.headline)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                            }
                            .accessibilityIdentifier("metric-tally-\(index)")
                            if index < min(11, snap.tally.count - 1) {
                                Hairline()
                            }
                        }
                    }
                }
            }
        }
    }

    private func rounds(_ snap: ScoreKindSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Por ronda")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if snap.rounds.isEmpty {
                Text("No hay \(kind.title.lowercased()) en este filtro.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
            ForEach(Array(snap.rounds.enumerated()), id: \.element.id) { index, item in
                Button { model.presentedRound = item.round } label: {
                    GCard(radius: 18, padding: 14) {
                        HStack(alignment: .top, spacing: 12) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(FormatAR.syncDay(item.round.date))
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                                Text(item.round.displayCourse)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                    .lineLimit(1)
                                Text(holesLine(item))
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 8)
                            VStack(alignment: .trailing, spacing: 2) {
                                Text("\(item.count)")
                                    .font(GType.statM)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                                Text(item.count == 1 ? kind.singular : kind.title.lowercased())
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                            }
                            MetricChevron(color: p.ink3)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-score-round-\(index)")
            }
        }
    }

    private func holesLine(_ item: ScoreKindRound) -> String {
        if item.usedHoleDetail, !item.holes.isEmpty {
            let numbers = item.holes.map { "\($0.number)" }.joined(separator: ", ")
            return "Hoyos \(numbers)"
        }
        if item.count > 0 {
            return "Sin detalle hoyo por hoyo"
        }
        return "—"
    }
}