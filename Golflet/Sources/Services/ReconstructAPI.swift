import Foundation

extension LiveGolfletAPI {
    func reconstructionSetup() async throws -> ReconstructionSetup {
        ReconstructPayload.parseSetup(try await request("GET", "/api/reconstructions"))
    }

    func createReconstruction(date: String, courseId: String, roundId: String?, tee: String?) async throws -> ReconstructionRound {
        var body: [String: Any] = ["date": date, "course_id": courseId]
        if let roundId, !roundId.isEmpty { body["round_id"] = roundId }
        if let tee, !tee.isEmpty { body["tee"] = tee }
        let json = try await request("POST", "/api/reconstructions", body: body)
        guard let row = json["live_round"] as? [String: Any] else { throw GolfletError.server("No se pudo abrir la vuelta.") }
        return ReconstructPayload.round(row, clubName: "")
    }

    func reconstructionShots(liveRoundId: String) async throws -> [ReconstructionShot] {
        let json = try await request("GET", "/api/reconstructions/\(liveRoundId)/shots")
        return ReconstructPayload.shots(json["shots"])
    }

    func saveReconstructionShot(liveRoundId: String, shot: ReconstructionDraft) async throws -> ReconstructionShot {
        let json = try await request("POST", "/api/reconstructions/\(liveRoundId)/shots", body: shot.body)
        guard let row = json["shot"] as? [String: Any] else { throw GolfletError.server("No se pudo guardar el golpe.") }
        return ReconstructPayload.shot(row)
    }

    func updateReconstructionShot(liveRoundId: String, shotId: String, shot: ReconstructionDraft) async throws -> ReconstructionShot {
        var body = shot.body
        body["shot_id"] = shotId
        let json = try await request("PATCH", "/api/reconstructions/\(liveRoundId)/shots", body: body)
        guard let row = json["shot"] as? [String: Any] else { throw GolfletError.server("No se pudo corregir el golpe.") }
        return ReconstructPayload.shot(row)
    }

    func deleteReconstructionShot(liveRoundId: String, shotId: String) async throws {
        _ = try await request("DELETE", "/api/reconstructions/\(liveRoundId)/shots?shot=\(shotId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? shotId)")
    }

    func courseCenters(courseId: String) async throws -> [Int: ReconstructionPoint] {
        let json = try await request("GET", "/api/gps/courses/\(courseId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? courseId)")
        return ReconstructPayload.centers(json)
    }

    func courseMap(club: String, course: String) async throws -> [String: Any] {
        let clubPart = club.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? club
        let coursePart = course.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? course
        return try await request("GET", "/api/course-maps/\(clubPart)/\(coursePart)")
    }
}

extension MockAPIClient {
    func reconstructionSetup() async throws -> ReconstructionSetup {
        guard ProcessInfo.processInfo.arguments.contains("-ui-testing-review") else {
            return ReconstructionSetup(officialRounds: [], saved: [])
        }
        let last = ReconstructionRound(id: "card-new", date: "2026-11-08", course: "Cancha Vieja", clubName: "Mar del Plata", clubCode: "209", vmCourse: "Cancha Vieja", roundId: "card-new", tee: "Azul", gross: 82, tracked: false, official: true)
        let older = ReconstructionRound(id: "card-old", date: "2026-10-04", course: "Azul", clubName: "Club Fixture", clubCode: "118", vmCourse: "Azul", roundId: "card-old", tee: "Blanco", gross: 76, tracked: true, official: true)
        let loose = ReconstructionRound(id: "live-loose", date: "2026-11-02", course: "Cancha Vieja", clubName: "", clubCode: "209", vmCourse: "Cancha Vieja", roundId: nil, tee: "Blanco", gross: nil, tracked: false, official: false)
        return ReconstructionSetup(officialRounds: [last, older], saved: [loose])
    }

    func createReconstruction(date: String, courseId: String, roundId: String?, tee: String?) async throws -> ReconstructionRound {
        let parts = courseId.split(separator: "-", maxSplits: 1).map(String.init)
        return ReconstructionRound(id: "mock-live", date: date, course: parts.count > 1 ? parts[1] : courseId, clubName: "", clubCode: parts.first ?? "", vmCourse: parts.count > 1 ? parts[1] : "", roundId: roundId, tee: tee ?? "", gross: nil, tracked: false, official: !(roundId ?? "").isEmpty)
    }

    func reconstructionShots(liveRoundId: String) async throws -> [ReconstructionShot] { [] }

    func saveReconstructionShot(liveRoundId: String, shot: ReconstructionDraft) async throws -> ReconstructionShot {
        ReconstructPayload.echo(shot, id: "mock-shot")
    }

    func updateReconstructionShot(liveRoundId: String, shotId: String, shot: ReconstructionDraft) async throws -> ReconstructionShot {
        ReconstructPayload.echo(shot, id: shotId)
    }

    func deleteReconstructionShot(liveRoundId: String, shotId: String) async throws {}

    func courseCenters(courseId: String) async throws -> [Int: ReconstructionPoint] { [:] }

    func courseMap(club: String, course: String) async throws -> [String: Any] { [:] }
}

enum ReconstructPayload {
    static func parseSetup(_ json: [String: Any]) -> ReconstructionSetup {
        let official = (json["rounds"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.map { row -> ReconstructionRound in
            var item = round(row, clubName: text(row["club_name"]))
            item.roundId = item.id
            item.official = true
            return item
        }
        let saved = (json["reconstructions"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.map { round($0, clubName: "") }
        return ReconstructionSetup(officialRounds: official, saved: saved)
    }

    static func round(_ row: [String: Any], clubName: String) -> ReconstructionRound {
        let linked = text(row["round_id"])
        return ReconstructionRound(
            id: text(row["id"]),
            date: String(text(row["date"]).prefix(10)),
            course: text(row["course"]),
            clubName: clubName,
            clubCode: text(row["club_code"]),
            vmCourse: text(row["vm_course"]),
            roundId: linked.isEmpty ? nil : linked,
            tee: text(row["tee"]),
            gross: JSONFlex.int(from: row["gross"]),
            tracked: JSONFlex.bool(from: row["tracked"]) ?? false,
            official: JSONFlex.bool(from: row["official"]) ?? !linked.isEmpty
        )
    }

    static func shots(_ raw: Any?) -> [ReconstructionShot] {
        (raw as? [Any] ?? []).compactMap { $0 as? [String: Any] }.map(shot)
    }

    static func shot(_ row: [String: Any]) -> ReconstructionShot {
        ReconstructionShot(
            id: text(row["id"]),
            hole: (row["hole"] as? NSNumber)?.intValue ?? 1,
            club: text(row["club"]),
            result: row["result"] as? String,
            penaltyStrokes: (row["penalty_strokes"] as? NSNumber)?.intValue ?? 0,
            lat: number(row["lat"]),
            lng: number(row["lng"]),
            endLat: number(row["end_lat"]),
            endLng: number(row["end_lng"]),
            distanceM: number(row["distance_m"]),
            lie: row["lie"] as? String,
            positionLabel: text(row["position_label"]),
            distanceLabel: text(row["distance_label"]),
            intent: row["intent"] as? String
        )
    }

    static func echo(_ shot: ReconstructionDraft, id: String) -> ReconstructionShot {
        let placed = shot.lat != nil || shot.endLat != nil
        let meters = shot.distanceM
        return ReconstructionShot(
            id: id, hole: shot.hole, club: shot.club, result: shot.result, penaltyStrokes: shot.penaltyStrokes,
            lat: shot.lat, lng: shot.lng, endLat: shot.endLat, endLng: shot.endLng, distanceM: meters,
            lie: nil,
            positionLabel: placed ? "Marcado a mano" : "Sin ubicación",
            distanceLabel: meters != nil || (shot.lat != nil && shot.endLat != nil) ? "Distancia estimada" : "Sin distancia"
        )
    }

    static func knownPoint(_ raw: Any?) -> ReconstructionPoint? {
        if let row = raw as? [String: Any] {
            if let lat = flex(row["lat"]), let lng = flex(row["lng"]), plausible(lat, lng) {
                return ReconstructionPoint(lat: lat, lng: lng)
            }
        }
        if let pair = raw as? [Any], pair.count >= 2,
           let lng = flex(pair[0]), let lat = flex(pair[1]), plausible(lat, lng) {
            return ReconstructionPoint(lat: lat, lng: lng)
        }
        return nil
    }

    private static func flex(_ raw: Any?) -> Double? {
        JSONFlex.double(from: raw) ?? (raw as? NSNumber)?.doubleValue
    }

    static func mergeCourseMap(_ json: [String: Any], into bag: inout [Int: HoleEnds]) {
        let holes = json["holes"] as? [Any] ?? []
        for item in holes {
            guard let hole = item as? [String: Any] else { continue }
            let number = JSONFlex.int(from: hole["hole"] ?? hole["number"])
            guard let number else { continue }
            var ends = bag[number] ?? HoleEnds()
            let tees = hole["tees"] as? [Any] ?? []
            if let first = tees.first as? [String: Any], let tee = knownPoint(first["center"]) ?? knownPoint(first) {
                ends.tee = tee
            }
            if let tee = knownPoint(hole["tee"]) { ends.tee = tee }
            if let line = hole["line"] as? [Any], let tee = knownPoint(line.first) { ends.tee = ends.tee ?? tee }
            if let green = hole["green"] as? [String: Any] {
                if let flag = knownPoint(green["center"]) ?? knownPoint(green["front"]) { ends.flag = flag }
            }
            if let line = hole["line"] as? [Any], let flag = knownPoint(line.last), line.count > 1 { ends.flag = ends.flag ?? flag }
            bag[number] = ends
        }
    }

    static func courseFocus(_ bag: [Int: HoleEnds]) -> ReconstructionPoint? {
        var points: [ReconstructionPoint] = []
        for ends in bag.values {
            guard let pair = ends.verified() else { continue }
            points.append(pair.tee)
            points.append(pair.flag)
        }
        guard !points.isEmpty else { return nil }
        let lat = points.map(\.lat).reduce(0, +) / Double(points.count)
        let lng = points.map(\.lng).reduce(0, +) / Double(points.count)
        return ReconstructionPoint(lat: lat, lng: lng)
    }

    private static func plausible(_ lat: Double, _ lng: Double) -> Bool {
        if lat == 0, lng == 0 { return false }
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    }

    static func centers(_ json: [String: Any]) -> [Int: ReconstructionPoint] {
        let course = json["course"] as? [String: Any]
        let holes = course?["holes"] as? [Any] ?? []
        var out: [Int: ReconstructionPoint] = [:]
        for item in holes {
            guard let hole = item as? [String: Any], let n = (hole["hole"] as? NSNumber)?.intValue else { continue }
            if let point = point(hole["tee"]) ?? point((hole["green"] as? [String: Any])?["center"]) ?? point(hole["green"]) {
                out[n] = point
            }
        }
        return out
    }

    private static func point(_ raw: Any?) -> ReconstructionPoint? {
        guard let row = raw as? [String: Any], let lat = number(row["lat"]), let lng = number(row["lng"]) else { return nil }
        return ReconstructionPoint(lat: lat, lng: lng)
    }

    private static func number(_ raw: Any?) -> Double? {
        (raw as? NSNumber)?.doubleValue
    }

    private static func text(_ raw: Any?) -> String {
        raw as? String ?? ""
    }
}
