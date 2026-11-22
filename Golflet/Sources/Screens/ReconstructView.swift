import MapKit
import SwiftUI

struct ReconstructView: View {
    var context: RoundTrackContext? = nil
    var onHoleScore: ((Int, Int) -> Void)? = nil
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    @State private var date = Date()
    @State private var courseKey = ""
    @State private var roundId = ""
    @State private var setup = ReconstructionSetup(officialRounds: [], saved: [])
    @State private var live: ReconstructionRound?
    @State private var shots: [ReconstructionShot] = []
    @State private var hole = 1
    @State private var club = "7i"
    @State private var result = ""
    @State private var penalties = 0
    @State private var typedDistance = ""
    @State private var start: ReconstructionPoint?
    @State private var end: ReconstructionPoint?
    @State private var editing: String?
    @State private var camera = MapCameraPosition.automatic
    @State private var note = ""
    @State private var busy = false
    @State private var staged = false
    @State private var teeName = "Blanco"
    @State private var holeEnds: [Int: HoleEnds] = [:]
    @State private var courseFocus: ReconstructionPoint?
    @State private var aimCenter: ReconstructionPoint?
    @State private var showsManual = false

    private let clubs = ["Dr", "3W", "5W", "Hy", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "SW", "LW", "Pt"]
    private let teeNames = ["Azul", "Blanco", "Amarillo", "Colorado", "Negro"]
    private let results = ["fairway", "green", "rough", "bunker", "water", "ob", "penalty", "holed", "other"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let live {
                    editor(live)
                } else if staged {
                    editor(nil)
                } else {
                    picker
                }
                if !note.isEmpty {
                    Text(note).font(GType.label).foregroundStyle(p.negative)
                }
            }
            .padding(16)
            .padding(.bottom, 28)
        }
        .background(p.bg)
        .safeAreaPadding(.bottom, 8)
        .navigationTitle(context == nil ? "Vuelta ya jugada" : "Registrar mis tiros")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button(context == nil ? "Cerrar" : "Volver") {
                    reportClosedHole()
                    model.showsReconstruct = false
                    dismiss()
                }
                .accessibilityIdentifier("reconstruct-back")
            }
        }
        .task { await loadSetup() }
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let last = setup.officialRounds.first {
                Button { Task { await openChoice(last) } } label: { choiceLabel(last, featured: true) }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("rc-last")
            } else {
                Text("Todavía no hay una tarjeta del club. Podés cargar los golpes igual, como vuelta no oficial.")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            if !otherCards.isEmpty {
                Text("Otras tarjetas")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                ForEach(otherCards) { round in
                    Button {
                        Task {
                            if round.official == false { await open(round) }
                            else { await openChoice(round) }
                        }
                    } label: { choiceLabel(round, featured: false) }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("rc-row")
                }
            }
            Button { showsManual.toggle() } label: {
                Text("Sin tarjeta del club")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(14)
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("rc-manual-open")
            if showsManual {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Elegí cancha, tee y fecha. Queda marcada como no oficial y no entra en los números del grupo, ni en pares, birdies, rachas ni en Con quién jugás.")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    DatePicker("Fecha", selection: $date, in: ...Date(), displayedComponents: .date)
                        .environment(\.timeZone, TimeZone(identifier: "America/Argentina/Buenos_Aires") ?? .current)
                        .accessibilityIdentifier("rc-date")
                    Picker("Cancha", selection: $courseKey) {
                        Text("Elegí la cancha").tag("")
                        ForEach(model.courses) { course in
                            Text("\(course.clubName) · \(course.name)").tag(course.id)
                        }
                    }
                    .accessibilityIdentifier("rc-course")
                    Picker("Tee", selection: $teeName) {
                        ForEach(teeNames, id: \.self) { Text($0).tag($0) }
                    }
                    Button("Registrar golpes") { Task { await create(cardId: nil) } }
                        .buttonStyle(.borderedProminent)
                        .tint(p.primary)
                        .disabled(busy || courseKey.isEmpty)
                        .accessibilityIdentifier("rc-start")
                }
            }
        }
    }

    private var otherCards: [ReconstructionRound] {
        let official = Array(setup.officialRounds.dropFirst())
        let loose = setup.saved.filter { $0.official == false }
        return (official + loose).sorted { lhs, rhs in
            if lhs.date == rhs.date { return lhs.id > rhs.id }
            return lhs.date > rhs.date
        }
    }

    private func choiceLabel(_ round: ReconstructionRound, featured: Bool) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            if featured {
                Text("ÚLTIMA RONDA")
                    .font(GType.label)
                    .foregroundStyle(Color(hex: 0xC8A86A))
            }
            Text(dayLabel(round.date))
                .font(GType.headline)
                .foregroundStyle(featured ? Color.white : p.ink)
            Text(choiceLine(round))
                .font(GType.label)
                .foregroundStyle(featured ? Color.white : p.ink2)
            Text(round.official == false ? (round.tracked ? "No oficial · Golpes cargados" : "No oficial") : (round.tracked ? "Golpes cargados" : "Sin golpes"))
                .font(GType.label)
                .foregroundStyle(featured ? Color.white : p.ink2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(featured ? p.primary : p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func editor(_ live: ReconstructionRound?) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(live.map { "\($0.date) · \($0.course)" } ?? stagedTitle)
                .font(GType.headline)
                .foregroundStyle(p.ink)
            if unofficialRound {
                Text("No oficial")
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .padding(.horizontal, 8)
                    .frame(minHeight: 24)
                    .background(Color(hex: 0xECE7DB))
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .accessibilityIdentifier("tk-unofficial")
            }
            holeMap
            if holeEnds[hole]?.verified() != nil {
                HStack(spacing: 12) {
                    Text(metersLine)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                        .accessibilityIdentifier("play-meters")
                    Spacer()
                    Button("ENTER") { dropAtCenter() }
                        .font(GType.headline)
                        .foregroundStyle(Color.white)
                        .padding(.horizontal, 16)
                        .frame(minHeight: 44)
                        .background(p.accent)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .accessibilityIdentifier("play-hit")
                }
            }
            HStack {
                Button("Hoyo anterior") { shiftHole(-1) }
                    .disabled(hole <= 1)
                    .accessibilityIdentifier("tkprev")
                Spacer()
                Text("Hoyo \(hole)")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Spacer()
                Button("Hoyo siguiente") { shiftHole(1) }
                    .disabled(hole >= 18)
                    .accessibilityIdentifier("tknext")
            }
            .font(GType.label)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(clubs, id: \.self) { name in
                        Button(name) { club = name }
                            .font(GType.label)
                            .padding(.horizontal, 10)
                            .frame(minHeight: 36)
                            .foregroundStyle(club == name ? Color.white : p.ink)
                            .background(club == name ? p.primary : p.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 8))
                    }
                }
            }
            .accessibilityIdentifier("rc-clubs")
            Picker("Hoyo", selection: $hole) {
                ForEach(1...18, id: \.self) { Text("\($0)").tag($0) }
            }
            .onChange(of: hole) { _, _ in
                start = nil
                end = nil
                aim()
            }
            Picker("Palo", selection: $club) {
                ForEach(clubs, id: \.self) { Text($0).tag($0) }
            }
            Picker("Resultado", selection: $result) {
                Text("Sin resultado").tag("")
                ForEach(results, id: \.self) { Text($0).tag($0) }
            }
            Stepper("Penas: \(penalties)", value: $penalties, in: 0...4)
            TextField("Distancia estimada en metros, si no marcaste los dos puntos", text: $typedDistance)
                .keyboardType(.numberPad)
            Button(editing == nil ? "Guardar golpe" : "Guardar corrección") { Task { await commit(live) } }
                .buttonStyle(.borderedProminent)
                .tint(p.accent)
                .disabled(busy)
            ForEach(shots) { shot in
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text("Hoyo \(shot.hole) · \(shot.club.isEmpty ? "sin palo" : shot.club)")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        if shot.intent == "recovery" {
                            Text("A buena")
                                .font(GFont.ui(9, weight: .bold))
                                .foregroundStyle(Color.white)
                                .padding(.horizontal, 4)
                                .padding(.vertical, 1)
                                .background(p.accent)
                                .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                        }
                    }
                    Text("\(shot.positionLabel). \(shot.distanceLabel)\(shot.distanceM.map { " · \(Int($0.rounded())) m" } ?? "")\(shot.penaltyStrokes > 0 ? " · \(shot.penaltyStrokes) pena\(shot.penaltyStrokes == 1 ? "" : "s")" : "")")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    HStack {
                        Button("Corregir") { load(shot) }
                        Button("Borrar") { Task { if let live { await remove(live, shot) } } }
                    }
                    .font(GType.label)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
    }

    private var unofficialRound: Bool {
        if let live { return live.official == false }
        return roundId.isEmpty
    }

    @ViewBuilder
    private var holeMap: some View {
        if let pair = holeEnds[hole]?.verified() {
            ZStack {
                Map(position: $camera) {
                    Annotation("Salida", coordinate: coord(pair.tee)) {
                        Circle().fill(Color.white).frame(width: 10, height: 10)
                    }
                    Annotation("Bandera", coordinate: coord(pair.flag)) {
                        Circle().fill(p.accent).frame(width: 10, height: 10)
                    }
                }
                .mapStyle(.imagery(elevation: .flat))
                reticle
            }
            .frame(height: 280)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("hole-satellite")
        } else if let focus = courseFocus {
            Map(position: $camera) {
                Annotation("Cancha", coordinate: coord(focus)) {}
            }
            .mapStyle(.imagery(elevation: .flat))
            .frame(height: 220)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .accessibilityIdentifier("hole-satellite")
            Text("Este hoyo no tiene geometría verificada. No marco un punto inventado.")
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier("rc-nogeo")
        } else {
            Text("Este hoyo no tiene geometría verificada. No marco un punto inventado.")
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier("rc-nogeo")
        }
    }

    private var reticle: some View {
        ZStack {
            Rectangle().fill(Color(hex: 0x0B2545)).frame(width: 1, height: 28)
            Rectangle().fill(Color(hex: 0x0B2545)).frame(width: 28, height: 1)
            Circle().stroke(Color(hex: 0xC8102E), lineWidth: 2).frame(width: 18, height: 18)
        }
        .allowsHitTesting(false)
        .accessibilityIdentifier("play-reticle")
    }

    private var metersLine: String {
        guard let pair = holeEnds[hole]?.verified(), let center = aimCenter else { return "Metros" }
        let meters = Int(distanceMeters(pair.tee, center).rounded())
        return meters > 0 ? "\(meters) m" : "Metros"
    }

    private func distanceMeters(_ a: ReconstructionPoint, _ b: ReconstructionPoint) -> Double {
        let r = 6371000.0
        let dLat = (b.lat - a.lat) * .pi / 180
        let dLng = (b.lng - a.lng) * .pi / 180
        let h = pow(sin(dLat / 2), 2) + cos(a.lat * .pi / 180) * cos(b.lat * .pi / 180) * pow(sin(dLng / 2), 2)
        return 2 * r * asin(min(1, sqrt(h)))
    }

    private func dropAtCenter() {
        guard let pair = holeEnds[hole]?.verified(), let center = aimCenter else { return }
        start = pair.tee
        end = center
        let meters = Int(distanceMeters(pair.tee, center).rounded())
        if meters > 0 { typedDistance = String(meters) }
    }

    private func coord(_ point: ReconstructionPoint) -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng)
    }

    private func shiftHole(_ delta: Int) {
        hole = min(18, max(1, hole + delta))
    }

    private func choiceLine(_ round: ReconstructionRound) -> String {
        var bits = [round.course.isEmpty ? "Cancha" : round.course]
        if !round.tee.isEmpty { bits.append("Tee \(round.tee)") }
        if let gross = round.gross { bits.append(String(gross)) }
        return bits.joined(separator: " · ")
    }

    private func dayLabel(_ iso: String) -> String {
        let parts = iso.split(separator: "-")
        let months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
        guard parts.count == 3, let month = Int(parts[1]), let day = Int(parts[2]), month >= 1, month <= 12 else { return iso }
        return "\(day) \(months[month - 1]) \(parts[0])"
    }

    private func aim() {
        if let pair = holeEnds[hole]?.verified() {
            let minLat = min(pair.tee.lat, pair.flag.lat)
            let maxLat = max(pair.tee.lat, pair.flag.lat)
            let minLng = min(pair.tee.lng, pair.flag.lng)
            let maxLng = max(pair.tee.lng, pair.flag.lng)
            let center = CLLocationCoordinate2D(latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2)
            let span = MKCoordinateSpan(latitudeDelta: max(0.004, (maxLat - minLat) * 1.8), longitudeDelta: max(0.004, (maxLng - minLng) * 1.8))
            camera = .region(MKCoordinateRegion(center: center, span: span))
            aimCenter = ReconstructionPoint(lat: center.latitude, lng: center.longitude)
            return
        }
        if let focus = courseFocus {
            camera = .region(MKCoordinateRegion(center: coord(focus), span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02)))
        }
    }

    private func artDate() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private var stagedTitle: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        formatter.dateFormat = "yyyy-MM-dd"
        let course = context?.courseName ?? ""
        return "\(formatter.string(from: date)) · \(course)"
    }

    /// A holed hole replaces Vos's score on the match. The same total is not added twice.
    private func reportClosedHole() {
        guard let onHoleScore else { return }
        let mine = shots.filter { $0.hole == hole }
        guard mine.contains(where: { $0.result == "holed" }) else { return }
        let strokes = mine.reduce(0) { partial, shot in
            partial + (shot.penaltyStrokes > 0 ? shot.penaltyStrokes : 1)
        }
        if strokes > 0 { onHoleScore(hole, strokes) }
    }

    private func loadSetup() async {
        if let context, context.roundId.isEmpty {
            date = context.date
            roundId = ""
            hole = min(18, max(1, context.hole))
            staged = true
            if let course = RoundTrackCourse.match(courses: model.courses, clubCode: context.clubCode, name: context.courseName) {
                courseKey = course.id
                await loadMap(club: course.clubCode, name: course.name)
            }
            return
        }
        do { setup = try await model.api.reconstructionSetup() }
        catch { note = error.localizedDescription; return }
        guard let context else { return }
        date = context.date
        roundId = context.roundId
        hole = min(18, max(1, context.hole))
        if let saved = setup.saved.first(where: { $0.roundId == context.roundId }) {
            await open(saved)
            return
        }
        guard let course = RoundTrackCourse.match(courses: model.courses, clubCode: context.clubCode, name: context.courseName) else { return }
        courseKey = course.id
        staged = true
        await loadMap(club: course.clubCode, name: course.name)
    }

    private func openChoice(_ choice: ReconstructionRound) async {
        note = ""
        if let saved = setup.saved.first(where: { $0.roundId == choice.id }) {
            await open(saved)
            return
        }
        roundId = choice.id
        if let day = Self.day(choice.date) { date = day }
        if !choice.tee.isEmpty { teeName = choice.tee }
        if let course = RoundTrackCourse.match(courses: model.courses, clubCode: choice.clubCode, name: choice.course) {
            courseKey = course.id
            staged = true
            await loadMap(club: course.clubCode, name: course.name)
        } else {
            courseKey = ""
            staged = true
            note = "Elegí la cancha para guardar los golpes."
            await loadMap(club: choice.clubCode, name: choice.course)
        }
    }

    private func loadMap(club: String, name: String) async {
        let id = ReconstructionCourseId.make(clubCode: club, course: name)
        var bag: [Int: HoleEnds] = [:]
        if let detail = try? await model.api.gpsCourse(id: id, lat: nil, lng: nil) {
            for hole in detail.holes {
                var ends = HoleEnds()
                if let tee = hole.tee, ReconstructPayload.knownPoint(["lat": tee.lat, "lng": tee.lng] as [String: Any]) != nil {
                    ends.tee = ReconstructionPoint(lat: tee.lat, lng: tee.lng)
                }
                if let flag = hole.green.center ?? hole.green.front, ReconstructPayload.knownPoint(["lat": flag.lat, "lng": flag.lng] as [String: Any]) != nil {
                    ends.flag = ReconstructionPoint(lat: flag.lat, lng: flag.lng)
                }
                bag[hole.number] = ends
            }
        }
        if !club.isEmpty, !name.isEmpty, let map = try? await model.api.courseMap(club: club, course: name) {
            ReconstructPayload.mergeCourseMap(map, into: &bag)
        }
        holeEnds = bag
        courseFocus = ReconstructPayload.courseFocus(bag)
        aim()
    }

    private static func day(_ iso: String) -> Date? {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: iso)
    }

    private func create(cardId: String?) async {
        guard let course = model.courses.first(where: { $0.id == courseKey }) else { note = "Elegí la cancha."; return }
        busy = true
        defer { busy = false }
        do {
            let id = ReconstructionCourseId.make(clubCode: course.clubCode, course: course.name)
            let created = try await model.api.createReconstruction(date: artDate(), courseId: id, roundId: cardId, tee: teeName)
            roundId = cardId ?? ""
            await open(created)
        } catch { note = error.localizedDescription }
    }

    private func open(_ round: ReconstructionRound) async {
        note = ""
        live = round
        do {
            shots = try await model.api.reconstructionShots(liveRoundId: round.id)
            let name = round.vmCourse.isEmpty ? round.course : round.vmCourse
            if !round.clubCode.isEmpty { await loadMap(club: round.clubCode, name: name) }
        } catch { note = error.localizedDescription }
    }

    private func draft() -> ReconstructionDraft {
        let meters = Double(typedDistance.replacingOccurrences(of: ",", with: "."))
        return ReconstructionDraft(hole: hole, club: club, result: result.isEmpty ? nil : result, penaltyStrokes: penalties, lat: start?.lat, lng: start?.lng, endLat: end?.lat, endLng: end?.lng, distanceM: meters)
    }

    private func commit(_ round: ReconstructionRound?) async {
        if let round {
            await save(round)
            return
        }
        guard let course = model.courses.first(where: { $0.id == courseKey }) else { note = "Elegí la cancha."; return }
        busy = true
        defer { busy = false }
        do {
            let id = ReconstructionCourseId.make(clubCode: course.clubCode, course: course.name)
            let created = try await model.api.createReconstruction(date: artDate(), courseId: id, roundId: roundId.isEmpty ? nil : roundId, tee: teeName)
            live = created
            staged = false
            shots = [try await model.api.saveReconstructionShot(liveRoundId: created.id, shot: draft())]
            editing = nil
            start = nil
            end = nil
            typedDistance = ""
            note = ""
        } catch { note = error.localizedDescription }
    }

    private func save(_ round: ReconstructionRound) async {
        busy = true
        defer { busy = false }
        do {
            if let editing {
                let shot = try await model.api.updateReconstructionShot(liveRoundId: round.id, shotId: editing, shot: draft())
                if let i = shots.firstIndex(where: { $0.id == shot.id }) { shots[i] = shot }
            } else {
                shots.append(try await model.api.saveReconstructionShot(liveRoundId: round.id, shot: draft()))
            }
            self.editing = nil
            start = nil
            end = nil
            typedDistance = ""
            note = ""
        } catch { note = error.localizedDescription }
    }

    private func load(_ shot: ReconstructionShot) {
        editing = shot.id
        hole = shot.hole
        club = shot.club.isEmpty ? "7i" : shot.club
        result = shot.result ?? ""
        penalties = shot.penaltyStrokes
        typedDistance = shot.lat == nil && shot.distanceM != nil ? String(Int(shot.distanceM!.rounded())) : ""
        start = shot.lat.flatMap { lat in shot.lng.map { ReconstructionPoint(lat: lat, lng: $0) } }
        end = shot.endLat.flatMap { lat in shot.endLng.map { ReconstructionPoint(lat: lat, lng: $0) } }
        aim()
    }

    private func remove(_ round: ReconstructionRound, _ shot: ReconstructionShot) async {
        do {
            try await model.api.deleteReconstructionShot(liveRoundId: round.id, shotId: shot.id)
            shots.removeAll { $0.id == shot.id }
        } catch { note = error.localizedDescription }
    }
}
