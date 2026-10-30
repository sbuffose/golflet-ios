import Foundation

enum PlanPlay {
    static func adjInput(
        from: PlanXY,
        to: PlanXY,
        dist dd: PlanClubDist?,
        yards: Double,
        hole: PlanHoleRow,
        firm: PlanFirmness,
        locked: Bool
    ) -> PlanAdjInput {
        if locked { return PlanAdjInput(headMph: nil, kmh: nil, tempC: nil, precipMm: nil, riseM: nil, rollYd: nil, firm: .normal) }
        let comp = hole.wind.map { PlanCore.windComp(bearing: PlanCore.bearingXY(from, to), wind: $0) }
        let roll: Double?
        if let dd, dd.kind == .point, let carry = dd.carry, dd.yards > carry {
            roll = (dd.yards - carry) * (yards / dd.yards)
        } else {
            roll = nil
        }
        return PlanAdjInput(
            headMph: comp?.headMph,
            kmh: hole.wind?.kmh,
            tempC: hole.wxTempC,
            precipMm: hole.wxPrecipMm,
            riseM: nil,
            rollYd: roll,
            firm: firm
        )
    }

    static func liveNumbers(
        from: PlanXY,
        landing: PlanXY,
        green: PlanXY,
        entrance: PlanXY?,
        club: String,
        adjust: PlanShotAdjust?,
        dist dd: PlanClubDist?,
        hole: PlanHoleRow,
        firm: PlanFirmness,
        locked: Bool
    ) -> PlanLiveNumbers {
        let shotYd = PlanCore.dist(from, landing) / PlanCore.yardMeters
        let remain = PlanCore.dist(landing, green) / PlanCore.yardMeters
        let remainR = Int(remain.rounded())
        let entranceYd = entrance.map { Int((PlanCore.dist(landing, $0) / PlanCore.yardMeters).rounded()) }
        let shownEntrance = entranceYd.flatMap { $0 < remainR && remainR > 3 ? $0 : nil }
        let computed: PlanShotAdjust
        if let adjust, !adjust.partial {
            computed = adjust
        } else if dd?.partial == true {
            computed = .partial(total: Int(shotYd.rounded()), normal: dd.map { Int($0.yards.rounded()) })
        } else {
            let inn = adjInput(from: from, to: landing, dist: dd, yards: shotYd, hole: hole, firm: firm, locked: locked)
            computed = PlanCore.shotReverse(reached: shotYd, input: inn)
        }
        let inn2 = remainR > 3 ? adjInput(from: landing, to: green, dist: nil, yards: remain, hole: hole, firm: firm, locked: locked) : nil
        let terms2 = inn2.map { PlanCore.adjTerms(yd: Double(remainR), input: $0) } ?? []
        let play = remainR - terms2.reduce(0) { $0 + $1.yards }
        let plays = inn2 != nil && abs(play - remainR) >= 2 ? play : nil
        return PlanLiveNumbers(
            shotYards: computed.total,
            remainYards: remainR,
            entranceYards: shownEntrance,
            playsLikeRemain: plays,
            adjust: computed,
            input: adjInput(from: from, to: landing, dist: dd, yards: shotYd, hole: hole, firm: firm, locked: locked),
            club: club
        )
    }

    static func termLabel(_ key: String) -> String {
        switch key {
        case "viento": return "Viento"
        case "temp": return "Temperatura"
        case "lluvia": return "Lluvia"
        case "altura": return "Altura"
        case "cancha": return "Cancha (rodado)"
        default: return key
        }
    }

    static func signed(_ yards: Int) -> String {
        yards < 0 ? "−\(abs(yards)) yd" : "+\(yards) yd"
    }
}
