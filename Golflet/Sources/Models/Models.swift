import Foundation

enum HoleResult: String, Codable, Sendable {
    case eagleOrBetter
    case birdie
    case par
    case bogey
    case doubleOrWorse
    case unknown

    init(className: String?, toPar: Int?) {
        let raw = className?.lowercased() ?? ""
        switch raw {
        case "eagle", "eagle-or-better", "albatross", "hole-in-one", "hoyoenuno":
            self = .eagleOrBetter
        case "birdie":
            self = .birdie
        case "par":
            self = .par
        case "bogey":
            self = .bogey
        case "double-bogey", "double", "triple-bogey", "worse", "triple_plus":
            self = .doubleOrWorse
        default:
            if let toPar {
                if toPar <= -2 { self = .eagleOrBetter }
                else if toPar == -1 { self = .birdie }
                else if toPar == 0 { self = .par }
                else if toPar == 1 { self = .bogey }
                else if toPar >= 2 { self = .doubleOrWorse }
                else { self = .unknown }
            } else {
                self = .unknown
            }
        }
    }
}

struct HoleScore: Identifiable, Hashable, Sendable {
    var id: Int { number }
    var number: Int
    var par: Int
    var handicap: Int
    var yards: Int?
    var strokes: Int?
    var toPar: Int?
    var result: HoleResult
}

struct ScoreCounts: Hashable, Sendable {
    var birdies: Int
    var pars: Int
    var bogeys: Int
    var doubles: Int
    var triples: Int
    var worse: Int
    var eagles: Int = 0
}

struct Round: Identifiable, Hashable, Sendable {
    var id: String { roundId }
    var roundId: String
    var date: Date
    var weekday: String
    var tournament: String
    var clubName: String
    var clubCode: String
    var course: String
    var tee: String
    var category: String?
    var weather: String?
    var courseRating: Double
    var slope: Double
    var position: Int?
    var fieldSize: Int?
    var handicapIndex: Double
    var playingHandicap: Int?
    var outScore: Int?
    var inScore: Int?
    var gross: Int?
    var net: Int?
    var cardStatus: String
    var counts: ScoreCounts
    var holes: [HoleScore]
    var holesPlayed: Int
    var isNineHoles: Bool
    var isValid: Bool
    var differential: Double?
    var adjustedGross: Int?
    var courseHandicap: Int?
    var hcpAllowancePct: Int?
    var courseKey: String = ""
    var putts: Int? = nil
    var puttsSource: String? = nil
    var gir: Int? = nil
    var fir: Int? = nil
    var notes: String? = nil
    var notesAt: Date? = nil
    var otherCourse: Bool = false
    var clubPlayed: String? = nil
    var sourceClubName: String? = nil
    var courseLabel: String? = nil
    var recapId: String? = nil
    var gpsShots: Int = 0
    var isCompetition: Bool = false

    var isOtherCourse: Bool {
        otherCourse || courseKey.hasPrefix("x:")
    }

    var displayCourse: String {
        if let courseLabel, !courseLabel.isEmpty { return courseLabel }
        if !course.isEmpty { return course }
        if let clubPlayed, !clubPlayed.isEmpty { return clubPlayed }
        return clubName
    }
}

struct CourseHole: Identifiable, Hashable, Sendable {
    var id: Int { number }
    var number: Int
    var par: Int
    var handicap: Int
    var yards: [String: Int]
}

struct Course: Identifiable, Hashable, Sendable {
    var id: String { "\(clubCode)-\(name)" }
    var clubCode: String
    var clubName: String
    var name: String
    var holes: [CourseHole]

    var par: Int { holes.reduce(0) { $0 + $1.par } }
}

struct TeeRating: Identifiable, Hashable, Sendable {
    var id: String { "\(clubCode)-\(course)-\(tee)" }
    var clubCode: String
    var course: String
    var tee: String
    var courseRating: Double
    var slope: Int
    var gender: String?
}

struct HoleDistribution: Hashable, Sendable {
    var eagleOrBetter: Int
    var birdie: Int
    var par: Int
    var bogey: Int
    var double: Int
    var triplePlus: Int

    var total: Int { eagleOrBetter + birdie + par + bogey + double + triplePlus }

    func percent(_ value: Int) -> Double {
        guard total > 0 else { return 0 }
        return Double(value) / Double(total) * 100
    }
}

struct SiteComparison: Hashable, Sendable {
    var key: String
    var playerPct: Double
    var groupPct: Double
}

struct HoleStat: Identifiable, Hashable, Sendable {
    var id: Int { number }
    var number: Int
    var par: Int
    var handicap: Int
    var samples: Int
    var average: Double
    var averageToPar: Double
    var averageLast16: Double?
    var best: Int?
    var worst: Int?
    var distribution: HoleDistribution
    var comparisons: [SiteComparison]
}

struct CourseHoleStats: Identifiable, Hashable, Sendable {
    var id: String { "\(clubCode)-\(course)" }
    var clubCode: String
    var clubName: String
    var course: String
    var rounds: Int
    var holes: [HoleStat]
}

struct LinkedClub: Identifiable, Hashable, Sendable {
    var id: String { accountId }
    var accountId: String
    var code: String
    var name: String
    var baseURL: URL
    var matricula: String
    var isDemo: Bool
    var passwordSaved: Bool = false
    var lastSyncStatus: String? = nil
    var lastSyncMessage: String? = nil
    var lastSyncAt: Date? = nil
    var cardCount: Int = 0
    var source: String = "app"
    var roundsStored: Int = 0
    var roundsWithHoles: Int = 0
}

struct ClubCatalogEntry: Identifiable, Hashable, Sendable {
    var id: Int
    var name: String
    var baseURL: String
    var directLogin: Bool = false
}

struct GolfletUser: Hashable, Sendable {
    var id: String
    var email: String
    var name: String
    var firstName: String = ""

    var visibleEmail: String? {
        if email.isEmpty || email.contains("@golfistics.invalid") { return nil }
        return email
    }
}

struct GolfisticsSession: Hashable, Sendable {
    var needsFirstSync: Bool
    var newAccount: Bool
    var userName: String?
}

struct AuthFailure: Hashable, Sendable {
    var code: String
    var message: String
    var hint: String?
    var golfisticsURL: URL?
    var retryAfterS: Int?

    var showsGolfisticsButton: Bool {
        code == "GOLFISTICS_REJECTED" || code == "TOO_MANY_ATTEMPTS"
    }

    var isUnavailable: Bool { code == "GOLFISTICS_UNAVAILABLE" }

    var bannerID: String {
        switch code {
        case "GOLFISTICS_UNAVAILABLE": return "auth-unavailable"
        case "TOO_MANY_ATTEMPTS": return "auth-rate-limit"
        default: return "auth-rejected"
        }
    }

    var cardID: String { "\(bannerID)-card" }
}

enum AuthCopy {
    static let golfisticsURL = URL(string: "https://app.golfistics.com/golf/golfisticsapp_login.php")!

    static let rejected = AuthFailure(
        code: "GOLFISTICS_REJECTED",
        message: "No pudimos entrar con esa matrícula y contraseña.",
        hint: "Si todavía no configuraste tu contraseña o no la recordás, andá al sitio de tu club a configurarla y volvé a intentar.",
        golfisticsURL: golfisticsURL,
        retryAfterS: nil
    )

    static let unavailable = AuthFailure(
        code: "GOLFISTICS_UNAVAILABLE",
        message: "El club no responde en este momento. Probá de nuevo en unos minutos.",
        hint: nil,
        golfisticsURL: nil,
        retryAfterS: nil
    )

    static func rateLimited(seconds: Int = 900) -> AuthFailure {
        AuthFailure(
            code: "TOO_MANY_ATTEMPTS",
            message: "Demasiados intentos. Esperá un rato y volvé a probar.",
            hint: "Si fallás varias veces seguidas hay que esperar un rato. Configurá o recuperá la contraseña en el sitio de tu club.",
            golfisticsURL: golfisticsURL,
            retryAfterS: seconds
        )
    }
}

struct HIPoint: Hashable, Sendable {
    var date: Date
    var handicap: Double
}

struct SyncClubResult: Hashable, Sendable {
    var accountId: String
    var clubName: String
    var ok: Bool
    var newRounds: Int? = nil
    var updated: Int? = nil
    var pending: Int? = nil
    var listTotal: Int? = nil
    var message: String? = nil
}

struct SyncResult: Hashable, Sendable {
    var ok: Bool
    var message: String
    var cardCount: Int? = nil
    var newCards: Int? = nil
    var clubs: [SyncClubResult] = []
}

enum SyncStage: String, Sendable, Hashable, CaseIterable {
    case connect, list, cards, handicap, save, done

    static let visible: [SyncStage] = [.connect, .list, .cards, .handicap, .save]

    static func parse(_ raw: String?) -> SyncStage? {
        guard let raw else { return nil }
        switch raw.lowercased() {
        case "connect", "connecting": return .connect
        case "list", "listing": return .list
        case "cards", "reading": return .cards
        case "handicap", "hi": return .handicap
        case "save", "saving": return .save
        case "done", "success", "ok": return .done
        default: return nil
        }
    }
}

enum SyncStepState: String, Sendable, Hashable {
    case todo, active, done, error
}

struct SyncLastHole: Hashable, Sendable, Identifiable {
    var id: Int { number }
    var number: Int
    var par: Int? = nil
    var strokes: Int? = nil

    var toPar: Int? {
        guard let strokes, let par else { return nil }
        return strokes - par
    }
}

struct SyncLastCard: Hashable, Sendable {
    var date: Date? = nil
    var course: String? = nil
    var club: String? = nil
    var otherCourse: Bool = false
    var gross: Int? = nil
    var par: Int? = nil
    var holes: [SyncLastHole] = []

    var toPar: Int? {
        if let gross, let par { return gross - par }
        let scored = holes.compactMap(\.toPar)
        return scored.isEmpty ? nil : scored.reduce(0, +)
    }
}

struct SyncMonthPoint: Hashable, Sendable, Identifiable {
    var id: String { month }
    var month: String
    var rounds: Int
}

struct SyncLiveStats: Hashable, Sendable {
    var rounds: Int? = nil
    var roundsWithHoles: Int? = nil
    var holes: Int? = nil
    var eagles: Int? = nil
    var birdies: Int? = nil
    var pars: Int? = nil
    var bogeys: Int? = nil
    var doublesPlus: Int? = nil
    var days: Int? = nil
    var bestGross: Int? = nil
    var bestGrossDate: Date? = nil
    var bestGrossCourse: String? = nil
    var months: [SyncMonthPoint] = []
    var lastCard: SyncLastCard? = nil

    var hasRounds: Bool { (rounds ?? 0) > 0 }
}

struct SyncAPIProgress: Hashable, Sendable {
    var club: String? = nil
    var clubIndex: Int? = nil
    var clubCount: Int? = nil
    var clubCode: String? = nil
    var clubLogo: String? = nil
    var clubInitials: String? = nil
    var stage: SyncStage
    var done: Int? = nil
    var total: Int? = nil
    var listTotal: Int? = nil
    var finished: Bool = false
    var error: String? = nil
    var cardsTotal: Int? = nil
    var stats: SyncLiveStats? = nil

    var clubOrdinal: String? {
        guard let clubIndex, let clubCount, clubCount > 0 else { return nil }
        return "\(clubIndex) de \(clubCount)"
    }

    /// Fills omitted optional fields from the previous poll. Club identity
    /// (code / logo / initials) is kept only while the club is the same so a
    /// later club with `club_logo: null` still gets a monogram.
    func merging(onto previous: SyncAPIProgress) -> SyncAPIProgress {
        var next = self
        if next.stage == .cards, let total = next.total {
            next.cardsTotal = total
        } else if next.cardsTotal == nil {
            next.cardsTotal = previous.cardsTotal
        }
        if next.listTotal == nil { next.listTotal = previous.listTotal }
        if next.clubIndex == nil { next.clubIndex = previous.clubIndex }
        if next.clubCount == nil { next.clubCount = previous.clubCount }

        let sameClub: Bool = {
            if let incoming = next.clubCode, let prior = previous.clubCode {
                return incoming == prior
            }
            if let incoming = next.club, let prior = previous.club {
                return incoming == prior
            }
            return next.clubCode == nil && next.club == nil
        }()
        if sameClub {
            if next.clubCode == nil { next.clubCode = previous.clubCode }
            if next.clubLogo == nil { next.clubLogo = previous.clubLogo }
            if next.clubInitials == nil { next.clubInitials = previous.clubInitials }
        }

        if next.stats == nil {
            next.stats = previous.stats
        } else if var stats = next.stats {
            if stats.lastCard == nil { stats.lastCard = previous.stats?.lastCard }
            if stats.months.isEmpty { stats.months = previous.stats?.months ?? [] }
            next.stats = stats
        }
        if next.club == nil {
            next.club = previous.club
        }
        return next
    }
}

struct SyncSession: Identifiable, Hashable, Sendable {
    enum Kind: String, Sendable, Hashable {
        case link
        case refresh
    }

    enum Outcome: String, Sendable, Hashable {
        case running
        case succeeded
        case failed
    }

    var id: UUID
    var progressID: String
    var kind: Kind
    var clubName: String
    var accountId: String?
    var knownCards: Int?
    var startedAt: Date
    var progress: SyncAPIProgress
    var outcome: Outcome
    var resultCards: Int? = nil
    var resultNewCards: Int? = nil
    var errorMessage: String? = nil

    var title: String {
        if outcome == .failed { return "No se pudo actualizar" }
        if outcome == .succeeded {
            if let n = resultCards { return "Listo · \(n) tarjetas" }
            return "Listo"
        }
        return "Leyendo tus tarjetas"
    }
}

enum RuntimeFlags {
    static var isUITesting: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("-ui-testing") || args.contains("-ui-testing-auth")
    }

    static var testingTextPrefs: TextPrefs? {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("-ui-testing-text-xl-bold") else { return nil }
        return TextPrefs(size: .extraLarge, weight: .marked)
    }

    static var testingGreetingName: String? {
        let args = ProcessInfo.processInfo.arguments
        guard let index = args.firstIndex(of: "-ui-testing-greeting"),
              args.indices.contains(index + 1)
        else { return nil }
        let value = args[index + 1].trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
}


struct AppSnapshot: Sendable {
    var user: GolfletUser?
    var profile: PlayerProfile
    var clubs: [LinkedClub]
    var rounds: [Round]
    var courses: [Course]
    var tees: [TeeRating]
    var holeStats: [CourseHoleStats]
    var bag: [BagClub]
    var hiHistory: [HIPoint]
    var courseGroups: [CourseFilter] = []
    var teeTimes: [TeeTime] = []
    var profesores: [Profesor] = []
}

struct TeeTime: Identifiable, Hashable, Sendable {
    var id: String
    var startsAt: Date
    var clubName: String
    var clubCode: String
    var course: String
    var companions: [String]

    var chipWhen: String { FormatAR.teeChip(startsAt) }

    var companionsLine: String? {
        TeeTime.companionsLine(from: companions)
    }

    static func companionsLine(from names: [String]) -> String? {
        let cleaned = names
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        if cleaned.count <= 2 {
            return "con " + cleaned.joined(separator: ", ")
        }
        let shown = cleaned.prefix(2).joined(separator: ", ")
        return "con \(shown) +\(cleaned.count - 2)"
    }

    func isUpcoming(now: Date = Date(), grace: TimeInterval = 3 * 3600) -> Bool {
        startsAt.addingTimeInterval(grace) >= now
    }
}

struct TeeTimeCheck: Hashable, Sendable {
    var status: String
    var newIDs: [String]
    var changedIDs: [String]
    var goneIDs: [String]
    var nextInSeconds: Int
    var teeTimes: [TeeTime]

    var hasUpdates: Bool {
        !newIDs.isEmpty || !changedIDs.isEmpty || !goneIDs.isEmpty
    }
}

struct PlayerProfile: Hashable, Sendable {
    var displayName: String
    var initials: String
    var currentHandicap: Double
    var firstName: String = ""

    var greetingName: String {
        let first = firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        return first.isEmpty ? displayName : first
    }
}

struct BagClub: Identifiable, Hashable, Sendable {
    var id: String { name }
    var name: String
    var carry: Int?
    var total: Int?
}

struct ClubCredential: Codable, Hashable, Sendable {
    var clubCode: String
    var clubName: String
    var baseURL: String
    var matricula: String
    var clave: String
}

struct CourseFilter: Hashable, Sendable, Identifiable {
    var id: String
    var title: String
    var courseNames: [String]
    var kind: Kind

    enum Kind: Hashable, Sendable {
        case all, group, other
    }

    static let all = CourseFilter(id: "all", title: "Todas", courseNames: [], kind: .all)
    static let other = CourseFilter(id: "other", title: "Otras canchas", courseNames: [], kind: .other)
    static let azul = CourseFilter(id: "azul", title: "Azul", courseNames: ["Azul"], kind: .group)
    static let colorada = CourseFilter(id: "colorada", title: "Colorada", courseNames: ["Colorada"], kind: .group)

    var rawValue: String { title }

    var courseName: String? {
        kind == .group && courseNames.count == 1 ? courseNames[0] : nil
    }

    func matches(_ round: Round, groupedNames: [String] = []) -> Bool {
        switch kind {
        case .all:
            return true
        case .group:
            return courseNames.contains { name in
                round.course.caseInsensitiveCompare(name) == .orderedSame
                    || round.displayCourse.caseInsensitiveCompare(name) == .orderedSame
            }
        case .other:
            return !groupedNames.contains { name in
                round.course.caseInsensitiveCompare(name) == .orderedSame
                    || round.displayCourse.caseInsensitiveCompare(name) == .orderedSame
            }
        }
    }
}

struct RoundFilter: Sendable {
    var course: String?
    var clubCode: String?
}

enum GolfletError: LocalizedError, Equatable {
    case notImplemented
    case notAuthenticated
    case invalidClub
    case wrongGolfisticsCredentials
    case golfisticsAppDown
    case auth(AuthFailure)
    case needsClub(NeedsClubPayload)
    case fixtureMissing(String)
    case decoding(String)
    case server(String)
    case http(status: Int, message: String)

    var errorDescription: String? {
        switch self {
        case .notImplemented: return "El API en vivo todavía no está conectado."
        case .notAuthenticated: return "Tenés que entrar a tu cuenta de Golflet."
        case .invalidClub: return "No reconocimos esa URL de Golfistics."
        case .wrongGolfisticsCredentials: return "Matrícula o clave incorrecta."
        case .golfisticsAppDown: return "La App de Golfistics no responde."
        case .auth(let failure): return failure.message
        case .needsClub(let payload): return payload.message
        case .fixtureMissing(let n): return "Falta el fixture \(n)."
        case .decoding(let n): return "No se pudo leer \(n)."
        case .server(let message): return message
        case .http(_, let message): return message
        }
    }

    var authFailure: AuthFailure? {
        if case .auth(let failure) = self { return failure }
        return nil
    }

    var needsClub: NeedsClubPayload? {
        if case .needsClub(let payload) = self { return payload }
        return nil
    }

    var httpStatus: Int? {
        if case .http(let status, _) = self { return status }
        return nil
    }
}

enum JSONFlex {
    static func double(from value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let i = value as? Int { return Double(i) }
        if let s = value as? String { return Double(s.replacingOccurrences(of: ",", with: ".")) }
        return nil
    }

    static func int(from value: Any?) -> Int? {
        if let i = value as? Int { return i }
        if let d = value as? Double { return Int(d.rounded()) }
        if let s = value as? String { return Int(s) }
        return nil
    }

    static func bool(from value: Any?) -> Bool? {
        if let b = value as? Bool { return b }
        if let i = value as? Int { return i != 0 }
        if let d = value as? Double { return d != 0 }
        if let s = value as? String {
            switch s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "true", "1", "yes", "si", "sí": return true
            case "false", "0", "no": return false
            default: return nil
            }
        }
        return nil
    }

    static func objectArray(from object: Any) -> [[String: Any]]? {
        if let typed = object as? [[String: Any]] { return typed }
        guard let items = object as? [Any] else { return nil }
        var result: [[String: Any]] = []
        result.reserveCapacity(items.count)
        for item in items {
            if let dict = item as? [String: Any] {
                result.append(dict)
                continue
            }
            if let dict = item as? NSDictionary {
                var mapped: [String: Any] = [:]
                mapped.reserveCapacity(dict.count)
                dict.forEach { key, value in
                    if let key = key as? String { mapped[key] = value }
                }
                result.append(mapped)
                continue
            }
            return nil
        }
        return result
    }
}
