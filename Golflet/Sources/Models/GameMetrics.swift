import Foundation

enum GameMetricsTab: String, CaseIterable, Identifiable, Sendable {
    case tee
    case hierros
    case gir
    case putting

    var id: String { rawValue }

    var title: String {
        switch self {
        case .tee: return "Tee"
        case .hierros: return "Hierros"
        case .gir: return "GIR"
        case .putting: return "Putting"
        }
    }
}

enum GameApproachBandID: String, CaseIterable, Identifiable, Sendable {
    case y150 = "150-125"
    case y125 = "125-100"
    case y100 = "100-75"
    case y75 = "75-50"
    case y50 = "50-30"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .y150: return "150–125"
        case .y125: return "125–100"
        case .y100: return "100–75"
        case .y75: return "75–50"
        case .y50: return "50–30"
        }
    }
}

struct GameMetrics: Hashable, Sendable {
    var range: String
    var empty: GameMetricsEmpty
    var tee: GameTeeMetrics
    var approach: [GameApproachBand]
    var gir: GameGIRMetrics
    var putts: GamePuttingMetrics
    var live: [GameMetricsLive]

    static func empty(range: String) -> GameMetrics {
        GameMetrics(
            range: range,
            empty: GameMetricsEmpty(tee: true, approach: true, gir: true, putts: true),
            tee: GameTeeMetrics(),
            approach: GameApproachBandID.allCases.map { GameApproachBand(id: $0.rawValue) },
            gir: GameGIRMetrics(),
            putts: GamePuttingMetrics(),
            live: []
        )
    }

    func band(id: String) -> GameApproachBand {
        approach.first { $0.id == id } ?? GameApproachBand(id: id)
    }
}

struct GameMetricsEmpty: Hashable, Sendable {
    var tee: Bool
    var approach: Bool
    var gir: Bool
    var putts: Bool
}

struct GameTeeMetrics: Hashable, Sendable {
    var fairwayPct: Int?
    var leftPct: Int?
    var rightPct: Int?
    var avgCarryYd: Int?
    var avgLateralYd: Double?
    var bandYd: Int = 15
    var drives: Int = 0
    var known: Int = 0
    var measured: Int = 0
    var tendency: String?
    var shots: [GameDriveShot] = []
}

struct GameDriveShot: Hashable, Sendable, Identifiable {
    var id: String { "\(date)-\(hole)-\(course)-\(carryYd ?? 0)-\(outcome ?? "")" }
    var date: String
    var hole: Int
    var course: String
    var par: Int?
    var carryYd: Int?
    var lateralYd: Double?
    var outcome: String?
}

struct GameApproachBand: Hashable, Sendable, Identifiable {
    var id: String
    var shots: Int = 0
    var known: Int = 0
    var greenPct: Int?
    var avgProxYd: Int?
    var proxN: Int = 0
    var pinMarked: Int = 0
    var topMiss: String?
    var list: [GameApproachShot] = []
}

struct GameApproachShot: Hashable, Sendable, Identifiable {
    var id: String { "\(date)-\(hole)-\(fromYd)-\(proxYd ?? 0)" }
    var date: String
    var hole: Int
    var course: String
    var fromYd: Int
    var onGreen: Bool?
    var miss: String?
    var proxYd: Int?
    var longYd: Double?
    var lateralYd: Double?
    var flagSource: String?
}

struct GameGIRMetrics: Hashable, Sendable {
    var girPct: Int?
    var holes: Int = 0
    var missed: Int = 0
    var missKnown: Int = 0
    var miss: GameMissCounts = GameMissCounts()
    var byPar: [Int: GameGIRPar] = [:]
    var rounds: [GameGIRRound] = []
    var trend: GameGIRTrend?
    var holesList: [GameGIRHole] = []

    func par(_ value: Int) -> GameGIRPar {
        byPar[value] ?? GameGIRPar()
    }
}

struct GameGIRPar: Hashable, Sendable {
    var girPct: Int?
    var holes: Int = 0
}

struct GameGIRRound: Hashable, Sendable, Identifiable {
    var id: String { "\(date)-\(holes)-\(girPct ?? 0)" }
    var date: String
    var holes: Int
    var girPct: Int?
}

struct GameGIRTrend: Hashable, Sendable {
    var firstHalf: Int
    var secondHalf: Int
    var delta: Int
}

struct GameGIRHole: Hashable, Sendable, Identifiable {
    var id: String { "\(date)-\(hole)-\(course)" }
    var date: String
    var hole: Int
    var course: String
    var par: Int
    var gir: Bool?
    var miss: String?
    var putts: Int?
}

struct GameMissCounts: Hashable, Sendable {
    var short: Int = 0
    var long: Int = 0
    var left: Int = 0
    var right: Int = 0

    subscript(_ key: String) -> Int {
        switch key {
        case "short": return short
        case "long": return long
        case "left": return left
        case "right": return right
        default: return 0
        }
    }

    var maxValue: Int { max(1, short, long, left, right) }
}

struct GamePuttingMetrics: Hashable, Sendable {
    var perRound: Double?
    var perRoundEst: Double?
    var perHole: Double?
    var onePuttPct: Int?
    var threePuttPct: Int?
    var holes: Int = 0
    var rounds: [GamePuttingRound] = []
    var firstPutt: GameFirstPutt = GameFirstPutt()
}

struct GamePuttingRound: Hashable, Sendable, Identifiable {
    var id: String { "\(date)-\(putts ?? 0)" }
    var date: String
    var putts: Int?
}

struct GameFirstPutt: Hashable, Sendable {
    var holes: Int = 0
    var avgYd: Double?
    var atCenter: Int = 0
    var bins: [GameFirstPuttBin] = []
}

struct GameFirstPuttBin: Hashable, Sendable, Identifiable {
    var id: String { label }
    var label: String
    var holes: Int
    var avgPutts: Double?
}

struct GameMetricsLive: Hashable, Sendable, Identifiable {
    var id: String
    var roundId: String?
}

struct LiveHoleRecord: Hashable, Sendable, Identifiable {
    var id: Int { number }
    var number: Int
    var par: Int?
    var putts: Int?
    var pin: LivePin?
    var dayPin: DayPin? = nil
    var pinAction: PinAction = .mark
}

struct LivePin: Hashable, Sendable {
    var lat: Double
    var lng: Double
    var accuracyM: Double?

    var coord: GPSCoord { GPSCoord(lat: lat, lng: lng) }
}

enum PinZone: String, CaseIterable, Sendable, Hashable {
    case front
    case middle
    case back

    var label: String {
        switch self {
        case .front: return "Adelante"
        case .middle: return "Medio"
        case .back: return "Fondo"
        }
    }
}

enum PinAction: String, Sendable, Hashable {
    case mark
    case remark
    case report
    case reported
    case none
}

enum PinSource: String, Sendable, Hashable {
    case club
    case player
}

struct DayPin: Hashable, Sendable {
    var lat: Double
    var lng: Double
    var accuracyM: Double?
    var zone: PinZone?
    var zoneLabel: String
    var source: PinSource
    var byMe: Bool

    var coord: GPSCoord { GPSCoord(lat: lat, lng: lng) }

    var sourcePhrase: String {
        PinCopy.phrase(source: source, byMe: byMe)
    }

    var headline: String {
        PinCopy.headline(zone: zoneLabel.isEmpty ? (zone?.label ?? "Medio") : zoneLabel, phrase: sourcePhrase)
    }
}

enum GamePinPriority {
    /// Metrics flag: club > own > other player > green center.
    static func resolve(club: Bool, own: Bool, other: Bool) -> String {
        if club { return "club" }
        if own { return "own" }
        if other { return "other" }
        return "green_center"
    }
}

enum PinCopy {
    static let mark = "Estoy en la bandera"
    static let save = "Guardar bandera"
    static let cancel = "Cancelar"
    static let remark = "Volver a marcar la bandera"
    static let report = "Bandera mal registrada"
    static let confirm = "Confirmar reporte"
    static let reported = "Reportaste esta bandera"
    static let whereOnGreen = "¿Dónde está la bandera en el green?"
    static let reportAsk = "¿La bandera no está donde dice?"
    static let reportFoot = "Parate al lado de la bandera real y confirmá. Le avisamos a Golflet para que la revise; nadie ve quién reportó."
    static let reportedFoot = "Reportaste esta bandera. Gracias, la vamos a revisar."
    static let usesThis = "Tus yardas y tus métricas de approach usan esta bandera."
    static let firstToday = "Sos el primero en este hoyo hoy: la bandera que marques la usan todos los que juegan hoy, con yardas exactas."
    static let askMark = "¿Embocaste? Parate al lado del hoyo y tocá:"
    static let noPin = "Sin bandera de hoy en este hoyo: medimos al centro del green."
    static let sharedToday = "La ven todos los que juegan este hoyo hoy."

    static func phrase(source: PinSource, byMe: Bool) -> String {
        switch source {
        case .club: return "cargada por el club"
        case .player: return byMe ? "la marcaste vos" : "cargada por un jugador"
        }
    }

    static func headline(zone: String, phrase: String) -> String {
        "Bandera de hoy · \(zone) · \(phrase)"
    }

    static func gpsNote(_ meters: Double?) -> String {
        "GPS ±\(meters.map { "\(Int($0.rounded()))" } ?? "—") m. \(sharedToday)"
    }
}

enum GameMetricsCoverage {
    static func count(rounds: [Round], range: StatsRange, live: [GameMetricsLive]) -> (gps: Int, n: Int) {
        let period = StatsEngine.ranged(rounds, range: range)
        let ids = Set(period.map(\.roundId))
        let linked = Set(live.compactMap(\.roundId).filter { ids.contains($0) })
        let extra = live.filter { item in
            guard let id = item.roundId, !id.isEmpty else { return true }
            return !ids.contains(id)
        }.count
        let gps = period.filter { $0.gpsShots > 0 || linked.contains($0.roundId) }.count + extra
        return (gps, period.count + extra)
    }

    static func line(gps: Int, n: Int) -> String {
        "Con GPS: \(gps) de \(n) \(n == 1 ? "ronda" : "rondas")"
    }
}

enum GameMetricsCopy {
    static let howToPlay = "Jugá con “Ya pegué” para ver tus datos"
    static let startGPS = "Empezar ronda con GPS"

    static func emptyTitle(for tab: GameMetricsTab) -> String {
        switch tab {
        case .tee: return "Tus drives"
        case .hierros: return "Tus approaches de 150 a 30 yd"
        case .gir: return "Greens en regulación"
        case .putting: return "Tus putts"
        }
    }

    static func emptyBody(for tab: GameMetricsTab) -> String {
        switch tab {
        case .tee:
            return "Qué porcentaje de fairways pegás, para qué lado errás, cuánto se abre tu drive y cuánto lo pegás, en los par 4 y par 5."
        case .hierros:
            return "Por distancia: cuántas veces llegás al green, a cuántas yardas de la bandera quedás y para dónde errás."
        case .gir:
            return "Qué porcentaje de greens tomás en regulación, en par 3, 4 y 5, cómo viene tu tendencia y para dónde errás los greens."
        case .putting:
            return "Putts por ronda y por hoyo, qué porcentaje de hoyos hacés en 1 y en 3 putts, y desde qué distancia tirás el primer putt."
        }
    }

    static func outcome(_ value: String?) -> String {
        switch value {
        case "fairway": return "Fairway"
        case "left": return "Izquierda"
        case "right": return "Derecha"
        default: return "Sin marcar"
        }
    }

    static func miss(_ value: String?) -> String {
        switch value {
        case "short": return "corto"
        case "long": return "largo"
        case "left": return "a la izquierda"
        case "right": return "a la derecha"
        default: return ""
        }
    }

    static func percent(_ value: Int?) -> String {
        guard let value else { return "—" }
        return "\(value)%"
    }

    static func yards(_ value: Int?) -> String {
        guard let value else { return "—" }
        return "\(value) yd"
    }

    static func yards(_ value: Double?) -> String {
        guard let value else { return "—" }
        if value.rounded() == value {
            return "\(Int(value)) yd"
        }
        return String(format: "%.1f yd", value)
    }

    static let flagHow = "Distancia a la bandera de ese día: la que cargó el club, la que marcaste vos o la que marcó otro jugador; si no había, al centro del green."
    static let flagHowApproach = "Cada golpe que salió a entre 30 y 150 yd de la bandera. Distancia a la bandera de ese día (del club, tuya o de otro jugador); si no había, al centro del green. Tocá una distancia para ver el detalle."
    static let flagHowPutting = "Desde donde marcaste el primer putt hasta la bandera de ese día: la que cargó el club, la que marcaste vos o la que marcó otro jugador. Si nadie la marcó, al centro del green."

    static func flagSource(_ value: String?) -> String {
        switch value {
        case "club": return "bandera del club"
        case "day_pin": return "bandera de hoy"
        case "player_marked", "pin": return "bandera marcada"
        case "green_center": return "al centro del green"
        default: return ""
        }
    }
}
