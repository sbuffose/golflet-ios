import MapKit
import SwiftUI
import UIKit

struct PlayHoleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let course: GPSCourseDetail
    /// Shots already saved when the hole opened. Used until the reload replaces them.
    let openingShots: [Shot]
    @State var liveRound: LiveRound
    @State private var location = PlayLocation()
    @State private var shots: [Shot] = []
    /// True once this screen has its own shot list, so a later undo is not replaced by the opening fixture.
    @State private var receivedShots = false
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
    @State private var shotsExpanded = false
    @State private var showsClubs = false
    @State private var mapZoom = 0
    @State private var cameraNudge = 0
    @State private var editingClosed = false
    @State private var editingShot: Shot?
    @State private var askDeleteShot = false
    @State private var movingShotID: String?
    @State private var recovery = false
    @State private var waterAsk = false
    @State private var droppedClientIDs: Set<String> = []
    @State private var nowWind: WeatherNow?
    @State private var windTried = false
    @State private var windOpen = false
    @State private var windNote = ""
    @State private var teeName = ""
    @State private var teeSource = ""
    @State private var chosenTee: GPSCoord?
    @State private var moveTee = false
    @State private var teeOpen = false

    private enum MarkMode { case aim, track }

    private enum PinStep: Equatable {
        case idle
        case zone(LivePin, PinZone?)
        case report
    }

    init(course: GPSCourseDetail, liveRound: LiveRound, openingShots: [Shot] = []) {
        self.course = course
        self.openingShots = openingShots
        _liveRound = State(initialValue: liveRound)
        _hole = State(initialValue: liveRound.currentHole)
        if !openingShots.isEmpty {
            _shots = State(initialValue: openingShots)
            _receivedShots = State(initialValue: true)
        }
    }

    var body: some View {
        ZStack {
            holeMap
                .ignoresSafeArea()
                .accessibilityHidden(true)
            reticle
                .allowsHitTesting(false)
            if !holeClosed {
                liveReadout
                    .allowsHitTesting(false)
                sideColumn
            }
            if holeClosed {
                closedChrome
            } else {
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
                    .accessibilityElement(children: .contain)
                dock
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            if showsClubs {
                clubCover
            }
        }
        .accessibilityIdentifier("screen-play-hole")
        .overlay(alignment: .topLeading) {
            Text(playStatus)
                .font(.system(size: 1))
                .foregroundStyle(.clear)
                .accessibilityIdentifier("play-hole-status")
                .accessibilityLabel(playStatus)
                .frame(width: 1, height: 1)
                .allowsHitTesting(false)
        }
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
            await loadWind(retry: false)
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
        .sheet(item: $editingShot) { shot in shotEditor(shot) }
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
        .onAppear {
            installClosedFixtureIfNeeded()
            adoptSavedTrackIfNeeded()
            restoreTee()
        }
    }

    private var current: GPSHole? {
        course.holes.first { $0.number == hole }
    }

    private var pinCoord: GPSCoord {
        holeRecord?.dayPin?.coord ?? current?.green.center ?? current?.tee ?? GPSCoord(lat: -34.48, lng: -58.53)
    }

    private var teeCoord: GPSCoord {
        chosenTee ?? current?.tee ?? pinCoord
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
        return "\(hole)-\(track.phase)-\(track.marks.count)-\(lat)-\(cameraNudge)"
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
            framesHole: holeClosed,
            zoom: mapZoom,
            shotMarks: shotPills,
            aimLine: (!holeClosed && (track.phase == .tracking || track.phase == .penaltyWhere)) ? [cursor, pinCoord] : [],
            onCenter: { next in
                if let mapCenter, abs(mapCenter.lat - next.lat) < 0.0000004, abs(mapCenter.lng - next.lng) < 0.0000004 {
                    return
                }
                mapCenter = next
            },
            onTarget: { aimTarget = $0 },
            onTap: { point in
                guard moveTee else { return }
                applyTee(point, name: teeName, source: "jugador", finish: true)
            }
        )
    }

    /// Closed hole, matching the web: score card, shot pills and zoom sit on the map.
    private var closedChrome: some View {
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                Button { model.showsPlay = false } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(p.ink)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color.white))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-close")
                .accessibilityLabel("Volver a la tarjeta")
                Text(course.course)
                    .font(GFont.ui(14, weight: .semibold))
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                    .shadow(color: .black.opacity(0.55), radius: 4, y: 1)
                    .frame(maxWidth: .infinity)
                Color.clear.frame(width: 44, height: 44)
            }
            .padding(.horizontal, 10)
            .padding(.top, 8)

            closeCard
                .frame(maxWidth: .infinity)
                .padding(.top, 8)

            Spacer(minLength: 0)

            HStack(alignment: .bottom, spacing: 8) {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(closedStrokes, id: \.n) { stroke in
                        Text("\(stroke.n). \(stroke.club) · \(stroke.span)")
                            .font(GFont.ui(12, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .fixedSize(horizontal: true, vertical: false)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.white)
                            .clipShape(Capsule())
                            .shadow(color: .black.opacity(0.18), radius: 4, y: 1)
                            .accessibilityIdentifier("play-stroke-\(stroke.n)")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Spacer(minLength: 8)
                VStack(spacing: 8) {
                    mapZoomButton(system: "plus", delta: 1, id: "play-zoom-in", label: "Acercar")
                    mapZoomButton(system: "minus", delta: -1, id: "play-zoom-out", label: "Alejar")
                }
            }
            .padding(.horizontal, 10)
            .padding(.bottom, 8)

            VStack(spacing: 6) {
                Button { changeHole(hole + 1) } label: {
                    Text("Siguiente hoyo")
                        .font(GFont.ui(16, weight: .semibold))
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-next-wide")
                .accessibilityLabel("Siguiente hoyo")
                Button { editingClosed = true } label: {
                    Text("Editar hoyo")
                        .font(GFont.ui(15, weight: .semibold))
                        .foregroundStyle(p.primary)
                        .frame(maxWidth: .infinity, minHeight: 40)
                        .background(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.primary, lineWidth: 1.5))
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-edit-hole")
                .accessibilityLabel("Editar hoyo")
            }
            .padding(.horizontal, 10)
            .accessibilityElement(children: .contain)

            closedNav
                .padding(.horizontal, 10)
                .padding(.top, 8)
                .padding(.bottom, 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var closeCard: some View {
        let parts = closeParts
        let line = [parts.line, parts.vs].compactMap { $0 }.joined(separator: " · ")
        return Text(line)
            .font(GFont.ui(15, weight: .bold))
            .foregroundStyle(Color.white)
            .lineLimit(1)
            .minimumScaleFactor(0.7)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(p.primary.opacity(0.94))
            .clipShape(Capsule())
            .shadow(color: .black.opacity(0.4), radius: 8, y: 4)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("play-aim-label")
    }

    private var closeParts: (line: String, vs: String?) {
        let strokes = activeTrack.strokeCount
        let putts = countedPutts(activeTrack.marks)
        let inCup = activeTrack.marks.contains(where: \.holed)
        let scored = TrackSession.scoredClose(strokes: strokes, putts: putts, inCup: inCup)
        let n = scored.strokes
        let putt = scored.putts.map { "\($0) \($0 == 1 ? "putt" : "putts")" } ?? "Putts sin confirmar"
        let line = "\(n) \(n == 1 ? "golpe" : "golpes") · \(putt)"
        guard let par = current?.par else { return (line, nil) }
        let delta = n - par
        let vs: String
        switch delta {
        case -2: vs = "Águila"
        case -1: vs = "Birdie"
        case 0: vs = "Par"
        case 1: vs = "Bogey"
        case 2: vs = "Doble bogey"
        case 3: vs = "Triple bogey"
        default: vs = delta > 0 ? "\(delta) sobre el par" : "\(abs(delta)) bajo el par"
        }
        return (line, vs)
    }

    private var shotPills: [HoleShotMark] {
        var prev = teeCoord
        var number = 0
        return activeTrack.marks.compactMap { mark in
            let here = GPSCoord(lat: mark.at.lat, lng: mark.at.lng)
            if mark.penalty {
                return HoleShotMark(number: 0, coord: here, label: "x")
            }
            guard mark.countsStroke, !mark.drop else { return nil }
            number += 1
            let meters = Double(PlayMath.meters(from: prev, to: here))
            let pinMeters = Double(PlayMath.meters(from: prev, to: pinCoord))
            let onGreen = !mark.recovery && pinMeters <= 30 && meters <= 55
            let dist: String
            if (isPutter(mark.club) || onGreen), let span = TrackSession.greenToHole(meters: meters), span != "En el hoyo" {
                dist = span
            } else {
                dist = "\(PlayMath.yards(from: prev, to: here)) yd"
            }
            let pill = HoleShotMark(number: number, coord: here, label: "\(number). \(spokenClub(mark.club)) · \(dist)")
            prev = here
            return pill
        }
    }

    private func spokenClub(_ club: String?) -> String {
        let raw = (club ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let key = raw.uppercased()
        if key == "DR" || key == "DRIVER" { return "Driver" }
        if key == "PT" || key == "PUTTER" { return "Putter" }
        if key == "PW" { return "Pitching wedge" }
        if key == "GW" { return "Gap wedge" }
        if key == "AW" { return "Approach wedge" }
        if key == "SW" { return "Sand wedge" }
        if key == "LW" { return "Lob wedge" }
        if let wood = Int(key.dropLast()), key.hasSuffix("W") { return "Madera \(wood)" }
        if let iron = Int(key.dropLast()), key.hasSuffix("I"), key.count == 2 { return "Hierro \(iron)" }
        return raw.isEmpty ? "Golpe" : raw
    }

    private func mapZoomButton(system: String, delta: Int, id: String, label: String) -> some View {
        Button {
            mapZoom = min(18, max(-2, mapZoom + delta))
        } label: {
            Image(systemName: system)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(Color(hex: 0xF6F7F9))
                .frame(width: 44, height: 44)
                .background(Circle().fill(p.primary.opacity(0.92)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        .accessibilityLabel(label)
    }

    private var closedNav: some View {
        HStack {
            Button { changeHole(hole - 1) } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 32, height: 32)
            }
            .accessibilityIdentifier("play-hole-prev")
            Spacer(minLength: 4)
            Button { showsHoles = true } label: {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text("Hoyo \(hole)")
                        .font(GFont.ui(13, weight: .semibold))
                    Text(holeChrome)
                        .font(GFont.ui(13, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-hole-picker")
            Spacer(minLength: 4)
            Button {
                editingClosed = true
                track = TrackSession.beginPenalty(track)
            } label: {
                Text("P+1")
                    .font(GFont.ui(12, weight: .bold))
                    .foregroundStyle(Color(hex: BrandHex.red))
                    .padding(.horizontal, 10)
                    .frame(height: 32)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-penalty")
            Button { changeHole(hole + 1) } label: {
                Image(systemName: "chevron.right")
                    .font(.system(size: 16, weight: .bold))
                    .frame(width: 32, height: 32)
            }
            .accessibilityIdentifier("play-hole-next")
        }
        .foregroundStyle(p.ink)
        .padding(.horizontal, 4)
        .padding(.vertical, 2)
        .background(Color.white)
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.28), radius: 8, y: 3)
    }

    private var reticle: some View {
        let penalty = track.phase == .penaltyWhere || track.phase == .relief || track.phase == .drop
        let color = penalty ? Color(hex: BrandHex.red) : Color(hex: BrandHex.navy)
        return ZStack {
            Circle().stroke(color, lineWidth: 3).frame(width: 22, height: 22).background(Circle().fill(Color.white))
            if track.phase == .drop {
                Text("X")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(hex: BrandHex.red))
            } else {
                Circle().fill(color).frame(width: 3, height: 3)
            }
        }
        .accessibilityIdentifier("play-reticle")
    }

    private var liveReadout: some View {
        VStack(spacing: 2) {
            Text(aimTitle)
                .font(.system(size: aimTitle == "En el hoyo" ? 28 : 34, weight: .bold))
                .foregroundStyle(Color(hex: BrandHex.navy))
                .opacity(aimTitle == "En el hoyo" ? 0.45 : 1)
                .animation(aimTitle == "En el hoyo" ? .easeInOut(duration: 0.45).repeatForever(autoreverses: true) : .default, value: aimTitle)
            if let detail = aimDetail, aimTitle != "En el hoyo" {
                Text(detail)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .multilineTextAlignment(.center)
            }
            if let wind = windPlayLine, aimTitle != "En el hoyo", !track.marks.contains(where: \.holed) {
                Text(wind)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(hex: BrandHex.navy).opacity(0.72))
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .shadow(color: .black.opacity(0.28), radius: 8, y: 3)
        .offset(y: -132)
        .accessibilityIdentifier("play-live")
    }

    private var sideColumn: some View {
        VStack(spacing: 8) {
            Button { recenterHole() } label: {
                Image(systemName: "scope")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.white))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-target")
            .accessibilityLabel("Objetivo")
            Button {
                var next = track
                next.phase = .confirmFlag
                track = next
            } label: {
                Image(systemName: "flag.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(Color(hex: BrandHex.red))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.white))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-flag")
            .accessibilityLabel("Bandera")
            Button { focusGPS() } label: {
                Text("GPS")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .frame(width: 44, height: 44)
                    .background(Circle().fill(Color.white))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-gps")
            .accessibilityLabel("GPS")
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
        .padding(.trailing, 12)
        .padding(.top, 180)
    }

    private func recenterHole() {
        mapCenter = nil
        cameraNudge += 1
    }

    private func focusGPS() {
        guard let here = location.coordinate else {
            message = "No hay una ubicación del GPS."
            return
        }
        mapCenter = here
    }

    private var shotRail: some View {
        let rows = visibleShots.filter { $0.hole == hole }.sorted { $0.shotNumber < $1.shotNumber }
        let shown = rows.count > 3 && !shotsExpanded ? Array(rows.suffix(3)) : rows
        return VStack(alignment: .leading, spacing: 4) {
            if rows.count > 3 {
                Button(shotsExpanded ? "Menos" : "+\(rows.count - 3)") { shotsExpanded.toggle() }
                    .font(GFont.ui(11, weight: .semibold))
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(p.primary)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("play-shots-more")
            }
            ForEach(shown, id: \.id) { shot in
                Text("\(shot.shotNumber). \(shotLabel(shot.club))")
                    .font(GFont.ui(11, weight: .semibold))
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
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
            Spacer(minLength: 8)
            Text(course.course)
                .font(GType.headline)
                .foregroundStyle(.white)
                .lineLimit(1)
                .shadow(radius: 2)
            Spacer(minLength: 8)
            trackBadge
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .accessibilityElement(children: .contain)
    }

    /// Visible TRACK chip. A plain `Text` in this bar is merged with the course
    /// name, so XCUITest never sees `play-track`. A button stays its own element.
    /// Tapping it does not leave track mode.
    private var trackBadge: some View {
        Button(action: {}) {
            Text("TRACK")
                .font(GType.label)
                .foregroundStyle(p.ink)
                .frame(width: 64, height: 44)
                .background(Capsule().fill(Color.white.opacity(0.96)))
        }
        .buttonStyle(.plain)
        .layoutPriority(1)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("TRACK")
        .accessibilityIdentifier("play-track")
    }

    private var windChip: some View {
        VStack(alignment: .trailing, spacing: 6) {
            Button {
                if nowWind == nil { windOpen.toggle() }
            } label: {
                HStack(spacing: 8) {
                    if let wind = nowWind {
                        if let turn = windTurn {
                            Image(systemName: "location.north.fill")
                                .font(.system(size: 36, weight: .bold))
                                .foregroundStyle(Color(hex: 0xE2B93B))
                                .rotationEffect(.degrees(turn))
                                .accessibilityHidden(true)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(windFace(wind))
                                .font(.system(size: 13, weight: .bold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                            Text(windBits(wind))
                                .lineLimit(1)
                            Text(wind.source + (wind.hhmm.isEmpty ? "" : " \(wind.hhmm)") + (wind.stale ? " · última lectura" : ""))
                                .font(.system(size: 10, weight: .medium))
                                .opacity(0.75)
                                .lineLimit(1)
                            if holeBearing == nil {
                                Text(HoleWind.missingBearingNote)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(Color(hex: 0xE2B93B))
                                    .lineLimit(1)
                            }
                        }
                    } else if windTried {
                        Text("–")
                    }
                }
                .font(GFont.ui(12, weight: .semibold))
                .foregroundStyle(Color(hex: 0xF6F7F9))
                .multilineTextAlignment(.leading)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .fixedSize(horizontal: true, vertical: false)
                .background(Color(hex: 0x0B2545))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-wind")
            if windOpen && nowWind == nil {
                VStack(alignment: .trailing, spacing: 8) {
                    Text(windNote.isEmpty ? "Open-Meteo y MET Norway no devolvieron viento." : windNote)
                        .font(GFont.ui(12, weight: .medium))
                        .foregroundStyle(Color(hex: 0x0B2545))
                        .multilineTextAlignment(.trailing)
                    Button("Reintentar") { Task { await loadWind(retry: true) } }
                        .font(GFont.ui(13, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 12)
                        .frame(minHeight: 36)
                        .background(Color(hex: 0xC8102E))
                        .clipShape(Capsule())
                        .accessibilityIdentifier("play-wind-retry")
                }
                .padding(10)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
        }
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
                if editingClosed {
                    markActions
                }
                if track.marks.contains(where: \.holed), !holeClosed {
                    EmptyView()
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(aimTitle)
                        .font(GFont.ui(22, weight: .semibold))
                        .foregroundStyle(p.ink)
                        .lineLimit(2)
                    if let detail = aimDetail {
                        Text(detail)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(2)
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("play-aim-label")
                teeControls
                if holeClosed, !closedStrokes.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(closedStrokes, id: \.n) { stroke in
                            Text("\(stroke.n). \(stroke.club) · \(stroke.span)")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(p.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .accessibilityIdentifier("play-stroke-\(stroke.n)")
                        }
                    }
                    .accessibilityElement(children: .contain)
                    .accessibilityLabel("Golpes")
                }
                if holeClosed {
                    VStack(spacing: 6) {
                        Button("Siguiente hoyo") { changeHole(hole + 1) }
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .accessibilityIdentifier("play-next-wide")
                        Button("Editar hoyo") { editingClosed = true }
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                            .frame(maxWidth: .infinity, minHeight: 40)
                            .background(Color.white)
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.primary, lineWidth: 1.5))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                            .accessibilityIdentifier("play-edit-hole")
                    }
                }
                distances
                holeNav
                if let movingID = movingShotID, let moving = shots.first(where: { $0.id == movingID }) {
                    Text("Mové el mapa y tocá Guardar punto.")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    Button("Guardar punto") { Task { await moveShot(moving) } }
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .accessibilityIdentifier("play-edit-save")
                }
                if !holeClosed && !editingClosed {
                    if offerShortPutt { finishPuttButtons }
                    markActions
                    if track.phase == .tracking { lostActions }
                }
                greenTools
                if !holeClosed {
                    holeShots
                }
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
        .frame(maxHeight: holeClosed ? 360 : 248)
        .background(Color.white.opacity(0.96))
    }

    /// A holed shot that is already saved keeps the hole closed when the in-memory track is empty or unfinished.
    private var activeTrack: TrackSession.State {
        if track.marks.contains(where: \.holed) { return track }
        if let restoredTrack, restoredTrack.marks.contains(where: \.holed) { return restoredTrack }
        if !track.marks.isEmpty { return track }
        return restoredTrack ?? track
    }

    private var shotsOnHole: [Shot] {
        var byID: [String: Shot] = [:]
        func keep(_ shot: Shot) {
            guard shot.hole == hole else { return }
            if let client = shot.clientId, droppedClientIDs.contains(client) { return }
            byID[shot.id] = shot
        }
        SavedRoundShots.load(roundID: liveRound.id).forEach(keep)
        if !receivedShots { openingShots.forEach(keep) }
        visibleShots.forEach(keep)
        return byID.values.sorted { $0.shotNumber < $1.shotNumber }
    }

    private var restoredTrack: TrackSession.State? {
        TrackSession.restored(
            shots: shotsOnHole.map {
                TrackSession.SavedShot(lat: $0.lat, lng: $0.lng, club: $0.club, result: $0.result)
            },
            tee: TrackPoint(lat: teeCoord.lat, lng: teeCoord.lng),
            pin: TrackPoint(lat: pinCoord.lat, lng: pinCoord.lng)
        )
    }

    private var holeClosed: Bool {
        !editingClosed && activeTrack.marks.contains(where: \.holed)
    }

    private func adoptSavedTrackIfNeeded() {
        guard track.marks.isEmpty, let restoredTrack else { return }
        track = restoredTrack
    }

    /// Test rounds can open with the shots already played. This writes those shots once.
    /// The closed layout still comes from the holed shot.
    private func installClosedFixtureIfNeeded() {
        guard SavedRoundShots.closedHoleFixtureRequested else { return }
        guard !shotsOnHole.contains(where: { TrackSession.isHoled($0.result) }) else { return }
        let fixture = SavedRoundShots.closedHoleFixture(hole: hole, tee: teeCoord, pin: pinCoord)
        shots = fixture
        receivedShots = true
        SavedRoundShots.replace(roundID: liveRound.id, shots: fixture)
    }

    private var playStatus: String {
        let holed = shotsOnHole.contains { TrackSession.isHoled($0.result) }
        let flag = SavedRoundShots.closedHoleFixtureRequested
        return "flag \(flag ? 1 : 0) shots \(shots.count) open \(openingShots.count) store \(SavedRoundShots.load(roundID: liveRound.id).count) holed \(holed ? 1 : 0)"
    }

    private var aimOrigin: GPSCoord {
        track.marks.contains(where: \.countsStroke) ? playerCoord : teeCoord
    }

    private var aimTitle: String {
        if moveTee { return "Arrastrá la salida o tocala en el mapa" }
        if track.marks.contains(where: \.holed) {
            let putts = countedPutts(track.marks)
            return TrackSession.holeClose(par: current?.par, strokes: track.strokeCount, putts: putts)
        }
        switch track.phase {
        case .confirmFlag:
            return "\(PlayMath.yards(from: teeCoord, to: cursor)) yd"
        case .tracking, .penaltyWhere, .drop:
            let meters = Double(PlayMath.meters(from: cursor, to: pinCoord))
            if TrackSession.inTheCup(meters: meters) { return "En el hoyo" }
            if let span = TrackSession.greenToHole(meters: meters), meters <= 25 {
                return span == "En el hoyo" ? span : span
            }
            return "\(PlayMath.yards(from: aimOrigin, to: cursor)) yd"
        default:
            return track.prompt
        }
    }

    private var aimDetail: String? {
        guard !moveTee, !track.marks.contains(where: \.holed) else { return nil }
        switch track.phase {
        case .tracking, .penaltyWhere:
            let meters = Double(PlayMath.meters(from: cursor, to: pinCoord))
            if let span = TrackSession.greenToHole(meters: meters), meters <= 25 {
                return span == "En el hoyo" ? nil : "estimada en el mapa"
            }
            return "\(PlayMath.yards(from: cursor, to: pinCoord)) yd al hoyo"
        default:
            return nil
        }
    }

    private func shotLabel(_ club: String?) -> String {
        let raw = (club ?? "Golpe").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = raw.first else { return "Golpe" }
        return String(first).uppercased() + raw.dropFirst()
    }

    private func savedYards(_ club: BagClub) -> String? {
        let name = club.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if name == "pt" || name == "putter" || name.hasPrefix("putter") { return nil }
        if let carry = club.carry, carry > 0 { return "\(carry) yd" }
        if let total = club.total, total > 0 { return "\(total) yd" }
        return nil
    }

    private func isPutter(_ name: String?) -> Bool {
        let club = (name ?? "").lowercased()
        return club == "pt" || club == "putter"
    }

    /// Tee and green from the hole record, or a tee the player already placed.
    /// A missing end, or a span that is not one hole, is not a bearing.
    private var holeBearing: Double? {
        let pin = holeRecord?.dayPin?.coord ?? current?.green.center ?? current?.green.front ?? current?.green.back
        let tee = chosenTee ?? current?.tee
        guard let pin, let tee else { return nil }
        let meters = Double(PlayMath.meters(from: tee, to: pin))
        guard meters >= 40, meters <= 700 else { return nil }
        return HoleGeoMath.heading(from: tee, to: pin)
    }

    private var windTurn: Double? {
        guard let from = nowWind?.fromDeg else { return nil }
        if let bearing = holeBearing {
            return HoleWind.pushDegrees(fromDeg: from, bearingDeg: bearing)
        }
        return HoleWind.absoluteDegrees(fromDeg: from)
    }

    private func windFace(_ wind: WeatherNow) -> String {
        if let bearing = holeBearing {
            return HoleWind.face(fromDeg: wind.fromDeg, bearingDeg: bearing)
        }
        return HoleWind.absoluteFace(fromDeg: wind.fromDeg)
    }

    private func windBits(_ wind: WeatherNow) -> String {
        var bits = ["\(Int(wind.kmh.rounded())) km/h"]
        if let gust = wind.gustKmh { bits.append("ráfagas \(Int(gust.rounded())) km/h") }
        if let temp = wind.tempC { bits.append("\(Int(temp.rounded()))°C") }
        if let rain = wind.precipMm, rain > 0 { bits.append("lluvia") }
        return bits.joined(separator: " · ")
    }

    private func loadWind(retry: Bool) async {
        let pin = current?.green.center ?? current?.tee
        guard let pin else {
            nowWind = nil
            windTried = true
            windNote = "Este hoyo no tiene un punto para pedir el clima."
            return
        }
        do {
            nowWind = try await model.api.weatherNow(lat: pin.lat, lng: pin.lng, retry: retry)
            windNote = nowWind == nil ? "Open-Meteo y MET Norway no devolvieron viento." : ""
            if nowWind != nil { windOpen = false }
        } catch {
            nowWind = nil
            windNote = error.localizedDescription
        }
        windTried = true
    }

    private var offerShortPutt: Bool {
        guard track.phase == .tracking, !track.marks.contains(where: \.holed) else { return false }
        let origin = track.ball.map { GPSCoord(lat: $0.lat, lng: $0.lng) } ?? teeCoord
        let classified = HoleGeoMath.lie(course: course, hole: hole, at: origin)
        let clubName = (chosenClub ?? "").lowercased()
        let putting = classified == .green || clubName == "pt" || clubName == "putter"
        guard putting else { return false }
        let ball = track.ball.map { GPSCoord(lat: $0.lat, lng: $0.lng) } ?? origin
        return TrackSession.shortPutt(meters: Double(PlayMath.meters(from: ball, to: pinCoord)))
    }

    private var finishPuttButtons: some View {
        HStack(spacing: 8) {
            Button("Embocar (+1)") { Task { await finishPutt(conceded: false) } }
                .font(GType.headline)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(p.primary)
                .clipShape(Capsule())
                .accessibilityIdentifier("play-hole-out")
            Button("Dada") { Task { await finishPutt(conceded: true) } }
                .font(GType.headline)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(p.primary)
                .clipShape(Capsule())
                .accessibilityIdentifier("play-concede")
        }
        .buttonStyle(.plain)
    }

    private func finishPutt(conceded: Bool) async {
        let point = TrackPoint(lat: pinCoord.lat, lng: pinCoord.lng)
        let outcome = TrackSession.enter(track, at: point, club: chosenClub ?? "Putter", onCup: true, putting: true)
        guard outcome.recorded else { return }
        track = outcome.state
        if conceded, let index = track.marks.indices.last {
            track.marks[index].conceded = true
        }
        await hit(holed: true, penalty: false, intent: conceded ? "conceded" : nil, atCup: true)
    }

    @ViewBuilder
    private var markActions: some View {
        if track.phase == .confirmTee || track.phase == .confirmFlag || track.phase == .drop {
            HStack(spacing: 8) {
                if track.phase == .drop {
                    cancelButton
                }
                setButton
            }
        } else if track.phase == .relief {
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
        } else {
            VStack(spacing: 6) {
                HStack(spacing: 8) {
                    if track.phase != .tracking { cancelButton }
                    clubButton
                    enterButton
                }
                if track.phase == .tracking {
                    HStack(spacing: 6) {
                        if !track.marks.isEmpty {
                            chipButton("Deshacer", id: "play-undo") { undoGroup() }
                        }
                        chipButton("P+1", id: "play-penalty", tint: Color(hex: BrandHex.red)) { track = TrackSession.beginPenalty(track) }
                        chipButton("A buena", id: "play-good", label: "A buena, golpe de recuperación") { Task { await markRecovery() } }
                    }
                }
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
                .frame(maxWidth: .infinity, minHeight: 56)
                .padding(.horizontal, 12)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
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

    private var clubButton: some View {
        let name = chosenClub ?? suggestedClub ?? "Palo"
        let picked = model.bag.first { $0.name == (chosenClub ?? suggestedClub) }
        return Button { showsClubs = true } label: {
            HStack(spacing: 8) {
                ClubThumb(brand: picked?.brand, model: picked?.modelName, face: ClubGear.face(picked?.name ?? name))
                    .frame(width: 28, height: 28)
                VStack(alignment: .leading, spacing: 1) {
                    Text(gridName(name))
                        .font(GFont.ui(15, weight: .bold))
                        .foregroundStyle(p.ink)
                        .lineLimit(1)
                    if let picked, let yards = savedYards(picked) {
                        Text(yards)
                            .font(GFont.ui(11, weight: .semibold))
                            .foregroundStyle(p.ink3)
                    }
                }
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 10)
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .background(p.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("play-club")
    }

    private func chipButton(_ title: String, id: String, tint: Color = Color(hex: BrandHex.navy), label: String? = nil, action: @escaping () -> Void) -> some View {
        Button(title, action: action)
            .font(GFont.ui(12, weight: .bold))
            .foregroundStyle(tint)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minHeight: 36)
            .background(Capsule().fill(Color.white))
            .buttonStyle(.plain)
            .accessibilityIdentifier(id)
            .accessibilityLabel(label ?? title)
    }

    private var suggestedClub: String? {
        guard chosenClub == nil else { return nil }
        let yards = PlayMath.yards(from: aimOrigin, to: cursor)
        return TrackSession.suggest(yards: yards, bag: model.bag.map { ($0.name, $0.carry) })
    }

    /// The bag rises from the bottom. One gold ring marks the chosen club.
    private var clubCover: some View {
        let columns = Array(repeating: GridItem(.flexible(), spacing: 8), count: 4)
        return ZStack(alignment: .bottom) {
            Color(hex: 0x0B2545).opacity(0.28).ignoresSafeArea()
            VStack(alignment: .leading, spacing: 12) {
                Text("Palo")
                    .font(GFont.ui(16, weight: .bold))
                    .foregroundStyle(p.ink)
                    .padding(.leading, 4)
                    .padding(.trailing, 44)
                    .accessibilityIdentifier("play-club-sheet")
                    .accessibilityLabel("Palo")
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(model.bag, id: \.name) { club in
                        let on = chosenClub == club.name
                        Button {
                            chosenClub = club.name
                            showsClubs = false
                        } label: {
                            VStack(spacing: 3) {
                                ClubThumb(brand: club.brand, model: club.modelName, face: club.face)
                                    .frame(width: 56, height: 56)
                                Text(gridName(club.name))
                                    .font(GFont.ui(12, weight: .bold))
                                    .lineLimit(2)
                                    .minimumScaleFactor(0.6)
                                if let yards = savedYards(club) {
                                    Text(yards)
                                        .font(GFont.ui(10, weight: .semibold))
                                        .foregroundStyle(Color(hex: 0x3E4C62))
                                        .lineLimit(1)
                                }
                            }
                            .foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity, minHeight: 118)
                            .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .background(Color.white)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 12, style: .continuous)
                                    .stroke(on ? Color(hex: 0xE2B93B) : Color(hex: 0xE6E2D8), lineWidth: on ? 2 : 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("play-club-\(club.name)")
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 16)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity)
            .background(Color(hex: 0xF6F7F9))
            .clipShape(UnevenRoundedRectangle(topLeadingRadius: 20, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 20, style: .continuous))
            .overlay(alignment: .topTrailing) {
                Button { showsClubs = false } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(p.ink)
                        .frame(width: 44, height: 44)
                        .background(Circle().fill(Color.white))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-club-close")
                .accessibilityLabel("Cerrar")
                .padding(8)
            }
            .shadow(color: Color(hex: 0x0B2545).opacity(0.28), radius: 16, y: -6)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("play-club-sheet")
        .accessibilityLabel("Palo")
    }

    private func gridName(_ raw: String) -> String {
        let spoken = spokenClub(raw)
        if let range = spoken.range(of: #"(\d+)\s*°"#, options: .regularExpression) {
            let digits = spoken[range].filter(\.isNumber)
            if !digits.isEmpty { return "\(digits)°" }
        }
        if spoken == "Pitching wedge" { return "PW" }
        return spoken
    }

    private func countedPutts(_ marks: [TrackMark]) -> Int? {
        var previous = activeTrack.tee
        var know = false
        var count = 0
        for mark in marks where mark.countsStroke && !mark.penalty && !mark.lost {
            know = true
            let here = GPSCoord(lat: mark.at.lat, lng: mark.at.lng)
            let from = previous.map { GPSCoord(lat: $0.lat, lng: $0.lng) } ?? here
            let meters = Double(PlayMath.meters(from: from, to: here))
            let pinMeters = Double(PlayMath.meters(from: from, to: pinCoord))
            if !mark.recovery && (isPutter(mark.club) || (pinMeters <= 30 && meters <= 55)) {
                count += 1
            }
            previous = mark.at
        }
        return know ? count : nil
    }

    /// Same estimate as plan-core: headwind shortens carry about 1% per mph.
    private var windPlayLine: String? {
        guard let wind = nowWind else { return nil }
        let yards = PlayMath.yards(from: cursor, to: pinCoord)
        guard yards > 0 else { return nil }
        let bearing = HoleGeoMath.heading(from: cursor, to: pinCoord)
        let rel = (wind.fromDeg - bearing) * .pi / 180
        let mph = wind.kmh / 1.609344
        let head = (mph * cos(rel) * 10).rounded() / 10
        let raw = head >= 0 ? 1 - 0.01 * head : 1 + 0.005 * -head
        let factor = min(1.3, max(0.6, raw))
        let plays = Int((Double(yards) / factor - Double(yards)).rounded())
        if plays == 0 { return nil }
        return "Juega \(yards + plays) yd"
    }

    private var suggestedName: String? {
        TrackSession.suggest(yards: PlayMath.yards(from: aimOrigin, to: cursor), bag: model.bag.map { ($0.name, $0.carry) })
    }

    private var lostActions: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button("Pelota perdida / fuera de límites") { markLost(provisional: false) }
                .font(GType.label)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("play-lost")
            Button("Pelota perdida · jugué la provisional") { markLost(provisional: true) }
                .font(GType.label)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("play-lost-prov")
        }
    }

    private func markRecovery() async {
        let point = TrackPoint(lat: cursor.lat, lng: cursor.lng)
        let outcome = TrackSession.enter(track, at: point, club: chosenClub, onCup: false, putting: false)
        guard outcome.recorded else { return }
        var state = outcome.state
        if let last = state.marks.indices.last {
            state.marks[last].recovery = true
        }
        track = state
        await hit(holed: false, penalty: false, intent: "recovery")
    }

    private func confirmEnter() async {
        let point = TrackPoint(lat: cursor.lat, lng: cursor.lng)
        let onCup = TrackSession.inTheCup(meters: Double(PlayMath.meters(from: cursor, to: pinCoord)))
        let origin = track.ball.map { GPSCoord(lat: $0.lat, lng: $0.lng) } ?? teeCoord
        let classified = HoleGeoMath.lie(course: course, hole: hole, at: origin)
        let clubName = (chosenClub ?? "").lowercased()
        let putting = classified == .green || clubName == "pt" || clubName == "putter"
        let outcome = TrackSession.enter(track, at: point, club: chosenClub, onCup: onCup, putting: putting)
        guard outcome.recorded else { return }
        let sacada = recovery
        var state = outcome.state
        if sacada, let last = state.marks.indices.last {
            state.marks[last].recovery = true
            recovery = false
        }
        let penalty = state.marks.last?.penalty == true
        track = state
        await hit(holed: outcome.holed, penalty: penalty, intent: sacada ? "recovery" : nil)
    }

    private func markLost(provisional: Bool) {
        let point = TrackPoint(lat: cursor.lat, lng: cursor.lng)
        let before = track.marks.count
        track = TrackSession.lostBall(track, at: point, club: chosenClub, provisional: provisional)
        for mark in track.marks.dropFirst(before) {
            Task { await postMark(mark) }
        }
    }

    private func postMark(_ mark: TrackMark) async {
        let draft = ShotDraft(
            clientId: String(UUID().uuidString.prefix(32)),
            hole: hole,
            lat: mark.at.lat,
            lng: mark.at.lng,
            accuracyM: location.accuracyM,
            takenAt: Date(),
            club: mark.penalty || mark.lost ? nil : mark.club,
            lie: nil,
            result: mark.lost ? "lost" : (mark.penalty ? "penalty" : nil),
            direction: nil,
            length: nil,
            mishit: false,
            liveRoundId: liveRound.id,
            intent: mark.recovery ? "recovery" : nil
        )
        ShotQueue.enqueue(draft)
        do {
            let posted = try await model.api.postShots(liveRoundId: liveRound.id, drafts: [draft])
            ShotQueue.remove(clientIds: [draft.clientId])
            shots = posted.filter { shot in
                guard let client = shot.clientId else { return true }
                return !droppedClientIDs.contains(client)
            }
        } catch {
            message = "Sin red. El golpe quedó en cola."
        }
    }

    private func undoGroup() {
        let span = TrackSession.undoSpan(track)
        track = TrackSession.undo(track)
        for _ in 0..<span { undoLast() }
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
            Text(track.strokeCount > 0 ? "\(track.strokeCount)" : "–")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(Color.white)
                .frame(width: 36, height: 36)
                .background(Circle().fill(p.primary))
                .accessibilityIdentifier("play-score")
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

    private var teeChoices: [TeeBox] {
        TeeBoxes.list(yards: current?.yards ?? [:], centers: current?.tees ?? [], green: current?.green.center)
    }

    private var teeButtonTitle: String {
        if let picked = teeChoices.first(where: { $0.name == teeName }) {
            if let yards = picked.yards { return "\(picked.name) · \(yards) yd" }
            return picked.name
        }
        if let yards = current?.yards.values.max() { return "Salida · \(yards) yd" }
        return "Salida"
    }

    private var teeControls: some View {
        VStack(alignment: .leading, spacing: 6) {
            if teeOpen {
                if teeChoices.isEmpty {
                    Text("Esta cancha no tiene salidas con yardas.")
                        .font(GFont.ui(12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x0B2545))
                        .padding(8)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                ForEach(teeChoices, id: \.name) { box in
                    Button { pickTee(box) } label: {
                        Text(box.yards.map { "\(box.name) · \($0) yd" } ?? box.name)
                            .font(GFont.ui(12, weight: .semibold))
                            .foregroundStyle(Color(hex: 0xF6F7F9))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 10)
                            .frame(minHeight: 32)
                            .background(Color(hex: 0x0B2545))
                            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(box.name == teeName ? Color(hex: 0xC8102E) : Color.clear, lineWidth: 2))
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("play-tee-\(box.name)")
                }
            }
            HStack(spacing: 6) {
                Button { teeOpen.toggle() } label: {
                    Text(teeButtonTitle)
                        .font(GFont.ui(12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xF6F7F9))
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(Color(hex: 0x0B2545))
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-tee")
                Button(moveTee ? "Listo" : "Mover") {
                    if moveTee { commitTeeAtCrosshair() } else { moveTee = true; teeOpen = false }
                }
                .font(GFont.ui(12, weight: .semibold))
                .foregroundStyle(Color(hex: 0xF6F7F9))
                .padding(.horizontal, 10)
                .frame(minHeight: 32)
                .background(Color(hex: 0x0B2545))
                .clipShape(Capsule())
                .overlay(Capsule().stroke(moveTee ? Color(hex: 0xC8102E) : Color.clear, lineWidth: 2))
                .buttonStyle(.plain)
                .accessibilityIdentifier("play-move-tee")
                if moveTee {
                    Button("Usar mi ubicación") { useMyLocation() }
                        .font(GFont.ui(12, weight: .semibold))
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 10)
                        .frame(minHeight: 32)
                        .background(Color(hex: 0xC8102E))
                        .clipShape(Capsule())
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("play-tee-gps")
                }
            }
        }
    }

    private struct SavedTee: Codable {
        var lat: Double?
        var lng: Double?
        var name: String
        var source: String
    }

    private func salidaKey() -> String { "golflet.salida.\(liveRound.id).\(hole)" }

    private func persistTee() {
        let rec = SavedTee(lat: chosenTee?.lat, lng: chosenTee?.lng, name: teeName, source: teeSource)
        guard let data = try? JSONEncoder().encode(rec) else { return }
        UserDefaults.standard.set(data, forKey: salidaKey())
    }

    private func restoreTee() {
        teeName = ""
        teeSource = ""
        chosenTee = nil
        moveTee = false
        teeOpen = false
        guard let data = UserDefaults.standard.data(forKey: salidaKey()),
              let rec = try? JSONDecoder().decode(SavedTee.self, from: data) else { return }
        teeName = rec.name
        teeSource = rec.source
        guard let lat = rec.lat, let lng = rec.lng else { return }
        let point = GPSCoord(lat: lat, lng: lng)
        chosenTee = point
        track.tee = TrackPoint(lat: lat, lng: lng)
        if !track.marks.contains(where: \.countsStroke) { track.ball = track.tee }
    }

    private func applyTee(_ point: GPSCoord, name: String, source: String, finish: Bool) {
        teeName = name
        teeSource = source
        chosenTee = point
        track.tee = TrackPoint(lat: point.lat, lng: point.lng)
        if !track.marks.contains(where: \.countsStroke) { track.ball = track.tee }
        if finish { moveTee = false; teeOpen = false }
        persistTee()
    }

    private func pickTee(_ box: TeeBox) {
        if let lat = box.lat, let lng = box.lng {
            applyTee(GPSCoord(lat: lat, lng: lng), name: box.name, source: "tee", finish: true)
            return
        }
        teeName = box.name
        teeSource = "tee"
        moveTee = false
        teeOpen = false
        persistTee()
    }

    private func commitTeeAtCrosshair() {
        applyTee(cursor, name: teeName, source: "jugador", finish: true)
    }

    private func useMyLocation() {
        guard let here = location.coordinate else {
            message = "No hay una ubicación del GPS."
            return
        }
        applyTee(here, name: teeName, source: "jugador", finish: true)
    }

    private var holeChrome: String {
        var parts = ["Par \(current?.par ?? 0)"]
        let picked = teeChoices.first { $0.name == teeName }?.yards
        if let yards = picked ?? current?.yards.values.max() {
            parts.append("\(yards) yd")
        }
        if let hcp = current?.hcp {
            parts.append("S.I. \(hcp)")
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
        if let plan = strategy?.hole(hole) {
            CompactPlanControl(title: plan.planTitle ?? "Cómo jugar el hoyo") {
                showsStrategy = true
            }
            .frame(maxWidth: .infinity)
            .frame(height: 32)
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

    private var closedStrokes: [(n: Int, club: String, yards: Int, span: String)] {
        let marks = activeTrack.marks.filter(\.countsStroke)
        if !marks.isEmpty {
            return marks.enumerated().map { index, mark in
                let previous = index == 0 ? activeTrack.tee : marks[index - 1].at
                let yards = strokeYards(from: previous, to: mark.at)
                let meters = previous.map {
                    Double(PlayMath.meters(from: GPSCoord(lat: $0.lat, lng: $0.lng), to: GPSCoord(lat: mark.at.lat, lng: mark.at.lng)))
                }
                let pinMeters = previous.map {
                    Double(PlayMath.meters(from: GPSCoord(lat: $0.lat, lng: $0.lng), to: pinCoord))
                }
                let onGreen = !mark.recovery && (pinMeters ?? 999) <= 30 && (meters ?? 999) <= 55
                let base = puttSpan(club: mark.club, meters: meters, yards: yards, onGreen: onGreen)
                let tag = mark.holed ? (mark.conceded ? "Dada" : "Embocado") : ""
                let span = tag.isEmpty ? base : (base.isEmpty ? tag : "\(base) · \(tag)")
                return (index + 1, mark.club ?? "—", yards, span)
            }
        }
        let rows = visibleShots.filter { $0.hole == hole }.sorted { $0.shotNumber < $1.shotNumber }
        return rows.enumerated().map { index, shot in
            let previous = index > 0 ? rows[index - 1] : nil
            return (shot.shotNumber, shot.club ?? "—", shot.distanceYd ?? 0, shotDistanceText(shot, previous: previous))
        }
    }

    private func puttSpan(club: String?, meters: Double?, yards: Int, onGreen: Bool) -> String {
        let putt = isPutter(club) || onGreen
        if putt, let meters, let label = TrackSession.greenToHole(meters: meters) {
            return label == "En el hoyo" ? "" : label
        }
        return "\(yards) yd"
    }

    private func shotDistanceText(_ shot: Shot, previous: Shot?, fromTee: Bool = false) -> String {
        if fromTee, let lat = shot.lat, let lng = shot.lng {
            let end = GPSCoord(lat: lat, lng: lng)
            let meters = Double(PlayMath.meters(from: teeCoord, to: end))
            let putt = isPutter(shot.club) || (shot.lie == "green" && meters <= 50)
            if putt, let label = TrackSession.greenToHole(meters: meters), label != "En el hoyo" { return label }
            if !putt { return "\(PlayMath.yards(from: teeCoord, to: end)) yd" }
        }
        let known = shot.distanceM.map(Double.init)
        let putt = isPutter(shot.club) || (shot.lie == "green" && (known == nil || known! <= 50))
        if putt, let meters = shot.distanceM, meters > 0, let label = TrackSession.greenToHole(meters: Double(meters)), label != "En el hoyo" {
            return label
        }
        if putt, let previous, let fromLat = previous.lat, let fromLng = previous.lng, let lat = shot.lat, let lng = shot.lng {
            let meters = Double(PlayMath.meters(from: GPSCoord(lat: fromLat, lng: fromLng), to: GPSCoord(lat: lat, lng: lng)))
            if let label = TrackSession.greenToHole(meters: meters), label != "En el hoyo" { return label }
        }
        return shot.distanceYd.map { "\($0) yd" } ?? "—"
    }

    private func strokeYards(from: TrackPoint?, to: TrackPoint) -> Int {
        guard let from else { return 0 }
        let meters = PlayMath.meters(
            from: GPSCoord(lat: from.lat, lng: from.lng),
            to: GPSCoord(lat: to.lat, lng: to.lng)
        )
        return PlayMath.yards(meters)
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
                            Button { editingShot = shot; askDeleteShot = false; movingShotID = nil } label: {
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
                                if shot.intent == "recovery" {
                                    Text("A buena")
                                        .font(GFont.ui(9, weight: .bold))
                                        .foregroundStyle(Color.white)
                                        .padding(.horizontal, 4)
                                        .padding(.vertical, 1)
                                        .background(p.accent)
                                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                                        .accessibilityIdentifier("play-recovery-tag")
                                }
                                Text(shot.lie.map { RecapCopy.lie($0) } ?? "—")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                if let result = shot.result {
                                    Text(RecapCopy.result(result))
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                                Spacer()
                                Text(shotDistanceText(shot, previous: index > 0 ? rows[index - 1] : nil, fromTee: index == 0))
                                    .font(GType.headline)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                            }
                            .accessibilityIdentifier("play-shot-\(index)")
                            }
                            .buttonStyle(.plain)
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

    private func shotEditTitle(_ shot: Shot) -> String {
        var bits = ["Golpe \(shot.shotNumber)"]
        if let club = shot.club, !club.isEmpty { bits.append(club) }
        let dist = shotDistanceText(shot, previous: nil)
        if dist != "—" { bits.append(dist) }
        return bits.joined(separator: " · ")
    }

    private func shotEditor(_ shot: Shot) -> some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(shotEditTitle(shot))
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    Button("Punto de inicio") {
                        movingShotID = shot.id
                        editingShot = nil
                    }
                    .accessibilityIdentifier("play-edit-start")
                    Button("Punto final") {
                        movingShotID = shot.id
                        editingShot = nil
                    }
                    .accessibilityIdentifier("play-edit-move")
                    Button("Objetivo") {
                        aimTarget = cursor
                        editingShot = nil
                    }
                    .accessibilityIdentifier("play-edit-aim")
                    Button("Insertar tiro") {
                        Task { await insertShot() }
                    }
                    .accessibilityIdentifier("play-edit-insert")
                    Button(shot.intent == "recovery" ? "A buena · activo" : "A buena") {
                        Task { await toggleRecovery(shot) }
                    }
                    .accessibilityIdentifier("play-edit-buena")
                    Text("Palo")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], spacing: 8) {
                        ForEach(model.bag, id: \.name) { club in
                            Button {
                                Task { await retarget(shot, club: club.name) }
                            } label: {
                                VStack(spacing: 2) {
                                    ClubThumb(brand: club.brand, model: club.modelName, face: club.face)
                                        .frame(width: 22, height: 22)
                                    Text(gridName(club.name))
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.7)
                                    if let yards = savedYards(club) {
                                        Text(yards)
                                            .font(GType.label)
                                            .foregroundStyle(p.ink3)
                                    }
                                }
                                .frame(maxWidth: .infinity, minHeight: 72)
                                .padding(.vertical, 8)
                                .background(Color.white)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(shot.club == club.name ? Color(hex: 0xE2B93B) : Color(hex: 0xE6E2D8), lineWidth: shot.club == club.name ? 2 : 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("play-edit-club-\(club.name)")
                        }
                    }
                    Button("Cerrar") { editingShot = nil }
                    if askDeleteShot {
                        Text("¿Borrar este golpe?")
                            .foregroundStyle(p.ink)
                        Button("Sí, borrar") { Task { await deleteShot(shot) } }
                            .accessibilityIdentifier("play-edit-yes")
                    } else {
                        Button("Borrar tiro") { askDeleteShot = true }
                            .font(GType.headline)
                            .foregroundStyle(p.accent)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(p.accent, lineWidth: 1.5))
                            .accessibilityIdentifier("play-edit-del")
                    }
                }
                .padding(16)
            }
            .navigationTitle(shotEditTitle(shot))
        }
        .accessibilityIdentifier("play-shot-editor")
    }

    private func retarget(_ shot: Shot, club: String) async {
        do {
            let saved = try await model.api.patchShot(id: shot.id, body: ["club": club])
            if let index = shots.firstIndex(where: { $0.id == saved.id }) { shots[index] = saved }
            editingShot = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func insertShot() async {
        let mark = TrackMark(id: track.nextID, at: TrackPoint(lat: cursor.lat, lng: cursor.lng), club: chosenClub, countsStroke: true, holed: false, penalty: false, drop: false)
        await postMark(mark)
        editingShot = nil
    }

    private func toggleRecovery(_ shot: Shot) async {
        let next: Any = shot.intent == "recovery" ? NSNull() : "recovery"
        do {
            let saved = try await model.api.patchShot(id: shot.id, body: ["intent": next])
            if let index = shots.firstIndex(where: { $0.id == saved.id }) { shots[index] = saved }
            editingShot = saved
        } catch {
            message = error.localizedDescription
        }
    }

    private func moveShot(_ shot: Shot) async {
        do {
            let saved = try await model.api.patchShot(id: shot.id, body: ["lat": cursor.lat, "lng": cursor.lng])
            if let index = shots.firstIndex(where: { $0.id == saved.id }) { shots[index] = saved }
            movingShotID = nil
        } catch {
            message = error.localizedDescription
        }
    }

    private func deleteShot(_ shot: Shot) async {
        do {
            try await model.api.deleteShot(id: shot.id)
            shots.removeAll { $0.id == shot.id }
            editingShot = nil
            askDeleteShot = false
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
        editingClosed = false
        editingShot = nil
        movingShotID = nil
        shotsExpanded = false
        aimTarget = nil
        mapCenter = nil
        waterAsk = false
        markMode = .track
        track = TrackSession.State()
        adoptSavedTrackIfNeeded()
        restoreTee()
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

    private func hit(holed: Bool = false, penalty: Bool = false, intent: String? = nil, atCup: Bool = false) async {
        waterAsk = false
        let conceded = intent == "conceded"
        let confirmed = atCup || (!conceded && holed && TrackSession.onCup(meters: Double(PlayMath.meters(from: landingPoint, to: pinCoord))))
        let here = conceded ? nil : (confirmed ? pinCoord : landingPoint)
        let draft = ShotDraft(
            clientId: String(UUID().uuidString.prefix(32)),
            hole: hole,
            lat: here?.lat,
            lng: here?.lng,
            accuracyM: location.accuracyM,
            takenAt: Date(),
            club: chosenClub,
            lie: penalty ? SGLie.agua.rawValue : markLie?.rawValue,
            result: (confirmed || conceded) ? "holed" : nil,
            direction: nil,
            length: nil,
            mishit: false,
            liveRoundId: liveRound.id,
            intent: intent
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
                toGreenYd: nil,
                intent: draft.intent
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
            let local = shots.isEmpty && !receivedShots ? openingShots : shots
            let kept = SavedRoundShots.keepingHoledShots(local: local, incoming: detail.shots)
            shots = kept
            if !kept.isEmpty {
                SavedRoundShots.replace(roundID: liveRound.id, shots: kept)
            }
            receivedShots = true
            adoptSavedTrackIfNeeded()
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

/// Visible plan chip. A SwiftUI `Text`/`Button` in this stack does not publish
/// `strategy-compact` to XCUITest. A UIKit control does, and it opens the plan.
private struct CompactPlanControl: UIViewRepresentable {
    var title: String
    var action: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(action: action) }

    func makeUIView(context: Context) -> CompactPlanChip {
        let chip = CompactPlanChip()
        chip.addTarget(context.coordinator, action: #selector(Coordinator.fire), for: .touchUpInside)
        chip.setContentHuggingPriority(.defaultLow, for: .horizontal)
        chip.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return chip
    }

    func updateUIView(_ chip: CompactPlanChip, context: Context) {
        context.coordinator.action = action
        chip.apply(title: title)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: CompactPlanChip, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 320, height: 32)
    }

    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func fire() { action() }
    }
}

private final class CompactPlanChip: UIControl {
    private let titleLabel = UILabel()
    private let verLabel = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isAccessibilityElement = true
        accessibilityIdentifier = "strategy-compact"
        accessibilityTraits = .button
        backgroundColor = UIColor.white.withAlphaComponent(0.96)
        layer.cornerRadius = 16
        clipsToBounds = true
        let font = UIFont(name: "Geist-Medium", size: 12.5) ?? .systemFont(ofSize: 12.5, weight: .medium)
        titleLabel.font = font
        titleLabel.textColor = UIColor(red: 14 / 255, green: 27 / 255, blue: 44 / 255, alpha: 1)
        titleLabel.lineBreakMode = .byTruncatingTail
        titleLabel.isAccessibilityElement = false
        verLabel.font = font
        verLabel.text = "Ver"
        verLabel.textColor = UIColor(red: 200 / 255, green: 16 / 255, blue: 46 / 255, alpha: 1)
        verLabel.isAccessibilityElement = false
        addSubview(titleLabel)
        addSubview(verLabel)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func apply(title: String) {
        titleLabel.text = title
        accessibilityLabel = title
        accessibilityIdentifier = "strategy-compact"
        isAccessibilityElement = true
        setNeedsLayout()
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        let verSize = verLabel.intrinsicContentSize
        verLabel.frame = CGRect(
            x: bounds.width - 12 - verSize.width,
            y: (bounds.height - verSize.height) / 2,
            width: verSize.width,
            height: verSize.height
        )
        let titleWidth = max(0, verLabel.frame.minX - 20)
        let titleHeight = titleLabel.intrinsicContentSize.height
        titleLabel.frame = CGRect(
            x: 12,
            y: (bounds.height - titleHeight) / 2,
            width: titleWidth,
            height: titleHeight
        )
    }

    override var intrinsicContentSize: CGSize {
        CGSize(width: UIView.noIntrinsicMetric, height: 32)
    }
}
