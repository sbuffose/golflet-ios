import Foundation

/// Cuándo pedir la tarjeta a Golfistics después de jugar.
///
/// El sync no arranca al salir del hoyo 18. La tarjeta del club tarda.
/// - Primera vez: 6 horas después del tee time, o 6 horas después de que
///   la persona marcó que jugó (una vuelta de GPS cerrada, sin tee time).
/// - Hasta el día calendario siguiente al de ese primer intento: cada 1 hora.
/// - A partir de ese día: una vez por día.
///
/// Se deja de pedir cuando la tarjeta de ese día ya está en las rondas.
/// Un tee time y una marca de “jugué” el mismo día y el mismo club cuentan
/// como un solo pedido: manda el tee time.
enum ScorecardFetch {
    static let firstDelay: TimeInterval = 6 * 60 * 60
    static let hourly: TimeInterval = 60 * 60
    static let daily: TimeInterval = 24 * 60 * 60

    /// El corte de “día siguiente” es el día del jugador, no UTC.
    static var localCalendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        return calendar
    }

    enum Kind: String, Codable, Sendable {
        case tee
        case played
    }

    struct Anchor: Codable, Equatable, Identifiable, Sendable {
        var id: String
        var kind: Kind
        var at: Date
        var clubCode: String
        var course: String
        var lastAttempt: Date?
    }

    /// Próximo instante en el que corresponde un sync. Si todavía no hubo
    /// intentos, es el momento de juego más 6 horas.
    static func nextAttempt(playedAt: Date, lastAttempt: Date?, calendar: Calendar? = nil) -> Date {
        let calendar = calendar ?? localCalendar
        let first = playedAt.addingTimeInterval(firstDelay)
        guard let last = lastAttempt else { return first }
        let cutoff = calendar.startOfDay(for: calendar.date(byAdding: .day, value: 1, to: first) ?? first)
        let plusHour = last.addingTimeInterval(hourly)
        if plusHour < cutoff { return plusHour }
        return last.addingTimeInterval(daily)
    }

    static func isDue(playedAt: Date, lastAttempt: Date?, now: Date, calendar: Calendar? = nil) -> Bool {
        now >= nextAttempt(playedAt: playedAt, lastAttempt: lastAttempt, calendar: calendar)
    }

    static func due(_ anchors: [Anchor], now: Date, calendar: Calendar? = nil) -> [Anchor] {
        anchors.filter { isDue(playedAt: $0.at, lastAttempt: $0.lastAttempt, now: now, calendar: calendar) }
    }

    /// La tarjeta ya llegó si hay una ronda de ese día en el club o la cancha.
    static func cardIsIn(
        _ rounds: [Round],
        playedAt: Date,
        clubCode: String,
        course: String,
        calendar: Calendar? = nil
    ) -> Bool {
        let calendar = calendar ?? localCalendar
        return rounds.contains { round in
            guard calendar.isDate(round.date, inSameDayAs: playedAt) else { return false }
            let clubOK = clubCode.isEmpty || round.clubCode.caseInsensitiveCompare(clubCode) == .orderedSame
            let courseOK = course.isEmpty || round.course.caseInsensitiveCompare(course) == .orderedSame
            if !clubCode.isEmpty && !course.isEmpty { return clubOK || courseOK }
            return clubOK && courseOK
        }
    }

    static func settle(_ anchors: [Anchor], rounds: [Round], calendar: Calendar? = nil) -> [Anchor] {
        anchors.filter { !cardIsIn(rounds, playedAt: $0.at, clubCode: $0.clubCode, course: $0.course, calendar: calendar) }
    }

    static func mergeTeeTimes(_ teeTimes: [TeeTime], into anchors: [Anchor]) -> [Anchor] {
        var next = anchors
        for tee in teeTimes {
            let id = "tee:\(tee.id)"
            if let index = next.firstIndex(where: { $0.id == id }) {
                next[index].at = tee.startsAt
                next[index].clubCode = tee.clubCode
                next[index].course = tee.course
                continue
            }
            next.append(Anchor(id: id, kind: .tee, at: tee.startsAt, clubCode: tee.clubCode, course: tee.course, lastAttempt: nil))
        }
        return next
    }

    /// Marca de “jugué” fuera de un tee time. Si ese día ya hay tee time del
    /// mismo club, no se duplica el pedido.
    static func mergePlayed(
        at: Date,
        clubCode: String,
        course: String,
        into anchors: [Anchor],
        calendar: Calendar? = nil
    ) -> [Anchor] {
        let calendar = calendar ?? localCalendar
        let day = calendar.startOfDay(for: at)
        let covered = anchors.contains { anchor in
            anchor.kind == .tee
                && calendar.startOfDay(for: anchor.at) == day
                && sameClub(anchor.clubCode, clubCode)
        }
        if covered { return anchors }
        let id = playedID(at: at, clubCode: clubCode, calendar: calendar)
        if anchors.contains(where: { $0.id == id }) { return anchors }
        var next = anchors
        next.append(Anchor(id: id, kind: .played, at: at, clubCode: clubCode, course: course, lastAttempt: nil))
        return next
    }

    static func markAttempted(_ anchors: [Anchor], ids: Set<String>, at: Date) -> [Anchor] {
        anchors.map { anchor in
            guard ids.contains(anchor.id) else { return anchor }
            var copy = anchor
            copy.lastAttempt = at
            return copy
        }
    }

    static func clubsToSync(due: [Anchor], clubs: [LinkedClub]) -> [LinkedClub] {
        let real = clubs.filter { !$0.isDemo && !$0.accountId.isEmpty }
        let codes = Set(due.map { $0.clubCode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }.filter { !$0.isEmpty })
        if codes.isEmpty { return real }
        let matched = real.filter { codes.contains($0.code.lowercased()) }
        return matched.isEmpty ? real : matched
    }

    private static func playedID(at: Date, clubCode: String, calendar: Calendar) -> String {
        let day = calendar.startOfDay(for: at).timeIntervalSince1970
        let club = clubCode.isEmpty ? "club" : clubCode.lowercased()
        return "played:\(club):\(Int(day))"
    }

    private static func sameClub(_ lhs: String, _ rhs: String) -> Bool {
        if lhs.isEmpty || rhs.isEmpty { return true }
        return lhs.caseInsensitiveCompare(rhs) == .orderedSame
    }
}

enum ScorecardFetchStore {
    private static let key = "golflet.scorecard-fetch.v1"

    static func load() -> [ScorecardFetch.Anchor] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([ScorecardFetch.Anchor].self, from: data)) ?? []
    }

    static func save(_ anchors: [ScorecardFetch.Anchor]) {
        guard let data = try? JSONEncoder().encode(anchors) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}
