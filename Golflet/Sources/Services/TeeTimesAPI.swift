import Foundation

struct ReservationRefresh: Sendable {
    var fresh: Bool
    var playersRead: Bool
    var message: String?
    var teeTimes: [TeeTime]
}

extension LiveGolfletAPI {
    func teeTimes() async throws -> [TeeTime] {
        TeeTimesParser.list(from: try await request("GET", TeeTimesAPIPaths.list))
    }

    func refreshBookings() async throws -> ReservationRefresh {
        parseRefresh(try await request("POST", "/api/tee-times/check?limit=50", body: [:], timeout: 60))
    }

    func refreshReservation(id: String) async throws -> ReservationRefresh {
        parseRefresh(try await request("POST", "/api/tee-times/check?limit=50", body: ["players": true, "tee_id": id], timeout: 60))
    }

    private func parseRefresh(_ json: [String: Any]) -> ReservationRefresh {
        ReservationRefresh(
            fresh: json["fresh"] as? Bool ?? false,
            playersRead: json["players_read"] as? Bool ?? false,
            message: json["message"] as? String,
            teeTimes: TeeTimesParser.list(from: json)
        )
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

    func refreshBookings() async throws -> ReservationRefresh {
        ReservationRefresh(fresh: true, playersRead: false, message: nil, teeTimes: try await teeTimes())
    }

    func refreshReservation(id: String) async throws -> ReservationRefresh {
        var rows = try await teeTimes()
        if let index = rows.firstIndex(where: { $0.id == id }) {
            rows[index].companions = ["Jugador leído del club"]
        }
        return ReservationRefresh(fresh: true, playersRead: true, message: nil, teeTimes: rows)
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
