import Foundation

enum PlansAPIPaths {
    static let setup = "/api/plans/setup"
    static let list = "/api/plans"
    static let clubs = "/api/plans/clubs"
    static func plan(_ id: String) -> String { "/api/plans/\(id)" }
    static func hole(_ id: String, n: Int) -> String { "/api/plans/\(id)/holes/\(n)" }
    static func courseMap(club: String, course: String) -> String {
        let clubEnc = club.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? club
        let courseEnc = course.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? course
        return "/api/course-maps/\(clubEnc)/\(courseEnc)"
    }
}

extension LiveGolfletAPI {
    func planSetup() async throws -> PlanSetup {
        PlanParser.setup(try await request("GET", PlansAPIPaths.setup))
    }

    func createPlan(clubCode: String, course: String, date: String, teeTime: String, startHole: Int?, teeTimeID: String?) async throws -> PlanDetail {
        var body: [String: Any] = [
            "club_code": clubCode,
            "course": course,
            "date": date,
            "tee_time": teeTime
        ]
        if let startHole { body["start_hole"] = startHole }
        if let teeTimeID { body["tee_time_id"] = teeTimeID }
        guard let detail = PlanParser.detail(try await request("POST", PlansAPIPaths.list, body: body)) else {
            throw GolfletError.decoding("plan")
        }
        return detail
    }

    func plan(id: String) async throws -> PlanDetail {
        guard let detail = PlanParser.detail(try await request("GET", PlansAPIPaths.plan(id))) else {
            throw GolfletError.decoding("plan")
        }
        return detail
    }

    func savePlanShots(id: String, hole: Int, shots: [PlanSavedShot]) async throws -> [PlanSavedShot] {
        let payload: [[String: Any]] = shots.map { shot in
            var item: [String: Any] = ["club": shot.club, "source": shot.source]
            if let to = shot.to { item["to"] = [to.lng, to.lat] }
            if let yards = shot.yardsFromTee { item["yd_from_tee"] = yards }
            if shot.adjusted { item["adjusted"] = true }
            if shot.suggested { item["suggested"] = true }
            if let aim = shot.aimYd, aim != 0 { item["aim_yd"] = aim }
            return item
        }
        let json = try await request("PUT", PlansAPIPaths.hole(id, n: hole), body: ["shots": payload])
        return PlanParser.savedShots(json["shots"])
    }

    func planClubs() async throws -> [PlanBagEntry] {
        PlanParser.clubs(try await request("GET", PlansAPIPaths.clubs))
    }

    func courseMap(clubCode: String, course: String) async throws -> CourseMap {
        guard let map = PlanParser.courseMap(try await request("GET", PlansAPIPaths.courseMap(club: clubCode, course: course))) else {
            throw GolfletError.decoding("course-map")
        }
        return map
    }
}

extension MockAPIClient {
    func planSetup() async throws -> PlanSetup {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return MockPlans.setup
    }

    func createPlan(clubCode: String, course: String, date: String, teeTime: String, startHole: Int?, teeTimeID: String?) async throws -> PlanDetail {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return MockPlans.detail(clubCode: clubCode, course: course, date: date, teeTime: teeTime, startHole: startHole ?? 1)
    }

    func plan(id: String) async throws -> PlanDetail {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return MockPlans.detail(id: id)
    }

    func savePlanShots(id: String, hole: Int, shots: [PlanSavedShot]) async throws -> [PlanSavedShot] {
        _ = id
        _ = hole
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return shots
    }

    func planClubs() async throws -> [PlanBagEntry] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return MockPlans.clubs
    }

    func courseMap(clubCode: String, course: String) async throws -> CourseMap {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return MockPlans.courseMap(clubCode: clubCode, course: course)
    }
}
