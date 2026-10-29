import Foundation

enum ComparativoKind: String, CaseIterable, Identifiable, Hashable, Sendable {
    case semana
    case mes

    var id: String { rawValue }

    var title: String {
        switch self {
        case .semana: return "Semana"
        case .mes: return "Mes"
        }
    }

    var thisLabel: String {
        switch self {
        case .semana: return "Esta semana"
        case .mes: return "Este mes"
        }
    }

    var thatLabel: String {
        switch self {
        case .semana: return "esa semana"
        case .mes: return "ese mes"
        }
    }

    var previousLabel: String {
        switch self {
        case .semana: return "la semana anterior"
        case .mes: return "el mes anterior"
        }
    }

    var windowFoot: String {
        switch self {
        case .semana: return "de lunes a domingo"
        case .mes: return "del mes calendario"
        }
    }
}

enum ComparativoRowState: String, Hashable, Sendable {
    case ranked
    case belowMin = "below_min"
    case noData = "no_data"
    case hidden
}

struct ComparativoPeriod: Hashable, Sendable {
    var kind: ComparativoKind
    var off: Int
    var short: String
    var label: String
    var inProgress: Bool
    var prevOff: Int?
    var nextOff: Int?
}

struct ComparativoStatDef: Identifiable, Hashable, Sendable {
    var key: String
    var short: String
    var label: String
    var desc: String
    var format: String
    var minKey: String?
    var lowerIsBetter: Bool
    var gps: Bool

    var id: String { key }
}

struct ComparativoStatValue: Hashable, Sendable {
    var value: Double?
    var n: Int?
    var have: Int?
    var need: Int?
    var hidden: Bool
    var extra: [String: String]
}

struct ComparativoMember: Identifiable, Hashable, Sendable {
    var memberID: String
    var name: String
    var initials: String
    var color: String?
    var isMe: Bool
    var profileShared: Bool
    var stats: [String: ComparativoStatValue]

    var id: String { memberID }

    var firstName: String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

struct ComparativoBoardRow: Identifiable, Hashable, Sendable {
    var memberID: String
    var pos: Int?
    var state: ComparativoRowState

    var id: String { memberID }
}

struct ComparativoBoard: Hashable, Sendable {
    var key: String
    var leaders: [String]
    var ranked: Bool
    var rows: [ComparativoBoardRow]
}

struct ComparativoLeaderRow: Identifiable, Hashable, Sendable {
    var memberID: String
    var pos: Int
    var state: ComparativoRowState?

    var id: String { memberID }
}

struct ComparativoLeaderboard: Hashable, Sendable {
    var rows: [ComparativoLeaderRow]
    var rest: [ComparativoLeaderRow]
}

struct ComparativoMins: Hashable, Sendable {
    var r: Int
    var gh: Int
    var dr: Int
    var mg: Int
    var pr: Int
    var gp: Int

    func value(for key: String?) -> Int? {
        switch key {
        case "r": return r
        case "gh": return gh
        case "dr": return dr
        case "mg": return mg
        case "pr": return pr
        case "gp": return gp
        default: return nil
        }
    }
}

struct ComparativoData: Hashable, Sendable {
    var groupID: String
    var groupName: String
    var period: ComparativoPeriod
    var members: [ComparativoMember]
    var stats: [ComparativoStatDef]
    var boards: [String: ComparativoBoard]
    var leaderboard: ComparativoLeaderboard
    var mins: ComparativoMins
    var gpsOrCardsAny: Bool

    func member(_ id: String) -> ComparativoMember? {
        members.first { $0.memberID == id }
    }

    func stat(_ key: String) -> ComparativoStatDef? {
        stats.first { $0.key == key }
    }

    static let groups: [(title: String, keys: [String])] = [
        ("Scoring", ["avg_gross", "best_gross", "best_net", "rounds", "hi_change"]),
        ("Birdies y pares", ["birdies", "eagles", "birdie_pct", "pars", "bogey_avoid"]),
        ("Promedio por par", ["par3", "par4", "par5"]),
        ("Greens, fairways y putts", ["gir", "fir", "scrambling", "putts_round", "putts_gir"])
    ]
}

struct GroupMemberProfile: Hashable, Sendable {
    var groupID: String
    var groupName: String
    var member: ComparativoMember
    var locked: Bool
    var clubs: [String]
    var shares: [String: Bool]
    var year: ProfileYear?
    var hiHistory: [HIPoint]
    var rounds: [ProfileRound]?
}

struct ProfileYear: Hashable, Sendable {
    var rounds: Int?
    var avgGross: Double?
    var bestGross: String?
    var avgNet: Double?
    var bestNet: String?
    var handicapIndex: Double?
    var types: [String: ProfileTypeStat]
    var par: [String: ProfileParStat]
    var putting: ProfilePutting?
}

struct ProfileTypeStat: Hashable, Sendable {
    var perRound: Double?
    var total: Int?
}

struct ProfileParStat: Hashable, Sendable {
    var avg: Double?
    var n: Int?
}

struct ProfilePutting: Hashable, Sendable {
    var rounds: Int?
    var roundsGir: Int?
    var roundsFir: Int?
    var avgPutts: Double?
    var avgGir: Double?
    var avgFir: Double?
}

struct ProfileRound: Identifiable, Hashable, Sendable {
    var roundID: String
    var date: Date?
    var dateLabel: String
    var courseLabel: String
    var gross: Int?
    var net: Int?
    var toPar: Int?

    var id: String { roundID }
}

struct SharedScorecard: Hashable, Sendable {
    var groupID: String
    var member: ComparativoMember
    var date: Date?
    var dateLabel: String
    var courseLabel: String
    var gross: Int?
    var net: Int?
    var toPar: Int?
    var putts: Int?
    var gir: Int?
    var fir: Int?
    var holes: [SharedHole]
}

struct SharedHole: Identifiable, Hashable, Sendable {
    var hole: Int
    var par: Int?
    var score: Int?

    var id: Int { hole }

    var toPar: Int? {
        guard let score, let par else { return nil }
        return score - par
    }
}

struct NeedsClubPayload: Hashable, Sendable {
    var message: String
    var matricula: String?
    var clubs: [ClubCatalogEntry]
}

struct ComparativoRoute: Hashable, Identifiable {
    var groupID: String
    var kind: ComparativoKind
    var off: Int
    var stat: String?

    var id: String { "\(groupID)-\(kind.rawValue)-\(off)-\(stat ?? "")" }
}

struct MemberProfileRoute: Hashable, Identifiable {
    var groupID: String
    var memberID: String
    var id: String { "\(groupID)-\(memberID)" }
}

struct MemberCardRoute: Hashable, Identifiable {
    var groupID: String
    var memberID: String
    var roundID: String
    var id: String { "\(groupID)-\(memberID)-\(roundID)" }
}

enum ComparativoFormat {
    static func toPar(_ value: Double?) -> String {
        guard let value else { return "—" }
        let rounded = Int(value.rounded())
        if rounded == 0 { return "Par" }
        return rounded > 0 ? "+\(abs(rounded))" : "−\(abs(rounded))"
    }

    static func number(_ value: Double?, format: String) -> String {
        guard let value else { return "—" }
        switch format {
        case "n": return FormatAR.int(Int(value.rounded()))
        case "f": return FormatAR.one(value)
        case "f2": return two(value)
        case "p":
            let text = FormatAR.one(value)
            return text.hasSuffix(",0") ? "\(String(text.dropLast(2))) %" : "\(text) %"
        case "tp": return toPar(value)
        case "hi":
            if abs(value) < 0.05 { return "0,0" }
            return (value > 0 ? "+" : "−") + FormatAR.one(abs(value))
        default:
            return FormatAR.one(value)
        }
    }

    static func two(_ value: Double) -> String {
        let rounded = (value * 100).rounded() / 100
        return String(format: "%.2f", rounded).replacingOccurrences(of: ".", with: ",")
    }

    static func count(_ n: Int, one: String, many: String) -> String {
        "\(n) \(n == 1 ? one : many)"
    }

    static func minWords(_ key: String?) -> (String, String) {
        switch key {
        case "r": return ("ronda", "rondas")
        case "gh": return ("hoyo con GIR", "hoyos con GIR")
        case "dr": return ("salida medida", "salidas medidas")
        case "mg": return ("green errado", "greens errados")
        case "pr": return ("ronda con putts", "rondas con putts")
        case "gp": return ("green en regulación con putts", "greens en regulación con putts")
        default: return ("dato", "datos")
        }
    }

    static func day(_ date: Date?) -> String {
        guard let date else { return "" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    static func extraSample(def: ComparativoStatDef, value: ComparativoStatValue) -> String {
        if value.hidden || value.value == nil { return "" }
        let extra = value.extra
        switch def.key {
        case "best_net", "best_gross":
            let score = extra["score"] ?? ""
            let course = extra["course"] ?? ""
            let date = extra["date_label"] ?? extra["date"] ?? ""
            return [score.isEmpty ? nil : score, course.isEmpty ? nil : "en \(course)", date.isEmpty ? nil : date]
                .compactMap { $0 }
                .joined(separator: " · ")
        case "avg_gross":
            let rounds = value.n.map { count($0, one: "ronda", many: "rondas") } ?? ""
            if let toPar = extra["to_par"].flatMap(Double.init) {
                let signed = toPar > 0 ? "+\(FormatAR.one(abs(toPar)))" : toPar < 0 ? "−\(FormatAR.one(abs(toPar)))" : FormatAR.one(0)
                return rounds.isEmpty ? "\(signed) vs par" : "\(rounds) · \(signed) vs par"
            }
            return rounds
        case "hi_change":
            if let from = extra["from"], let to = extra["to"] { return "\(from) → \(to)" }
            return ""
        case "eagles", "birdies", "pars":
            if let per = extra["per_round"].flatMap(Double.init) { return "\(FormatAR.one(per)) por ronda" }
            return ""
        case "birdie_pct", "bogey_avoid":
            if let count = extra["count"], let n = value.n { return "\(count) de \(n) hoyos" }
            return ""
        case "par3", "par4", "par5":
            let holes = value.n.map { count($0, one: "hoyo", many: "hoyos") } ?? ""
            return holes
        case "gir", "fir":
            if let hit = extra["hit"], let n = value.n {
                return def.key == "fir" ? "\(hit) de \(n) salidas" : "\(hit) de \(n) hoyos"
            }
            return ""
        case "scrambling":
            if let saved = extra["saved"], let n = value.n {
                return "\(saved) de \(count(n, one: "green errado", many: "greens errados"))"
            }
            return ""
        case "putts_round":
            return value.n.map { count($0, one: "ronda", many: "rondas") } ?? ""
        case "putts_gir":
            return value.n.map { count($0, one: "green", many: "greens") } ?? ""
        default:
            return ""
        }
    }
}
