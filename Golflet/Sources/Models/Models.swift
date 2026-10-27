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
    var gir: Int? = nil
    var fir: Int? = nil
    var notes: String? = nil
    var notesAt: Date? = nil
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
}

struct ClubCatalogEntry: Identifiable, Hashable, Sendable {
    var id: Int
    var name: String
    var baseURL: String
}

struct GolfletUser: Hashable, Sendable {
    var id: String
    var email: String
    var name: String
}

struct HIPoint: Hashable, Sendable {
    var date: Date
    var handicap: Double
}

struct SyncResult: Hashable, Sendable {
    var ok: Bool
    var message: String
}

struct SyncProgress: Hashable, Sendable {
    var phase: Phase
    var message: String
    var current: Int? = nil
    var total: Int? = nil

    enum Phase: String, Sendable, Hashable {
        case connecting
        case reading
        case calculating
        case finishing
        case success
        case failed

        static func parse(_ raw: String?) -> Phase? {
            guard let raw else { return nil }
            let value = raw.lowercased().replacingOccurrences(of: " ", with: "_")
            switch value {
            case "connecting", "connect", "login", "auth", "signing_in":
                return .connecting
            case "reading", "read", "cards", "fetching", "scraping", "syncing", "running":
                return .reading
            case "calculating", "handicap", "hi", "compute", "computing":
                return .calculating
            case "finishing", "ordering", "saving", "finalizing":
                return .finishing
            case "success", "ok", "done", "ready":
                return .success
            case "failed", "error", "fail":
                return .failed
            default:
                return nil
            }
        }
    }

    var line: String {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { return trimmed }
        switch phase {
        case .connecting: return "Conectando"
        case .reading:
            if let current, let total { return "Leyendo tarjetas · \(current) de \(total)" }
            return "Leyendo tarjetas"
        case .calculating: return "Calculando tu hándicap"
        case .finishing: return "Ordenando tus rondas"
        case .success: return "Listo"
        case .failed: return "No se pudo actualizar"
        }
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
    var kind: Kind
    var clubName: String
    var accountId: String?
    var knownCards: Int?
    var startedAt: Date
    var progress: SyncProgress
    var outcome: Outcome

    var title: String {
        kind == .link ? "Vincular club" : "Actualizar"
    }
}

enum RuntimeFlags {
    static var isUITesting: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("-ui-testing") || args.contains("-ui-testing-auth")
    }
}

typealias SyncProgressHandler = @Sendable (SyncProgress) -> Void

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
}

struct PlayerProfile: Hashable, Sendable {
    var displayName: String
    var initials: String
    var currentHandicap: Double
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

enum CourseFilter: String, CaseIterable, Identifiable, Sendable {
    case all = "Todas"
    case azul = "Azul"
    case colorada = "Colorada"

    var id: String { rawValue }

    var courseName: String? {
        switch self {
        case .all: return nil
        case .azul: return "Azul"
        case .colorada: return "Colorada"
        }
    }
}

struct RoundFilter: Sendable {
    var course: String?
    var clubCode: String?
}

enum GolfletError: LocalizedError {
    case notImplemented
    case notAuthenticated
    case invalidClub
    case fixtureMissing(String)
    case decoding(String)
    case server(String)

    var errorDescription: String? {
        switch self {
        case .notImplemented: return "El API en vivo todavía no está conectado."
        case .notAuthenticated: return "Tenés que entrar a tu cuenta de Golflet."
        case .invalidClub: return "No reconocimos esa URL de Golfistics."
        case .fixtureMissing(let n): return "Falta el fixture \(n)."
        case .decoding(let n): return "No se pudo leer \(n)."
        case .server(let message): return message
        }
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
}
