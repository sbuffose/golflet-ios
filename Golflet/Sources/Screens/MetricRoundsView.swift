import SwiftUI

struct MetricRoundsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let query: RoundListQuery
    var showsBack = true
    var screenID = "screen-metric-rounds"

    @State private var period: MetricPeriod
    @State private var course: MetricCourseBucket
    @State private var sort: MetricSortField
    @State private var order: MetricSortOrder
    @State private var apiRounds: [Round]?

    init(query: RoundListQuery, showsBack: Bool = true, screenID: String = "screen-metric-rounds") {
        self.query = query
        self.showsBack = showsBack
        self.screenID = screenID
        _period = State(initialValue: query.periodDefault)
        _course = State(initialValue: .all)
        _sort = State(initialValue: query.defaultSort)
        _order = State(initialValue: query.defaultOrder)
    }

    var body: some View {
        GScreen(id: screenID) {
            VStack(alignment: .leading, spacing: 14) {
                header
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
                if query.showSort {
                    sortRow
                }
                ScrollView(showsIndicators: false) {
                    LazyVStack(spacing: 10, pinnedViews: .sectionHeaders) {
                        if rows.isEmpty {
                            Text("No hay rondas con este filtro.")
                                .font(GType.body)
                                .foregroundStyle(p.ink3)
                                .padding(.top, 24)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(yearSections) { section in
                            Section {
                                ForEach(Array(section.rounds.enumerated()), id: \.element.id) { index, round in
                                    Button { model.presentedRound = round } label: {
                                        RoundRow(
                                            round: round,
                                            style: .list,
                                            showYearUnderMonth: sort != .date && !section.isCurrent
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("metric-round-\(section.id)-\(index)")
                                }
                            } header: {
                                if sort == .date, !section.isCurrent {
                                    Text(section.id)
                                        .font(GType.overline)
                                        .foregroundStyle(p.ink3)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                        .padding(.vertical, 4)
                                        .background(p.bg.opacity(0.94))
                                        .accessibilityIdentifier("year-marker-\(section.id)")
                                }
                            }
                        }
                    }
                    .padding(.bottom, 24)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
        }
        .accessibilityIdentifier(screenID)
        .safeAreaInset(edge: .top) {
            if showsBack { MetricBackBar() }
        }
        .task(id: "\(period.rawValue)-\(course.rawValue)-\(sort.rawValue)-\(order.rawValue)") {
            await loadAPI()
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "\(rows.count) \(rows.count == 1 ? "ronda" : "rondas")")
            GTitle(text: query.title, size: 34)
            if let footnote = query.footnote {
                Text(footnote)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
        }
    }

    private var sortRow: some View {
        HStack {
            Text(sortCaption)
                .font(GType.label)
                .foregroundStyle(p.ink2)
            Spacer()
            Menu {
                Button("Recientes") { sort = .date; order = .bestFirst }
                Button("Antiguas") { sort = .date; order = .worstFirst }
                Button("Mejor gross") { sort = .gross; order = .bestFirst }
                Button("Peor gross") { sort = .gross; order = .worstFirst }
                Button("Mejor neto") { sort = .net; order = .bestFirst }
                Button("Peor neto") { sort = .net; order = .worstFirst }
            } label: {
                Image(systemName: "arrow.up.arrow.down")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.ink)
                    .frame(width: 36, height: 36)
                    .background(p.surface2)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("metric-sort-menu")
        }
    }

    private var sortCaption: String {
        switch (sort, order) {
        case (.date, .bestFirst): return "Recientes"
        case (.date, .worstFirst): return "Antiguas"
        case (.gross, .bestFirst): return "Mejor"
        case (.gross, .worstFirst): return "Peor"
        case (.net, .bestFirst): return "Mejor neto"
        case (.net, .worstFirst): return "Peor neto"
        }
    }

    private var yearSections: [RoundYearSection] {
        let current = Calendar.gregorian.component(.year, from: Date())
        var order: [Int] = []
        var buckets: [Int: [Round]] = [:]
        for round in rows {
            let year = Calendar.gregorian.component(.year, from: round.date)
            if buckets[year] == nil { order.append(year) }
            buckets[year, default: []].append(round)
        }
        return order.map { year in
            RoundYearSection(id: String(year), isCurrent: year == current, rounds: buckets[year] ?? [])
        }
    }

    private var rows: [Round] {
        if let apiRounds, !apiRounds.isEmpty { return apiRounds }
        let filtered = StatsEngine.filter(model.rounds, query: query, period: period, course: course)
        return StatsEngine.sorted(filtered, field: sort, order: order)
    }

    private func loadAPI() async {
        let (scope, year) = MetricAPIMap.scope(period, sinceYear: query.sinceYear)
        guard let drill = try? await model.api.metricDrilldown(
            metric: MetricAPIMap.name(for: query),
            scope: scope,
            year: year,
            course: MetricAPIMap.course(course),
            sort: MetricAPIMap.sortKey(sort),
            order: MetricAPIMap.orderKey(sort, order),
            range: model.statsRange.query
        ), !drill.rounds.isEmpty else {
            apiRounds = nil
            return
        }
        apiRounds = drill.rounds.map { item in
            model.rounds.first { $0.roundId == item.roundId } ?? item.asRound()
        }
    }
}