import SwiftUI

struct HoleRef: Identifiable, Hashable {
    var number: Int
    var id: Int { number }
}

struct HoleDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let courseName: String
    let holeNumber: Int
    @State private var strategy: CourseStrategy?

    private var currentHole: Int { model.presentedHole ?? holeNumber }
    private var courseKey: String { CourseIdentity.key(for: courseName) }

    var body: some View {
        GScreen(id: "screen-hoyo") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    map
                    yardages
                    history
                    strategyCard
                    placeholders
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-hoyo")
        .metricDestinations()
        .task { strategy = try? await model.api.courseStrategy(courseKey: courseKey, courseId: nil) }
        .onChange(of: currentHole) { _, _ in
            Task { strategy = try? await model.api.courseStrategy(courseKey: courseKey, courseId: nil) }
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Button { model.presentedHole = nil } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(p.ink2)
                        .frame(width: 32, height: 32)
                        .background(p.surface)
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("close-hole")
                Spacer()
                HStack(spacing: 8) {
                    Button { step(-1) } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 32, height: 32)
                            .background(p.surface)
                            .clipShape(Circle())
                    }
                    .accessibilityIdentifier("prev-hole")
                    Button { step(1) } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 32, height: 32)
                            .background(p.surface)
                            .clipShape(Circle())
                    }
                    .accessibilityIdentifier("next-hole")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 6)
            .background(p.bg)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "Cancha \(courseName) · tu hoyo más difícil")
            GTitle(text: "Hoyo \(currentHole)")
        }
    }

    private var map: some View {
        VStack(alignment: .leading, spacing: 10) {
            GOverline(text: "Esquema · trazado real próximamente")
            HoleMapView(course: course, hole: courseHole, tees: teeYardages)
                .frame(height: 340)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        }
    }

    private var yardages: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                labeled("Hoyo", "\(currentHole)")
                Spacer()
                labeled("Par", "\(stat?.par ?? courseHole?.par ?? 4)")
                Spacer()
                labeled("Yardas", longestYardage.map(String.init) ?? "—")
                Spacer()
                labeled("Handicap", "\(stat?.handicap ?? courseHole?.handicap ?? currentHole)")
            }
            .padding(.vertical, 8)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(teeYardages, id: \.0) { name, yards in
                    HStack(spacing: 8) {
                        TeeDot(name: name)
                        Text("\(name) \(yards)")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                }
            }
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(GType.statM)
                .tabular()
                .foregroundStyle(p.ink)
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Tu historial")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Text("\(stat?.samples ?? 0) vueltas")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
            GCard(radius: 22, padding: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(stat.map { FormatAR.one($0.average) } ?? "—")
                            .font(GFont.ui(44, weight: .semibold))
                            .tracking(-1.8)
                            .tabular()
                            .foregroundStyle(p.ink)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Promedio")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                            Text("\(stat.map { FormatAR.signedOne($0.averageToPar) } ?? "—") vs par")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                        Spacer()
                    }
                    if let last = stat?.averageLast16 {
                        Text("Últimas 16: \(FormatAR.one(last))")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    if holeSeries.count > 1 {
                        MetricLineChart(points: holeSeries, valueTitle: "Golpes")
                            .frame(height: 160)
                            .accessibilityIdentifier("hole-score-chart")
                    }
                    distribution
                    comparison
                }
            }
        }
    }

    private var distribution: some View {
        let dist = stat?.distribution
        let items: [(String, Double, Color)] = [
            ("Birdie", dist?.percent(dist?.birdie ?? 0) ?? 0, p.accent),
            ("Par", dist?.percent(dist?.par ?? 0) ?? 0, p.ink2),
            ("Bogey", dist?.percent(dist?.bogey ?? 0) ?? 0, p.sand),
            ("Doble+", dist?.percent((dist?.double ?? 0) + (dist?.triplePlus ?? 0)) ?? 0, Color(hex: 0xC4B48A))
        ]
        return VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(items, id: \.0) { item in
                        if item.1 > 0 {
                            item.2.frame(width: max(4, geo.size.width * item.1 / 100), height: 8)
                        }
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 8)
            HStack {
                ForEach(items, id: \.0) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.0)
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                        Text("\(Int(item.1.rounded()))%")
                            .font(GType.headline)
                            .tabular()
                            .foregroundStyle(p.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var comparison: some View {
        let birdie = stat?.comparisons.first { $0.key == "Birdie" }
        let par = stat?.comparisons.first { $0.key == "Par" }
        let bogey = stat?.comparisons.first { $0.key == "Bogey" }
        let double = stat?.comparisons.first { $0.key == "DobleBogey" }
        return HStack {
            compare("Birdie", birdie)
            compare("Par", par)
            compare("Bogey", bogey)
            compare("Doble+", double)
        }
        .font(GType.label)
    }

    private func compare(_ label: String, _ item: SiteComparison?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .foregroundStyle(p.ink3)
            Text("\(Int(item?.playerPct ?? 0))%")
                .font(GType.headline)
                .foregroundStyle(p.ink)
            Text("todos \(Int(item?.groupPct ?? 0))%")
                .foregroundStyle(p.ink3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var strategyCard: some View {
        if let hole = strategy?.hole(currentHole) {
            StrategyHoleCard(
                hole: hole,
                courseKey: courseKey,
                warning: StrategyCopy.siteWarning(courseKey: courseKey, hole: currentHole)
            )
        }
    }

    private var placeholders: some View {
        Group {
            if strategy?.hole(currentHole) == nil {
                HStack(spacing: 10) {
                    placeholder("Lectura de green", "Pendientes y profundidad del green, todavía sin relevar.")
                    placeholder("Tiro recomendado", "Todavía sin plan para este hoyo.")
                }
            }
        }
    }

    private func placeholder(_ title: String, _ body: String) -> some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                GOverline(text: "Próximamente")
                Text(title)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text(body)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
        }
    }

    private var course: Course? {
        model.courses.first { $0.name.caseInsensitiveCompare(courseName) == .orderedSame }
    }

    private var courseHole: CourseHole? {
        course?.holes.first { $0.number == currentHole }
    }

    private var stat: HoleStat? {
        model.holesForCourse(courseName).first { $0.number == currentHole }
    }

    private var holeSeries: [MetricPoint] {
        StatsEngine.series(
            from: StatsEngine.ranged(model.rounds, range: model.statsRange),
            kind: .hole(currentHole),
            courseName: courseName
        )
    }

    private var teeYardages: [(String, Int)] {
        let order = ["NEGRO", "ROJO", "AZUL", "BLANCO", "AMARILLO"]
        let yards = courseHole?.yards ?? [:]
        return order.compactMap { key in
            guard let value = yards[key] else { return nil }
            return (key.capitalized, value)
        }
    }

    private var longestYardage: Int? {
        courseHole?.yards.values.max()
    }

    private func step(_ delta: Int) {
        let next = min(18, max(1, currentHole + delta))
        model.presentedHole = next
    }
}

struct HoleMapView: View {
    @Environment(\.palette) private var p
    let course: Course?
    let hole: CourseHole?
    let tees: [(String, Int)]

    var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size)
            context.fill(Path(roundedRect: rect, cornerRadius: 28), with: .color(p.turf))

            let centerX = size.width * 0.5
            let greenY = size.height * 0.16
            let teeY = size.height * 0.86
            let maxYards = Double(tees.map(\.1).max() ?? 400)

            // Distance rings from the green
            let rings = [100, 150, 200, 250, 300]
            for yards in rings {
                let t = CGFloat(Double(yards) / max(maxYards, 320))
                let y = greenY + (teeY - greenY) * t
                var path = Path()
                path.addEllipse(in: CGRect(x: centerX - 70, y: y - 10, width: 140, height: 20))
                context.stroke(path, with: .color(p.primary.opacity(0.12)), lineWidth: 1)
                let label = Text("\(yards)")
                    .font(GFont.ui(10, weight: .medium))
                    .foregroundColor(p.ink3)
                context.draw(label, at: CGPoint(x: size.width - 28, y: y))
            }

            // Fairway ribbon
            var fairway = Path()
            fairway.move(to: CGPoint(x: centerX - 22, y: teeY))
            fairway.addCurve(
                to: CGPoint(x: centerX - 18, y: greenY + 28),
                control1: CGPoint(x: centerX - 50, y: (teeY + greenY) / 2),
                control2: CGPoint(x: centerX - 8, y: greenY + 90)
            )
            fairway.addLine(to: CGPoint(x: centerX + 18, y: greenY + 28))
            fairway.addCurve(
                to: CGPoint(x: centerX + 22, y: teeY),
                control1: CGPoint(x: centerX + 8, y: greenY + 90),
                control2: CGPoint(x: centerX + 50, y: (teeY + greenY) / 2)
            )
            fairway.closeSubpath()
            context.fill(fairway, with: .color(p.fairway))

            // Green
            context.fill(Path(ellipseIn: CGRect(x: centerX - 22, y: greenY - 16, width: 44, height: 36)), with: .color(p.green))
            context.fill(Path(ellipseIn: CGRect(x: centerX - 2.5, y: greenY - 2.5, width: 5, height: 5)), with: .color(p.primary))

            // Tees
            let inset: CGFloat = 28
            for (index, tee) in tees.enumerated() {
                let t = 1 - CGFloat(Double(tee.1) / max(maxYards, 1))
                let y = greenY + (teeY - greenY) * (0.72 + t * 0.22)
                let x = inset + CGFloat(index) * CGFloat(18)
                context.fill(Path(ellipseIn: CGRect(x: x, y: y, width: 8, height: 8)), with: .color(p.teeColor(tee.0)))
            }
        }
        .overlay(alignment: .bottomLeading) {
            HStack(spacing: 10) {
                ForEach(tees, id: \.0) { name, yards in
                    HStack(spacing: 4) {
                        TeeDot(name: name, size: 7)
                        Text("\(yards)")
                            .font(GType.label)
                            .tabular()
                            .foregroundStyle(p.ink2)
                    }
                }
            }
            .padding(12)
        }
    }
}
