import Foundation

/// One scorecard that can count toward the handicap index.
struct IndexCardRef: Equatable, Identifiable, Sendable {
    var id: String
    var date: Date
    var course: String
    var differential: Double
    var gross: Int? = nil
}

/// A moment when the counting set changed because a card was added.
struct IndexRevision: Equatable, Identifiable, Sendable {
    var id: String
    var date: Date
    var counting: [IndexCardRef]
    var entered: [IndexCardRef]
    var dropped: [IndexCardRef]
    /// Counting cards that left because a better one inside the same 20 took the place.
    var leftBest8: [IndexCardRef] = []
    /// Counting cards that fell out of the last 20.
    var agedOut: [IndexCardRef] = []
    /// The new card joined the last 20 and did not enter the counting set.
    var joinedWindow: [IndexCardRef] = []
}

/// What changed in the index book between two dates. Empty groups mean that move did not happen.
struct IndexShift: Equatable, Sendable {
    var verified: Bool
    var enteredBest8: [IndexCardRef]
    var leftBest8: [IndexCardRef]
    var agedOut: [IndexCardRef]
    var enteredWindow: [IndexCardRef]

    var isEmpty: Bool {
        enteredBest8.isEmpty && leftBest8.isEmpty && agedOut.isEmpty && enteredWindow.isEmpty
    }
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

    /// Course printed on the card. The registration club is not a course.
    static func scorecardCourse(_ round: Round) -> String {
        if let label = round.courseLabel, !label.isEmpty { return label }
        if !round.course.isEmpty { return round.course }
        return ""
    }

    static func scorecards(from rounds: [Round]) -> [IndexCardRef] {
        rounds.compactMap { round -> IndexCardRef? in
            guard let differential = recordedDifferential(round) else { return nil }
            return IndexCardRef(
                id: round.roundId,
                date: round.date,
                course: scorecardCourse(round),
                differential: differential,
                gross: round.gross
            )
        }.sorted { lhs, rhs in
            if lhs.date != rhs.date { return lhs.date < rhs.date }
            return lhs.id < rhs.id
        }
    }

    static func composition(from rounds: [Round]) -> IndexComposition {
        let cards = scorecards(from: rounds)

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
            let windowIDs = Set(window.map(\.id))
            if !entered.isEmpty || !dropped.isEmpty {
                revisions.append(IndexRevision(
                    id: "\(card.id)@\(card.date.timeIntervalSince1970)",
                    date: card.date,
                    counting: counting,
                    entered: entered,
                    dropped: dropped,
                    leftBest8: dropped.filter { windowIDs.contains($0.id) },
                    agedOut: dropped.filter { !windowIDs.contains($0.id) },
                    joinedWindow: countingIDs.contains(card.id) ? [] : [card]
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

    /// Best 8 of each date's last 20. Fewer than 20 cards on either side is unverified: no guessed card.
    static func explain(rounds: [Round], from earlier: Date, to later: Date) -> IndexShift {
        let cards = scorecards(from: rounds)
        let prev = Array(cards.filter { $0.date <= earlier }.suffix(20))
        let cur = Array(cards.filter { $0.date <= later }.suffix(20))
        guard prev.count >= 20, cur.count >= 20 else {
            return IndexShift(verified: false, enteredBest8: [], leftBest8: [], agedOut: [], enteredWindow: [])
        }
        let prevBest = best(of: prev)
        let curBest = best(of: cur)
        let prevBestIDs = Set(prevBest.map(\.id))
        let curBestIDs = Set(curBest.map(\.id))
        let prevWindowIDs = Set(prev.map(\.id))
        let curWindowIDs = Set(cur.map(\.id))
        return IndexShift(
            verified: true,
            enteredBest8: curBest.filter { !prevBestIDs.contains($0.id) },
            leftBest8: prevBest.filter { curWindowIDs.contains($0.id) && !curBestIDs.contains($0.id) },
            agedOut: prevBest.filter { !curWindowIDs.contains($0.id) },
            enteredWindow: cur.filter { !prevWindowIDs.contains($0.id) && !curBestIDs.contains($0.id) }
        )
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
