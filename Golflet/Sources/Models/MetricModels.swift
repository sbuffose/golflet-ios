import Foundation

enum MetricPeriod: String, Hashable, CaseIterable, Sendable {
    case year = "Este año"
    case all = "Histórico"
}

enum MetricCourseBucket: String, Hashable, CaseIterable, Sendable {
    case all = "Todas"
    case azul = "Azul"
    case colorada = "Colorada"
    case mdpNueva = "MdP Nueva"
    case mdpVieja = "MdP Vieja"
    case other = "Otras"

    static func bucket(for round: Round) -> MetricCourseBucket {
        let haystack = [
            round.course,
            round.courseLabel ?? "",
            round.displayCourse,
            round.clubName,
            round.clubPlayed ?? ""
        ].joined(separator: " ").folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()

        if matchesNamed(haystack, "azul") { return .azul }
        if matchesNamed(haystack, "colorada") { return .colorada }
        if isMarDelPlata(round, haystack) && haystack.contains("nueva") { return .mdpNueva }
        if isMarDelPlata(round, haystack) && (haystack.contains("vieja") || haystack.contains("cancha vieja")) {
            return .mdpVieja
        }
        if haystack.contains("mdp nueva") { return .mdpNueva }
        if haystack.contains("mdp vieja") { return .mdpVieja }
        return .other
    }

    func matches(_ round: Round) -> Bool {
        if self == .all { return true }
        return Self.bucket(for: round) == self
    }

    private static func matchesNamed(_ haystack: String, _ token: String) -> Bool {
        haystack == token || haystack.contains(" \(token) ") || haystack.hasPrefix("\(token) ") || haystack.hasSuffix(" \(token)") || haystack.contains(token)
    }

    private static func isMarDelPlata(_ round: Round, _ haystack: String) -> Bool {
        round.clubCode == "209"
            || haystack.contains("mar del plata")
            || haystack.contains("mdp")
    }
}

enum MetricSortField: String, Hashable, CaseIterable, Sendable {
    case date = "Fecha"
    case gross = "Gross"
    case net = "Neto"
}

enum MetricSortOrder: String, Hashable, Sendable {
    case bestFirst
    case worstFirst

    var flipped: MetricSortOrder { self == .bestFirst ? .worstFirst : .bestFirst }

    func label(for field: MetricSortField) -> String {
        switch field {
        case .date:
            return self == .bestFirst ? "Recientes" : "Antiguas"
        case .gross, .net:
            return self == .bestFirst ? "Mejor" : "Peor"
        }
    }
}

struct RoundYearSection: Identifiable, Hashable {
    var id: String
    var isCurrent: Bool
    var rounds: [Round]
}

enum ScoreKind: String, Hashable, CaseIterable, Sendable {
    case eagle
    case birdie
    case par
    case bogey

    var title: String {
        switch self {
        case .eagle: return "Águilas"
        case .birdie: return "Birdies"
        case .par: return "Pares"
        case .bogey: return "Bogeys"
        }
    }

    var singular: String {
        switch self {
        case .eagle: return "águila"
        case .birdie: return "birdie"
        case .par: return "par"
        case .bogey: return "bogey"
        }
    }

    var holeResult: HoleResult {
        switch self {
        case .eagle: return .eagleOrBetter
        case .birdie: return .birdie
        case .par: return .par
        case .bogey: return .bogey
        }
    }

    var tallyTitle: String {
        switch self {
        case .eagle: return "Hoyos con más águilas"
        case .birdie: return "Hoyos con más birdies"
        case .par: return "Hoyos con más pares"
        case .bogey: return "Hoyos con más bogeys"
        }
    }
}

struct RoundListQuery: Hashable, Sendable {
    var title: String
    var footnote: String? = nil
    var periodDefault: MetricPeriod = .all
    var showPeriod: Bool = true
    var showCourseFilter: Bool = true
    var showSort: Bool = true
    var valid18Only: Bool = false
    var clubCode: String? = nil
    var courseName: String? = nil
    var sinceYear: Int? = nil
    var defaultSort: MetricSortField = .date
    var defaultOrder: MetricSortOrder = .bestFirst

    static var allCards: RoundListQuery {
        RoundListQuery(title: "Tarjetas", footnote: "Todas las tarjetas de tu ficha del club.")
    }

    static var yearRounds: RoundListQuery {
        RoundListQuery(
            title: "Rondas",
            footnote: "Rondas válidas de 18 hoyos.",
            periodDefault: .year,
            valid18Only: true
        )
    }

    static func bestGross(yearOnly: Bool) -> RoundListQuery {
        RoundListQuery(
            title: yearOnly ? "Mejor del año" : "Mejor gross",
            footnote: "Rondas válidas de 18 hoyos, de menor a mayor gross.",
            periodDefault: yearOnly ? .year : .all,
            valid18Only: true,
            defaultSort: .gross,
            defaultOrder: .bestFirst
        )
    }

    static func average(yearOnly: Bool) -> RoundListQuery {
        RoundListQuery(
            title: yearOnly ? "Promedio \(Calendar.gregorian.component(.year, from: Date()))" : "Promedio gross",
            footnote: "Las rondas que entran en el promedio.",
            periodDefault: yearOnly ? .year : .all,
            valid18Only: true,
            defaultSort: .gross,
            defaultOrder: .bestFirst
        )
    }

    static func club(_ club: LinkedClub) -> RoundListQuery {
        RoundListQuery(
            title: club.name,
            footnote: "Tarjetas de este club.",
            clubCode: club.code
        )
    }

    static func course(_ name: String, title: String, sinceYear: Int? = nil, sort: MetricSortField = .date) -> RoundListQuery {
        RoundListQuery(
            title: title,
            footnote: "Cancha \(name).",
            showCourseFilter: false,
            valid18Only: true,
            courseName: name,
            sinceYear: sinceYear,
            defaultSort: sort,
            defaultOrder: .bestFirst
        )
    }

    static func summaryBest(course: String?) -> RoundListQuery {
        RoundListQuery(
            title: "Mejor ronda",
            footnote: "Menor gross, después menor neto.",
            showCourseFilter: course == nil,
            valid18Only: true,
            courseName: course,
            defaultSort: .gross,
            defaultOrder: .bestFirst
        )
    }

    static func summaryWorst(course: String?) -> RoundListQuery {
        RoundListQuery(
            title: "Peor ronda",
            footnote: "Desde 2021, mayor gross.",
            showCourseFilter: course == nil,
            valid18Only: true,
            courseName: course,
            sinceYear: 2021,
            defaultSort: .gross,
            defaultOrder: .worstFirst
        )
    }

    func locking(course: String?) -> RoundListQuery {
        var next = self
        next.courseName = course
        next.showCourseFilter = course == nil
        return next
    }

    static func since2025(course: String?) -> RoundListQuery {
        RoundListQuery(
            title: "Desde 2025",
            footnote: "Rondas válidas de 18 hoyos desde 2025.",
            showCourseFilter: course == nil,
            valid18Only: true,
            courseName: course,
            sinceYear: 2025,
            defaultSort: .gross,
            defaultOrder: .bestFirst
        )
    }
}

enum MetricRoute: Hashable, Sendable {
    case roundList(RoundListQuery)
    case scoreKind(ScoreKind, RoundListQuery)
    case chart(MetricChartQuery)
    case handicap
    case recurring
    case clubStats(String)
    case strategy(courseKey: String, courseName: String)
    case gameMetrics
    case ironBand(String)
    case girPar(Int)
}

struct HoleTally: Hashable, Sendable, Identifiable {
    var id: String { "\(course)-\(hole)" }
    var course: String
    var hole: Int
    var count: Int
}

struct ScoreKindRound: Hashable, Sendable, Identifiable {
    var id: String { round.roundId }
    var round: Round
    var count: Int
    var holes: [HoleScore]
    var usedHoleDetail: Bool
}

struct ScoreKindSnapshot: Hashable, Sendable {
    var total: Int
    var rounds: [ScoreKindRound]
    var tally: [HoleTally]
    var roundsMissingHoles: Int
}