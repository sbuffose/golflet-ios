import Foundation

/// Strokes gained against PGA Tour baselines published by Mark Broadie (2011).
/// Shot values: "Assessing Golfer Performance on the PGA TOUR", Table 9 (ShotLink 2003–2010).
/// http://www.columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf
/// Putts: "Putts Gained: Measuring Putting on the PGA TOUR" (2011).
/// http://www.columbia.edu/~mnb2/broadie/Assets/putting_strokes_gained_20110113.pdf
/// Linear interpolation between rows; clamp outside the table. Tee under 100 yd uses Fairway.
/// There is no published-by-handicap table we can cite with these numbers, so we do not compare by handicap.
enum SGLie: String, Codable, CaseIterable {
    case salida = "Salida"
    case fairway = "Fairway"
    case rough = "Rough"
    case bunker = "Bunker"
    case green = "Green"
    case agua = "Agua"
    case hoyo = "Hoyo"
}

enum SGCategory: String, Codable, CaseIterable, Identifiable {
    case tee, app, corto, putt
    var id: String { rawValue }

    var title: String {
        switch self {
        case .tee: return "Salida"
        case .app: return "Approach"
        case .corto: return "Juego corto"
        case .putt: return "Putt"
        }
    }

    var detail: String {
        switch self {
        case .tee: return "Off the tee: golpes de salida en par 4 y 5"
        case .app: return "Golpes a green desde más de 46 m (50 yd)"
        case .corto: return "Alrededor del green: hasta 46 m, fuera del green"
        case .putt: return "Todo golpe desde el green"
        }
    }
}

struct SGShot: Identifiable, Hashable, Codable {
    var id: String = UUID().uuidString
    var hole: Int
    var index: Int
    var startLie: SGLie
    var startM: Double
    var endLie: SGLie
    var endM: Double
    var holed: Bool
    var penalty: Bool
    var club: String?
    var sg: Double
    var category: SGCategory
}

struct SGTotals: Hashable {
    var tee: Double = 0
    var app: Double = 0
    var corto: Double = 0
    var putt: Double = 0
    var tot: Double { tee + app + corto + putt }

    subscript(_ cat: SGCategory) -> Double {
        switch cat {
        case .tee: return tee
        case .app: return app
        case .corto: return corto
        case .putt: return putt
        }
    }

    mutating func add(_ shot: SGShot) {
        switch shot.category {
        case .tee: tee += shot.sg
        case .app: app += shot.sg
        case .corto: corto += shot.sg
        case .putt: putt += shot.sg
        }
    }
}

enum StrokesGained {
    static let distancesYd: [Double] = [
        10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
        320, 340, 360, 380, 400, 420, 440, 460, 480, 500, 520, 540, 560, 580, 600
    ]

    static let tee: [Double?] = [
        nil, nil, nil, nil, nil, nil, nil, nil, nil, 2.92, 2.99, 2.97, 2.99, 3.05, 3.12, 3.17, 3.25, 3.45, 3.65, 3.71,
        3.79, 3.86, 3.92, 3.96, 3.99, 4.02, 4.08, 4.17, 4.28, 4.41, 4.54, 4.65, 4.74, 4.79, 4.82
    ]
    static let fairway: [Double] = [
        2.18, 2.40, 2.52, 2.60, 2.66, 2.70, 2.72, 2.75, 2.77, 2.80, 2.85, 2.91, 2.98, 3.08, 3.19, 3.32, 3.45, 3.58, 3.69, 3.78,
        3.84, 3.88, 3.95, 4.03, 4.11, 4.19, 4.27, 4.34, 4.42, 4.50, 4.58, 4.66, 4.74, 4.82, 4.89
    ]
    static let rough: [Double] = [
        2.34, 2.59, 2.70, 2.78, 2.87, 2.91, 2.93, 2.96, 2.99, 3.02, 3.08, 3.15, 3.23, 3.31, 3.42, 3.53, 3.64, 3.74, 3.83, 3.90,
        3.95, 4.02, 4.11, 4.21, 4.30, 4.40, 4.49, 4.58, 4.68, 4.77, 4.87, 4.96, 5.06, 5.15, 5.25
    ]
    static let bunker: [Double] = [
        2.43, 2.53, 2.66, 2.82, 2.92, 3.15, 3.21, 3.24, 3.24, 3.23, 3.21, 3.22, 3.28, 3.40, 3.55, 3.70, 3.84, 3.93, 4.00, 4.04,
        4.12, 4.26, 4.41, 4.55, 4.69, 4.83, 4.97, 5.11, 5.25, 5.40, 5.54, 5.68, 5.82, 5.96, 6.10
    ]
    static let puttFt: [(Double, Double)] = [
        (0, 1), (2, 1.01), (3, 1.05), (4, 1.14), (5, 1.24), (6, 1.34), (7, 1.43), (8, 1.50),
        (9, 1.56), (10, 1.61), (15, 1.78), (20, 1.87), (30, 1.98), (40, 2.06), (50, 2.14), (60, 2.21), (90, 2.36)
    ]

    static func interpolate(_ xs: [Double], _ ys: [Double], _ x: Double) -> Double {
        guard let first = xs.first, let last = xs.last, xs.count == ys.count, !xs.isEmpty else { return 0 }
        if x <= first { return ys[0] }
        if x >= last { return ys[ys.count - 1] }
        for i in 1..<xs.count where x <= xs[i] {
            let span = xs[i] - xs[i - 1]
            guard span > 0 else { return ys[i] }
            return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / span
        }
        return ys[ys.count - 1]
    }

    static func expected(lie: SGLie, meters: Double) -> Double {
        if lie == .hoyo { return 0 }
        if lie == .green {
            return interpolate(puttFt.map(\.0), puttFt.map(\.1), meters * 3.2808)
        }
        let yards = meters * 1.0936
        var col = lie == .agua ? SGLie.rough : lie
        if col == .salida && yards < 100 { col = .fairway }
        let raw: [Double?]
        switch col {
        case .salida: raw = tee
        case .fairway: raw = fairway.map { Optional($0) }
        case .rough, .agua: raw = rough.map { Optional($0) }
        case .bunker: raw = bunker.map { Optional($0) }
        default: raw = rough.map { Optional($0) }
        }
        var xs: [Double] = []
        var ys: [Double] = []
        for (i, value) in raw.enumerated() where value != nil {
            xs.append(distancesYd[i])
            ys.append(value!)
        }
        return interpolate(xs, ys, yards)
    }

    static func category(startLie: SGLie, startM: Double, par: Int) -> SGCategory {
        if startLie == .salida && par >= 4 { return .tee }
        if startLie == .green { return .putt }
        if startM <= 46 { return .corto }
        return .app
    }

    static func shot(
        hole: Int,
        index: Int,
        startLie: SGLie,
        startM: Double,
        endLie: SGLie,
        endM: Double,
        holed: Bool,
        penalty: Bool,
        par: Int,
        club: String? = nil
    ) -> SGShot {
        let startExpected = expected(lie: startLie == .agua ? .rough : startLie, meters: startM)
        let endExpected = holed ? 0 : expected(lie: endLie, meters: endM)
        let sg = startExpected - endExpected - 1 - (penalty ? 1 : 0)
        return SGShot(
            hole: hole,
            index: index,
            startLie: startLie,
            startM: startM,
            endLie: holed ? .hoyo : endLie,
            endM: holed ? 0 : endM,
            holed: holed,
            penalty: penalty,
            club: club,
            sg: sg,
            category: category(startLie: startLie, startM: startM, par: par)
        )
    }

    static func totals(_ shots: [SGShot]) -> SGTotals {
        var o = SGTotals()
        shots.forEach { o.add($0) }
        return o
    }

    static func format(_ value: Double) -> String {
        let body = String(format: "%.2f", abs(value)).replacingOccurrences(of: ".", with: ",")
        if value > 0.004 { return "+\(body)" }
        if value < -0.004 { return "−\(body)" }
        return body
    }
}
