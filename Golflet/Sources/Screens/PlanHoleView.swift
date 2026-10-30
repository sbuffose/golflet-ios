import SwiftUI

struct PlanHoleRoute: Hashable, Sendable {
    var clubCode: String
    var course: String
    var hole: Int
}

struct PlanSetupView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let clubCode: String
    let course: String
    @State private var detail: PlanDetail?
    @State private var map: CourseMap?
    @State private var clubs: [PlanBagEntry] = []
    @State private var hole = 1
    @State private var message: String?

    var body: some View {
        Group {
            if let detail, let map {
                PlanHoleView(detail: detail, map: map, clubs: clubs, hole: $hole)
            } else {
                GScreen(id: "screen-plan-loading") {
                    VStack(alignment: .leading, spacing: 12) {
                        GOverline(text: "Estrategia de juego")
                        GTitle(text: course, size: 30)
                        if let message {
                            Text(message)
                                .font(GType.body)
                                .foregroundStyle(p.negative)
                        } else {
                            Text("Armando el hoyo…")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                    }
                    .padding(20)
                }
                .accessibilityIdentifier("screen-plan-loading")
                .safeAreaInset(edge: .top) { MetricBackBar() }
            }
        }
        .task { await load() }
    }

    private func load() async {
        do {
            let setup = try await model.api.planSetup()
            let today = setup.today.isEmpty ? "2026-10-30" : setup.today
            async let created = model.api.createPlan(clubCode: clubCode, course: course, date: today, teeTime: "09:30", startHole: 1, teeTimeID: nil)
            async let fetchedMap = model.api.courseMap(clubCode: clubCode, course: course)
            async let fetchedClubs = model.api.planClubs()
            detail = try await created
            map = try await fetchedMap
            clubs = try await fetchedClubs
        } catch {
            message = error.localizedDescription
        }
    }
}

struct PlanHoleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    let detail: PlanDetail
    let map: CourseMap
    let clubs: [PlanBagEntry]
    @Binding var hole: Int

    @State private var mode: PlanViewMode = .diseno
    @State private var teeKey: String?
    @State private var firm: PlanFirmness
    @State private var pending: PlanPendingShot?
    @State private var shots: [PlanSavedShot]
    @State private var breakdown: PlanBreakdown?
    @State private var autoPicked = false

    init(detail: PlanDetail, map: CourseMap, clubs: [PlanBagEntry], hole: Binding<Int>) {
        self.detail = detail
        self.map = map
        self.clubs = clubs
        _hole = hole
        _firm = State(initialValue: PlanPreferences.storedFirm(planID: detail.plan.id))
        let current = detail.hole(hole.wrappedValue)
        _shots = State(initialValue: current?.shots ?? [])
    }

    var body: some View {
        GScreen(id: "screen-plan-hole") {
            VStack(spacing: 0) {
                header
                ZStack(alignment: .topLeading) {
                    if let holeMap, let start {
                        PlanHoleMap(
                            hole: holeMap,
                            frame: frame,
                            start: start,
                            shots: shots,
                            pending: pending,
                            landing: landingLL,
                            noWind: noWindLL,
                            suggested: pending?.suggested == true,
                            confirmed: confirmedNumbers,
                            clubName: pending.map { PlanCore.clubName($0.club) } ?? "",
                            mode: mode,
                            onTap: { ll in
                                guard let pending else { return }
                                self.pending = PlanPendingShot(club: pending.club, aimYd: pending.aimYd, suggested: false, to: ll)
                            },
                            onSelectConfirmed: { breakdown = .confirmed($0) }
                        )
                    } else {
                        Text("No tenemos el mapa de este hoyo")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .padding(20)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }
                    overlays
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                strip
            }
        }
        .accessibilityIdentifier("screen-plan-hole")
        .accessibilityElement(children: .contain)
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { pickDefault() }
        .onChange(of: hole) { _, _ in
            shots = planHole?.shots ?? []
            pending = nil
            breakdown = nil
            autoPicked = false
            pickDefault()
        }
    }

    private var planHole: PlanHoleRow? { detail.hole(hole) }
    private var holeMap: CourseMapHole? { map.hole(hole) }
    private var frame: PlanHoleFrame { holeMap.map(PlanGeometry.frame(for:)) ?? PlanHoleFrame(ref: PlanLL(lng: 0, lat: 0), bearing: 0) }
    private var tees: [PlanCardTee] {
        guard let holeMap, let planHole else { return [] }
        return PlanTeeColors.tees(from: holeMap, planHole: planHole, course: detail.course)
    }
    private var selectedTee: PlanCardTee? {
        PlanGeometry.pickTee(from: tees, stored: teeKey, usual: detail.course.usualTee, mapYd: holeMap?.playLengthYd)
    }
    private var start: PlanLL? {
        guard let holeMap else { return nil }
        if let tee = selectedTee, let spot = PlanGeometry.teeSpot(hole: holeMap, frame: frame, yards: tee.yards) {
            return spot
        }
        return holeMap.tees.first?.center ?? holeMap.line.first
    }

    private var usable: [(entry: PlanBagEntry, dist: PlanClubDist)] {
        clubs.compactMap { entry in
            guard let dist = entry.dist(source: detail.plan.distSource) else { return nil }
            return (entry, dist)
        }
    }

    private var calc: Calc {
        compute()
    }

    private var landingLL: PlanLL? {
        if let to = pending?.to { return to }
        if let landing = calc.landing {
            return frame.ll(landing)
        }
        return nil
    }

    private var noWindLL: PlanLL? {
        calc.noWind.map(frame.ll)
    }

    private var confirmedNumbers: [PlanLiveNumbers] {
        guard let holeMap, let start, let planHole, let green = greenXY else { return [] }
        let path = [start] + shots.compactMap(\.to)
        return shots.enumerated().map { index, shot in
            let fromLL = index == 0 ? start : path[index]
            let toLL = shot.to ?? start
            let from = frame.xy(fromLL)
            let to = frame.xy(toLL)
            let entry = usable.first { $0.entry.code.caseInsensitiveCompare(shot.club) == .orderedSame }
            let dd = entry?.dist
            let A = dd.flatMap { !$0.partial && !shot.adjusted ? PlanCore.shotAdjust(normal: $0.yards, input: PlanPlay.adjInput(from: from, to: PlanCore.aimPoint(path: frame.playPath(holeMap), from: from, meters: $0.yards * PlanCore.yardMeters), dist: $0, yards: $0.yards, hole: planHole, firm: firm, locked: detail.torneo.playsLikeLocked)) : nil }
            return PlanPlay.liveNumbers(from: from, landing: to, green: green, entrance: entranceXY, club: shot.club, adjust: A, dist: dd, hole: planHole, firm: firm, locked: detail.torneo.playsLikeLocked)
        }
    }

    private var greenXY: PlanXY? {
        guard let holeMap else { return nil }
        if let c = holeMap.green?.center { return frame.xy(c) }
        return holeMap.line.last.map(frame.xy)
    }

    private var entranceXY: PlanXY? {
        holeMap?.green?.front.map(frame.xy)
    }

    private var header: some View {
        HStack(spacing: 8) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .frame(width: 32, height: 32)
            }
            .accessibilityIdentifier("plan-back")
            VStack(alignment: .leading, spacing: 0) {
                Text("Hoyo \(hole)")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                HStack(spacing: 6) {
                    if let par = planHole?.par {
                        Text("Par \(par)")
                    }
                    if let tee = selectedTee, !detail.torneo.distancesLocked {
                        Text("\(tee.yards) yd")
                    }
                    if let eta = planHole?.eta, !eta.isEmpty {
                        Text(eta)
                    }
                }
                .font(GType.label)
                .tabular()
                .foregroundStyle(p.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            }
            Spacer(minLength: 4)
            if let prev = neighbor(-1) {
                Button("‹\(prev)") { hole = prev }
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("plan-prev")
            }
            if let next = neighbor(1) {
                Button("\(next)›") { hole = next }
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("plan-next")
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
        .background(p.bg)
    }

    private var overlays: some View {
        HStack(alignment: .top, spacing: 8) {
            viewToggle
            if let tee = selectedTee, !detail.torneo.distancesLocked {
                teeChip(tee)
            }
            Spacer(minLength: 0)
        }
        .padding(10)
    }

    private var viewToggle: some View {
        HStack(spacing: 0) {
            toggle("Diseño", .diseno, "plan-view-diseno")
            toggle("Satelital", .satelital, "plan-view-satelital")
        }
        .background(p.surface.opacity(0.94))
        .clipShape(Capsule())
    }

    private func toggle(_ title: String, _ value: PlanViewMode, _ id: String) -> some View {
        Button(title) { mode = value }
            .font(GType.label)
            .foregroundStyle(mode == value ? p.onPrimary : p.ink)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(mode == value ? p.primary : .clear)
            .clipShape(Capsule())
            .accessibilityIdentifier(id)
            .accessibilityAddTraits(mode == value ? .isSelected : [])
    }

    private func teeChip(_ tee: PlanCardTee) -> some View {
        Menu {
            ForEach(tees) { option in
                Button("\(option.name) · \(option.yards) yd") {
                    teeKey = option.key
                    PlanPreferences.storeTee(option.key, clubCode: detail.course.clubCode, course: detail.course.course)
                    pending?.to = nil
                    autoPicked = false
                    pickDefault()
                }
            }
        } label: {
            HStack(spacing: 6) {
                Circle().fill(Color(hex: tee.colorHex)).frame(width: 9, height: 9)
                    .overlay(Circle().stroke(p.ink.opacity(0.35), lineWidth: 0.6))
                Text("\(tee.name) \(tee.yards)")
                    .font(GType.label)
                    .tabular()
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(p.surface.opacity(0.94))
            .clipShape(Capsule())
        }
        .accessibilityIdentifier("plan-tee")
        .accessibilityLabel("Salida: \(tee.name), \(tee.yards) yardas. Cambiar salida")
        .accessibilityElement(children: .contain)
        .overlay(alignment: .topLeading) {
            GProbe(id: "plan-tee", label: "Salida \(tee.name)")
        }
    }

    private var strip: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let breakdown {
                breakdownView(breakdown)
            }
            clubRow
            actionRow
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(p.bg)
    }

    private var clubRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(calc.adjusted, id: \.code) { item in
                    let on = pending?.club == item.code
                    Button {
                        pending = PlanPendingShot(club: item.code, aimYd: 0, suggested: calc.suggestion?.code == item.code, to: nil)
                        breakdown = nil
                    } label: {
                        VStack(spacing: 1) {
                            Text(PlanCore.clubName(item.code))
                                .font(GType.label)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                            Text(item.partial ? "≈\(item.yards)" : "\(item.yards)")
                                .font(GType.label)
                                .tabular()
                        }
                        .foregroundStyle(on ? p.onPrimary : p.ink)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(on ? p.primary : p.surface2)
                        .overlay {
                            if calc.suggestion?.code == item.code {
                                Capsule().stroke(p.accent, lineWidth: 1.4)
                            }
                        }
                        .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("plan-club-\(item.code)")
                }
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 8) {
            if calc.done {
                Text("En el green")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("\(shots.count) \(shots.count == 1 ? "tiro" : "tiros")")
                    .font(GType.label)
                    .tabular()
                    .foregroundStyle(p.ink2)
                Spacer()
            } else if let live = calc.live {
                Button {
                    breakdown = breakdown == .shot ? nil : .shot
                } label: {
                    PlanShotPill(live: live, highlightNew: pending?.suggested == true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("plan-shot-pill")
                Button {
                    breakdown = breakdown == .remain ? nil : .remain
                } label: {
                    Text("→ \(live.remainYards)")
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
                .accessibilityIdentifier("plan-remain")
                Spacer()
                Button("Confirmar") { confirm() }
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(p.primary)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("plan-confirm")
            } else if usable.isEmpty {
                Text("Cargá tus distancias en Mi bolsa")
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("plan-need-bag")
                Spacer()
            } else if usable.allSatisfy({ PlanCore.fitDD($0.dist, remain: calc.remain).partial }) {
                Text("Ningún palo entra completo: cargá palos cortos")
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("plan-no-full")
                Spacer()
            } else {
                Text("\(Int(calc.remain.rounded())) al centro")
                    .font(GType.headline)
                    .tabular()
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("plan-remain-empty")
                Spacer()
            }
            if !shots.isEmpty {
                Button {
                    shots.removeLast()
                    pending = nil
                    autoPicked = false
                    pickDefault()
                    persist()
                } label: {
                    Image(systemName: "arrow.uturn.backward")
                        .font(GType.label)
                        .foregroundStyle(p.ink)
                }
                .accessibilityIdentifier("plan-undo")
            }
        }
    }

    @ViewBuilder
    private func breakdownView(_ target: PlanBreakdown) -> some View {
        let live: PlanLiveNumbers? = {
            switch target {
            case .shot, .remain: return calc.live
            case .confirmed(let i): return confirmedNumbers.indices.contains(i) ? confirmedNumbers[i] : nil
            }
        }()
        if let live {
            VStack(alignment: .leading, spacing: 6) {
                Text(target == .remain ? "Te quedan \(live.remainYards) al centro" : "\(PlanCore.clubName(live.club)) · \(live.shotYards) yd")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                if live.adjust.partial {
                    Text("Tiro a medias: no es un golpe completo. Cargá un palo más corto en Mi bolsa.")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                } else {
                    HStack(spacing: 6) {
                        Text("\(live.adjust.normal)")
                            .font(GType.headline)
                            .tabular()
                            .foregroundStyle(p.accent)
                        Text("normal (Mi bolsa)")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    ForEach(live.adjust.terms, id: \.key) { term in
                        HStack(spacing: 6) {
                            termIcon(term.key)
                            Text(PlanPlay.signed(term.yards))
                                .font(GType.label)
                                .tabular()
                                .foregroundStyle(term.yards < 0 ? p.negative : p.positive)
                            Text(PlanPlay.termLabel(term.key))
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                                .lineLimit(1)
                                .minimumScaleFactor(0.7)
                        }
                    }
                    Text("= \(live.adjust.total) yd estimadas hoy")
                        .font(GType.label)
                        .tabular()
                        .foregroundStyle(p.ink)
                    if target != .confirmed(-1) {
                        firmRow
                    }
                }
            }
            .padding(10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.surface)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityIdentifier("plan-breakdown")
        }
    }

    private var firmRow: some View {
        HStack(spacing: 6) {
            Text("Cancha")
                .font(GType.label)
                .foregroundStyle(p.ink2)
            ForEach(PlanFirmness.allCases, id: \.self) { option in
                Button(option.label) {
                    firm = option
                    PlanPreferences.storeFirm(option, planID: detail.plan.id)
                }
                .font(GType.label)
                .foregroundStyle(firm == option ? p.onPrimary : p.ink)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(firm == option ? p.primary : p.surface2)
                .clipShape(Capsule())
                .accessibilityIdentifier("plan-firm-\(option.rawValue)")
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func termIcon(_ key: String) -> some View {
        Group {
            switch key {
            case "viento": Image(systemName: "wind")
            case "temp": Image(systemName: "thermometer")
            case "lluvia": Image(systemName: "drop")
            case "cancha": Image(systemName: "circle.fill")
            default: Image(systemName: "minus")
            }
        }
        .font(GType.label)
        .foregroundStyle(p.ink2)
    }

    private struct Calc {
        var remain: Double
        var done: Bool
        var suggestion: PlanEvalShot?
        var landing: PlanXY?
        var noWind: PlanXY?
        var live: PlanLiveNumbers?
        var adjusted: [Adj]
    }

    private struct Adj: Hashable {
        var code: String
        var yards: Int
        var partial: Bool
    }

    private func compute() -> Calc {
        guard let holeMap, let start, let planHole, let green = greenXY else {
            return Calc(remain: 0, done: false, suggestion: nil, landing: nil, noWind: nil, live: nil, adjusted: [])
        }
        let ballLL = shots.last?.to ?? start
        let ball = frame.xy(ballLL)
        let remain = PlanCore.dist(ball, green) / PlanCore.yardMeters
        let onGreen = (holeMap.green?.polygon.isEmpty == false && PlanCore.inPoly(ball, holeMap.green!.polygon.map(frame.xy)))
            || PlanCore.dist(ball, green) / PlanCore.yardMeters < 6
        let path = frame.playPath(holeMap)
        let hz = PlanGeometry.hazards(holeMap, frame: frame)
        let adjusted = usable.map { item -> Adj in
            let fit = PlanCore.fitDD(item.dist, remain: remain)
            let aim = PlanCore.aimPoint(path: path, from: ball, meters: fit.yards * PlanCore.yardMeters)
            let A = fit.partial || detail.torneo.playsLikeLocked ? nil : PlanCore.shotAdjust(normal: fit.yards, input: PlanPlay.adjInput(from: ball, to: aim, dist: fit, yards: fit.yards, hole: planHole, firm: firm, locked: detail.torneo.playsLikeLocked))
            return Adj(code: item.entry.code, yards: A?.total ?? Int(fit.yards.rounded()), partial: fit.partial)
        }
        let suggestion = (!onGreen && !usable.isEmpty && !detail.torneo.recommendationsLocked)
            ? PlanCore.suggestShot(
                ball: ball,
                green: green,
                path: path,
                clubs: usable.map { ($0.entry.code, $0.dist) },
                wind: planHole.wind,
                hazards: hz,
                first: shots.isEmpty
            )
            : nil
        var landing: PlanXY?
        var noWind: PlanXY?
        var live: PlanLiveNumbers?
        if let pending, let u = usable.first(where: { $0.entry.code == pending.club }) {
            let dd = PlanCore.fitDD(u.dist, remain: remain)
            let aim = PlanCore.aimPoint(path: path, from: ball, meters: dd.yards * PlanCore.yardMeters)
            let comp = planHole.wind.map { PlanCore.windComp(bearing: PlanCore.bearingXY(ball, aim), wind: $0) }
            let baseLat = (dd.kind == .oval ? (dd.mean?.lat ?? 0) : 0) + Double(pending.aimYd)
            let A = dd.partial || detail.torneo.playsLikeLocked ? nil : PlanCore.shotAdjust(normal: dd.yards, input: PlanPlay.adjInput(from: ball, to: aim, dist: dd, yards: dd.yards, hole: planHole, firm: firm, locked: detail.torneo.playsLikeLocked))
            let fwd = A?.total ?? Int(dd.yards.rounded())
            let windLat = comp.map { PlanCore.applyWind(fwd: dd.yards, lat: baseLat, comp: $0).lat } ?? baseLat
            noWind = PlanCore.offsetPoint(from: ball, aim: aim, fwdYd: dd.yards, latYd: baseLat)
            landing = pending.to.map(frame.xy) ?? PlanCore.offsetPoint(from: ball, aim: aim, fwdYd: Double(fwd), latYd: windLat)
            if let landing {
                live = PlanPlay.liveNumbers(from: ball, landing: landing, green: green, entrance: entranceXY, club: pending.club, adjust: pending.to == nil ? A : nil, dist: dd, hole: planHole, firm: firm, locked: detail.torneo.playsLikeLocked)
            }
        }
        return Calc(remain: remain, done: onGreen && !shots.isEmpty, suggestion: suggestion, landing: landing, noWind: noWind, live: live, adjusted: adjusted)
    }

    private func pickDefault() {
        guard !autoPicked, pending == nil, !calc.done else { return }
        let bag = usable
        let choice = PlanCore.autoSelect(
            suggestion: calc.suggestion,
            clubs: calc.adjusted.map { item in
                let dist = bag.first { $0.entry.code == item.code }?.dist
                    ?? PlanClubDist(kind: .point, yards: Double(item.yards), carry: nil, mean: nil, cov: nil, used: "libreto", note: nil, partial: item.partial)
                return (code: item.code, dist: dist, adjusted: Double(item.yards))
            },
            remain: calc.remain
        )
        if let choice {
            pending = PlanPendingShot(club: choice.code, aimYd: choice.aimYd, suggested: choice.suggested, to: nil)
            autoPicked = true
        }
    }

    private func confirm() {
        guard let to = landingLL, let pending else { return }
        shots.append(PlanSavedShot(club: pending.club, source: detail.plan.distSource, to: to, yardsFromTee: nil, adjusted: pending.to != nil, suggested: pending.suggested, aimYd: pending.aimYd == 0 ? nil : pending.aimYd))
        self.pending = nil
        breakdown = nil
        autoPicked = false
        pickDefault()
        persist()
    }

    private func persist() {
        let id = detail.plan.id
        let n = hole
        let body = shots
        Task { _ = try? await model.api.savePlanShots(id: id, hole: n, shots: body) }
    }

    private func neighbor(_ delta: Int) -> Int? {
        let ordered = detail.holes.sorted { $0.order < $1.order }.map(\.hole)
        guard let i = ordered.firstIndex(of: hole) else { return nil }
        let j = i + delta
        return ordered.indices.contains(j) ? ordered[j] : nil
    }
}

struct PlanShotPill: View {
    @Environment(\.palette) private var p
    let live: PlanLiveNumbers
    var highlightNew = false

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("\(PlanCore.clubName(live.club)) · \(live.shotYards)")
                .font(GType.headline)
                .tabular()
                .foregroundStyle(p.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            HStack(spacing: 4) {
                Text("\(live.adjust.normal)")
                    .font(GType.label)
                    .tabular()
                    .foregroundStyle(p.accent)
                ForEach(live.adjust.terms, id: \.key) { term in
                    HStack(spacing: 2) {
                        Image(systemName: icon(term.key))
                            .font(.system(size: 9, weight: .semibold))
                        Text(PlanPlay.signed(term.yards))
                            .font(GType.label)
                            .tabular()
                    }
                    .foregroundStyle(term.yards < 0 ? p.negative : p.positive)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(highlightNew ? p.accentSoft : p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(PlanCore.clubName(live.club)), \(live.shotYards) yardas")
    }

    private func icon(_ key: String) -> String {
        switch key {
        case "viento": return "wind"
        case "temp": return "thermometer"
        case "lluvia": return "drop"
        case "cancha": return "circle.fill"
        default: return "minus"
        }
    }
}
