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
                    LazyVStack(spacing: 10) {
                        if rows.isEmpty {
                            Text("No hay rondas con este filtro.")
                                .font(GType.body)
                                .foregroundStyle(p.ink3)
                                .padding(.top, 24)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, round in
                            Button { model.presentedRound = round } label: {
                                RoundRow(round: round, style: .list)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("metric-round-\(index)")
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
        HStack(spacing: 8) {
            ForEach(MetricSortField.allCases, id: \.self) { field in
                Button {
                    sort = field
                } label: {
                    Text(field.rawValue)
                        .font(GType.headline)
                        .foregroundStyle(sort == field ? p.ink : p.ink2)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(sort == field ? p.surface : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-sort-\(field.rawValue.lowercased())")
            }
            Spacer(minLength: 8)
            Button { order = order.flipped } label: {
                HStack(spacing: 4) {
                    Image(systemName: order == .bestFirst ? "arrow.up" : "arrow.down")
                        .font(.system(size: 11, weight: .semibold))
                    Text(order.label(for: sort))
                        .font(GType.label)
                }
                .foregroundStyle(p.ink2)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("metric-sort-order")
        }
        .padding(4)
        .background(p.surface2)
        .clipShape(Capsule())
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