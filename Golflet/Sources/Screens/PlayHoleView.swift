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
    @State private var lastManualChange = Date.distantPast

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
                    accuracy
                    hitButton
                    if phase != .ready { clubGrid }
                    if phase == .pickResult { resultGrid }
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
            await refresh()
        }
        .onDisappear {
            UIApplication.shared.isIdleTimerDisabled = false
            location.stop()
        }
        .onChange(of: location.coordinate?.lat) { _, _ in
            maybeAdvance()
        }
        .sheet(isPresented: $showsHoles) { holePicker }
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
                HStack(alignment: .bottom, spacing: 8) {
                    yardCell("Frente", yards(from: here, to: green?.front), id: "distance-front")
                    yardCell("Centro", yards(from: here, to: green?.center), id: "distance-center", hero: true)
                    yardCell("Fondo", yards(from: here, to: green?.back), id: "distance-back")
                }
            }
        }
    }

    private func yardCell(_ label: String, _ value: Int?, id: String, hero: Bool = false) -> some View {
        VStack(spacing: 4) {
            Text(label.uppercased())
                .font(GType.overline)
                .foregroundStyle(p.ink3)
            Text(value.map(String.init) ?? "—")
                .font(hero ? GType.statHero : GType.statL)
                .tabular()
                .foregroundStyle(p.ink)
                .minimumScaleFactor(0.4)
                .lineLimit(1)
                .accessibilityIdentifier(id)
            Text("yd")
                .font(GType.label)
                .foregroundStyle(p.ink2)
        }
        .frame(maxWidth: .infinity)
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
            Text("Pegué")
                .font(GFont.ui(28, weight: .semibold))
                .foregroundStyle(p.onPrimary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 22)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("play-hit")
        .disabled(location.coordinate == nil)
    }

    private var clubGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("¿Con qué palo?")
                .font(GType.section)
                .foregroundStyle(p.ink)
            let clubs = model.bag.isEmpty ? DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) } : model.bag
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 8)], spacing: 8) {
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
                Text("Caminá, mirá la distancia y tocá Pegué.")
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
        return PlayMath.yards(PlayMath.meters(from: here, to: target))
    }

    private func changeHole(_ next: Int) {
        let clamped = min(max(next, 1), max(course.holes.count, 1))
        hole = clamped
        lastManualChange = Date()
        phase = .ready
        Task {
            _ = try? await model.api.patchLiveRound(id: liveRound.id, body: ["current_hole": clamped])
        }
    }

    private func maybeAdvance() {
        guard Date().timeIntervalSince(lastManualChange) > 8 else { return }
        guard shots.contains(where: { $0.hole == hole }) else { return }
        guard let here = location.coordinate else { return }
        let next = course.holes.first { $0.number == hole + 1 }
        guard let tee = next?.tee else { return }
        if PlayMath.meters(from: here, to: tee) <= 25 {
            changeHole(hole + 1)
        }
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
        do {
            let posted = try await model.api.postShots(liveRoundId: liveRound.id, drafts: [draft])
            ShotQueue.remove(clientIds: [draft.clientId])
            shots = posted
            lastShot = posted.last { $0.clientId == draft.clientId } ?? posted.last
            phase = .pickClub
        } catch {
            message = "Sin red. El golpe quedó en cola."
            phase = .pickClub
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
                if let direction = body["direction"] as? String { draft.direction = direction }
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
    }

    private func endRound() async {
        _ = try? await model.api.patchLiveRound(id: liveRound.id, body: ["ended": true])
        await model.endPlay(recapLiveRoundId: liveRound.id)
    }
}
