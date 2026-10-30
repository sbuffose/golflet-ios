import Foundation

extension LiveGolfletAPI {
    func teeTimes() async throws -> [TeeTime] {
        TeeTimesParser.list(from: try await request("GET", TeeTimesAPIPaths.list))
    }

    func checkTeeTimes(limit: Int) async throws -> TeeTimeCheck {
        TeeTimesParser.check(from: try await request("POST", TeeTimesAPIPaths.check(limit: limit), body: [:]))
    }
}

extension MockAPIClient {
    func teeTimes() async throws -> [TeeTime] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-no-tee") {
            return []
        }
        return Self.mockBookings()
    }

    func checkTeeTimes(limit: Int) async throws -> TeeTimeCheck {
        _ = limit
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-no-tee") {
            return TeeTimeCheck(status: "no_account", newIDs: [], changedIDs: [], goneIDs: [], nextInSeconds: 150, teeTimes: [])
        }
        let bookings = Self.mockBookings()
        let already = Self.mockTeeChecked
        Self.mockTeeChecked = true
        if already {
            return TeeTimeCheck(status: "throttled", newIDs: [], changedIDs: [], goneIDs: [], nextInSeconds: 150, teeTimes: bookings)
        }
        return TeeTimeCheck(
            status: "checked",
            newIDs: [bookings[0].id],
            changedIDs: [],
            goneIDs: [],
            nextInSeconds: 150,
            teeTimes: bookings
        )
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
