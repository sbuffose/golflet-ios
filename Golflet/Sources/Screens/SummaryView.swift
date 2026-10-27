import SwiftUI

struct SummaryView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen {
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
            )
        )
    }

    private var grid: some View {
        let snap = model.summary
        return VStack(spacing: 10) {
            HStack(spacing: 10) {
                statBlock(
                    label: "Mejor ronda",
                    value: snap.best?.gross.map(String.init) ?? "—",
                    secondary: snap.best.flatMap { best in
                        guard let net = best.net else { return nil }
                        return "\(net) neto"
                    },
                    footnote: snap.best.map { "\(FormatAR.longDate($0.date)) · \($0.course)" }
                )
                statBlock(
                    label: "Peor (desde 2021)",
                    value: snap.worstSince2021?.gross.map(String.init) ?? "—",
                    secondary: snap.worstSince2021.flatMap { w in w.net.map { "\($0) neto" } },
                    footnote: snap.worstSince2021.map { "\(FormatAR.longDate($0.date)) · \($0.course)" }
                )
            }
            HStack(spacing: 10) {
                statBlock(
                    label: "Promedio gross",
                    value: snap.averageGross.map(FormatAR.one) ?? "—",
                    secondary: snap.averageToPar.map { "neto · \(FormatAR.signedOne($0))" },
                    footnote: "\(snap.validRoundCount) rondas · \(snap.averageToPar.map { FormatAR.signedOne($0) } ?? "—")"
                )
                statBlock(
                    label: "Desde 2025",
                    value: snap.since2025Average.map(FormatAR.one) ?? "—",
                    secondary: nil,
                    footnote: "\(snap.since2025Count) rondas · mejor dif. \(snap.since2025BestDifferential.map(FormatAR.one) ?? "—")"
                )
            }
        }
    }

    private func statBlock(label: String, value: String, secondary: String?, footnote: String?) -> some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(value)
                        .font(GType.statL)
                        .tabular()
                        .foregroundStyle(p.ink)
                    if let secondary {
                        Text(secondary)
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                }
                if let footnote {
                    Text(footnote)
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                        .lineLimit(2)
                }
            }
        }
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
                    .foregroundStyle(p.ink3)
            }
            GCard(radius: 22, padding: 16) {
                TrendChart(points: model.summary.trend, current: model.home.handicapIndex)
                    .frame(height: 180)
                HStack(spacing: 16) {
                    legendDot(p.teeColor("azul"), "Azul")
                    legendDot(p.teeColor("rojo"), "Colorada")
                    legendDot(p.ink, "Índice")
                }
                .padding(.top, 8)
                Text("Cada punto es el diferencial calculado por Golflet (Golfistics no publica el HCP Index oficial de las últimas 26 semanas).")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .padding(.top, 6)
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
        Canvas { context, size in
            guard points.count > 1 else { return }
            let values = points.map(\.handicap)
            let minV = min(values.min() ?? 0, 0)
            let maxV = max(values.max() ?? 10, current + 1)
            let span = max(maxV - minV, 1)
            func pt(_ index: Int, _ value: Double) -> CGPoint {
                let x = size.width * CGFloat(index) / CGFloat(points.count - 1)
                let y = size.height * 0.12 + (1 - CGFloat((value - minV) / span)) * (size.height * 0.76)
                return CGPoint(x: x, y: y)
            }
            var line = Path()
            for (index, point) in points.enumerated() {
                let point = pt(index, point.handicap)
                if index == 0 { line.move(to: point) } else { line.addLine(to: point) }
            }
            for (index, point) in points.enumerated() {
                let c = pt(index, point.handicap)
                let color = point.course.lowercased() == "azul" ? Palette.light.teeColor("azul") : Palette.light.teeColor("rojo")
                context.fill(Path(ellipseIn: CGRect(x: c.x - 2.2, y: c.y - 2.2, width: 4.4, height: 4.4)), with: .color(color.opacity(0.85)))
            }
            context.stroke(line, with: .color(p.ink), lineWidth: 1.6)
            let last = pt(points.count - 1, current)
            context.fill(Path(ellipseIn: CGRect(x: last.x - 7, y: last.y - 7, width: 14, height: 14)), with: .color(p.primary))
            let label = Text(FormatAR.one(current))
                .font(GFont.ui(12, weight: .semibold))
                .foregroundColor(p.onPrimary)
            context.draw(label, at: last)
        }
        .accessibilityIdentifier("trend-chart")
    }
}
