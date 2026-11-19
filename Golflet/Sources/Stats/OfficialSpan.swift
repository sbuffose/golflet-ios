import Foundation

/// The handicap change Inicio already prints: last official index minus the first, with both dates.
enum OfficialSpan {
    static func impact(history: [HIPoint], rounds: [Round]) -> HcpImpact? {
        let dated = history.sorted { $0.date < $1.date }
        guard dated.count > 1, let first = dated.first, let last = dated.last else { return nil }
        let delta = ((last.handicap - first.handicap) * 10).rounded() / 10
        var movers: [HcpMover] = []
        var sawUnverified = false
        if dated.count > 1 {
            for index in 1..<dated.count {
                let earlier = dated[index - 1]
                let later = dated[index]
                guard abs(later.handicap - earlier.handicap) >= 0.05 else { continue }
                let shift = IndexBook.explain(rounds: rounds, from: earlier.date, to: later.date)
                if !shift.verified {
                    sawUnverified = true
                    continue
                }
                for card in shift.enteredBest8 {
                    let impact = ((card.differential - earlier.handicap) * 10).rounded() / 10
                    movers.append(HcpMover(
                        id: "\(card.id)-\(later.date.timeIntervalSince1970)",
                        roundId: card.id,
                        date: card.date,
                        course: card.course,
                        differential: card.differential,
                        impact: impact
                    ))
                }
            }
        }
        movers.sort { abs($0.impact) > abs($1.impact) }
        if movers.count > 5 { movers = Array(movers.prefix(5)) }
        return HcpImpact(
            delta: delta,
            start: first.handicap,
            now: last.handicap,
            estimated: false,
            counting: [],
            dropped: [],
            startDate: first.date,
            nowDate: last.date,
            series: dated,
            movers: movers,
            unidentified: movers.isEmpty && sawUnverified
        )
    }
}

enum ShotEditCopy {
    /// What deleting this shot does to the hole. Excluding it from distances never changes the score.
    static func deleteLine(shotsOnHole: Int?, postedStrokes: Int?) -> String {
        guard let shotsOnHole, shotsOnHole > 0 else {
            return "El golpe sale de la ronda. Las distancias de este palo se recalculan."
        }
        let next = shotsOnHole - 1
        if let postedStrokes {
            return "La tarjeta del club sigue en \(postedStrokes). Los golpes marcados pasan de \(shotsOnHole) a \(next), así que dejan de coincidir con ese score. Las distancias de este palo se recalculan."
        }
        return "El hoyo pasa de \(shotsOnHole) a \(next) golpes. Las distancias de este palo se recalculan."
    }

    static let excludeLine = "El golpe sigue en el hoyo y en el score. Deja de contar en las distancias de este palo."
    static let changesScore = "El score del hoyo cambia."
}
