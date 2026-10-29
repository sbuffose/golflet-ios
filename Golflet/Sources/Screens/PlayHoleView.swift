import SwiftUI
import UIKit

struct PlayHoleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    let course: GPSCourseDetail
    @State var liveRound: LiveRound
    @State private var location = PlayLocation()
    @State private var shots: [Shot] = []
    @State private var hole: Int
    @State private var phase: Phase = .ready
    @State private var lastDraft: ShotDraft?
    @State private var lastShot: Shot?
    @State private var message: String?
    @State private var showsHoles = false
    @State private var showsStrategy = false
    @State private var strategy: CourseStrategy?
    @State private var lastManualChange = Date.distantPast
    @State private var pendingAdvance: Int?
    @State private var pace = PaceConfig.fallback
    @State private var paceSession: PaceSession?
    @State private var showsPaceAlert = false
    @State private var paceAlertText = ""
    @State private var holeRecords: [Int: LiveHoleRecord] = [:]
    @State private var draftPutts: [Int: Int] = [:]
    @State private var pinStep: PinStep = .idle

    private enum PinStep: Equatable {
        case idle
        case zone(LivePin, PinZone?)
        case report
    }

    enum Phase { case ready, pickClub, pickResult }

    init(course: GPSCourseDetail, liveRound: LiveRound) {
        self.course = course
        _liveRound = State(initialValue: liveRound)
        _hole = State(initialValue: liveRound.currentHole)
    }

    var body: some View {
        GScreen(id: "screen-play-hole") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    distances
                    compactStrategy
                    accuracy
                    hitButton
                    if phase != .ready { clubGrid }
                    if phase == .pickResult { resultGrid }
                    driveSide
                    greenTools
                    holeShots
                    footer
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-play-hole")
        .background(p.bg.ignoresSafeArea())
        .task {
            UIApplication.shared.isIdleTimerDisabled = true
            location.start()
            model.rememberPlay(course: course, round: liveRound)
            if let here = location.coordinate {
                OfflinePlay.saveLastGPS(here, accuracy: location.accuracyM)
            }
            await refresh()
            if let cached = CourseCache.load(courseId: course.courseId)?.strategy {
                strategy = cached
            }
            if let remote = try? await model.api.courseStrategy(courseKey: course.courseKey, courseId: course.courseId) {
                strategy = remote
                CourseCache.save(detail: course, strategy: remote)
            }
            RoundLiveActivity.start(course: course, liveRound: liveRound, here: location.coordinate, shots: shots)
            beginPace()
            await loadPaceEstimate()
            await refreshLivePace()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            location.stop()
        }
        .onChange(of: location.coordinate?.lat) { _, _ in
            if let here = location.coordinate {
                OfflinePlay.saveLastGPS(here, accuracy: location.accuracyM)
            }
            refreshLiveActivity()
            maybeAdvance()
        }
        .alert(
            "¿Pasamos al hoyo \(pendingAdvance ?? (hole + 1))?",
            isPresented: Binding(
                get: { pendingAdvance != nil },
                set: { if !$0 { pendingAdvance = nil } }
            )
        ) {
            Button("Pasar al hoyo") {
                if let next = pendingAdvance {
                    changeHole(next)
                }
                pendingAdvance = nil
            }
            .accessibilityIdentifier("play-advance-confirm")
            Button("Seguir acá", role: .cancel) {
                lastManualChange = Date()
                pendingAdvance = nil
            }
            .accessibilityIdentifier("play-advance-stay")
        } message: {
            Text("El GPS te ubica en el tee siguiente. Confirmá para cambiar de hoyo.")
        }
        .sheet(isPresented: $showsHoles) { holePicker }
        .sheet(isPresented: $showsStrategy) { strategySheet }
        .alert("Ritmo de juego", isPresented: $showsPaceAlert) {
            Button("Listo", role: .cancel) {}
                .accessibilityIdentifier("pace-alert-ok")
        } message: {
            Text(paceAlertText)
        }
        .overlay {
            if showsPaceAlert {
                GProbe(id: "pace-alert", label: paceAlertText)
            }
        }
    }

    private var current: GPSHole? {
        course.holes.first { $0.number == hole }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                GOverline(text: "Ronda con GPS")
                Text(course.course)
                    .font(GType.sheetTitle)
                    .tracking(-1.2)
                    .foregroundStyle(p.ink)
                    .minimumScaleFactor(0.7)
                    .lineLimit(1)
                Text("\(FormatAR.longDate(Date())) · \(course.clubName)")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .lineLimit(1)
            }
            Spacer()
            Button { model.showsPlay = false } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.ink2)
                    .frame(width: 32, height: 32)
                    .background(p.surface)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("play-close")
        }
    }

    private var distances: some View {
        let here = location.coordinate
        let green = current?.green
        return GCard(radius: 28, padding: 20) {
            VStack(spacing: 16) {
                HStack {
                    Button { changeHole(hole - 1) } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 36, height: 36)
                    }
                    .accessibilityIdentifier("play-hole-prev")
                    Spacer()
                    Button { showsHoles = true } label: {
                        VStack(spacing: 2) {
                            Text("Hoyo \(hole)")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            if let par = current?.par {
                                Text("Par \(par)")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("play-hole-picker")
                    Spacer()
                    Button { changeHole(hole + 1) } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 36, height: 36)
                    }
                    .accessibilityIdentifier("play-hole-next")
                }
                distanceValues(here: here, green: green)
            }
        }
    }

    @ViewBuilder
    private func distanceValues(here: GPSCoord?, green: GPSGreen?) -> some View {
        let front = yards(from: here, to: green?.front)
        let center = yards(from: here, to: green?.center)
        let back = yards(from: here, to: green?.back)
        if PlayMath.isFar(front) || PlayMath.isFar(center) || PlayMath.isFar(back) {
            Text("Estás lejos de la cancha")
                .font(GType.headline)
                .foregroundStyle(p.ink)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .accessibilityIdentifier("distance-far")
        } else {
            if let day = holeRecord?.dayPin {
                Text(day.headline)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier("play-day-pin-dist")
            }
            HStack(alignment: .bottom, spacing: 8) {
                yardCell("Adelante", front, id: "distance-front")
                if let day = holeRecord?.dayPin {
                    yardCell("A la bandera", yards(from: here, to: day.coord), id: "distance-pin", hero: true)
                } else {
                    yardCell("Al centro", center, id: "distance-center", hero: true)
                }
                yardCell("Fondo", back, id: "distance-back")
            }
        }
    }

    private func yardCell(_ label: String, _ value: Int?, id: String, hero: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(label.uppercased())
                .font(GType.overline)
                .foregroundStyle(p.ink3)
            Text(value.map(String.init) ?? "—")
                .font(hero ? GFont.ui(52, weight: .semibold) : GType.statL)
                .tabular()
                .foregroundStyle(p.ink)
                .minimumScaleFactor(0.55)
                .lineLimit(1)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier(id)
            Text("yd")
                .font(GType.label)
                .foregroundStyle(p.ink2)
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var compactStrategy: some View {
        if let hole = strategy?.hole(hole) {
            Button { showsStrategy = true } label: {
                GCard(radius: 22, padding: 16) {
                    VStack(alignment: .leading, spacing: 12) {
                        StrategyHoleCard(hole: hole, courseKey: course.courseKey, compact: true)
                        Text("Ver plan")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(p.primary)
                            .clipShape(Capsule())
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("strategy-compact")
        }
    }

    private var strategySheet: some View {
        NavigationStack {
            GScreen(id: "screen-strategy-hole") {
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 16) {
                        if let holePlan = strategy?.hole(hole) {
                            StrategyHoleCard(
                                hole: holePlan,
                                courseKey: course.courseKey,
                                warning: StrategyCopy.siteWarning(courseKey: course.courseKey, hole: hole)
                            )
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 8)
                    .padding(.bottom, 28)
                }
            }
            .safeAreaInset(edge: .top) {
                HStack {
                    Spacer()
                    Button { showsStrategy = false } label: {
                        Image(systemName: "xmark")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(p.ink2)
                            .frame(width: 32, height: 32)
                            .background(p.surface)
                            .clipShape(Circle())
                    }
                    .accessibilityIdentifier("close-strategy")
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
            }
            .metricDestinations()
        }
        .golfletChrome()
        .environment(model)
    }

    private var accuracy: some View {
        HStack {
            Circle()
                .fill((location.accuracyM ?? 99) <= 8 ? p.positive : p.accent)
                .frame(width: 8, height: 8)
            Text(location.accuracyM.map { "GPS ±\(Int($0.rounded())) m" } ?? "Buscando GPS…")
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier("play-accuracy")
            Spacer()
            Text("\(shots.filter { $0.hole == hole }.count) golpes")
                .font(GType.label)
                .tabular()
                .foregroundStyle(p.ink3)
        }
    }

    private var hitButton: some View {
        Button {
            Task { await hit() }
        } label: {
            Text("Ya pegué")
                .font(GFont.ui(28, weight: .semibold))
                .foregroundStyle(p.onPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Ya pegué")
        .accessibilityIdentifier("play-hit")
        .accessibilityLabel("Ya pegué")
        .disabled(location.coordinate == nil)
    }

    private var clubGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("¿Con qué palo?")
                .font(GType.section)
                .foregroundStyle(p.ink)
            let clubs = model.bag.isEmpty ? DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) } : model.bag
            AdaptiveTileGrid {
                ForEach(clubs) { club in
                    Button {
                        Task { await pickClub(ClubCode.code(for: club.name)) }
                    } label: {
                        Text(ClubCode.code(for: club.name))
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(p.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("club-\(ClubCode.code(for: club.name))")
                }
            }
        }
    }

    private var resultGrid: some View {
        VStack(alignment: .leading, spacing: 14) {
            chipRow("Dirección", [
                ("left", "Izq"),
                ("center", "Centro"),
                ("right", "Der")
            ], current: lastShot?.direction) { value in
                Task { await patch(["direction": value]) }
            }
            chipRow("Largo", [
                ("short", "Corto"),
                ("on", "Justo"),
                ("long", "Largo")
            ], current: lastShot?.length) { value in
                Task { await patch(["length": value]) }
            }
            chipRow("Quedó", [
                ("fairway", "Fairway"),
                ("rough", "Rough"),
                ("bunker", "Bunker"),
                ("green", "Green"),
                ("penalty", "Penalty"),
                ("ob", "OB")
            ], current: lastShot?.result) { value in
                Task { await patch(["result": value]) }
            }
            Button {
                Task { await patch(["mishit": true]) }
            } label: {
                Text("Pegado feo")
                    .font(GType.headline)
                    .foregroundStyle(lastShot?.mishit == true ? p.onPrimary : p.ink)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(lastShot?.mishit == true ? p.negative : p.surface)
                    .clipShape(Capsule())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("result-mishit")
        }
    }

    private func chipRow(_ title: String, _ items: [(String, String)], current: String?, action: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink2)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(items, id: \.0) { item in
                        Button { action(item.0) } label: {
                            Text(item.1)
                                .font(GType.headline)
                                .foregroundStyle(current == item.0 ? p.onPrimary : p.ink)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(current == item.0 ? p.primary : p.surface)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("result-\(item.0)")
                    }
                }
            }
        }
    }

    private var holeShots: some View {
        let rows = shots.filter { $0.hole == hole }.sorted { $0.shotNumber < $1.shotNumber }
        return VStack(alignment: .leading, spacing: 10) {
            Text("Golpes")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if rows.isEmpty {
                Text("Caminá, mirá la distancia y tocá Ya pegué.")
                    .font(GType.body)
                    .foregroundStyle(p.ink3)
            } else {
                GCard(radius: 18, padding: 14) {
                    VStack(spacing: 10) {
                        ForEach(Array(rows.enumerated()), id: \.element.id) { index, shot in
                            HStack {
                                Text("\(shot.shotNumber)")
                                    .font(GType.label)
                                    .tabular()
                                    .foregroundStyle(p.ink3)
                                    .frame(width: 18)
                                Text(shot.club ?? "—")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                    .frame(width: 36, alignment: .leading)
                                Text(RecapCopy.lie(shot.lie ?? (shot.shotNumber == 1 ? "tee" : nil)))
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                if let result = shot.result {
                                    Text(RecapCopy.result(result))
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                                Spacer()
                                Text(shot.distanceYd.map { "\($0) yd" } ?? "—")
                                    .font(GType.headline)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                            }
                            .accessibilityIdentifier("play-shot-\(index)")
                            if index < rows.count - 1 { Hairline() }
                        }
                    }
                }
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let message {
                Text(message)
                    .font(GType.label)
                    .foregroundStyle(p.negative)
            }
            Text("Distancia hasta el golpe siguiente; el último antes del green, hasta el centro del green cuando lo marcaste en green. Yardas.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
            Button {
                Task { await endRound() }
            } label: {
                Text("Terminar ronda")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-end")
        }
    }

    private var holePicker: some View {
        NavigationStack {
            List(course.holes) { item in
                Button {
                    changeHole(item.number)
                    showsHoles = false
                } label: {
                    HStack {
                        Text("Hoyo \(item.number)")
                        Spacer()
                        Text("Par \(item.par)")
                    }
                }
                .accessibilityIdentifier("pick-hole-\(item.number)")
            }
            .navigationTitle("Hoyos")
        }
        .golfletChrome()
    }

    private func yards(from here: GPSCoord?, to target: GPSCoord?) -> Int? {
        guard let here, let target else { return nil }
        return PlayMath.yards(from: here, to: target)
    }

    private var driveShot: Shot? {
        shots.filter { $0.hole == hole && !isPutt($0) }.sorted { $0.shotNumber < $1.shotNumber }.first
    }

    private func isPutt(_ shot: Shot) -> Bool {
        let club = (shot.club ?? "").lowercased()
        return club == "pt" || club == "putter" || shot.lie == "green"
    }

    private var displayedPutts: Int? {
        draftPutts[hole] ?? holeRecords[hole]?.putts
    }

    private var holeRecord: LiveHoleRecord? {
        holeRecords[hole]
    }

    private var pinAction: PinAction {
        if liveRound.endedAt != nil { return .none }
        return holeRecord?.pinAction ?? (holeRecord?.dayPin == nil ? .mark : .none)
    }

    @ViewBuilder
    private var pinCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            if let day = holeRecord?.dayPin {
                Text(day.headline)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("play-pin-marked")
                    .accessibilityLabel(day.headline)
                Text(day.byMe ? "La marcaste vos: la ven todos los que juegan hoy" : PinCopy.usesThis)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("play-day-pin")
            }

            switch pinStep {
            case .zone(let fix, let zone):
                Text(PinCopy.whereOnGreen)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                zoneChips(current: zone) { picked in
                    pinStep = .zone(fix, picked)
                }
                Text(PinCopy.gpsNote(fix.accuracyM))
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { await savePin(fix: fix, zone: zone) }
                } label: {
                    pinButtonLabel(PinCopy.save, primary: true)
                }
                .buttonStyle(.plain)
                .disabled(zone == nil)
                .accessibilityIdentifier("play-pin-save")
                Button {
                    pinStep = .idle
                } label: {
                    pinButtonLabel(PinCopy.cancel, primary: false)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-pin-cancel")

            case .report:
                Text(PinCopy.reportAsk)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(PinCopy.reportFoot)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                Button {
                    Task { await confirmPinReport() }
                } label: {
                    pinButtonLabel(PinCopy.confirm, primary: true)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-pin-report-confirm")
                Button {
                    pinStep = .idle
                } label: {
                    pinButtonLabel(PinCopy.cancel, primary: false)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-pin-cancel")

            case .idle:
                idlePinActions
            }
        }
    }

    @ViewBuilder
    private var idlePinActions: some View {
        switch pinAction {
        case .mark:
            Text(PinCopy.askMark)
                .font(GType.body)
                .foregroundStyle(p.ink2)
                .fixedSize(horizontal: false, vertical: true)
            Button {
                Task { await beginMarkPin() }
            } label: {
                pinButtonLabel(PinCopy.mark, primary: true)
            }
            .buttonStyle(.plain)
            .disabled(location.coordinate == nil)
            .accessibilityIdentifier("play-pin")
            .accessibilityLabel(PinCopy.mark)
            Text(PinCopy.firstToday)
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .fixedSize(horizontal: false, vertical: true)
        case .remark:
            Button {
                Task { await beginMarkPin() }
            } label: {
                pinButtonLabel(PinCopy.remark, primary: false)
            }
            .buttonStyle(.plain)
            .disabled(location.coordinate == nil)
            .accessibilityIdentifier("play-pin-remark")
        case .report:
            Button {
                pinStep = .report
            } label: {
                pinButtonLabel(PinCopy.report, primary: false)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-pin-report")
            Text(PinCopy.usesThis)
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .fixedSize(horizontal: false, vertical: true)
        case .reported:
            Text(PinCopy.reportedFoot)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("play-pin-reported")
                .accessibilityLabel(PinCopy.reported)
        case .none:
            if holeRecord?.dayPin == nil {
                Text(PinCopy.noPin)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func zoneChips(current: PinZone?, pick: @escaping (PinZone) -> Void) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                ForEach(PinZone.allCases, id: \.self) { zone in
                    zoneChip(zone, zone.label, current: current, pick: pick)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(PinZone.allCases, id: \.self) { zone in
                    zoneChip(zone, zone.label, current: current, pick: pick)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("play-pin-zones")
    }

    private func zoneChip(_ zone: PinZone, _ label: String, current: PinZone?, pick: @escaping (PinZone) -> Void) -> some View {
        Button { pick(zone) } label: {
            Text(label)
                .font(GType.headline)
                .foregroundStyle(current == zone ? p.onPrimary : p.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity)
                .background(current == zone ? p.primary : p.surface2)
                .clipShape(Capsule())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("play-pin-zone-\(zone.rawValue)")
        .accessibilityAddTraits(current == zone ? .isSelected : [])
    }

    private func pinButtonLabel(_ title: String, primary: Bool) -> some View {
        Text(title)
            .font(GType.headline)
            .foregroundStyle(primary ? p.onPrimary : p.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(primary ? p.primary : p.surface2)
            .clipShape(Capsule())
            .minimumScaleFactor(0.7)
            .lineLimit(2)
            .multilineTextAlignment(.center)
    }

    @ViewBuilder
    private var driveSide: some View {
        let par = current?.par ?? 4
        if let tee = driveShot, par >= 4 {
            VStack(alignment: .leading, spacing: 10) {
                Text("¿Cómo salió el drive?")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                HStack(spacing: 8) {
                    driveChip("left", "Izq.", current: tee.direction)
                    driveChip("center", "Fairway", current: tee.direction)
                    driveChip("right", "Der.", current: tee.direction)
                }
                Text("Opcional. Si no marcás, lo calculamos con tu golpe siguiente.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("play-drive-side")
        }
    }

    private func driveChip(_ value: String, _ title: String, current: String?) -> some View {
        Button {
            Task { await setDriveDirection(value) }
        } label: {
            Text(title)
                .font(GType.headline)
                .foregroundStyle(current == value ? p.onPrimary : p.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(current == value ? p.primary : p.surface)
                .clipShape(Capsule())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("drive-\(value == "center" ? "fairway" : value)")
    }

    private var greenTools: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("En el green")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text("Putts")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Spacer()
                        HStack(spacing: 12) {
                            Button { adjustPutts(-1) } label: {
                                Text("−")
                                    .font(GType.section)
                                    .foregroundStyle(p.ink)
                                    .frame(width: 36, height: 36)
                                    .background(p.surface2)
                                    .clipShape(Circle())
                            }
                            .buttonStyle(.plain)
                            .disabled((displayedPutts ?? 0) <= 0)
                            .accessibilityIdentifier("play-putts-minus")
                            Text(displayedPutts.map(String.init) ?? "—")
                                .font(GType.statM)
                                .tabular()
                                .foregroundStyle(p.ink)
                                .frame(minWidth: 28)
                                .minimumScaleFactor(0.5)
                                .lineLimit(1)
                                .accessibilityIdentifier("play-putts-value")
                            Button { adjustPutts(1) } label: {
                                Text("+")
                                    .font(GType.section)
                                    .foregroundStyle(p.ink)
                                    .frame(width: 36, height: 36)
                                    .background(p.surface2)
                                    .clipShape(Circle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("play-putts-plus")
                        }
                    }
                    Text("Se guarda al pasar al hoyo siguiente.")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
            }
            GCard(radius: 18, padding: 16) {
                pinCard
            }
        }
    }

    private func adjustPutts(_ delta: Int) {
        let gpsPutts = shots.filter { $0.hole == hole && isPutt($0) }.count
        let current = displayedPutts ?? gpsPutts
        draftPutts[hole] = min(10, max(0, current + delta))
    }

    private func setDriveDirection(_ value: String) async {
        guard let tee = driveShot else { return }
        var body: [String: Any] = [:]
        if tee.direction == value {
            body["direction"] = NSNull()
        } else {
            body["direction"] = value
        }
        await patch(body)
    }

    private func beginMarkPin() async {
        guard let here = location.coordinate else { return }
        pinStep = .zone(LivePin(lat: here.lat, lng: here.lng, accuracyM: location.accuracyM), nil)
    }

    private func savePin(fix: LivePin, zone: PinZone?) async {
        guard let zone else { return }
        do {
            let record = try await model.api.postLiveRoundPin(id: liveRound.id, hole: hole, pin: fix, zone: zone)
            holeRecords[record.number] = record
            pinStep = .idle
            message = "Bandera de hoy guardada: ya la ven todos los que juegan este hoyo."
        } catch {
            await handlePinError(error)
        }
    }

    private func confirmPinReport() async {
        guard let here = location.coordinate else { return }
        do {
            let record = try await model.api.postLiveRoundPinReport(
                id: liveRound.id,
                hole: hole,
                pin: LivePin(lat: here.lat, lng: here.lng, accuracyM: location.accuracyM)
            )
            holeRecords[record.number] = record
            pinStep = .idle
            message = "Reporte enviado. Gracias."
        } catch {
            await handlePinError(error)
        }
    }

    private func handlePinError(_ error: Error) async {
        let status = (error as? GolfletError)?.httpStatus
        if status == 409 || status == 429 {
            await reloadHoles()
            pinStep = .idle
        }
        message = error.localizedDescription
    }

    private func reloadHoles() async {
        if let holes = try? await model.api.liveRoundHoles(id: liveRound.id) {
            holeRecords = Dictionary(uniqueKeysWithValues: holes.map { ($0.number, $0) })
        }
    }

    private func savePuttsIfNeeded() async {
        guard let value = draftPutts[hole], value != holeRecords[hole]?.putts else { return }
        do {
            let record = try await model.api.putLiveRoundHole(id: liveRound.id, hole: hole, putts: value)
            holeRecords[record.number] = record
            draftPutts[hole] = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func changeHole(_ next: Int) {
        Task { await changeHoleAsync(next) }
    }

    private func changeHoleAsync(_ next: Int) async {
        await savePuttsIfNeeded()
        let clamped = min(max(next, 1), max(course.holes.count, 1))
        hole = clamped
        pinStep = .idle
        lastManualChange = Date()
        phase = .ready
        PlayHaptics.holeChange()
        OfflinePlay.saveActive(roundId: liveRound.id, courseId: course.courseId, hole: clamped, courseName: course.course)
        refreshLiveActivity()
        updatePace { $0.enter(hole: clamped) }
        Task { await syncHoleAndPace(clamped) }
    }

    private func maybeAdvance() {
        let nextNumber = HoleAdvance.nextHole(after: hole, holeCount: course.holes.count)
        let next = course.holes.first { $0.number == nextNumber }
        guard HoleAdvance.shouldOffer(
            lastManual: lastManualChange,
            currentHole: hole,
            shotHoles: Set(shots.map(\.hole)),
            here: location.coordinate,
            nextTee: next?.tee
        ) else { return }
        pendingAdvance = nextNumber
    }

    private func refreshLiveActivity() {
        RoundLiveActivity.update(course: course, hole: hole, here: location.coordinate, shots: shots)
    }

    private func hit() async {
        guard let here = location.coordinate else { return }
        let draft = ShotDraft(
            clientId: String(UUID().uuidString.prefix(32)),
            hole: hole,
            lat: here.lat,
            lng: here.lng,
            accuracyM: location.accuracyM,
            takenAt: Date(),
            club: nil,
            lie: shots.contains(where: { $0.hole == hole }) ? nil : "tee",
            result: nil,
            direction: nil,
            length: nil,
            mishit: false,
            liveRoundId: liveRound.id
        )
        lastDraft = draft
        ShotQueue.enqueue(draft)
        PlayHaptics.shot()
        updatePace { $0.markStart(draft.takenAt) }
        do {
            let posted = try await model.api.postShots(liveRoundId: liveRound.id, drafts: [draft])
            ShotQueue.remove(clientIds: [draft.clientId])
            shots = posted
            lastShot = posted.last { $0.clientId == draft.clientId } ?? posted.last
            phase = .pickClub
        } catch {
            message = "Sin red. El golpe quedó en cola."
            shots.append(Shot(
                id: draft.clientId,
                clientId: draft.clientId,
                hole: draft.hole,
                shotNumber: shots.filter { $0.hole == hole }.count + 1,
                lat: draft.lat,
                lng: draft.lng,
                accuracyM: draft.accuracyM,
                takenAt: draft.takenAt,
                club: draft.club,
                lie: draft.lie,
                result: draft.result,
                direction: draft.direction,
                length: draft.length,
                mishit: draft.mishit,
                distanceM: nil,
                distanceYd: nil,
                toGreenYd: nil
            ))
            phase = .pickClub
        }
        refreshLiveActivity()
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-next-tee") {
            location.coordinate = GPSCoord(lat: -34.485427 + 0.00055, lng: -58.532351 + 0.00042)
            location.accuracyM = 4
            maybeAdvance()
        }
    }

    private func pickClub(_ code: String) async {
        await patch(["club": code])
        phase = .pickResult
    }

    private func patch(_ body: [String: Any]) async {
        if let shot = lastShot {
            do {
                lastShot = try await model.api.patchShot(id: shot.id, body: body)
                if let updated = lastShot, let index = shots.firstIndex(where: { $0.id == updated.id }) {
                    shots[index] = updated
                }
                return
            } catch {
                message = error.localizedDescription
            }
        }
        if let client = lastDraft?.clientId {
            ShotQueue.update(clientId: client) { draft in
                if let club = body["club"] as? String { draft.club = club }
                if let result = body["result"] as? String { draft.result = result }
                if body["direction"] is NSNull {
                    draft.direction = nil
                } else if let direction = body["direction"] as? String {
                    draft.direction = direction
                }
                if let length = body["length"] as? String { draft.length = length }
                if let mishit = body["mishit"] as? Bool { draft.mishit = mishit }
            }
        }
    }

    private func refresh() async {
        if let detail = try? await model.api.liveRound(id: liveRound.id) {
            liveRound = detail.liveRound
            shots = detail.shots
        }
        if let holes = try? await model.api.liveRoundHoles(id: liveRound.id) {
            holeRecords = Dictionary(uniqueKeysWithValues: holes.map { ($0.number, $0) })
        }
    }

    private func endRound() async {
        await savePuttsIfNeeded()
        _ = try? await model.api.patchLiveRound(id: liveRound.id, body: ["ended": true])
        await model.endPlay(recapLiveRoundId: liveRound.id)
    }

    private func beginPace() {
        let start = liveRound.startedAt
            ?? shots.compactMap(\.takenAt).min()
            ?? Date()
        paceSession = PaceSessionStore.make(roundId: liveRound.id, startedAt: start, hole: hole)
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-pace-late") {
            updatePace { $0.startedAt = Date().addingTimeInterval(-3 * 3600) }
        }
        if let minutes = course.minutesPerHole {
            pace = PaceConfig(
                minutesPerHole: minutes,
                players: liveRound.players,
                modality: liveRound.modality,
                source: "course"
            )
        }
    }

    private func loadPaceEstimate() async {
        if let remote = try? await model.api.paceConfig(
            courseId: course.courseId,
            clubCode: course.clubCode,
            players: liveRound.players,
            modality: liveRound.modality
        ), remote.source != "fallback" {
            pace = remote
        }
    }

    private func syncHoleAndPace(_ hole: Int) async {
        _ = try? await model.api.patchLiveRound(id: liveRound.id, body: [
            "current_hole": hole,
            "players": liveRound.players,
            "modality": liveRound.modality
        ])
        await refreshLivePace()
    }

    private func refreshLivePace() async {
        do {
            let remote = try await model.api.liveRoundPace(id: liveRound.id)
            guard remote.alertDue else { return }
            let text = PaceParser.optionalString(remote.alertText)
                ?? PaceEngine.fallbackAlertText(elapsed: remote.elapsedMin, expected: remote.expectedMin)
            paceAlertText = text
            showsPaceAlert = true
            updatePace { $0.alertedHole10 = true }
            _ = try? await model.api.markPaceAlerted(id: liveRound.id)
        } catch {
            evaluatePaceFallback()
        }
    }

    private func updatePace(_ edit: (inout PaceSession) -> Void) {
        guard var session = paceSession else { return }
        edit(&session)
        paceSession = session
        PaceSessionStore.save(session)
    }

    private func evaluatePaceFallback() {
        guard let session = paceSession else { return }
        guard PaceEngine.shouldAlert(
            hole: hole,
            startedAt: session.startedAt,
            minutesPerHole: pace.minutesPerHole,
            alertEnabled: model.playSettings.paceAlertEnabled,
            alreadyAlerted: session.alertedHole10
        ) else { return }
        let elapsed = PaceEngine.elapsedMinutes(from: session.startedAt, now: Date())
        let expected = PaceEngine.expectedMinutes(holesReached: hole, minutesPerHole: pace.minutesPerHole)
        paceAlertText = PaceEngine.fallbackAlertText(elapsed: elapsed, expected: expected)
        updatePace { $0.alertedHole10 = true }
        showsPaceAlert = true
    }
}
