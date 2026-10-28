import SwiftUI

struct StrategyCourseView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let courseKey: String
    let courseName: String
    @State private var strategy: CourseStrategy?
    @State private var message: String?

    var body: some View {
        GScreen(id: "screen-strategy") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    if let overview = strategy?.overview, !overview.isEmpty {
                        GCard(radius: 22, padding: 16) {
                            VStack(alignment: .leading, spacing: 8) {
                                GOverline(text: "La cancha")
                                Text(overview)
                                    .font(GType.body)
                                    .foregroundStyle(p.ink)
                            }
                        }
                    }
                    holes
                    if let message {
                        Text(message)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-strategy")
        .navigationDestination(for: StrategyHoleRoute.self) { route in
            StrategyHoleView(courseKey: route.courseKey, courseName: route.courseName, holeNumber: route.hole)
        }
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task { await load() }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "Cancha \(courseName)")
            GTitle(text: "Cómo jugar la cancha", size: 30)
            if let published = strategy?.publishedHoles, !published.isEmpty {
                Text("\(published.count) hoyos publicados")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
        }
    }

    private var holes: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Hoyos")
                .font(GType.section)
                .foregroundStyle(p.ink)
            ForEach(1...18, id: \.self) { number in
                if let hole = strategy?.hole(number) {
                    NavigationLink(value: StrategyHoleRoute(courseKey: courseKey, courseName: courseName, hole: number)) {
                        holeRow(number: number, title: hole.planTitle ?? "Cómo jugarlo", published: true)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("strategy-hole-\(number)")
                } else {
                    holeRow(number: number, title: "Todavía sin plan", published: false)
                        .accessibilityIdentifier("strategy-hole-\(number)")
                }
            }
        }
    }

    private func holeRow(number: Int, title: String, published: Bool) -> some View {
        GCard(radius: 18, padding: 14) {
            HStack(spacing: 12) {
                Text("\(number)")
                    .font(GType.headline)
                    .tabular()
                    .foregroundStyle(published ? p.onPrimary : p.ink3)
                    .frame(width: 32, height: 32)
                    .background(published ? p.primary : p.surface2)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Hoyo \(number)")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                    Text(title)
                        .font(GType.headline)
                        .foregroundStyle(published ? p.ink : p.ink3)
                        .lineLimit(2)
                }
                Spacer()
                if published { MetricChevron(color: p.ink3) }
            }
        }
    }

    private func load() async {
        do {
            strategy = try await model.api.courseStrategy(courseKey: courseKey, courseId: nil)
        } catch {
            message = error.localizedDescription
        }
    }
}

struct StrategyHoleRoute: Hashable, Sendable {
    var courseKey: String
    var courseName: String
    var hole: Int
}

struct StrategyHoleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let courseKey: String
    let courseName: String
    let holeNumber: Int
    @State private var strategy: CourseStrategy?

    var body: some View {
        GScreen(id: "screen-strategy-hole") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Cancha \(courseName) · Hoyo \(holeNumber)")
                        GTitle(text: "Cómo jugarlo", size: 30)
                    }
                    if let hole = strategy?.hole(holeNumber) {
                        StrategyHoleCard(
                            hole: hole,
                            courseKey: courseKey,
                            warning: StrategyCopy.siteWarning(courseKey: courseKey, hole: holeNumber)
                        )
                    } else {
                        Text("Todavía sin plan.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-strategy-hole")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task { strategy = try? await model.api.courseStrategy(courseKey: courseKey, courseId: nil) }
    }
}

struct StrategyHoleCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let hole: HoleStrategy
    var courseKey: String
    var warning: String?
    var compact = false

    @State private var level: StrategyLevel = .general
    @State private var expandedHazard: String?

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 10 : 16) {
            if let warning = warning ?? StrategyCopy.siteWarning(courseKey: courseKey, hole: hole.hole), !compact {
                Text(warning)
                    .font(GType.label)
                    .foregroundStyle(p.negative)
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(p.accentSoft)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityIdentifier("strategy-warning")
            }
            if compact {
                compactHeader
            } else {
                fullHeader
                chips
                plan
                hazards
                why
                miss
                green
            }
        }
        .onAppear { pickDefaultLevel() }
    }

    private var compactHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                GOverline(text: "Cómo jugarlo")
                Spacer()
                Text("Estrategia")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(p.surface2)
                    .clipShape(Capsule())
            }
            if let title = hole.planTitle {
                Text(title)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("strategy-plan-title")
            }
            HStack(spacing: 8) {
                if let club = hole.resolvedClub(level: level) {
                    clubChip(club)
                }
                if let target = hole.teeTarget {
                    Text(target)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .lineLimit(2)
                }
            }
        }
    }

    private var fullHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                GOverline(text: "Cómo jugarlo")
                Spacer()
                Text("Estrategia")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(p.surface2)
                    .clipShape(Capsule())
            }
            if let title = hole.planTitle {
                Text(title)
                    .font(GFont.ui(22, weight: .semibold))
                    .tracking(-0.6)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("strategy-plan-title")
            }
        }
    }

    private var chips: some View {
        let options = availableLevels
        return Group {
            if options.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(options, id: \.self) { option in
                            Button { level = option } label: {
                                Text(option.chip)
                                    .font(GType.headline)
                                    .foregroundStyle(level == option ? p.onPrimary : p.ink)
                                    .padding(.horizontal, 14)
                                    .padding(.vertical, 8)
                                    .background(level == option ? p.primary : Color.clear)
                                    .overlay {
                                        Capsule().stroke(level == option ? Color.clear : p.hairline, lineWidth: 1)
                                    }
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("strategy-level-\(option.rawValue)")
                        }
                    }
                }
            }
        }
    }

    private var plan: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let club = hole.resolvedClub(level: level) {
                HStack(spacing: 10) {
                    Text("SALIDA")
                        .font(GType.overline)
                        .tracking(1.2)
                        .foregroundStyle(p.ink3)
                    clubChip(club)
                }
            }
            if let target = hole.teeTarget {
                Text(target)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("strategy-target")
            }
            if let text = hole.resolvedPlan(level: level) {
                Text(text)
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("strategy-plan")
            }
        }
    }

    private var hazards: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Peligros")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Text("\(hole.hazards.count)")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(p.surface2)
                    .clipShape(Capsule())
            }
            GCard(radius: 18, padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(hole.hazards.enumerated()), id: \.element.id) { index, hazard in
                        Button {
                            expandedHazard = expandedHazard == hazard.id ? nil : hazard.id
                        } label: {
                            hazardRow(hazard)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("strategy-hazard-\(index)")
                        if index < hole.hazards.count - 1 { Hairline() }
                    }
                }
            }
        }
    }

    private func hazardRow(_ hazard: StrategyHazard) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Circle()
                    .stroke(p.hairline, lineWidth: 1.4)
                    .frame(width: 16, height: 16)
                    .padding(.top, 2)
                Text(hazard.title)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Spacer()
                if let range = hazard.rangeLabel {
                    Text(range)
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                }
            }
            if expandedHazard == hazard.id {
                if let note = hazard.note, !note.isEmpty {
                    Text(note)
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                        .padding(.leading, 26)
                        .accessibilityIdentifier("strategy-hazard-note")
                }
                if let carry = hazard.carryYd {
                    let meters = hazard.carryM.map { " (\($0) m)" } ?? ""
                    Text("Para pasarlo: \(carry) yd de carry\(meters).")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                        .padding(.leading, 26)
                }
            }
        }
        .padding(14)
    }

    @ViewBuilder
    private var why: some View {
        if let why = hole.why, !why.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text("Por qué")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                GCard(radius: 18, padding: 16) {
                    Text(why)
                        .font(GType.body)
                        .foregroundStyle(p.ink)
                        .accessibilityIdentifier("strategy-why")
                }
            }
        }
    }

    @ViewBuilder
    private var miss: some View {
        if hole.missSide != nil || hole.missNote != nil {
            VStack(alignment: .leading, spacing: 8) {
                Text("El error bueno")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                GCard(radius: 18, padding: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        if let side = hole.missSide {
                            Text(StrategyCopy.side(side).isEmpty ? side.capitalized : StrategyCopy.side(side))
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                        }
                        if let note = hole.missNote {
                            Text(note)
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder
    private var green: some View {
        if hole.greenSlope != nil || hole.greenLeave != nil || hole.greenNotes != nil {
            VStack(alignment: .leading, spacing: 8) {
                Text("El green")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                GCard(radius: 18, padding: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        if let slope = hole.greenSlope {
                            labeled("Pendiente", slope)
                        }
                        if let leave = hole.greenLeave {
                            labeled("Dejarla", leave)
                        }
                        if let notes = hole.greenNotes {
                            Text(notes)
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                    }
                }
            }
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink3)
            Text(value)
                .font(GType.headline)
                .foregroundStyle(p.ink)
        }
    }

    private func clubChip(_ name: String) -> some View {
        NavigationLink(value: MetricRoute.clubStats(ClubCode.code(for: name))) {
            Text(name)
                .font(GType.headline)
                .foregroundStyle(p.onPrimary)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(p.primary)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("strategy-club")
    }

    private var availableLevels: [StrategyLevel] {
        var levels: [StrategyLevel] = [.general]
        for level in [StrategyLevel.scratch, .medio, .alto] where hole.variants[level] != nil {
            levels.append(level)
        }
        return levels
    }

    private func pickDefaultLevel() {
        let preferred = StrategyLevel.from(handicap: model.profile.currentHandicap)
        if hole.variants[preferred] != nil {
            level = preferred
        } else {
            level = .general
        }
    }
}
