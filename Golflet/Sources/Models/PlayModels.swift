import Foundation

struct GPSCoord: Hashable, Sendable {
    var lat: Double
    var lng: Double
}

struct GPSCourseSummary: Hashable, Sendable, Identifiable {
    var id: String { courseId }
    var courseId: String
    var clubCode: String
    var clubName: String
    var course: String
    var label: String
    var courseKey: String
    var holesCached: Int
    var mine: Bool
    var distanceKm: Double?
    var courseLabel: String? = nil
    var clubCourseCount: Int? = nil
    var displayName: String? = nil
}

struct GPSCourseList: Hashable, Sendable {
    var courses: [GPSCourseSummary]
    var nearby: [GPSCourseSummary]
}

struct GPSGreen: Hashable, Sendable {
    var front: GPSCoord?
    var center: GPSCoord?
    var back: GPSCoord?
}

struct GPSHole: Hashable, Sendable, Identifiable {
    var id: Int { number }
    var number: Int
    var par: Int
    var hcp: Int?
    var yards: [String: Int]
    var green: GPSGreen
    var tee: GPSCoord?
}

struct GPSCourseDetail: Hashable, Sendable, Identifiable {
    var id: String { courseId }
    var courseId: String
    var clubCode: String
    var clubName: String
    var course: String
    var courseKey: String
    var par: Int
    var holeCount: Int
    var holes: [GPSHole]
    var warnings: [String]
    var attribution: String?
}

struct LiveRound: Hashable, Sendable, Identifiable {
    var id: String
    var courseId: String?
    var clubCode: String?
    var course: String?
    var date: String
    var tee: String?
    var currentHole: Int
    var startedAt: Date?
    var endedAt: Date?
    var roundId: String?
    var recapId: String?
    var shots: Int
}

struct Shot: Hashable, Sendable, Identifiable {
    var id: String
    var clientId: String?
    var hole: Int
    var shotNumber: Int
    var lat: Double?
    var lng: Double?
    var accuracyM: Double?
    var takenAt: Date?
    var club: String?
    var lie: String?
    var result: String?
    var direction: String?
    var length: String?
    var mishit: Bool
    var distanceM: Int?
    var distanceYd: Int?
    var toGreenYd: Int?
}

struct ShotDraft: Hashable, Sendable {
    var clientId: String
    var hole: Int
    var lat: Double
    var lng: Double
    var accuracyM: Double?
    var takenAt: Date
    var club: String?
    var lie: String?
    var result: String?
    var direction: String?
    var length: String?
    var mishit: Bool
    var liveRoundId: String
}

struct LiveRoundDetail: Hashable, Sendable {
    var liveRound: LiveRound
    var shots: [Shot]
    var recap: Recap?
}

struct RecapMistake: Hashable, Sendable, Identifiable {
    var id: String { "\(category)-\(hole ?? 0)-\(text)" }
    var category: String
    var hole: Int?
    var text: String

    var label: String { RecapCopy.category(category) }
}

struct RecapPositive: Hashable, Sendable, Identifiable {
    var id: String { "\(hole ?? 0)-\(text)" }
    var hole: Int?
    var text: String
}

struct RecapDraft: Hashable, Sendable {
    var transcript: String
    var summary: String?
    var mistakes: [RecapMistake] = []
    var positives: [RecapPositive] = []
    var structuredOnDevice = false
    var fromSpeech = false
    var model: String?
    var durationS: Double?

    var source: String? {
        structuredOnDevice ? "ios_on_device" : nil
    }

    var resolvedModel: String? {
        if let model {
            return String(model.prefix(80))
        }
        if structuredOnDevice { return "apple-speech-es-AR + apple-fm" }
        if fromSpeech { return "apple-speech-es-AR" }
        return nil
    }

    var jsonBody: [String: Any] {
        var body: [String: Any] = ["transcript": transcript]
        if let source { body["source"] = source }
        if let resolvedModel { body["model"] = resolvedModel }
        if let durationS { body["duration_s"] = Int(durationS.rounded()) }
        if structuredOnDevice {
            if let summary { body["summary"] = summary }
            body["mistakes"] = mistakes.map {
                var item: [String: Any] = ["category": $0.category, "text": $0.text]
                if let hole = $0.hole { item["hole"] = hole }
                return item
            }
            body["positives"] = positives.map {
                var item: [String: Any] = ["text": $0.text]
                if let hole = $0.hole { item["hole"] = hole }
                return item
            }
        }
        return body
    }

    var patchBody: [String: Any] {
        var body = jsonBody
        if !structuredOnDevice {
            body["restructure"] = true
        }
        return body
    }
}

struct Recap: Hashable, Sendable, Identifiable {
    var id: String
    var roundId: String?
    var liveRoundId: String?
    var status: String
    var error: String?
    var hasAudio: Bool
    var transcript: String?
    var summary: String?
    var mistakes: [RecapMistake]
    var positives: [RecapPositive]
    var source: String?
    var durationS: Double?
}

struct RecurringHole: Hashable, Sendable {
    var hole: Int
    var mentions: Int
}

struct RecurringExample: Hashable, Sendable {
    var date: String
    var hole: Int?
    var text: String
}

struct RecurringItem: Hashable, Sendable, Identifiable {
    var id: String { category }
    var category: String
    var label: String
    var rounds: Int
    var of: Int
    var share: Double
    var mentions: Int
    var holes: [RecurringHole]
    var text: String
    var examples: [RecurringExample]
}

struct RecurringReport: Hashable, Sendable {
    var roundsConsidered: Int
    var lastN: Int
    var items: [RecurringItem]
}

struct ClubDistanceBlock: Hashable, Sendable {
    var n: Int
    var avgM: Int?
    var medianM: Int?
    var maxM: Int?
    var avgYd: Int?
    var medianYd: Int?
    var maxYd: Int?
    var rangeYd: [Int]
    var spreadYd: Int?
}

struct ClubSplit: Hashable, Sendable {
    var left: Int
    var center: Int
    var right: Int
    var n: Int
}

struct ClubLengthSplit: Hashable, Sendable {
    var short: Int
    var on: Int
    var long: Int
    var n: Int
}

struct ClubRate: Hashable, Sendable {
    var pct: Int
    var hit: Int
    var of: Int
}

struct ClubStats: Hashable, Sendable, Identifiable {
    var id: String { club }
    var club: String
    var label: String
    var shots: Int
    var distance: ClubDistanceBlock?
    var direction: ClubSplit?
    var lengthOnApproach: ClubLengthSplit?
    var greensHit: ClubRate?
    var fairwaysHit: ClubRate?
    var mishit: ClubRate?
    var tendency: String?
}

struct ClubRecentShot: Hashable, Sendable, Identifiable {
    var id: String
    var date: String?
    var hole: Int?
    var distanceYd: Int?
    var result: String?
    var direction: String?
    var mishit: Bool
}

struct ClubStatsDetail: Hashable, Sendable {
    var club: ClubStats
    var recent: [ClubRecentShot]
}

struct MetricAPIRound: Hashable, Sendable, Identifiable {
    var id: String { roundId }
    var roundId: String
    var date: Date?
    var tournament: String?
    var clubName: String?
    var course: String?
    var courseKey: String?
    var courseLabel: String?
    var tee: String?
    var gross: Int?
    var net: Int?
    var valid: Bool
    var isNineHoles: Bool
    var otherCourse: Bool
    var count: Int?
    var holes: [Int]
    var holesKnown: Bool
}

struct MetricAPIHole: Hashable, Sendable, Identifiable {
    var id: String { "\(courseLabel)-\(hole)" }
    var courseKey: String?
    var courseLabel: String
    var hole: Int
    var par: Int?
    var count: Int
}

struct MetricAPIHistory: Hashable, Sendable {
    var date: Date?
    var hi: Double
    var club: String?
}

struct MetricSeriesPoint: Hashable, Sendable, Identifiable {
    var id: String { "\(date.timeIntervalSince1970)-\(value)" }
    var date: Date
    var value: Double
    var course: String
}

struct MetricMonthlyPoint: Hashable, Sendable, Identifiable {
    var id: String { month }
    var month: String
    var date: Date
    var value: Double
    var rounds: Int
}

struct MonthlyScoreBar: Hashable, Sendable, Identifiable {
    var id: String { month }
    var month: String
    var date: Date
    var birdies: Int
    var pars: Int

    var hasBars: Bool { birdies > 0 || pars > 0 }
}

struct PerRoundAverage: Hashable, Sendable {
    var mean: Double?
    var median: Double?
    var rounds: Int

    static let empty = PerRoundAverage(mean: nil, median: nil, rounds: 0)
}

struct PerRoundStats: Hashable, Sendable {
    var eagles: PerRoundAverage
    var birdies: PerRoundAverage
    var pars: PerRoundAverage
    var bogeys: PerRoundAverage
    var doubles: PerRoundAverage

    static let empty = PerRoundStats(
        eagles: .empty, birdies: .empty, pars: .empty, bogeys: .empty, doubles: .empty
    )

    func value(for kind: ScoreKind) -> PerRoundAverage {
        switch kind {
        case .eagle: return eagles
        case .birdie: return birdies
        case .par: return pars
        case .bogey: return bogeys
        }
    }
}

struct HcpImpactCard: Hashable, Sendable, Identifiable {
    var id: String
    var date: Date?
    var differential: Double?
    var course: String?
    var counting: Bool
}

struct HcpImpact: Hashable, Sendable {
    var delta: Double
    var start: Double?
    var now: Double?
    var estimated: Bool
    var counting: [HcpImpactCard]
    var dropped: [HcpImpactCard]
}

struct MetricsSummary: Hashable, Sendable {
    var range: String
    var rangeLabel: String?
    var since: Date?
    var roundsInRange: Int
    var validRounds: Int
    var averageGross: Double?
    var averageNet: Double?
    var bestGross: Int?
    var worstGross: Int?
    var eagles: Int
    var birdies: Int
    var pars: Int
    var bogeys: Int
    var perRound: PerRoundStats = .empty
    var hcpImpact: HcpImpact? = nil
    var courseGroups: [CourseFilter] = []
}

struct MetricDrilldown: Hashable, Sendable {
    var metric: String
    var total: Int?
    var current: Double?
    var change: Double?
    var rounds: [MetricAPIRound]
    var perHole: [MetricAPIHole]
    var history: [MetricAPIHistory]
    var summaryRounds: Int?
    var averageGross: Double?
    var bestGross: Int?
    var series: [MetricSeriesPoint] = []
    var monthly: [MetricMonthlyPoint] = []
    var roundsInRange: Int?
    var since: Date?
    var rangeLabel: String?
    var start: Date? = nil
    var recordsTotal: Int? = nil
    var monthlyScores: [MonthlyScoreBar] = []

    func chartPoints(preferMonthly: Bool) -> [MetricPoint] {
        if preferMonthly, !monthly.isEmpty {
            return monthly.map {
                MetricPoint(date: $0.date, value: $0.rounds > 0 ? $0.value / Double($0.rounds) : $0.value, course: "")
            }
        }
        if !series.isEmpty {
            return series.map { MetricPoint(date: $0.date, value: $0.value, course: $0.course) }
        }
        return []
    }
}

enum RecapCopy {
    static func category(_ raw: String) -> String {
        switch raw {
        case "salida": return "Salida"
        case "approach": return "Approach"
        case "juego_corto": return "Juego corto"
        case "bunker": return "Bunker"
        case "putt": return "Putt"
        case "estrategia": return "Estrategia / mental"
        default: return "Otro"
        }
    }

    static func result(_ raw: String?) -> String {
        switch raw {
        case "fairway": return "Fairway"
        case "rough": return "Rough"
        case "bunker": return "Bunker"
        case "green": return "Green"
        case "penalty": return "Penalty"
        case "ob": return "OB"
        case "water": return "Agua"
        case "holed": return "Embocado"
        default: return "Otro"
        }
    }

    static func lie(_ raw: String?) -> String {
        switch raw {
        case "tee": return "Tee"
        case "fairway": return "Fairway"
        case "rough": return "Rough"
        case "bunker": return "Bunker"
        case "green": return "Green"
        case "fringe": return "Fringe"
        case "recovery": return "Recuperación"
        default: return "Otro"
        }
    }

    static func length(_ raw: String?) -> String {
        switch raw {
        case "short": return "Corto"
        case "on": return "Justo"
        case "long": return "Largo"
        default: return "—"
        }
    }

    static let pendingAI = "Audio guardado. La transcripción se hace en la app de iPhone…"

    static func direction(_ raw: String?) -> String {
        switch raw {
        case "left": return "Izquierda"
        case "center": return "Centro"
        case "right": return "Derecha"
        default: return "—"
        }
    }
}

enum ClubCode {
    static func code(for name: String) -> String {
        let folded = name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        switch folded {
        case "driver", "dr": return "Dr"
        case "madera 3", "3w", "3 wood": return "3W"
        case "madera 5", "5w": return "5W"
        case "hibrido", "hy", "hybrid": return "Hy"
        case "wedge", "w": return "PW"
        case "hierro 4", "4i": return "4i"
        case "hierro 5", "5i": return "5i"
        case "hierro 6", "6i": return "6i"
        case "hierro 7", "7i": return "7i"
        case "hierro 8", "8i": return "8i"
        case "hierro 9", "9i": return "9i"
        case "pw", "pitching": return "PW"
        case "gw", "gap": return "GW"
        case "sw", "sand": return "SW"
        case "lw", "lob": return "LW"
        case "putter", "pt": return "Pt"
        default:
            if folded.hasPrefix("hierro "), let n = folded.split(separator: " ").last { return "\(n)i" }
            return String(name.prefix(8))
        }
    }

    static func label(for code: String) -> String {
        switch code {
        case "Dr": return "Driver"
        case "3W": return "Madera 3"
        case "5W": return "Madera 5"
        case "Hy": return "Híbrido"
        case "4i": return "Hierro 4"
        case "5i": return "Hierro 5"
        case "6i": return "Hierro 6"
        case "7i": return "Hierro 7"
        case "8i": return "Hierro 8"
        case "9i": return "Hierro 9"
        case "PW": return "PW"
        case "GW": return "GW"
        case "SW": return "SW"
        case "LW": return "LW"
        case "Pt": return "Putter"
        default: return code
        }
    }
}

enum CourseIdentity {
    static func key(for name: String) -> String {
        switch name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased() {
        case "azul": return "1:Azul"
        case "colorada": return "1:Colorada"
        case "cancha nueva": return "7:Cancha Nueva"
        case "cancha vieja": return "7:Cancha Vieja"
        default: return name
        }
    }

    static func id(for name: String) -> String {
        switch name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased() {
        case "azul": return "118-jockey-azul"
        case "colorada": return "118-jockey-colorada"
        case "cancha nueva": return "209-mdp-nueva"
        case "cancha vieja": return "209-mdp-vieja"
        default: return name
        }
    }
}

enum StrategyLevel: String, Hashable, CaseIterable, Sendable {
    case general
    case scratch
    case medio
    case alto

    var chip: String {
        switch self {
        case .general: return "General"
        case .scratch: return "Scratch"
        case .medio: return "Hándicap medio"
        case .alto: return "Hándicap alto"
        }
    }

    static func from(handicap: Double) -> StrategyLevel {
        if handicap <= 5 { return .scratch }
        if handicap <= 18 { return .medio }
        return .alto
    }
}

struct StrategyVariant: Hashable, Sendable {
    var teeClub: String?
    var plan: String?
}

struct StrategyHazard: Hashable, Sendable, Identifiable {
    var id: String
    var type: String
    var typeLabel: String
    var side: String?
    var sideLabel: String?
    var fromYd: Int?
    var carryYd: Int?
    var fromM: Int?
    var carryM: Int?
    var note: String?
    var at: GPSCoord?

    var title: String {
        let side = sideLabel ?? StrategyCopy.side(self.side)
        if side.isEmpty { return typeLabel }
        return "\(typeLabel) · \(side)"
    }

    var rangeLabel: String? {
        switch (fromYd, carryYd) {
        case let (from?, carry?): return "\(from)–\(carry) yd"
        case let (from?, nil): return "\(from) yd"
        case let (nil, carry?): return "\(carry) yd"
        default: return nil
        }
    }
}

struct HoleStrategy: Hashable, Sendable, Identifiable {
    var id: Int { hole }
    var hole: Int
    var planTitle: String?
    var planText: String?
    var teeClub: String?
    var teeTarget: String?
    var target: GPSCoord?
    var hazards: [StrategyHazard]
    var why: String?
    var missSide: String?
    var missNote: String?
    var greenSlope: String?
    var greenLeave: String?
    var greenNotes: String?
    var variants: [StrategyLevel: StrategyVariant]
    var publishedAt: String?

    func variant(_ level: StrategyLevel) -> StrategyVariant? {
        variants[level]
    }

    func resolvedClub(level: StrategyLevel) -> String? {
        if level != .general, let club = variants[level]?.teeClub, !club.isEmpty { return club }
        return teeClub
    }

    func resolvedPlan(level: StrategyLevel) -> String? {
        if level != .general, let plan = variants[level]?.plan, !plan.isEmpty { return plan }
        return planText
    }
}

struct CourseStrategy: Hashable, Sendable {
    var courseId: String
    var courseKey: String
    var overview: String?
    var overviewPublishedAt: String?
    var publishedHoles: [Int]
    var holes: [HoleStrategy]

    func hole(_ number: Int) -> HoleStrategy? {
        holes.first { $0.hole == number }
    }
}

enum StrategyCopy {
    static func side(_ raw: String?) -> String {
        switch raw {
        case "izquierda": return "Izquierda"
        case "derecha": return "Derecha"
        case "centro": return "Centro"
        case "ambos_lados": return "Ambos lados"
        case "frente_green": return "Frente al green"
        case "detras_green": return "Detrás del green"
        case "corto": return "Corto"
        case "largo": return "Largo"
        default: return ""
        }
    }

    static func siteWarning(courseKey: String, hole: Int) -> String? {
        guard courseKey == "1:Azul", hole == 7 else { return nil }
        return "Dato del sitio a revisar: la yarda y el par de este hoyo no parecen coincidir."
    }
}

enum PlayMath {
    static func meters(from a: GPSCoord, to b: GPSCoord) -> Int {
        let r = 6_371_000.0
        let dLat = (b.lat - a.lat) * .pi / 180
        let dLng = (b.lng - a.lng) * .pi / 180
        let la1 = a.lat * .pi / 180
        let la2 = b.lat * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(la1) * cos(la2) * sin(dLng / 2) * sin(dLng / 2)
        return Int((2 * r * atan2(sqrt(h), sqrt(1 - h))).rounded())
    }

    static func yards(_ meters: Int) -> Int {
        Int((Double(meters) * 1.0936133).rounded())
    }
}