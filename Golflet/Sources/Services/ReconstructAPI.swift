import Foundation

extension LiveGolfletAPI {
    func reconstructionSetup() async throws -> ReconstructionSetup {
        ReconstructPayload.parseSetup(try await request("GET", "/api/reconstructions"))
    }

    func createReconstruction(date: String, courseId: String, roundId: String?) async throws -> ReconstructionRound {
        var body: [String: Any] = ["date": date, "course_id": courseId]
        if let roundId, !roundId.isEmpty { body["round_id"] = roundId }
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
}

extension MockAPIClient {
    func reconstructionSetup() async throws -> ReconstructionSetup {
        ReconstructionSetup(officialRounds: [], saved: [])
    }

    func createReconstruction(date: String, courseId: String, roundId: String?) async throws -> ReconstructionRound {
        let parts = courseId.split(separator: "-", maxSplits: 1).map(String.init)
        return ReconstructionRound(id: "mock-live", date: date, course: parts.count > 1 ? parts[1] : courseId, clubName: "", clubCode: parts.first ?? "", vmCourse: parts.count > 1 ? parts[1] : "", roundId: roundId)
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
}

enum ReconstructPayload {
    static func parseSetup(_ json: [String: Any]) -> ReconstructionSetup {
        let official = (json["rounds"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.map { round($0, clubName: text($0["club_name"])) }
        let saved = (json["reconstructions"] as? [Any] ?? []).compactMap { $0 as? [String: Any] }.map { round($0, clubName: "") }
        return ReconstructionSetup(officialRounds: official, saved: saved)
    }

    static func round(_ row: [String: Any], clubName: String) -> ReconstructionRound {
        ReconstructionRound(
            id: text(row["id"]),
            date: String(text(row["date"]).prefix(10)),
            course: text(row["course"]),
            clubName: clubName,
            clubCode: text(row["club_code"]),
            vmCourse: text(row["vm_course"]),
            roundId: row["round_id"] as? String
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
            positionLabel: text(row["position_label"]),
            distanceLabel: text(row["distance_label"])
        )
    }

    static func echo(_ shot: ReconstructionDraft, id: String) -> ReconstructionShot {
        let placed = shot.lat != nil || shot.endLat != nil
        let meters = shot.distanceM
        return ReconstructionShot(
            id: id, hole: shot.hole, club: shot.club, result: shot.result, penaltyStrokes: shot.penaltyStrokes,
            lat: shot.lat, lng: shot.lng, endLat: shot.endLat, endLng: shot.endLng, distanceM: meters,
            positionLabel: placed ? "Marcado a mano" : "Sin ubicación",
            distanceLabel: meters != nil || (shot.lat != nil && shot.endLat != nil) ? "Distancia estimada" : "Sin distancia"
        )
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
