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
    @Namespace private var roundZoom

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
                            VStack(alignment: .leading, spacing: 10) {
                                CaddieMark(height: 72)
                                Text("Todavía no hay tarjetas")
                                    .font(GType.section)
                                    .foregroundStyle(p.ink)
                                Text("No hay rondas con este filtro.")
                                    .font(GType.body)
                                    .foregroundStyle(p.ink3)
                            }
                            .padding(.top, 24)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(yearSections) { section in
                            Section {
                                ForEach(Array(section.rounds.enumerated()), id: \.element.id) { index, round in
                                    NavigationLink(value: round) {
                                        RoundRow(
                                            round: round,
                                            style: .list,
                                            showYearUnderMonth: sort != .date && !section.isCurrent
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .modifier(RoundZoomSource(id: round.roundId, space: roundZoom))
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
        .navigationDestination(for: Round.self) { round in
            RoundDetailView(round: round)
                .modifier(RoundZoomDestination(id: round.roundId, space: roundZoom))
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
        HStack(spacing: 8) {
            Text("Ordenar")
                .font(GType.label)
                .foregroundStyle(p.ink3)
            sortChip("Fecha", field: .date, id: "sort-date")
            sortChip("Mejor gross", field: .gross, id: "sort-gross")
            sortChip("Mejor neto", field: .net, id: "sort-net")
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("metric-sort-menu")
    }

    private func sortChip(_ title: String, field: MetricSortField, id: String) -> some View {
        let on = sort == field && order == .bestFirst
        return Button {
            sort = field
            order = .bestFirst
        } label: {
            Text(title)
                .font(GType.label)
                .foregroundStyle(on ? p.onPrimary : p.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(on ? p.primary : p.surface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        .accessibilityAddTraits(on ? .isSelected : [])
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