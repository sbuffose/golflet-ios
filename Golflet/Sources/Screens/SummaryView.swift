import SwiftUI

struct SummaryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-resumen") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    filters
                    grid
                    trend
                    hardest
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-resumen")
        .metricDestinations()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "\(model.summary.firstYear) – \(model.summary.lastYear)")
            GTitle(text: "Resumen")
        }
    }

    private var filters: some View {
        FilterPills(
            options: CourseFilter.allCases.map(\.rawValue),
            selection: Binding(
                get: { model.courseFilter.rawValue },
                set: { model.courseFilter = CourseFilter(rawValue: $0) ?? .all }
            ),
            leadingDot: { option in
                switch CourseFilter(rawValue: option) {
                case .azul: return p.teeColor("azul")
                case .colorada: return p.teeColor("colorada")
                default: return nil
                }
            }
        )
    }

    private var grid: some View {
        let snap = model.summary
        let course = model.courseFilter.courseName
        let scoped = StatsEngine.apply(StatsEngine.eighteenHoleValid(model.rounds), filter: model.courseFilter)
        let start2025 = Calendar.gregorian.date(from: DateComponents(year: 2025, month: 1, day: 1)) ?? Date.distantPast
        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                NavigationLink(value: MetricRoute.roundList(.summaryBest(course: course))) {
                    AccentStatCard(
                        tint: .primary,
                        icon: "trophy.fill",
                        title: "Mejor ronda",
                        value: snap.best?.gross.map(String.init) ?? "—",
                        secondary: snap.best.flatMap { best in
                            guard let net = best.net else { return nil }
                            return "\(net) neto"
                        },
                        footnote: snap.best.map { "\(FormatAR.longDate($0.date)) · \($0.displayCourse)" }
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-summary-best")
                NavigationLink(value: MetricRoute.roundList(.summaryWorst(course: course))) {
                    AccentStatCard(
                        tint: .danger,
                        icon: "arrow.down.right",
                        title: "Peor (desde 2021)",
                        value: snap.worstSince2021?.gross.map(String.init) ?? "—",
                        secondary: snap.worstSince2021.flatMap { w in w.net.map { "\($0) neto" } },
                        footnote: snap.worstSince2021.map { "\(FormatAR.longDate($0.date)) · \($0.displayCourse)" }
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-summary-worst")
            }
            HStack(spacing: 10) {
                NavigationLink(value: MetricRoute.roundList(.average(yearOnly: false).locking(course: course))) {
                    AccentStatCard(
                        tint: .primary,
                        icon: "chart.xyaxis.line",
                        title: "Promedio gross",
                        value: snap.averageGross.map(FormatAR.one) ?? "—",
                        secondary: snap.averageToPar.map { "neto · \(FormatAR.signedOne($0))" },
                        footnote: "\(snap.validRoundCount) rondas · \(snap.averageToPar.map { FormatAR.signedOne($0) } ?? "—")",
                        sparkline: StatsEngine.recentGross(scoped)
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-summary-average")
                NavigationLink(value: MetricRoute.roundList(.since2025(course: course))) {
                    AccentStatCard(
                        tint: .primary,
                        icon: "calendar",
                        title: "Desde 2025",
                        value: snap.since2025Average.map(FormatAR.one) ?? "—",
                        footnote: "\(snap.since2025Count) rondas · mejor dif. \(snap.since2025BestDifferential.map(FormatAR.one) ?? "—")",
                        sparkline: StatsEngine.recentGross(scoped.filter { $0.date >= start2025 })
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-summary-2025")
            }
            scoreMix
        }
    }

    private var scoreMix: some View {
        let scoped = StatsEngine.apply(StatsEngine.eighteenHoleValid(model.rounds), filter: model.courseFilter)
        let totals = StatsEngine.scoreTotals(scoped)
        let query = RoundListQuery(
            title: "Resumen",
            periodDefault: .all,
            showCourseFilter: model.courseFilter.courseName == nil,
            valid18Only: true,
            courseName: model.courseFilter.courseName
        )
        return VStack(alignment: .leading, spacing: 10) {
            Text("Resultados")
                .font(GType.section)
                .foregroundStyle(p.ink)
            VStack(spacing: 10) {
                HStack(spacing: 10) {
                    ForEach([ScoreKind.eagle, .birdie], id: \.self) { kind in
                        scoreTile(kind, total: totals[kind] ?? 0, query: query)
                    }
                }
                HStack(spacing: 10) {
                    ForEach([ScoreKind.par, .bogey], id: \.self) { kind in
                        scoreTile(kind, total: totals[kind] ?? 0, query: query)
                    }
                }
            }
        }
    }

    private func scoreTile(_ kind: ScoreKind, total: Int, query: RoundListQuery) -> some View {
        let scoped = StatsEngine.apply(StatsEngine.eighteenHoleValid(model.rounds), filter: model.courseFilter)
        return NavigationLink(value: MetricRoute.scoreKind(kind, query)) {
            AccentStatCard(
                tint: kind.statTint,
                icon: kind.symbolName,
                title: kind.title,
                value: "\(total)",
                share: StatsEngine.holeShare(kind, in: scoped),
                compact: true
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("metric-summary-\(kind.rawValue)")
    }

    private var trend: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Tendencia")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Text("Índice estimado")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            NavigationLink(value: MetricRoute.handicap) {
                GCard(radius: 22, padding: 16) {
                    VStack(alignment: .leading, spacing: 12) {
                        TrendChart(points: model.summary.trend, current: model.home.handicapIndex)
                            .frame(maxWidth: .infinity)
                            .frame(height: 180)
                        HStack(spacing: 16) {
                            legendDot(p.teeColor("azul"), "Azul")
                            legendDot(p.teeColor("colorada"), "Colorada")
                            legendDot(p.primary, "Índice")
                            Spacer(minLength: 8)
                            MetricChevron(color: p.ink3)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("trend-legend")
                        Text("Diferencial calculado por Golflet · Golfistics no publica el HCP Index oficial")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("trend-footnote")
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("metric-summary-trend")
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

    private var hardest: some View {
        let rows = StatsEngine.hardestHoles(from: model.holeStats, filter: model.courseFilter)
        return VStack(alignment: .leading, spacing: 12) {
            Text("Hoyos que más te cuestan")
                .font(GType.section)
                .foregroundStyle(p.ink)
            VStack(spacing: 8) {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, pair in
                    let (course, hole) = pair
                    Button {
                        model.selectedCourseName = course.course
                        model.presentedHole = hole.number
                        model.selectedTab = .cancha
                    } label: {
                        HStack(spacing: 12) {
                            Text("\(hole.number)")
                                .font(GFont.ui(18, weight: .semibold))
                                .tabular()
                                .foregroundStyle(p.ink)
                                .frame(width: 28)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Par \(hole.par) · Handicap \(hole.handicap)")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text("\(course.course.prefix(3).uppercased()) · Promedio \(FormatAR.one(hole.average)) en \(hole.samples) vueltas")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            Spacer()
                            Text(FormatAR.signedOne(hole.averageToPar))
                                .font(GType.headline)
                                .tabular()
                                .foregroundStyle(p.ink)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(p.ink3)
                        }
                        .padding(.vertical, 10)
                    }
                    .buttonStyle(.plain)
                    if pair.1.number != rows.last?.1.number || pair.0.course != rows.last?.0.course {
                        Hairline()
                    }
                }
            }
            .padding(.horizontal, 4)
            Text("Sobre \(model.summary.validRoundCount) tarjetas válidas de 18 hoyos. DES y las de 9 hoyos no cuentan.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
    }
}

struct TrendChart: View {
    @Environment(\.palette) private var p
    let points: [TrendPoint]
    let current: Double

    var body: some View {
        GeometryReader { geo in
            let layout = TrendLayout(size: geo.size, points: points, current: current)
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    drawPlot(context: context, layout: layout)
                }
                ForEach(Array(layout.yTicks.enumerated()), id: \.offset) { _, tick in
                    Text(tick.label)
                        .font(GType.label)
                        .tabular()
                        .foregroundStyle(p.ink2)
                        .position(x: 16, y: tick.y)
                }
                if let badge = layout.badgeCenter {
                    Text(FormatAR.one(current))
                        .font(GFont.ui(12, weight: .semibold))
                        .tabular()
                        .foregroundStyle(p.onPrimary)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(p.primary)
                        .clipShape(Capsule())
                        .position(x: badge.x, y: badge.y)
                        .accessibilityIdentifier("trend-last-value")
                }
            }
        }
        .accessibilityIdentifier("trend-chart")
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Tendencia, índice \(FormatAR.one(current))")
    }

    private func drawPlot(context: GraphicsContext, layout: TrendLayout) {
        for tick in layout.yTicks {
            var grid = Path()
            grid.move(to: CGPoint(x: layout.plot.minX, y: tick.y))
            grid.addLine(to: CGPoint(x: layout.plot.maxX, y: tick.y))
            context.stroke(grid, with: .color(p.hairline), lineWidth: 1)
        }
        var baseline = Path()
        baseline.move(to: CGPoint(x: layout.plot.minX, y: layout.plot.maxY))
        baseline.addLine(to: CGPoint(x: layout.plot.maxX, y: layout.plot.maxY))
        context.stroke(baseline, with: .color(p.ink3), lineWidth: 1)

        if layout.plotPoints.count > 1 {
            var line = Path()
            for (index, point) in layout.plotPoints.enumerated() {
                if index == 0 { line.move(to: point.position) } else { line.addLine(to: point.position) }
            }
            context.stroke(line, with: .color(p.ink), lineWidth: 1.6)
        }
        for point in layout.plotPoints {
            let color = p.teeColor(point.course)
            context.fill(
                Path(ellipseIn: CGRect(x: point.position.x - 2.4, y: point.position.y - 2.4, width: 4.8, height: 4.8)),
                with: .color(color)
            )
        }
        if let last = layout.lastPoint {
            context.fill(
                Path(ellipseIn: CGRect(x: last.x - 6, y: last.y - 6, width: 12, height: 12)),
                with: .color(p.primary)
            )
        }
    }
}

private struct TrendLayout {
    struct Tick {
        var y: CGFloat
        var label: String
    }

    struct PlotPoint {
        var position: CGPoint
        var course: String
    }

    let plot: CGRect
    let yTicks: [Tick]
    let plotPoints: [PlotPoint]
    let lastPoint: CGPoint?
    let badgeCenter: CGPoint?

    init(size: CGSize, points: [TrendPoint], current: Double) {
        let values = points.map(\.handicap) + [current]
        let minV = min(values.min() ?? 0, current)
        let maxV = max(values.max() ?? 10, current)
        let span = max(maxV - minV, 1)
        let plot = CGRect(x: 36, y: 16, width: max(size.width - 48, 8), height: max(size.height - 28, 8))
        self.plot = plot

        func y(for value: Double) -> CGFloat {
            plot.maxY - CGFloat((value - minV) / span) * plot.height
        }

        let mid = (minV + maxV) / 2
        yTicks = [
            Tick(y: y(for: maxV), label: FormatAR.one(maxV)),
            Tick(y: y(for: mid), label: FormatAR.one(mid)),
            Tick(y: y(for: minV), label: FormatAR.one(minV))
        ]

        if points.isEmpty {
            plotPoints = []
            lastPoint = nil
            badgeCenter = nil
            return
        }

        let lastIndex = max(points.count - 1, 1)
        plotPoints = points.enumerated().map { index, point in
            let x = plot.minX + plot.width * CGFloat(index) / CGFloat(lastIndex)
            return PlotPoint(position: CGPoint(x: x, y: y(for: point.handicap)), course: point.course)
        }
        let last = CGPoint(
            x: plot.minX + plot.width,
            y: y(for: current)
        )
        lastPoint = last

        var badge = CGPoint(x: last.x - 28, y: last.y - 18)
        if badge.x < plot.minX + 24 {
            badge.x = min(last.x, plot.maxX - 24)
            badge.y = last.y - 22
        }
        badgeCenter = badge
    }
}
