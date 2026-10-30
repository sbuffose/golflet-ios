import Foundation

struct PlanRecord: Hashable, Sendable, Identifiable {
    var id: String
    var clubCode: String
    var course: String
    var date: String
    var teeTime: String
    var startHole: Int
    var minPerHole: Double
    var distSource: String
    var teeTimeID: String?
}

struct PlanCourseInfo: Hashable, Sendable {
    var clubCode: String
    var course: String
    var clubName: String
    var numberingUnconfirmed: Bool
    var usualTee: String?
    var hasMap: Bool
    var hasGreenGuide: Bool
}

struct PlanHoleRow: Hashable, Sendable, Identifiable {
    var id: Int { hole }
    var hole: Int
    var par: Int?
    var playLengthYd: Int?
    var eta: String
    var order: Int
    var minutes: Double
    var bearingTrue: Double?
    var wind: PlanWind?
    var playsLikeYd: Int?
    var wxTempC: Double?
    var wxPrecipMm: Double?
    var shots: [PlanSavedShot]
    var relevamiento: Bool
}

struct PlanSavedShot: Hashable, Sendable {
    var club: String
    var source: String
    var to: PlanLL?
    var yardsFromTee: Int?
    var adjusted: Bool
    var suggested: Bool
    var aimYd: Int?
}

struct PlanTorneo: Hashable, Sendable {
    var on: Bool
    var active: Bool
    var mode: String
    var noDistanceRule: Bool
    var locks: [String: Bool]

    var plannerLocked: Bool { locks["planner"] == true }
    var playsLikeLocked: Bool { locks["plays_like"] == true }
    var distancesLocked: Bool { locks["distances"] == true }
    var recommendationsLocked: Bool { locks["recommendations"] == true }

    static let open = PlanTorneo(on: false, active: false, mode: "normal", noDistanceRule: false, locks: [:])
}

struct PlanDetail: Hashable, Sendable {
    var plan: PlanRecord
    var course: PlanCourseInfo
    var holes: [PlanHoleRow]
    var forecastStatus: String?
    var windModel: String
    var torneo: PlanTorneo

    func hole(_ n: Int) -> PlanHoleRow? {
        holes.first { $0.hole == n }
    }
}

struct PlanSetupCourse: Hashable, Sendable, Identifiable {
    var id: String { "\(clubCode)|\(course)" }
    var clubCode: String
    var course: String
    var clubName: String
    var holes: Int
    var mine: Bool
}

struct PlanSetup: Hashable, Sendable {
    var courses: [PlanSetupCourse]
    var today: String
}

struct PlanBagEntry: Hashable, Sendable, Identifiable {
    var id: String { code }
    var code: String
    var label: String
    var carryYd: Int?
    var totalYd: Int?
    var gpsOK: Bool
    var gpsMean: PlanDispersionMean?
    var gpsCov: [[Double]]?

    func dist(source: String) -> PlanClubDist? {
        PlanCore.clubDist(
            libretoTotal: totalYd.map(Double.init) ?? carryYd.map(Double.init),
            libretoCarry: carryYd.map(Double.init),
            gpsMean: gpsMean,
            gpsCov: gpsCov,
            gpsOK: gpsOK,
            source: source
        )
    }
}

struct CourseMapHole: Hashable, Sendable, Identifiable {
    var id: Int { hole }
    var hole: Int
    var line: [PlanLL]
    var playLengthYd: Int?
    var tees: [CourseMapTee]
    var green: CourseMapGreen?
    var fairways: [[PlanLL]]
    var bunkers: [CourseMapBunker]
    var water: [[PlanLL]]
    var woods: [[PlanLL]]
    var markers: [CourseMapMarker]
    var hazards: [CourseMapHazard]
    var bearingTrue: Double?
    var cardYards: [String: Int]
    var par: Int?
    var coverageNotes: [String]
    var markersRef: String?
}

struct CourseMapTee: Hashable, Sendable {
    var center: PlanLL
    var polygon: [PlanLL]
    var toGreenYd: Double?
}

struct CourseMapGreen: Hashable, Sendable {
    var polygon: [PlanLL]
    var center: PlanLL?
    var front: PlanLL?
    var back: PlanLL?
}

struct CourseMapBunker: Hashable, Sendable {
    var polygon: [PlanLL]
    var center: PlanLL?
}

struct CourseMapMarker: Hashable, Sendable, Identifiable {
    var id: String { "\(yards)-\(fromTeeYd)" }
    var yards: Int
    var fromTeeYd: Int
    var point: PlanLL
    var across: [PlanLL]
    var color: String?
}

struct CourseMapHazard: Hashable, Sendable, Identifiable {
    var id: String { "\(kind)-\(reachYd ?? 0)-\(carryYd ?? 0)" }
    var kind: String
    var side: String?
    var reachYd: Int?
    var carryYd: Int?
    var greenside: Bool
    var inPlay: Bool
    var text: String
    var center: PlanLL?
}

struct CourseMap: Hashable, Sendable {
    var clubCode: String
    var course: String
    var holes: [CourseMapHole]
    var markerRef: String?

    func hole(_ n: Int) -> CourseMapHole? {
        holes.first { $0.hole == n }
    }
}

struct PlanCardTee: Hashable, Sendable, Identifiable {
    var id: String { key }
    var key: String
    var name: String
    var yards: Int
    var colorHex: UInt32
}

enum PlanTeeColors {
    static func hex(for key: String) -> UInt32 {
        switch key.uppercased() {
        case "AZUL": return 0x2F6DB5
        case "NEGRO": return 0x1A1A1A
        case "BLANCO": return 0xFFFFFF
        case "AMARILLO": return 0xE3B925
        case "ROJO": return 0xC0392B
        case "ROSA": return 0xE79AB8
        case "VERDE": return 0x2E8B57
        case "DORADO": return 0xC8A86A
        case "PLATEADO": return 0xB8BEC2
        case "CELESTE": return 0x75AADB
        case "NARANJA": return 0xE07B2E
        case "VIOLETA": return 0x7A4FA0
        default: return 0x5D6F66
        }
    }

    static func name(_ key: String) -> String {
        let raw = key.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let first = raw.first else { return raw }
        return String(first).uppercased() + raw.dropFirst().lowercased()
    }

    static func tees(from hole: CourseMapHole, planHole: PlanHoleRow, course: PlanCourseInfo) -> [PlanCardTee] {
        if course.numberingUnconfirmed && planHole.par == nil { return [] }
        return hole.cardYards
            .filter { $0.value > 0 }
            .map { PlanCardTee(key: $0.key.uppercased(), name: name($0.key), yards: $0.value, colorHex: hex(for: $0.key)) }
            .sorted { $0.yards > $1.yards }
    }
}

struct PlanPendingShot: Hashable, Sendable {
    var club: String
    var aimYd: Int
    var suggested: Bool
    var to: PlanLL?
}

enum PlanViewMode: String, Hashable, Sendable {
    case diseno
    case satelital

    var label: String {
        self == .diseno ? "Diseño" : "Satelital"
    }
}

enum PlanBreakdown: Hashable, Sendable {
    case shot
    case remain
    case confirmed(Int)
}

struct PlanLiveNumbers: Hashable, Sendable {
    var shotYards: Int
    var remainYards: Int
    var entranceYards: Int?
    var playsLikeRemain: Int?
    var adjust: PlanShotAdjust
    var input: PlanAdjInput
    var club: String
}

enum PlanPreferences {
    static func teeKey(clubCode: String, course: String) -> String {
        "golflet.tee.\(clubCode)|\(course.lowercased())"
    }

    static func firmKey(planID: String) -> String {
        "golflet.firm.\(planID)"
    }

    static func storedTee(clubCode: String, course: String) -> String? {
        UserDefaults.standard.string(forKey: teeKey(clubCode: clubCode, course: course))
    }

    static func storeTee(_ key: String, clubCode: String, course: String) {
        UserDefaults.standard.set(key, forKey: teeKey(clubCode: clubCode, course: course))
    }

    static func storedFirm(planID: String) -> PlanFirmness {
        PlanFirmness(rawValue: UserDefaults.standard.string(forKey: firmKey(planID: planID)) ?? "") ?? .normal
    }

    static func storeFirm(_ firm: PlanFirmness, planID: String) {
        UserDefaults.standard.set(firm.rawValue, forKey: firmKey(planID: planID))
    }
}
