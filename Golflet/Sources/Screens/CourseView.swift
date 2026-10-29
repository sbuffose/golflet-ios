import SwiftUI

struct CourseView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

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
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: model.clubs.first?.name ?? "Golflet")
            GTitle(text: "Cancha")
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
                    Text(title)
                        .font(GType.headline)
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

    private var hero: some View {
        let snap = model.courseSnapshot()
        let courseTitle = CourseDisplay.courseTitle(
            name: snap.course,
            clubCode: selectedClub?.clubCode ?? "",
            clubName: selectedClub?.clubName ?? ""
        )
        return GCard(fill: p.primary, radius: 28, padding: 20) {
            VStack(alignment: .leading, spacing: 10) {
                GOverline(text: "Cancha \(courseTitle) · Par \(snap.par)", color: p.onPrimary.opacity(0.55))
                NavigationLink(value: MetricRoute.roundList(.course(snap.course, title: "Promedio \(snap.course)", sort: .gross))) {
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
                    NavigationLink(value: MetricRoute.roundList(.course(snap.course, title: "Mejor \(snap.course)", sort: .gross))) {
                        mini("Mejor", snap.bestGross.map(String.init) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-course-best")
                    Spacer()
                    NavigationLink(value: MetricRoute.roundList(.course(snap.course, title: "Neto \(snap.course)", sort: .net))) {
                        mini("Neto prom.", snap.averageNet.map(FormatAR.one) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-course-net")
                    Spacer()
                    NavigationLink(value: MetricRoute.roundList(.course(snap.course, title: "\(snap.course) desde 2025", sinceYear: 2025, sort: .gross))) {
                        mini("Desde 2025", snap.since2025Average.map(FormatAR.one) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-course-2025")
                }
                .padding(.top, 8)
            }
        }
    }

    private func mini(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.5))
                MetricChevron(color: p.onPrimary.opacity(0.35))
            }
            Text(value)
                .font(GType.statM)
                .tabular()
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
        let columns = [GridItem(.flexible()), GridItem(.flexible())]
        return LazyVGrid(columns: columns, spacing: 10) {
            ForEach(snap.tees.filter { ["Negro", "Rojo", "Blanco", "Amarillo", "Azul"].contains($0.tee) }) { tee in
                HStack(spacing: 8) {
                    TeeDot(name: tee.tee, size: 10)
                    Text("\(tee.tee) \(FormatAR.one(tee.courseRating)) / \(tee.slope)")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    Spacer()
                }
            }
        }
    }

    private var holes: some View {
        let stats = model.holeStats.first { $0.course.caseInsensitiveCompare(model.selectedCourseName) == .orderedSame }
        let holes = stats?.holes.sorted { $0.number < $1.number } ?? []
        let columns = [GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible()),
                       GridItem(.flexible()), GridItem(.flexible()), GridItem(.flexible())]
        return VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Hoyos")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                HStack(spacing: 6) {
                    Circle().fill(p.negative).frame(width: 6, height: 6)
                    Text("golpes sobre el par")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
            }
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(holes) { hole in
                    Button { model.presentedHole = hole.number } label: {
                        holeCell(hole)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("hole-\(hole.number)")
                }
            }
            Text("En verde oscuro, tus tres hoyos más difíciles.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
    }

    private func holeCell(_ hole: HoleStat) -> some View {
        let hardest = Set(
            (model.holeStats.first { $0.course.caseInsensitiveCompare(model.selectedCourseName) == .orderedSame }?
                .holes.sorted { $0.averageToPar > $1.averageToPar }.prefix(3).map(\.number)) ?? []
        )
        let dark = hardest.contains(hole.number)
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text("\(hole.number)")
                    .font(GFont.ui(16, weight: .semibold))
                    .tabular()
                Spacer()
                Circle()
                    .fill(hole.averageToPar >= 0 ? p.negative : p.positive)
                    .frame(width: 6, height: 6)
            }
            Text("Par \(hole.par)")
                .font(GType.label)
            Text(FormatAR.signedOne(hole.averageToPar))
                .font(GFont.ui(14, weight: .semibold))
                .tabular()
        }
        .foregroundStyle(dark ? p.onPrimary : p.ink)
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 78, alignment: .topLeading)
        .background(dark ? p.primary : p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}
