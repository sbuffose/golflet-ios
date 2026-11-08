import MapKit
import SwiftUI
import UIKit

struct PlayHoleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let course: GPSCourseDetail
    @State var liveRound: LiveRound
    @State private var location = PlayLocation()
    @State private var shots: [Shot] = []
    @State private var hole: Int
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
    @State private var markMode: MarkMode = .track
    @State private var mapCenter: GPSCoord?
    @State private var aimTarget: GPSCoord?
    @State private var track = TrackSession.State()
    @State private var chosenClub: String?
    @State private var waterAsk = false
    @State private var droppedClientIDs: Set<String> = []

    private enum MarkMode { case aim, track }

    private enum PinStep: Equatable {
        case idle
        case zone(LivePin, PinZone?)
        case report
    }

    init(course: GPSCourseDetail, liveRound: LiveRound) {
        self.course = course
        _liveRound = State(initialValue: liveRound)
        _hole = State(initialValue: liveRound.currentHole)
    }

    var body: some View {
        ZStack {
            holeMap
                .ignoresSafeArea()
            reticle
                .allowsHitTesting(false)
            VStack(spacing: 8) {
                topBar
                HStack(alignment: .top) {
                    shotRail
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 6) {
                        if showsWind {
                            windChip
                        }
                        if liveRound.modality == "match" || liveRound.modality == "fourball" {
                            matchChip
                        }
                    }
                }
                .padding(.horizontal, 12)
                Spacer(minLength: 0)
                compactStrategy
                    .padding(.horizontal, 12)
                dock
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .accessibilityIdentifier("screen-play-hole")
        .background(Color.black.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .toolbar(.hidden, for: .tabBar)
        .task {
            UIApplication.shared.isIdleTimerDisabled = true
            location.start()
            model.rememberPlay(course: course, round: liveRound)
            if let here = location.coordinate {
                OfflinePlay.saveLastGPS(here, accuracy: location.accuracyM)
            }
            RoundLiveActivity.start(
                course: course,
                liveRound: liveRound,
                here: location.coordinate,
                shots: shots,
                practice: showsWind,
                headingDeg: location.headingDeg
            )
            await refresh()
            if let cached = CourseCache.load(courseId: course.courseId)?.strategy {
                strategy = cached
            }
            if let remote = try? await model.api.courseStrategy(courseKey: course.courseKey, courseId: course.courseId) {
                strategy = remote
                CourseCache.save(detail: course, strategy: remote)
            }
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
        .onChange(of: location.headingDeg) { _, _ in
            refreshLiveActivity()
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

    private var pinCoord: GPSCoord {
        holeRecord?.dayPin?.coord ?? current?.green.center ?? current?.tee ?? GPSCoord(lat: -34.48, lng: -58.53)
    }

    private var teeCoord: GPSCoord {
        current?.tee ?? pinCoord
    }

    private var playerCoord: GPSCoord {
        let rows = visibleShots.filter { $0.hole == hole }
        if let last = rows.last, let lat = last.lat, let lng = last.lng {
            return GPSCoord(lat: lat, lng: lng)
        }
        return location.coordinate ?? teeCoord
    }

    private var visibleShots: [Shot] {
        shots.filter { shot in
            guard let client = shot.clientId else { return true }
            return !droppedClientIDs.contains(client)
        }
    }

    private var cursor: GPSCoord { mapCenter ?? focusPoint }

    private var landingPoint: GPSCoord { cursor }

    private var focusPoint: GPSCoord {
        switch track.phase {
        case .confirmTee:
            return teeCoord
        case .confirmFlag:
            return pinCoord
        default:
            if let ball = track.ball {
                return GPSCoord(lat: ball.lat, lng: ball.lng)
            }
            return playerCoord
        }
    }

    private var focusID: String {
        let lat = track.ball.map { String(format: "%.5f", $0.lat) } ?? "x"
        return "\(hole)-\(track.phase)-\(track.marks.count)-\(lat)"
    }

    private var markLie: SGLie? {
        HoleGeoMath.lie(course: course, hole: hole, at: landingPoint)
    }

    private var holeMap: some View {
        let geo = HoleGeoMath.rings(course: course, hole: current)
        let played = [teeCoord] + visibleShots.filter { $0.hole == hole }.compactMap { shot -> GPSCoord? in
            guard let lat = shot.lat, let lng = shot.lng else { return nil }
            return GPSCoord(lat: lat, lng: lng)
        }
        return HoleSatelliteMap(
            holeNumber: hole,
            tee: teeCoord,
            pin: pinCoord,
            player: playerCoord,
            target: aimTarget ?? pinCoord,
            shotPoints: played,
            rings: geo.rings,
            line: geo.line.isEmpty ? [teeCoord, pinCoord] : geo.line,
            trackMode: true,
            heading: HoleGeoMath.heading(from: teeCoord, to: pinCoord),
            animateCamera: !reduceMotion,
            focus: focusPoint,
            focusID: focusID,
            onCenter: { next in
                if let mapCenter, abs(mapCenter.lat - next.lat) < 0.0000004, abs(mapCenter.lng - next.lng) < 0.0000004 {
                    return
                }
                mapCenter = next
            },
            onTarget: { aimTarget = $0 }
        )
    }

    private var reticle: some View {
        let penalty = track.phase == .penaltyWhere || track.phase == .relief || track.phase == .drop
        let color = penalty ? Color(hex: BrandHex.red) : Color(hex: BrandHex.navy)
        return ZStack {
            Circle().stroke(color, lineWidth: 3).frame(width: 22, height: 22).background(Circle().fill(Color.white))
            Circle().fill(color).frame(width: 3, height: 3)
        }
        .accessibilityIdentifier("play-reticle")
        .background(Color.clear.accessibilityIdentifier("play-track").frame(width: 1, height: 1))
    }

    private var shotRail: some View {
        let rows = visibleShots.filter { $0.hole == hole }.sorted { $0.shotNumber < $1.shotNumber }
        return VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(rows.enumerated()), id: \.element.id) { _, shot in
                Text("\(shot.shotNumber). \(shot.club ?? "Golpe")")
                    .font(GFont.ui(11, weight: .semibold))
                    .foregroundStyle(p.ink)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.94))
                    .clipShape(Capsule())
            }
            ForEach(track.marks.filter(\.drop)) { mark in
                Text("Drop")
                    .font(GFont.ui(11, weight: .semibold))
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(p.accent)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("play-drop-mark-\(mark.id)")
            }
        }
    }

    private var topBar: some View {
        HStack {
            Button { model.showsPlay = false } label: {
                Image(systemName: "house.fill")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(p.ink)
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.white.opacity(0.96)))
            }
            .accessibilityIdentifier("play-close")
            Spacer()
            Text(course.course)
                .font(GType.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
                .shadow(radius: 2)
            Spacer()
            Color.clear.frame(width: 44, height: 44)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }

    private var windChip: some View {
        Text(location.headingDeg.map { "Rumbo \(Int($0.rounded()))°" } ?? "Sin rumbo de teléfono")
            .font(GFont.ui(12, weight: .semibold))
            .foregroundStyle(p.ink)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(Color.white.opacity(0.94))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("play-wind")
    }

    private var matchChip: some View {
        Text(PaceModality(rawValue: liveRound.modality)?.label ?? "Partido")
            .font(GFont.ui(12, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(p.primary)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .accessibilityIdentifier("play-match")
    }

    private var dock: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 10) {
                Text(statusLine)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .lineLimit(2)
                    .accessibilityIdentifier("play-aim-label")
                distances
                holeNav
                markActions
                greenTools
                holeShots
                accuracy
                Text("El palo lo marca el Apple Watch o el sensor, cuando estén conectados.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("play-club-later")
                footer
            }
            .padding(.horizontal, 16)
            .padding(.top, 10)
            .padding(.bottom, 16)
        }
        .frame(maxHeight: 248)
        .background(Color.white.opacity(0.96))
    }

    private var statusLine: String {
        switch track.phase {
        case .tracking, .penaltyWhere:
            let meters = Double(PlayMath.meters(from: cursor, to: pinCoord))
            if TrackSession.onCup(meters: meters) { return "En el hoyo" }
            if let feet = TrackSession.puttFeet(meters: meters) { return "\(feet) pies al hoyo" }
            return "\(PlayMath.yards(from: playerCoord, to: cursor)) yd · \(track.prompt)"
        default:
            return track.prompt
        }
    }

    @ViewBuilder
    private var markActions: some View {
        switch track.phase {
        case .confirmTee, .confirmFlag, .drop:
            HStack(spacing: 8) {
                if track.phase == .drop {
                    cancelButton
                }
                setButton
            }
        case .relief:
            HStack(spacing: 8) {
                Button("Otra vez") { track = TrackSession.reload(track) }
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(p.accent)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("play-reload")
                Button("Drop") { track = TrackSession.chooseDrop(track) }
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(p.accent)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("play-drop")
                cancelButton
            }
        case .tracking, .penaltyWhere:
            HStack(spacing: 8) {
                if track.phase == .tracking {
                    Button("P") { track = TrackSession.beginPenalty(track) }
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(p.accent))
                        .accessibilityIdentifier("play-penalty")
                } else {
                    cancelButton
                }
                clubMenu
                enterButton
            }
        }
    }

    private var setButton: some View {
        Button {
            let point = TrackPoint(lat: cursor.lat, lng: cursor.lng)
            track = TrackSession.set(track, at: point)
        } label: {
            Text("SET")
                .font(GType.headline)
                .foregroundStyle(p.onPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("play-set")
    }

    private var enterButton: some View {
        Button {
            Task { await confirmEnter() }
        } label: {
            Text("ENTER")
                .font(GType.headline)
                .foregroundStyle(p.onPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("play-hit")
        .accessibilityLabel("ENTER")
    }

    private var cancelButton: some View {
        Button("Cancelar") { cancelMark() }
            .font(GType.headline)
            .foregroundStyle(p.ink)
            .accessibilityIdentifier("play-penalty-cancel")
    }

    private var clubMenu: some View {
        Menu {
            Button("Sin palo") { chosenClub = nil }
            ForEach(model.bag, id: \.name) { club in
                Button(club.name) { chosenClub = club.name }
            }
        } label: {
            Text(chosenClub ?? "Palo")
                .font(GType.label)
                .foregroundStyle(p.ink)
                .lineLimit(1)
                .frame(minWidth: 52, minHeight: 40)
                .padding(.horizontal, 8)
                .background(p.surface)
                .clipShape(Capsule())
        }
        .accessibilityIdentifier("play-club")
    }

    private func confirmEnter() async {
        let point = TrackPoint(lat: cursor.lat, lng: cursor.lng)
        let onCup = TrackSession.onCup(meters: Double(PlayMath.meters(from: cursor, to: pinCoord)))
        let outcome = TrackSession.enter(track, at: point, club: chosenClub, onCup: onCup)
        guard outcome.recorded else { return }
        let penalty = outcome.state.marks.last?.penalty == true
        track = outcome.state
        await hit(holed: outcome.holed, penalty: penalty)
    }

    private func cancelMark() {
        let posted = track.phase == .relief || track.phase == .drop
        track = TrackSession.cancel(track)
        if posted { undoLast() }
    }

    private var holeNav: some View {
        HStack {
            Button { changeHole(hole - 1) } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(p.ink)
                    .frame(width: 36, height: 36)
            }
            .accessibilityIdentifier("play-hole-prev")
            Spacer()
            Button { showsHoles = true } label: {
                VStack(spacing: 2) {
                    Text("Hoyo \(hole)")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text(holeChrome)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-hole-picker")
            Spacer()
            Button { changeHole(hole + 1) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(p.ink)
                    .frame(width: 36, height: 36)
            }
            .accessibilityIdentifier("play-hole-next")
        }
    }

    private var holeChrome: String {
        var parts = ["Par \(current?.par ?? 0)"]
        if let yards = current?.yards.values.max() {
            parts.append("\(yards) yd")
        }
        if let hcp = current?.hcp {
            parts.append("Hcp \(hcp)")
        }
        return parts.joined(separator: " · ")
    }

    private var distances: some View {
        distanceValues(here: location.coordinate, green: current?.green)
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
                .font(hero ? GFont.ui(22, weight: .semibold) : GType.headline)
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
                HStack(spacing: 8) {
                    Text(hole.planTitle ?? "Cómo jugar el hoyo")
                        .font(GType.label)
                        .foregroundStyle(p.ink)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Text("Ver")
                        .font(GType.label)
                        .foregroundStyle(p.accent)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.white.opacity(0.96))
                .clipShape(Capsule())
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
            Text("\(visibleShots.filter { $0.hole == hole }.count) golpes")
                .font(GType.label)
                .tabular()
                .foregroundStyle(p.ink3)
        }
    }

    private var holeShots: some View {
        let rows = visibleShots.filter { $0.hole == hole }.sorted { $0.shotNumber < $1.shotNumber }
        return VStack(alignment: .leading, spacing: 10) {
            Text("Golpes")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if rows.isEmpty {
                Text("Arrastrá el mapa o el objetivo y confirmá con ENTER.")
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
                                Text(shot.lie.map { RecapCopy.lie($0) } ?? "—")
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
        aimTarget = nil
        mapCenter = nil
        waterAsk = false
        markMode = .track
        track = TrackSession.State()
        chosenClub = nil
        pinStep = .idle
        lastManualChange = Date()
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

    private var showsWind: Bool {
        model.roundSettings.shows(.viento, mode: model.homeMode)
    }

    private func refreshLiveActivity() {
        RoundLiveActivity.update(
            course: course,
            hole: hole,
            here: location.coordinate,
            shots: shots,
            practice: showsWind,
            headingDeg: location.headingDeg
        )
    }

    private func undoLast() {
        guard let last = visibleShots.filter({ $0.hole == hole }).max(by: { $0.shotNumber < $1.shotNumber }) else { return }
        if let client = last.clientId {
            droppedClientIDs.insert(client)
            ShotQueue.remove(clientIds: [client])
        }
        shots.removeAll { $0.id == last.id }
        refreshLiveActivity()
    }

    private func hit(holed: Bool = false, penalty: Bool = false) async {
        waterAsk = false
        let confirmed = holed && TrackSession.onCup(meters: Double(PlayMath.meters(from: landingPoint, to: pinCoord)))
        let here = confirmed ? pinCoord : landingPoint
        let draft = ShotDraft(
            clientId: String(UUID().uuidString.prefix(32)),
            hole: hole,
            lat: here.lat,
            lng: here.lng,
            accuracyM: location.accuracyM,
            takenAt: Date(),
            club: chosenClub,
            lie: penalty ? SGLie.agua.rawValue : markLie?.rawValue,
            result: confirmed ? "hoyo" : nil,
            direction: nil,
            length: nil,
            mishit: false,
            liveRoundId: liveRound.id
        )
        ShotQueue.enqueue(draft)
        PlayHaptics.shot()
        updatePace { $0.markStart(draft.takenAt) }
        do {
            let posted = try await model.api.postShots(liveRoundId: liveRound.id, drafts: [draft])
            ShotQueue.remove(clientIds: [draft.clientId])
            shots = posted.filter { shot in
                guard let client = shot.clientId else { return true }
                return !droppedClientIDs.contains(client)
            }
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
        }
        refreshLiveActivity()
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-next-tee") {
            location.coordinate = GPSCoord(lat: -34.485427 + 0.00055, lng: -58.532351 + 0.00042)
            location.accuracyM = 4
            maybeAdvance()
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
        do {
            _ = try await model.api.patchLiveRound(id: liveRound.id, body: ["ended": true])
        } catch {
            model.scorecardFetchNote = "No pudimos avisar que terminaste la vuelta. Si había una reserva, la tarjeta se busca a partir de cinco horas después de la salida. El servidor revisa cada quince minutos."
        }
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
