import Foundation

/// One scorecard that can count toward the handicap index.
struct IndexCardRef: Equatable, Identifiable, Sendable {
    var id: String
    var date: Date
    var course: String
    var differential: Double
}

/// A moment when the counting set changed because a card was added.
struct IndexRevision: Equatable, Identifiable, Sendable {
    var id: String
    var date: Date
    var counting: [IndexCardRef]
    var entered: [IndexCardRef]
    var dropped: [IndexCardRef]
}

/// The cards that make the current index, plus each time that set changed.
struct IndexComposition: Equatable, Sendable {
    var counting: [IndexCardRef]
    var windowCount: Int
    var revisions: [IndexRevision]
}

/// World Handicap System book built only from differentials the cards already have.
enum IndexBook {
    /// Stored differential, or the 18-hole formula when the card already has adjusted gross, rating and slope.
    /// Gross alone is not a differential.
    static func recordedDifferential(_ round: Round) -> Double? {
        guard round.isValid else { return nil }
        if let stored = round.differential { return stored }
        guard !round.isNineHoles,
              round.holesPlayed >= 18 || round.holes.count >= 18,
              let adjusted = round.adjustedGross,
              round.courseRating > 0,
              round.slope > 0
        else { return nil }
        return HandicapMath.differential(
            adjustedGross: Double(adjusted),
            courseRating: round.courseRating,
            slope: round.slope
        )
    }

    static func composition(from rounds: [Round]) -> IndexComposition {
        let cards = rounds.compactMap { round -> IndexCardRef? in
            guard let differential = recordedDifferential(round) else { return nil }
            return IndexCardRef(
                id: round.roundId,
                date: round.date,
                course: round.displayCourse,
                differential: differential
            )
        }.sorted { lhs, rhs in
            if lhs.date != rhs.date { return lhs.date < rhs.date }
            return lhs.id < rhs.id
        }

        var window: [IndexCardRef] = []
        var previous: [IndexCardRef] = []
        var revisions: [IndexRevision] = []

        for card in cards {
            window.append(card)
            if window.count > 20 {
                window.removeFirst()
            }
            let counting = best(of: window)
            let previousIDs = Set(previous.map(\.id))
            let countingIDs = Set(counting.map(\.id))
            let entered = counting.filter { !previousIDs.contains($0.id) }
            let dropped = previous.filter { !countingIDs.contains($0.id) }
            if !entered.isEmpty || !dropped.isEmpty {
                revisions.append(IndexRevision(
                    id: "\(card.id)@\(card.date.timeIntervalSince1970)",
                    date: card.date,
                    counting: counting,
                    entered: entered,
                    dropped: dropped
                ))
            }
            previous = counting
        }

        return IndexComposition(
            counting: best(of: window),
            windowCount: window.count,
            revisions: revisions
        )
    }

    /// Lowest differentials. A tie for the last place keeps the more recent card.
    static func best(of window: [IndexCardRef]) -> [IndexCardRef] {
        let rule = HandicapMath.usage(forCount: window.count)
        guard rule.count > 0 else { return [] }
        return Array(window.sorted { lhs, rhs in
            if lhs.differential != rhs.differential { return lhs.differential < rhs.differential }
            if lhs.date != rhs.date { return lhs.date > rhs.date }
            return lhs.id > rhs.id
        }.prefix(rule.count))
    }

    static func counting(asOf date: Date, revisions: [IndexRevision]) -> [IndexCardRef] {
        revisions.last { $0.date <= date }?.counting ?? []
    }

    static func movement(from earlier: [IndexCardRef], to later: [IndexCardRef]) -> (entered: [IndexCardRef], dropped: [IndexCardRef]) {
        let before = Set(earlier.map(\.id))
        let after = Set(later.map(\.id))
        return (
            later.filter { !before.contains($0.id) },
            earlier.filter { !after.contains($0.id) }
        )
    }
}
