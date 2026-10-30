import Foundation

struct PlanLL: Hashable, Sendable {
    var lng: Double
    var lat: Double

    var pair: [Double] { [lng, lat] }

    static func parse(_ raw: Any?) -> PlanLL? {
        if let pair = raw as? [Any], pair.count >= 2,
           let lng = JSONFlex.double(from: pair[0]),
           let lat = JSONFlex.double(from: pair[1]) {
            return PlanLL(lng: lng, lat: lat)
        }
        if let blob = raw as? [String: Any],
           let lng = JSONFlex.double(from: blob["lng"] ?? blob["lon"]),
           let lat = JSONFlex.double(from: blob["lat"]) {
            return PlanLL(lng: lng, lat: lat)
        }
        return nil
    }
}

struct PlanXY: Hashable, Sendable {
    var x: Double
    var y: Double

    var pair: [Double] { [x, y] }
}

struct PlanWind: Hashable, Sendable {
    var kmh: Double
    var fromDeg: Double
    var gustKmh: Double?
}

struct PlanWindComp: Hashable, Sendable {
    var headMph: Double
    var crossMph: Double
}

struct PlanAdjTerm: Hashable, Sendable {
    var key: String
    var yards: Int
}

struct PlanShotAdjust: Hashable, Sendable {
    var normal: Int
    var terms: [PlanAdjTerm]
    var total: Int
    var dragged: Bool
    var partial: Bool

    static func partial(total: Int, normal: Int?) -> PlanShotAdjust {
        PlanShotAdjust(normal: normal ?? total, terms: [], total: total, dragged: false, partial: true)
    }
}

struct PlanAdjInput: Hashable, Sendable {
    var headMph: Double?
    var kmh: Double?
    var tempC: Double?
    var precipMm: Double?
    var riseM: Double?
    var rollYd: Double?
    var firm: PlanFirmness
}

enum PlanFirmness: String, CaseIterable, Hashable, Sendable {
    case blanda
    case normal
    case dura

    var label: String {
        switch self {
        case .blanda: return "Blanda"
        case .normal: return "Normal"
        case .dura: return "Dura"
        }
    }
}

struct PlanClubDist: Hashable, Sendable {
    var kind: Kind
    var yards: Double
    var carry: Double?
    var mean: PlanDispersionMean?
    var cov: [[Double]]?
    var used: String
    var note: String?
    var partial: Bool

    enum Kind: String, Hashable, Sendable {
        case point
        case oval
    }
}

struct PlanDispersionMean: Hashable, Sendable {
    var fwd: Double
    var lat: Double
}

struct PlanEvalShot: Hashable, Sendable {
    var code: String
    var dist: PlanClubDist
    var aimYd: Int
    var fwd: Int
    var landing: PlanXY
    var afterYd: Int
    var risk: [PlanRisk]
    var riskPct: Int
    var score: Double
    var partial: Bool
    var reason: PlanSuggestReason?
    var alternatives: [PlanSuggestAlt]
}

struct PlanRisk: Hashable, Sendable {
    var kind: String
    var pct: Int
}

struct PlanSuggestReason: Hashable, Sendable {
    var type: String
    var text: String
}

struct PlanSuggestAlt: Hashable, Sendable {
    var code: String
    var fwd: Int
    var afterYd: Int
    var riskPct: Int
}

struct PlanHazardPoly: Hashable, Sendable, Identifiable {
    var id: Int
    var kind: String
    var poly: [PlanXY]
}

enum PlanCore {
    static let yardMeters = 0.9144
    static let kmhPerMph = 1.609344
    static let minGPSShots = 5
    static let ovalK = 1.515
    static let defaultMinPerHole = 14.0
    static let partialPenalty = 0.35
    static let elevationTermEnabled = false
    static let riskYards: [String: Double] = [
        "bunker": 0.4,
        "agua": 2,
        "bosque": 0.6,
        "límite": 2
    ]
    static let kindES: [String: String] = [
        "bunker": "el bunker",
        "agua": "el agua",
        "bosque": "los árboles",
        "límite": "el OB"
    ]
    static let windLabel = "Estimación: en contra ~1% más corto por cada mph, a favor ~0,5% más largo por mph, cruzado desvía ~0,5% de la distancia por mph."
    static let adjLabel = "Estimación: viento (modelo de arriba); temperatura ±0,18% por °C respecto de 20 °C; lluvia −1,5% (≥0,2 mm/h) o −3% (≥1 mm/h); altura (desactivada por ahora) 1 yd por yd de desnivel; cancha blanda/dura −/+50% del rodado."

    static func round1(_ x: Double) -> Double {
        (x * 10).rounded() / 10
    }

    static func norm360(_ deg: Double) -> Double {
        let m = deg.truncatingRemainder(dividingBy: 360)
        return m >= 0 ? m : m + 360
    }

    static func rad(_ deg: Double) -> Double { deg * .pi / 180 }
    static func deg(_ rad: Double) -> Double { rad * 180 / .pi }

    static func dist(_ a: PlanXY, _ b: PlanXY) -> Double {
        hypot(b.x - a.x, b.y - a.y)
    }

    static func distLL(_ a: PlanLL, _ b: PlanLL) -> Double {
        dist(xy(a, ref: a), xy(b, ref: a))
    }

    static func xy(_ p: PlanLL, ref: PlanLL) -> PlanXY {
        let kx = 111_320 * cos(rad(ref.lat))
        let ky = 110_574.0
        return PlanXY(x: (p.lng - ref.lng) * kx, y: (p.lat - ref.lat) * ky)
    }

    static func ll(_ v: PlanXY, ref: PlanLL) -> PlanLL {
        let kx = 111_320 * cos(rad(ref.lat))
        let ky = 110_574.0
        return PlanLL(lng: ref.lng + v.x / kx, lat: ref.lat + v.y / ky)
    }

    static func bearingXY(_ a: PlanXY, _ b: PlanXY) -> Double {
        norm360(deg(atan2(b.x - a.x, b.y - a.y)))
    }

    static func unit(_ bearing: Double) -> PlanXY {
        PlanXY(x: sin(rad(bearing)), y: cos(rad(bearing)))
    }

    static func rightOf(_ u: PlanXY) -> PlanXY {
        PlanXY(x: u.y, y: -u.x)
    }

    static func windComp(bearing: Double, wind: PlanWind) -> PlanWindComp {
        let rel = rad(norm360(wind.fromDeg - bearing))
        let mph = wind.kmh / kmhPerMph
        return PlanWindComp(headMph: round1(mph * cos(rel)), crossMph: round1(mph * sin(rel)))
    }

    static func distFactor(headMph: Double) -> Double {
        let f = headMph >= 0 ? 1 - 0.01 * headMph : 1 + 0.005 * -headMph
        return min(1.3, max(0.6, f))
    }

    static func driftCoef(crossMph: Double) -> Double {
        -0.005 * crossMph
    }

    static func applyWind(fwd: Double, lat: Double, comp: PlanWindComp) -> (fwd: Double, lat: Double) {
        (fwd * distFactor(headMph: comp.headMph), lat + driftCoef(crossMph: comp.crossMph) * fwd)
    }

    static func playsLikeYd(_ yd: Double, headMph: Double) -> Int {
        Int((yd / distFactor(headMph: headMph) - yd).rounded())
    }

    static func adjTerms(yd: Double, input: PlanAdjInput) -> [PlanAdjTerm] {
        var terms: [PlanAdjTerm] = []
        func push(_ key: String, _ value: Double) {
            let rounded = Int(value.sign == .minus ? -abs(value).rounded() : abs(value).rounded())
            if rounded != 0 {
                terms.append(PlanAdjTerm(key: key, yards: rounded))
            }
        }
        if let head = input.headMph {
            push("viento", yd * distFactor(headMph: head) - yd)
        }
        if let temp = input.tempC {
            push("temp", yd * 0.18 / 100 * (temp - 20))
        }
        if let rain = input.precipMm, rain >= 0.2 {
            push("lluvia", yd * (rain >= 1 ? -3.0 : -1.5) / 100)
        }
        if elevationTermEnabled, let rise = input.riseM {
            push("altura", -rise / yardMeters)
        }
        if input.firm != .normal, let roll = input.rollYd, roll > 0 {
            push("cancha", (input.firm == .dura ? 1.0 : -1.0) * roll * 0.5)
        }
        return terms
    }

    static func shotAdjust(normal: Double, input: PlanAdjInput) -> PlanShotAdjust {
        let n = Int(normal.rounded())
        let terms = adjTerms(yd: Double(n), input: input)
        return PlanShotAdjust(normal: n, terms: terms, total: n + terms.reduce(0) { $0 + $1.yards }, dragged: false, partial: false)
    }

    static func shotReverse(reached: Double, input: PlanAdjInput) -> PlanShotAdjust {
        let r = Int(reached.rounded())
        let terms = adjTerms(yd: Double(r), input: input)
        return PlanShotAdjust(normal: r - terms.reduce(0) { $0 + $1.yards }, terms: terms, total: r, dragged: true, partial: false)
    }

    static func aimPoint(path: [PlanXY], from: PlanXY, meters: Double) -> PlanXY {
        guard path.count >= 2 else { return path.last ?? from }
        var bestS = 0.0
        var bestDD = Double.infinity
        var acc = 0.0
        for i in 0..<(path.count - 1) {
            let a = path[i], b = path[i + 1]
            let length = dist(a, b)
            let L = length > 0 ? length : 1e-9
            let t = max(0, min(1, ((from.x - a.x) * (b.x - a.x) + (from.y - a.y) * (b.y - a.y)) / (L * L)))
            let p = PlanXY(x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y))
            let dd = dist(p, from)
            if dd < bestDD {
                bestDD = dd
                bestS = acc + t * L
            }
            acc += L
        }
        let goal = min(acc, bestS + sqrt(max(0, meters * meters - bestDD * bestDD)))
        var s = 0.0
        for i in 0..<(path.count - 1) {
            let L = dist(path[i], path[i + 1])
            if s + L >= goal {
                let t = (goal - s) / (L > 0 ? L : 1e-9)
                return PlanXY(
                    x: path[i].x + t * (path[i + 1].x - path[i].x),
                    y: path[i].y + t * (path[i + 1].y - path[i].y)
                )
            }
            s += L
        }
        return path[path.count - 1]
    }

    static func offsetPoint(from: PlanXY, aim: PlanXY, fwdYd: Double, latYd: Double) -> PlanXY {
        let u = unit(bearingXY(from, aim))
        let r = rightOf(u)
        return PlanXY(
            x: from.x + (u.x * fwdYd + r.x * latYd) * yardMeters,
            y: from.y + (u.y * fwdYd + r.y * latYd) * yardMeters
        )
    }

    static func inPoly(_ p: PlanXY, _ poly: [PlanXY]) -> Bool {
        var c = false
        var j = poly.count - 1
        for i in 0..<poly.count {
            let yi = poly[i].y, yj = poly[j].y
            if (yi > p.y) != (yj > p.y) && p.x < (poly[j].x - poly[i].x) * (p.y - yi) / (yj - yi) + poly[i].x {
                c.toggle()
            }
            j = i
        }
        return c
    }

    static func hitsAt(_ p: PlanXY, _ hazards: [PlanHazardPoly]) -> [PlanHazardPoly] {
        hazards.filter { $0.poly.count > 2 && inPoly(p, $0.poly) }
    }

    static func fitDD(_ dd: PlanClubDist, remain: Double) -> PlanClubDist {
        guard dd.yards > remain + 15 else { return dd }
        let k = remain / dd.yards
        if dd.kind == .oval, let mean = dd.mean, let cov = dd.cov {
            return PlanClubDist(
                kind: .oval,
                yards: remain,
                carry: dd.carry,
                mean: PlanDispersionMean(fwd: remain, lat: mean.lat * k),
                cov: cov.map { $0.map { $0 * k * k } },
                used: dd.used,
                note: dd.note,
                partial: true
            )
        }
        return PlanClubDist(kind: .point, yards: remain, carry: nil, mean: nil, cov: nil, used: dd.used, note: dd.note, partial: true)
    }

    static func isDriver(_ code: String) -> Bool {
        let folded = code.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        return folded == "dr" || folded == "driver"
    }

    static func clubDist(libretoTotal: Double?, libretoCarry: Double?, gpsMean: PlanDispersionMean?, gpsCov: [[Double]]?, gpsOK: Bool, source: String) -> PlanClubDist? {
        if source == "gps", gpsOK, let mean = gpsMean, let cov = gpsCov {
            return PlanClubDist(kind: .oval, yards: mean.fwd, carry: nil, mean: mean, cov: cov, used: "gps", note: nil, partial: false)
        }
        if source == "gps", let lib = libretoTotal {
            return PlanClubDist(kind: .point, yards: lib, carry: libretoCarry, mean: nil, cov: nil, used: "libreto", note: "Sin tiros GPS suficientes: uso tu libreto.", partial: false)
        }
        if let lib = libretoTotal {
            return PlanClubDist(kind: .point, yards: lib, carry: libretoCarry, mean: nil, cov: nil, used: "libreto", note: nil, partial: false)
        }
        if gpsOK, let mean = gpsMean, let cov = gpsCov {
            return PlanClubDist(kind: .oval, yards: mean.fwd, carry: nil, mean: mean, cov: cov, used: "gps", note: "No cargaste este palo en el libreto: uso tus tiros GPS.", partial: false)
        }
        return nil
    }

    static func evalShot(
        ball: PlanXY,
        green: PlanXY,
        path: [PlanXY],
        code: String,
        dist dd0: PlanClubDist,
        wind: PlanWind?,
        hazards: [PlanHazardPoly],
        aimYd: Int?
    ) -> PlanEvalShot {
        let remain = dist(ball, green) / yardMeters
        let dd = fitDD(dd0, remain: remain)
        let aim = aimPoint(path: path, from: ball, meters: dd.yards * yardMeters)
        let comp = wind.map { windComp(bearing: bearingXY(ball, aim), wind: $0) }
        let baseLat = dd.kind == .oval ? (dd.mean?.lat ?? 0) : 0
        let wp = comp.map { applyWind(fwd: dd.yards, lat: baseLat, comp: $0) } ?? (dd.yards, baseLat)
        var aimOff = aimYd ?? Int((-wp.lat).rounded())
        if aimYd == nil && abs(aimOff) < 3 { aimOff = 0 }
        let landing = offsetPoint(from: ball, aim: aim, fwdYd: wp.fwd, latYd: wp.lat + Double(aimOff))
        var riskMap: [String: Int] = [:]
        var tests = [landing]
        if dd.kind == .point, let carry = dd.carry, carry < dd.yards {
            let cw = comp.map { applyWind(fwd: carry, lat: 0, comp: $0) } ?? (carry, 0.0)
            tests.append(offsetPoint(from: ball, aim: aim, fwdYd: cw.fwd, latYd: cw.lat + Double(aimOff)))
        }
        for point in tests {
            for hit in hitsAt(point, hazards) {
                riskMap[hit.kind] = 100
            }
        }
        let risk = riskMap.map { PlanRisk(kind: $0.key, pct: $0.value) }.sorted { $0.pct > $1.pct }
        let after = dist(landing, green) / yardMeters
        let pen = risk.reduce(0.0) { $0 + Double($1.pct) * (riskYards[$1.kind] ?? 1) }
        return PlanEvalShot(
            code: code,
            dist: dd,
            aimYd: aimOff,
            fwd: Int(wp.fwd.rounded()),
            landing: landing,
            afterYd: Int(after.rounded()),
            risk: risk,
            riskPct: risk.reduce(0) { $0 + $1.pct },
            score: after + pen,
            partial: dd.partial,
            reason: nil,
            alternatives: []
        )
    }

    static func suggestShot(
        ball: PlanXY,
        green: PlanXY,
        path: [PlanXY],
        clubs: [(code: String, dist: PlanClubDist)],
        wind: PlanWind?,
        hazards: [PlanHazardPoly],
        first: Bool
    ) -> PlanEvalShot? {
        let remain = dist(ball, green) / yardMeters
        let all: [PlanEvalShot] = clubs.compactMap { club in
            guard club.dist.yards > 0, first || !isDriver(club.code) else { return nil }
            var shot = evalShot(ball: ball, green: green, path: path, code: club.code, dist: club.dist, wind: wind, hazards: hazards, aimYd: nil)
            if shot.partial {
                shot.score += partialPenalty * max(0, club.dist.yards - Double(shot.fwd))
                return shot
            }
            if shot.fwd <= Int((remain + 15).rounded()) || isDriver(club.code) {
                return shot
            }
            let k = remain / Double(shot.fwd)
            var dd = club.dist
            dd.yards = club.dist.yards * k
            dd.partial = true
            if dd.kind == .oval, let mean = dd.mean, let cov = dd.cov {
                dd.mean = PlanDispersionMean(fwd: mean.fwd * k, lat: mean.lat * k)
                dd.cov = cov.map { $0.map { $0 * k * k } }
            } else {
                dd.kind = .point
                dd.carry = nil
            }
            var eval = evalShot(ball: ball, green: green, path: path, code: club.code, dist: dd, wind: wind, hazards: hazards, aimYd: nil)
            eval.partial = true
            eval.score += partialPenalty * max(0, Double(shot.fwd) - Double(eval.fwd))
            return eval
        }
        var cands = all.filter { $0.partial ? !isDriver($0.code) : Double($0.fwd) <= remain + 15 }
        let parts = cands.filter(\.partial)
        if parts.count > 1, let shortest = parts.min(by: { fullYards($0, clubs) < fullYards($1, clubs) }) {
            cands = cands.filter { !$0.partial || $0.code == shortest.code }
        }
        guard !cands.isEmpty else { return nil }
        let best = cands.sorted { $0.score != $1.score ? $0.score < $1.score : $0.fwd > $1.fwd }[0]
        let longer = cands.filter { $0.fwd > best.fwd + 3 && $0.riskPct > best.riskPct }.sorted { $0.fwd > $1.fwd }.first
        let shorter = cands.filter { $0.fwd < best.fwd - 3 && $0.riskPct > best.riskPct }.sorted { $0.fwd > $1.fwd }.first
        let type: String
        var text: String
        if let longer, let risk = longer.risk.first {
            type = "layup"
            text = "Con \(longer.code), \(risk.pct)% cae en \(kindES[risk.kind] ?? risk.kind): te quedás antes con \(best.code)."
        } else if let shorter, let risk = shorter.risk.first, let bestRisk = best.risk.first {
            type = "carry"
            text = "\(best.code) pasa \(kindES[bestRisk.kind] ?? kindES[risk.kind] ?? risk.kind) (con \(shorter.code) cae adentro)."
        } else if best.riskPct > 0, let risk = best.risk.first {
            type = "riesgo"
            text = "Ojo: \(risk.pct)% de la caída toca \(kindES[risk.kind] ?? risk.kind)."
        } else {
            type = "max"
            text = best.partial ? "Tiro a media distancia al green." : "Llegás lo más cerca posible sin obstáculos en la caída."
        }
        if best.aimYd != 0 {
            text += " Apuntá \(abs(best.aimYd)) yd a la \(best.aimYd < 0 ? "izquierda" : "derecha") por el viento cruzado."
        }
        var result = best
        result.reason = PlanSuggestReason(type: type, text: text)
        result.alternatives = cands.filter { $0.code != best.code }
            .sorted { $0.score < $1.score }
            .prefix(2)
            .map { PlanSuggestAlt(code: $0.code, fwd: $0.fwd, afterYd: $0.afterYd, riskPct: $0.riskPct) }
        return result
    }

    private static func fullYards(_ shot: PlanEvalShot, _ clubs: [(code: String, dist: PlanClubDist)]) -> Double {
        clubs.first { $0.code == shot.code }?.dist.yards ?? shot.dist.yards
    }

    static func clubName(_ code: String) -> String {
        ClubCode.label(for: code)
    }

    static func holeSchedule(teeTime: String, startHole: Int, minPerHole: Double, pars: [Int?]) -> [(hole: Int, order: Int, minutes: Double, eta: String)] {
        let n = max(pars.count, 18)
        let parts = teeTime.split(separator: ":")
        let t0 = (Int(parts.first ?? "0") ?? 0) * 60 + (Int(parts.dropFirst().first ?? "0") ?? 0)
        let order = (0..<n).map { (startHole - 1 + $0) % n + 1 }
        let weights = order.map { hole -> Double in
            switch pars[safe: hole - 1] ?? nil {
            case 3: return 0.8
            case 5: return 1.25
            default: return 1
            }
        }
        let sum = weights.reduce(0, +)
        let k = minPerHole * Double(n) / (sum == 0 ? 1 : sum)
        var acc = 0.0
        var rows: [(hole: Int, order: Int, minutes: Double, eta: String)] = []
        for (i, hole) in order.enumerated() {
            let minutes = round1(weights[i] * k)
            let etaMin = ((t0 + Int(acc.rounded())) % 1440 + 1440) % 1440
            rows.append((hole, i + 1, minutes, String(format: "%02d:%02d", etaMin / 60, etaMin % 60)))
            acc += weights[i] * k
        }
        return rows.sorted { $0.hole < $1.hole }
    }

    static func autoSelect(
        suggestion: PlanEvalShot?,
        clubs: [(code: String, dist: PlanClubDist, adjusted: Double)],
        remain: Double
    ) -> (code: String, aimYd: Int, suggested: Bool)? {
        if let suggestion, !suggestion.partial {
            return (suggestion.code, suggestion.aimYd, true)
        }
        let full = clubs.filter { !$0.dist.partial }.sorted { abs($0.adjusted - remain) < abs($1.adjusted - remain) }
        if let best = full.first {
            return (best.code, 0, false)
        }
        return nil
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
