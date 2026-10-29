import SwiftUI

struct CourseView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var holesWidth: CGFloat = 353

    var body: some View {
        GScreen(id: "screen-cancha") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    coursePills
                    hero
                    strategyCard
                    tees
                    holes
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-cancha")
        .metricDestinations()
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            GOverline(text: model.clubs.first?.name ?? "Golflet")
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    GTitle(text: "Cancha")
                    Text("\(model.courseSnapshot().validCount) \(model.courseSnapshot().validCount == 1 ? "ronda" : "rondas")")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .accessibilityIdentifier("range-count")
                }
                Spacer(minLength: 8)
                RangeMenuButton(
                    range: Binding(
                        get: { model.statsRange },
                        set: { model.setStatsRange($0) }
                    ),
                    count: model.courseSnapshot().validCount
                )
            }
        }
    }

    private var clubGroups: [ClubStatsGroup] {
        CourseGroups.make(from: model.courses)
    }

    private var selectedClub: ClubStatsGroup? {
        clubGroups.first { group in
            group.courses.contains { $0.name.caseInsensitiveCompare(model.selectedCourseName) == .orderedSame }
        } ?? clubGroups.first
    }

    @ViewBuilder
    private var coursePills: some View {
        let groups = clubGroups
        if !groups.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                if groups.count > 1 {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 8) {
                            ForEach(groups) { group in
                                let selected = group.id == selectedClub?.id
                                Button {
                                    if let first = group.courses.first {
                                        model.selectedCourseName = first.name
                                    }
                                } label: {
                                    Text(group.clubName)
                                        .font(GType.headline)
                                        .foregroundStyle(selected ? p.ink : p.ink2)
                                        .padding(.horizontal, 18)
                                        .padding(.vertical, 10)
                                        .background(selected ? p.surface : Color.clear)
                                        .clipShape(Capsule())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("club-filter-\(group.clubCode.isEmpty ? group.groupingKey : group.clubCode)")
                            }
                        }
                        .padding(4)
                        .background(p.surface2)
                        .clipShape(Capsule())
                    }
                }
                if let group = selectedClub, group.courses.count > 1 {
                    courseNamePills(group.courses)
                }
            }
        }
    }

    private func courseNamePills(_ courses: [Course]) -> some View {
        HStack(spacing: 8) {
            ForEach(courses) { course in
                let title = CourseDisplay.courseTitle(name: course.name, clubCode: course.clubCode, clubName: course.clubName)
                let selected = course.name.caseInsensitiveCompare(model.selectedCourseName) == .orderedSame
                Button {
                    model.selectedCourseName = course.name
                } label: {
                    HStack(spacing: 6) {
                        if let color = teeDot(for: title) {
                            Circle().fill(color).frame(width: 8, height: 8)
                        }
                        Text(title)
                            .font(GType.headline)
                            .lineLimit(1)
                    }
                    .foregroundStyle(selected ? p.ink : p.ink2)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(selected ? p.surface : Color.clear)
                    .clipShape(Capsule())
                    .shadow(color: selected ? Color.black.opacity(0.06) : .clear, radius: 8, y: 2)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("filter-\(title.lowercased())")
            }
        }
        .padding(4)
        .background(p.surface2)
        .clipShape(Capsule())
    }

    private func teeDot(for title: String) -> Color? {
        switch title.lowercased() {
        case "azul": return p.teeColor("azul")
        case "colorada": return p.teeColor("colorada")
        default: return nil
        }
    }

    private var hero: some View {
        let snap = model.courseSnapshot()
        let courseTitle = CourseDisplay.courseTitle(
            name: snap.course,
            clubCode: selectedClub?.clubCode ?? "",
            clubName: selectedClub?.clubName ?? ""
        )
        if snap.validCount == 0 {
            return AnyView(RangeEmptyState(range: model.statsRange))
        }
        return AnyView(GCard(fill: p.primary, radius: 28, padding: 20) {
            VStack(alignment: .leading, spacing: 10) {
                GOverline(text: "Cancha \(courseTitle) · Par \(snap.par)", color: p.onPrimary.opacity(0.55))
                NavigationLink(value: chart(.gross, title: "Promedio \(snap.course)", course: snap.course)) {
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(snap.averageGross.map(FormatAR.one) ?? "—")
                            .font(GType.statHero)
                            .tracking(-4.4)
                            .tabular()
                            .foregroundStyle(p.onPrimary)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)
                        Text("gross promedio\nen \(snap.validCount) tarjetas")
                            .font(GType.label)
                            .foregroundStyle(p.onPrimary.opacity(0.6))
                        Spacer(minLength: 4)
                        MetricChevron(color: p.onPrimary.opacity(0.4))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-course-average")
                HStack {
                    NavigationLink(value: chart(.gross, title: "Mejor \(snap.course)", course: snap.course)) {
                        mini("Mejor", snap.bestGross.map(String.init) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-course-best")
                    Spacer()
                    NavigationLink(value: chart(.net, title: "Neto \(snap.course)", course: snap.course)) {
                        mini("Neto prom.", snap.averageNet.map(FormatAR.one) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-course-net")
                    Spacer()
                    NavigationLink(value: chart(.differential, title: "\(snap.course) desde 2025", course: snap.course)) {
                        mini("Desde 2025", snap.since2025Average.map(FormatAR.one) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-course-2025")
                }
                .padding(.top, 8)
            }
        })
    }

    private func chart(_ kind: MetricChartKind, title: String, course: String) -> MetricRoute {
        .chart(MetricChartQuery(title: title, kind: kind, courseName: course, range: model.statsRange))
    }

    private func mini(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.5))
                    .lineLimit(1)
                MetricChevron(color: p.onPrimary.opacity(0.35))
            }
            Text(value)
                .font(GType.statM)
                .tabular()
                .lineLimit(1)
                .foregroundStyle(p.onPrimary)
        }
        .contentShape(Rectangle())
    }

    private var strategyCard: some View {
        NavigationLink(value: MetricRoute.strategy(courseKey: CourseIdentity.key(for: model.selectedCourseName), courseName: model.selectedCourseName)) {
            GCard(radius: 22, padding: 16) {
                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Estrategia")
                        Text("Cómo jugar la cancha")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text("Plan por hoyo, palo de salida y peligros.")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    Spacer()
                    MetricChevron(color: p.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("course-strategy")
    }

    private var tees: some View {
        let snap = model.courseSnapshot()
        let visible = snap.tees.filter { ["Negro", "Rojo", "Blanco", "Amarillo", "Azul"].contains($0.tee) }
        return CourseTeeLegend(tees: visible)
    }

    private var holes: some View {
        let holes = model.holesForCourse(model.selectedCourseName).sorted { $0.number < $1.number }
        let hardest = Set(holes.sorted { $0.averageToPar > $1.averageToPar }.prefix(3).map(\.number))
        return VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Text("Hoyos")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
                    .fixedSize()
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    Circle().fill(p.negative).frame(width: 6, height: 6)
                    Text("golpes sobre el par")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .lineLimit(1)
                }
            }
            CourseHolesGrid(holes: holes, hardest: hardest, width: holesWidth) { number in
                model.presentedHole = number
            }
            .opacity(model.courseSnapshot().validCount == 0 ? 0.35 : 1)
            .background {
                GeometryReader { geo in
                    Color.clear.preference(key: CourseHolesWidthKey.self, value: geo.size.width)
                }
            }
            .onPreferenceChange(CourseHolesWidthKey.self) { width in
                if width > 0 { holesWidth = width }
            }
            Text("En verde oscuro, tus tres hoyos más difíciles.")
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

enum CourseLayout {
    static let holeSpacing: CGFloat = 6
    static let minSixColumnCell: CGFloat = 48

    static func holeColumnCount(forWidth width: CGFloat) -> Int {
        let cell = (width - holeSpacing * 5) / 6
        return cell >= minSixColumnCell ? 6 : 3
    }

    static func holeColumns(forWidth width: CGFloat) -> [GridItem] {
        Array(
            repeating: GridItem(.flexible(), spacing: holeSpacing),
            count: holeColumnCount(forWidth: width)
        )
    }
}

private struct CourseHolesWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

struct CourseTeeLegend: View {
    @Environment(\.palette) private var p
    let tees: [TeeRating]

    var body: some View {
        LazyVGrid(
            columns: [GridItem(.adaptive(minimum: 148), spacing: 10)],
            spacing: 10
        ) {
            ForEach(tees) { tee in
                HStack(spacing: 8) {
                    TeeDot(name: tee.tee, size: 10)
                    Text("\(tee.tee) \(FormatAR.one(tee.courseRating)) / \(tee.slope)")
                        .font(GType.label)
                        .tabular()
                        .foregroundStyle(p.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Spacer(minLength: 0)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("tee-\(tee.tee.lowercased())")
            }
        }
        .accessibilityIdentifier("course-tee-legend")
    }
}

struct CourseHolesGrid: View {
    let holes: [HoleStat]
    let hardest: Set<Int>
    var width: CGFloat
    var onSelect: ((Int) -> Void)?

    var body: some View {
        LazyVGrid(columns: CourseLayout.holeColumns(forWidth: width), spacing: CourseLayout.holeSpacing) {
            ForEach(holes) { hole in
                Button { onSelect?(hole.number) } label: {
                    CourseHoleCell(hole: hole, dark: hardest.contains(hole.number))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("hole-\(hole.number)")
            }
        }
    }
}

struct CourseHoleCell: View {
    @Environment(\.palette) private var p
    let hole: HoleStat
    var dark: Bool

    var body: some View {
        ZStack(alignment: .topTrailing) {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(hole.number)")
                    .font(GFont.ui(15, weight: .semibold))
                    .tabular()
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                Text(FormatAR.signedOne(hole.averageToPar))
                    .font(GFont.ui(16, weight: .semibold))
                    .tabular()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text("P\(hole.par)")
                    .font(GType.overline)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            Circle()
                .fill(hole.averageToPar >= 0 ? p.negative : p.positive)
                .frame(width: 6, height: 6)
                .padding(.top, 1)
                .accessibilityHidden(true)
        }
        .foregroundStyle(dark ? p.onPrimary : p.ink)
        .padding(.horizontal, 6)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .background(dark ? p.primary : p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Hoyo \(hole.number), P\(hole.par), \(FormatAR.signedOne(hole.averageToPar))")
    }
}
