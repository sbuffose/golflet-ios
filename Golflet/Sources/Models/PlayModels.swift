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

    var patchBody: [String: Any] {
        var body: [String: Any] = ["transcript": transcript]
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
        } else {
            body["restructure"] = true
        }
        return body
    }

    var jsonBody: [String: Any] {
        var body = patchBody
        body.removeValue(forKey: "restructure")
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

    static let pendingAI = "La transcripción automática se activa pronto"

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