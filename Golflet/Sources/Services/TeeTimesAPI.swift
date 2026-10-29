import Foundation

extension LiveGolfletAPI {
    func teeTimes() async throws -> [TeeTime] {
        TeeTimesParser.list(from: try await request("GET", TeeTimesAPIPaths.list))
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
