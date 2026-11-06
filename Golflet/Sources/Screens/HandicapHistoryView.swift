import Charts
import SwiftUI

struct HandicapHistoryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    @State private var apiPoints: [TrendPoint]?
    @State private var start: Date?
    @State private var recordsTotal: Int?
    @State private var monthlyScores: [MonthlyScoreBar] = []
    @State private var openChange: Int?
    @State private var showAllRevisions = false

    var body: some View {
        let points = apiPoints ?? StatsEngine.handicapSeries(model.rounds)
        let changes = StatsEngine.handicapChanges(points)
        let book = IndexBook.composition(from: model.rounds)
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
                        Text(footnote)
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }

                    GCard(radius: 22, padding: 16) {
                        Sparkline(values: points.map(\.handicap), color: p.primary)
                            .frame(height: 72)
                            .accessibilityIdentifier("hcp-history-spark")
                    }

                    if showsMonthlyLegend {
                        monthlyCard
                    }

                    cambiosSection(changes: changes, book: book)
                    countingSection(book)
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-metric-handicap")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task {
            if let drill = try? await model.api.metricDrilldown(
                metric: "handicap",
                scope: "all",
                year: 2023,
                course: "all",
                sort: "date",
                order: "desc",
                range: StatsRange.all.query
            ) {
                start = drill.start
                recordsTotal = drill.recordsTotal ?? (drill.history.isEmpty ? nil : drill.history.count)
                monthlyScores = drill.monthlyScores
                if !drill.history.isEmpty {
                    apiPoints = drill.history.compactMap { item in
                        guard let date = item.date else { return nil }
                        return TrendPoint(date: date, handicap: item.hi, course: item.club ?? "")
                    }.reversed()
                }
            }
        }
    }

    private func cambiosSection(changes: [TrendPoint], book: IndexComposition) -> some View {
        let newestFirst = Array(changes.reversed())
        return VStack(alignment: .leading, spacing: 12) {
            Text("Cambios")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if newestFirst.isEmpty {
                Text("No hay historial de hándicap en las tarjetas.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            } else {
                GCard(radius: 18, padding: 14) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(newestFirst.enumerated()), id: \.offset) { index, point in
                            let older = index + 1 < newestFirst.count ? newestFirst[index + 1] : nil
                            Button {
                                openChange = openChange == index ? nil : index
                            } label: {
                                timelineRow(point: point, older: older, index: index, isLast: index == newestFirst.count - 1, book: book)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("metric-hi-\(index)")
                            if openChange == index {
                                jumpDetail(
                                    point: point,
                                    previous: older,
                                    book: book
                                )
                                .accessibilityIdentifier("hcp-jump-detail-\(index)")
                                .padding(.leading, 24)
                            }
                        }
                    }
                }
            }
        }
    }

    private func timelineRow(point: TrendPoint, older: TrendPoint?, index: Int, isLast: Bool, book: IndexComposition) -> some View {
        let delta = older.map { point.handicap - $0.handicap }
        let rose = (delta ?? 0) > 0.049
        let fell = (delta ?? 0) < -0.049
        let color: Color = rose ? p.negative : (fell ? p.green : p.ink3)
        return HStack(alignment: .top, spacing: 12) {
            Circle()
                .fill(color)
                .frame(width: 10, height: 10)
                .padding(.top, 5)
            VStack(alignment: .leading, spacing: 2) {
                Text(FormatAR.longDate(point.date))
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text(point.course.isEmpty ? "Golflet" : point.course)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .lineLimit(1)
                if let delta, rose || fell {
                    Text("\(rose ? "Subió" : "Bajó") \(FormatAR.one(abs(delta)))")
                        .font(GType.label)
                        .foregroundStyle(color)
                }
                if let cause = causeLine(point: point, older: older, book: book) {
                    Text(cause)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            Text(FormatAR.one(point.handicap))
                .font(GType.headline)
                .tabular()
                .foregroundStyle(p.ink)
            Image(systemName: openChange == index ? "chevron.down" : "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(p.ink3)
                .padding(.top, 4)
        }
        .padding(.vertical, 10)
        .background(alignment: .topLeading) {
            if !isLast {
                Rectangle()
                    .fill(p.hairline)
                    .frame(width: 2)
                    .padding(.leading, 4)
                    .padding(.top, 16)
            }
        }
    }

    private func causeLine(point: TrendPoint, older: TrendPoint?, book: IndexComposition) -> String? {
        guard let older else { return nil }
        let move = IndexBook.movement(
            from: IndexBook.counting(asOf: older.date, revisions: book.revisions),
            to: IndexBook.counting(asOf: point.date, revisions: book.revisions)
        )
        var bits: [String] = []
        if let card = move.entered.first {
            let name = card.course.isEmpty ? "una tarjeta" : card.course
            bits.append("Entró \(name)")
        }
        if let card = move.dropped.first {
            let name = card.course.isEmpty ? "una tarjeta" : card.course
            bits.append("Salió \(name)")
        }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    private func jumpDetail(point: TrendPoint, previous: TrendPoint?, book: IndexComposition) -> some View {
        let active = IndexBook.counting(asOf: point.date, revisions: book.revisions)
        let move: (entered: [IndexCardRef], dropped: [IndexCardRef])? = previous.map { earlier in
            IndexBook.movement(
                from: IndexBook.counting(asOf: earlier.date, revisions: book.revisions),
                to: active
            )
        }
        return VStack(alignment: .leading, spacing: 8) {
            if active.isEmpty {
                Text("Hasta esa fecha las tarjetas no traen diferencial.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            } else {
                Text("En ese índice")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                cardList(active)
            }
            if let move, !move.entered.isEmpty {
                Text("Entró")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                cardList(move.entered)
            }
            if let move, !move.dropped.isEmpty {
                Text("Salió")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                cardList(move.dropped)
            }
            if let move, !active.isEmpty, move.entered.isEmpty, move.dropped.isEmpty {
                Text("El grupo de tarjetas no cambió.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, 4)
    }

    private func countingSection(_ book: IndexComposition) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Las que cuentan")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    Text(countingCaption(book))
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                    if !book.counting.isEmpty {
                        cardList(book.counting)
                    }
                    if !book.revisions.isEmpty {
                        Hairline()
                        Text("Cuándo cambió el grupo")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                        let shown = showAllRevisions ? Array(book.revisions.reversed()) : Array(book.revisions.reversed().prefix(8))
                        ForEach(Array(shown.enumerated()), id: \.element.id) { index, revision in
                            revisionRow(revision)
                                .accessibilityIdentifier("hcp-revision-\(index)")
                        }
                        if book.revisions.count > 8 {
                            Button(showAllRevisions ? "Ver menos" : "Ver los \(book.revisions.count - 8) cambios anteriores") {
                                showAllRevisions.toggle()
                            }
                            .font(GType.label)
                            .foregroundStyle(p.primary)
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("hcp-revisions-more")
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .accessibilityIdentifier("hcp-counting")
        }
    }

    private func revisionRow(_ revision: IndexRevision) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(FormatAR.longDate(revision.date))
                .font(GType.headline)
                .foregroundStyle(p.ink)
            if !revision.entered.isEmpty {
                Text("Entró \(revision.entered.map(cardLine).joined(separator: " · "))")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            if !revision.dropped.isEmpty {
                Text("Salió \(revision.dropped.map(cardLine).joined(separator: " · "))")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func cardLine(_ card: IndexCardRef) -> String {
        let course = card.course.isEmpty ? "Tarjeta" : card.course
        return "\(course) \(FormatAR.one(card.differential))"
    }

    private func countingCaption(_ book: IndexComposition) -> String {
        if book.windowCount == 0 {
            return "Las tarjetas no traen diferencial. No armo el grupo."
        }
        if book.counting.isEmpty {
            return "Hay \(book.windowCount) \(book.windowCount == 1 ? "tarjeta" : "tarjetas") con diferencial. El índice usa tarjetas a partir de la tercera."
        }
        let n = book.counting.count
        let window = min(book.windowCount, 20)
        return "Mejores \(n) de las últimas \(window) con diferencial."
    }

    private func cardList(_ cards: [IndexCardRef]) -> some View {
        VStack(spacing: 8) {
            ForEach(cards) { card in
                HStack(spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(card.course.isEmpty ? "Tarjeta" : card.course)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                        Text(FormatAR.longDate(card.date))
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                    Spacer()
                    Text(FormatAR.one(card.differential))
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                }
                .accessibilityIdentifier("hcp-card-\(card.id)")
            }
        }
    }

    private var showsMonthlyLegend: Bool {
        monthlyScores.contains(where: \.hasBars)
    }

    private var footnote: String {
        let count = recordsTotal ?? apiPoints?.count
        if let start, let count {
            return "\(count) registros semanales · desde \(FormatAR.monthYear(start))"
        }
        if let count, count > 0 {
            return "\(count) registros semanales · desde 2023"
        }
        return "Cada punto es el índice que venía en la tarjeta. El historial oficial empieza en 2023."
    }

    private var monthlyCard: some View {
        GCard(radius: 22, padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Birdies y pares")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Chart {
                    ForEach(monthlyScores) { row in
                        BarMark(
                            x: .value("Mes", FormatAR.dayMonth(row.date).month),
                            y: .value("Birdies", row.birdies)
                        )
                        .foregroundStyle(p.accentInk)
                        BarMark(
                            x: .value("Mes", FormatAR.dayMonth(row.date).month),
                            y: .value("Pares", row.pars)
                        )
                        .foregroundStyle(p.primary)
                    }
                }
                .frame(height: 140)
                .accessibilityIdentifier("hcp-monthly-bars")
                HStack(spacing: 16) {
                    legendDot(p.accentInk, "Birdies")
                    legendDot(p.primary, "Pares")
                }
                .accessibilityIdentifier("hcp-monthly-legend")
            }
        }
    }

    private func legendDot(_ color: Color, _ label: String) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 7, height: 7)
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
        }
    }
}
