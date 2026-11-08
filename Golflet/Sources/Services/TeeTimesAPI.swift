import Foundation

extension LiveGolfletAPI {
    func teeTimes() async throws -> [TeeTime] {
        TeeTimesParser.list(from: try await request("GET", TeeTimesAPIPaths.list))
    }

    func scorecardFetches() async throws -> [ScorecardFetchJob] {
        ScorecardFetchParser.list(from: try await request("GET", "/api/scorecard-fetches"))
    }
}

enum ScorecardFetchParser {
    static func list(from json: [String: Any]) -> [ScorecardFetchJob] {
        let raw = json["fetches"] as? [Any] ?? []
        return raw.compactMap { item in
            guard let row = item as? [String: Any] else { return nil }
            let id = (row["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !id.isEmpty else { return nil }
            let label = (row["label"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return ScorecardFetchJob(
                id: id,
                teeTimeId: row["tee_time_id"] as? String,
                date: (row["date"] as? String) ?? "",
                time: (row["time"] as? String) ?? "",
                clubName: (row["club_name"] as? String) ?? "",
                course: (row["course_label"] as? String) ?? "",
                status: (row["status"] as? String) ?? "",
                label: label.isEmpty ? "No pudimos leer el estado de esta búsqueda." : label,
                lastError: row["last_error"] as? String,
                roundId: row["round_id"] as? String,
                attemptCount: row["attempt_count"] as? Int ?? 0
            )
        }
    }
}

extension MockAPIClient {
    func scorecardFetches() async throws -> [ScorecardFetchJob] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return []
    }

    func teeTimes() async throws -> [TeeTime] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-no-tee") {
            return []
        }
        return Self.mockBookings()
    }

    private static func mockBookings() -> [TeeTime] {
        let cal = Calendar.gregorian
        let base = Date().addingTimeInterval(36 * 3600)
        var comps = cal.dateComponents([.year, .month, .day], from: base)
        comps.hour = 12
        comps.minute = 33
        comps.second = 0
        let first = cal.date(from: comps) ?? base
        let second = first.addingTimeInterval(7 * 24 * 3600)
        return [
            TeeTime(
                id: "tt-jockey-1",
                startsAt: first,
                clubName: "Jockey Club Buenos Aires",
                clubCode: "118",
                course: "Azul",
                companions: ["Juan", "Pedro", "Ana"]
            ),
            TeeTime(
                id: "tt-mdp-1",
                startsAt: second,
                clubName: "Mar del Plata Golf Club",
                clubCode: "209",
                course: "Cancha Vieja",
                companions: []
            )
        ]
    }
}
