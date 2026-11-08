import MapKit
import SwiftUI

struct ReconstructView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    @State private var date = Date()
    @State private var courseKey = ""
    @State private var roundId = ""
    @State private var setup = ReconstructionSetup(officialRounds: [], saved: [])
    @State private var live: ReconstructionRound?
    @State private var shots: [ReconstructionShot] = []
    @State private var centers: [Int: ReconstructionPoint] = [:]
    @State private var hole = 1
    @State private var club = "7i"
    @State private var result = ""
    @State private var penalties = 0
    @State private var typedDistance = ""
    @State private var start: ReconstructionPoint?
    @State private var end: ReconstructionPoint?
    @State private var editing: String?
    @State private var camera = MapCameraPosition.automatic
    @State private var aimPoint: ReconstructionPoint?
    @State private var note = ""
    @State private var busy = false

    private let clubs = ["Dr", "3W", "5W", "Hy", "4i", "5i", "6i", "7i", "8i", "9i", "PW", "GW", "SW", "LW", "Pt"]
    private let results = ["fairway", "green", "rough", "bunker", "water", "ob", "penalty", "holed", "other"]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if let live {
                    editor(live)
                } else {
                    picker
                }
                if !note.isEmpty {
                    Text(note).font(GType.label).foregroundStyle(p.negative)
                }
            }
            .padding(16)
        }
        .background(p.bg)
        .navigationTitle("Vuelta ya jugada")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cerrar") { model.showsReconstruct = false; dismiss() }
            }
        }
        .task { await loadSetup() }
    }

    private var picker: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Elegí la fecha, la cancha y, si ya está, la tarjeta del club. Los golpes se guardan aparte y no reescriben esa tarjeta.")
                .font(GType.label)
                .foregroundStyle(p.ink2)
            DatePicker("Fecha", selection: $date, in: ...Date(), displayedComponents: .date)
                .environment(\.timeZone, TimeZone(identifier: "America/Argentina/Buenos_Aires") ?? .current)
            Picker("Cancha", selection: $courseKey) {
                Text("Elegí la cancha").tag("")
                ForEach(model.courses) { course in
                    Text("\(course.clubName) · \(course.name)").tag(course.id)
                }
            }
            Picker("Tarjeta del club", selection: $roundId) {
                Text("Sin asociar").tag("")
                ForEach(setup.officialRounds) { round in
                    Text("\(round.date) · \(round.clubName) · \(round.course)").tag(round.id)
                }
            }
            Button("Empezar hoyo por hoyo") { Task { await create() } }
                .buttonStyle(.borderedProminent)
                .tint(p.primary)
                .disabled(busy || courseKey.isEmpty)
            ForEach(setup.saved) { saved in
                Button {
                    Task { await open(saved) }
                } label: {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(saved.date) · \(saved.course)").font(GType.headline).foregroundStyle(p.ink)
                        Text("Seguir cargando golpes").font(GType.label).foregroundStyle(p.ink2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func editor(_ live: ReconstructionRound) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("\(live.date) · \(live.course)")
                .font(GType.headline)
                .foregroundStyle(p.ink)
            Text("La mira queda fija. Mové el mapa y marcá la salida y la caída. Si el hoyo no tiene mapa, guardá el palo y el resultado sin un punto.")
                .font(GType.label)
                .foregroundStyle(p.ink2)
            if let point = centers[hole] {
                Map(position: $camera) {
                    Annotation("Salida", coordinate: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng)) {}
                }
                .frame(height: 280)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(Circle().stroke(Color.white, lineWidth: 2).background(Circle().stroke(p.accent, lineWidth: 4)).frame(width: 14, height: 14))
                .onMapCameraChange { context in
                    aimPoint = ReconstructionPoint(lat: context.region.center.latitude, lng: context.region.center.longitude)
                }
                HStack {
                    Button("Salida en la mira") { start = currentCenter() }
                    Button("Caída en la mira") { end = currentCenter() }
                    Button("Borrar puntos") { start = nil; end = nil }
                }
                .font(GType.label)
                Text(placeCopy).font(GType.label).foregroundStyle(p.ink2)
            } else {
                Text("Este hoyo no tiene un punto de mapa. Podés guardar el palo, el resultado y las penas sin ubicación.")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
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
            Button(editing == nil ? "Guardar golpe" : "Guardar corrección") { Task { await save(live) } }
                .buttonStyle(.borderedProminent)
                .tint(p.accent)
                .disabled(busy)
            ForEach(shots) { shot in
                VStack(alignment: .leading, spacing: 4) {
                    Text("Hoyo \(shot.hole) · \(shot.club.isEmpty ? "sin palo" : shot.club)")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("\(shot.positionLabel). \(shot.distanceLabel)\(shot.distanceM.map { " · \(Int($0.rounded())) m" } ?? "")\(shot.penaltyStrokes > 0 ? " · \(shot.penaltyStrokes) pena\(shot.penaltyStrokes == 1 ? "" : "s")" : "")")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    HStack {
                        Button("Corregir") { load(shot) }
                        Button("Borrar") { Task { await remove(live, shot) } }
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

    private var placeCopy: String {
        let whereText = start != nil || end != nil ? "Marcado a mano" : "Sin ubicación"
        let dist = start != nil && end != nil ? "Distancia estimada" : (typedDistance.isEmpty ? "Sin distancia" : "Distancia estimada, sin los dos puntos")
        return "\(whereText). \(dist)."
    }

    private func currentCenter() -> ReconstructionPoint? {
        aimPoint ?? centers[hole]
    }

    private func aim() {
        guard let point = centers[hole] else { return }
        camera = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: point.lat, longitude: point.lng), span: MKCoordinateSpan(latitudeDelta: 0.002, longitudeDelta: 0.002)))
    }

    private func artDate() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    private func loadSetup() async {
        do { setup = try await model.api.reconstructionSetup() }
        catch { note = error.localizedDescription }
    }

    private func create() async {
        guard let course = model.courses.first(where: { $0.id == courseKey }) else { note = "Elegí la cancha."; return }
        busy = true
        defer { busy = false }
        do {
            let id = ReconstructionCourseId.make(clubCode: course.clubCode, course: course.name)
            let created = try await model.api.createReconstruction(date: artDate(), courseId: id, roundId: roundId.isEmpty ? nil : roundId)
            await open(created)
        } catch { note = error.localizedDescription }
    }

    private func open(_ round: ReconstructionRound) async {
        note = ""
        live = round
        do {
            shots = try await model.api.reconstructionShots(liveRoundId: round.id)
            let id = ReconstructionCourseId.make(clubCode: round.clubCode, course: round.vmCourse.isEmpty ? round.course : round.vmCourse)
            if !round.clubCode.isEmpty { centers = try await model.api.courseCenters(courseId: id) }
            aim()
        } catch { note = error.localizedDescription }
    }

    private func draft() -> ReconstructionDraft {
        let meters = Double(typedDistance.replacingOccurrences(of: ",", with: "."))
        return ReconstructionDraft(hole: hole, club: club, result: result.isEmpty ? nil : result, penaltyStrokes: penalties, lat: start?.lat, lng: start?.lng, endLat: end?.lat, endLng: end?.lng, distanceM: meters)
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
