import Foundation

struct HomeSnapshot: Equatable, Sendable {
    var handicapIndex: Double
    var trendValues: [Double]
    var trendDelta: Double
    var trendSinceLabel: String
    var cards: Int
    var bestGross: Int?
    var yearAverage: Double?
    var yearRoundCount: Int
    var yearBestGross: Int?
    var yearBirdies: Int
    var lastRound: Round?
}

struct SummarySnapshot: Equatable, Sendable {
    var firstYear: Int
    var lastYear: Int
    var best: Round?
    var worstSince2021: Round?
    var averageGross: Double?
    var averageToPar: Double?
    var validRoundCount: Int
    var since2025Average: Double?
    var since2025Count: Int
    var since2025BestDifferential: Double?
    var trend: [TrendPoint]
}

struct TrendPoint: Equatable, Sendable {
    var date: Date
    var handicap: Double
    var course: String
}

struct CourseSnapshot: Equatable, Sendable {
    var course: String
    var par: Int
    var averageGross: Double?
    var validCount: Int
    var bestGross: Int?
    var averageNet: Double?
    var since2025Average: Double?
    var tees: [TeeRating]
}

enum StatsEngine {
    static func eighteenHoleValid(_ rounds: [Round]) -> [Round] {
        rounds
            .filter { $0.isValid && !$0.isNineHoles && $0.gross != nil }
            .sorted { $0.date > $1.date }
    }

    static func apply(_ rounds: [Round], filter: CourseFilter, groupedNames: [String] = []) -> [Round] {
        rounds.filter { filter.matches($0, groupedNames: groupedNames) }
    }

    static func groupedCourseNames(from filters: [CourseFilter]) -> [String] {
        filters.filter { $0.kind == .group }.flatMap(\.courseNames)
    }

    static func home(rounds: [Round], now: Date = Date()) -> HomeSnapshot {
        let sorted = rounds.sorted { $0.date > $1.date }
        let valid18 = eighteenHoleValid(rounds)
        let calendar = Calendar.gregorian
        let year = calendar.component(.year, from: now)
        let yearRounds = valid18.filter { calendar.component(.year, from: $0.date) == year }

        let latestHI = sorted.first?.handicapIndex ?? 0
        let history = handicapSeries(rounds)
        let april = calendar.date(from: DateComponents(year: year, month: 4, day: 1))
        let aprilHI = history.first(where: {
            calendar.component(.year, from: $0.date) == year && calendar.component(.month, from: $0.date) == 4
        })?.handicap
            ?? history.last(where: { $0.date < (april ?? now) })?.handicap
        let delta: Double
        let since: String
        if let aprilHI {
            delta = latestHI - aprilHI
            since = "desde abril \(year)"
        } else if let first = history.first {
            delta = latestHI - first.handicap
            since = "desde \(FormatAR.monthYear(first.date))"
        } else {
            delta = 0
            since = ""
        }

        return HomeSnapshot(
            handicapIndex: latestHI,
            trendValues: history.suffix(40).map(\.handicap),
            trendDelta: delta,
            trendSinceLabel: since,
            cards: rounds.count,
            bestGross: valid18.compactMap(\.gross).min(),
            yearAverage: average(yearRounds.compactMap(\.gross)),
            yearRoundCount: yearRounds.count,
            yearBestGross: yearRounds.compactMap(\.gross).min(),
            yearBirdies: yearRounds.reduce(0) { $0 + count(.birdie, in: $1).count },
            lastRound: sorted.first
        )
    }

    static func ranged(_ rounds: [Round], range: StatsRange, now: Date = Date()) -> [Round] {
        guard let start = range.startDate(now: now) else { return rounds }
        return rounds.filter { $0.date >= start && $0.date <= now }
    }

    static func hasCompleteHoleData(_ rounds: [Round]) -> Bool {
        let valid = eighteenHoleValid(rounds)
        guard !valid.isEmpty else { return true }
        let detailed = valid.filter { $0.holes.count >= 9 }
        return detailed.count * 4 >= valid.count * 3
    }

    static func summary(rounds: [Round], filter: CourseFilter, range: StatsRange = .all, groupedNames: [String] = [], now: Date = Date()) -> SummarySnapshot {
        let scoped = apply(ranged(rounds, range: range, now: now), filter: filter, groupedNames: groupedNames)
        let valid18 = eighteenHoleValid(scoped)
        let years = valid18.map { Calendar.gregorian.component(.year, from: $0.date) }
        let start2025 = Calendar.gregorian.date(from: DateComponents(year: 2025, month: 1, day: 1)) ?? Date.distantPast
        let from2025 = valid18.filter { $0.date >= start2025 }
        let start2021 = Calendar.gregorian.date(from: DateComponents(year: 2021, month: 1, day: 1)) ?? Date.distantPast
        let from2021 = valid18.filter { $0.date >= start2021 }

        let best = valid18.min { lhs, rhs in
            (lhs.gross ?? 999, lhs.net ?? 999) < (rhs.gross ?? 999, rhs.net ?? 999)
        }
        let worst = from2021.max { lhs, rhs in
            (lhs.gross ?? 0, lhs.net ?? 0) < (rhs.gross ?? 0, rhs.net ?? 0)
        }

        let toPars: [Double] = valid18.compactMap { round in
            guard let gross = round.gross else { return nil }
            let par = round.holes.reduce(0) { $0 + $1.par }
            guard par > 0 else { return nil }
            return Double(gross - par)
        }

        return SummarySnapshot(
            firstYear: years.min() ?? 2013,
            lastYear: years.max() ?? Calendar.gregorian.component(.year, from: Date()),
            best: best,
            worstSince2021: worst,
            averageGross: average(valid18.compactMap(\.gross)),
            averageToPar: average(toPars),
            validRoundCount: valid18.count,
            since2025Average: average(from2025.compactMap(\.gross)),
            since2025Count: from2025.count,
            since2025BestDifferential: from2025.compactMap(\.differential).min(),
            trend: handicapSeries(scoped)
        )
    }

    static func course(named name: String, rounds: [Round], courses: [Course], tees: [TeeRating], range: StatsRange = .all, now: Date = Date()) -> CourseSnapshot {
        let valid18 = eighteenHoleValid(ranged(rounds, range: range, now: now)).filter {
            !$0.isOtherCourse && $0.course.caseInsensitiveCompare(name) == .orderedSame
        }
        let start2025 = Calendar.gregorian.date(from: DateComponents(year: 2025, month: 1, day: 1)) ?? Date.distantPast
        let from2025 = valid18.filter { $0.date >= start2025 }
        let par = courses.first(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame })?.par ?? 72
        return CourseSnapshot(
            course: name,
            par: par,
            averageGross: average(valid18.compactMap(\.gross)),
            validCount: valid18.count,
            bestGross: valid18.compactMap(\.gross).min(),
            averageNet: average(valid18.compactMap(\.net).map(Double.init)),
            since2025Average: average(from2025.compactMap(\.gross)),
            tees: tees.filter { $0.course.caseInsensitiveCompare(name) == .orderedSame }
        )
    }

    static func hardestHoles(from stats: [CourseHoleStats], filter: CourseFilter, groupedNames: [String] = [], limit: Int = 4) -> [(CourseHoleStats, HoleStat)] {
        let scoped: [CourseHoleStats]
        switch filter.kind {
        case .all:
            scoped = stats.filter { !$0.course.hasPrefix("x:") }
        case .group:
            scoped = stats.filter { stat in
                filter.courseNames.contains { stat.course.caseInsensitiveCompare($0) == .orderedSame }
            }
        case .other:
            scoped = stats.filter { stat in
                !groupedNames.contains { stat.course.caseInsensitiveCompare($0) == .orderedSame }
            }
        }
        var pairs: [(CourseHoleStats, HoleStat)] = []
        for course in scoped {
            for hole in course.holes {
                pairs.append((course, hole))
            }
        }
        return pairs.sorted { $0.1.averageToPar > $1.1.averageToPar }.prefix(limit).map { $0 }
    }

    static func handicapSeries(_ rounds: [Round]) -> [TrendPoint] {
        let ordered = rounds.sorted { $0.date < $1.date }
        var points: [TrendPoint] = []
        var last: Double?
        for round in ordered {
            if last != round.handicapIndex {
                points.append(TrendPoint(date: round.date, handicap: round.handicapIndex, course: round.course))
                last = round.handicapIndex
            }
        }
        return points
    }

    static func average(_ values: [Int]) -> Double? {
        guard !values.isEmpty else { return nil }
        return Double(values.reduce(0, +)) / Double(values.count)
    }

    static func average(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        return values.reduce(0, +) / Double(values.count)
    }

    static func filter(
        _ rounds: [Round],
        query: RoundListQuery,
        period: MetricPeriod,
        course: MetricCourseBucket,
        now: Date = Date()
    ) -> [Round] {
        let year = Calendar.gregorian.component(.year, from: now)
        return rounds.filter { round in
            if let club = query.clubCode, round.clubCode != club { return false }
            if let name = query.courseName {
                let named = round.course.caseInsensitiveCompare(name) == .orderedSame
                    || round.displayCourse.caseInsensitiveCompare(name) == .orderedSame
                if !named { return false }
            }
            if query.valid18Only, !(round.isValid && !round.isNineHoles && round.gross != nil) {
                return false
            }
            if let since = query.sinceYear,
               Calendar.gregorian.component(.year, from: round.date) < since {
                return false
            }
            if period == .year, Calendar.gregorian.component(.year, from: round.date) != year {
                return false
            }
            if !course.matches(round) { return false }
            return true
        }
    }

    static func sorted(
        _ rounds: [Round],
        field: MetricSortField,
        order: MetricSortOrder
    ) -> [Round] {
        rounds.sorted { lhs, rhs in
            switch field {
            case .date:
                return order == .bestFirst ? lhs.date > rhs.date : lhs.date < rhs.date
            case .gross:
                let left = lhs.gross ?? (order == .bestFirst ? 9999 : -9999)
                let right = rhs.gross ?? (order == .bestFirst ? 9999 : -9999)
                if left != right {
                    return order == .bestFirst ? left < right : left > right
                }
                return lhs.date > rhs.date
            case .net:
                let left = lhs.net ?? (order == .bestFirst ? 9999 : -9999)
                let right = rhs.net ?? (order == .bestFirst ? 9999 : -9999)
                if left != right {
                    return order == .bestFirst ? left < right : left > right
                }
                return lhs.date > rhs.date
            }
        }
    }

    static func holes(_ kind: ScoreKind, in round: Round) -> [HoleScore] {
        round.holes.filter { $0.result == kind.holeResult }
    }

    static func count(_ kind: ScoreKind, in round: Round) -> (count: Int, fromHoles: Bool) {
        if !round.holes.isEmpty {
            return (holes(kind, in: round).count, true)
        }
        switch kind {
        case .eagle:
            return (round.counts.eagles, false)
        case .birdie:
            return (round.counts.birdies, false)
        case .par:
            return (round.counts.pars, false)
        case .bogey:
            return (round.counts.bogeys, false)
        }
    }

    static func scoreKind(
        _ kind: ScoreKind,
        rounds: [Round],
        query: RoundListQuery,
        period: MetricPeriod,
        course: MetricCourseBucket,
        now: Date = Date()
    ) -> ScoreKindSnapshot {
        let scoped = filter(rounds, query: query, period: period, course: course, now: now)
        var items: [ScoreKindRound] = []
        var tallyMap: [String: HoleTally] = [:]
        var missing = 0
        var total = 0
        for round in scoped {
            let scored = count(kind, in: round)
            if scored.count == 0 { continue }
            total += scored.count
            let holeList = holes(kind, in: round)
            if !scored.fromHoles { missing += 1 }
            items.append(ScoreKindRound(round: round, count: scored.count, holes: holeList, usedHoleDetail: scored.fromHoles))
            for hole in holeList {
                let key = "\(round.displayCourse)-\(hole.number)"
                var entry = tallyMap[key] ?? HoleTally(course: round.displayCourse, hole: hole.number, count: 0)
                entry.count += 1
                tallyMap[key] = entry
            }
        }
        let tally = tallyMap.values.sorted { lhs, rhs in
            if lhs.count != rhs.count { return lhs.count > rhs.count }
            if lhs.course != rhs.course { return lhs.course < rhs.course }
            return lhs.hole < rhs.hole
        }
        let orderedRounds = items.sorted { lhs, rhs in
            if lhs.count != rhs.count { return lhs.count > rhs.count }
            return lhs.round.date > rhs.round.date
        }
        return ScoreKindSnapshot(total: total, rounds: orderedRounds, tally: tally, roundsMissingHoles: missing)
    }

    static func scoreTotals(_ rounds: [Round]) -> [ScoreKind: Int] {
        var totals: [ScoreKind: Int] = [:]
        for kind in ScoreKind.allCases {
            totals[kind] = rounds.reduce(0) { $0 + count(kind, in: $1).count }
        }
        return totals
    }

    static func holesPlayed(in round: Round) -> Int {
        if !round.holes.isEmpty { return round.holes.count }
        if round.holesPlayed > 0 { return round.holesPlayed }
        return round.isNineHoles ? 9 : 18
    }

    static func holeShare(_ kind: ScoreKind, in rounds: [Round]) -> Double {
        let holes = rounds.reduce(0) { $0 + holesPlayed(in: $1) }
        guard holes > 0 else { return 0 }
        let scored = rounds.reduce(0) { $0 + count(kind, in: $1).count }
        return Double(scored) / Double(holes)
    }

    static func recentGross(_ rounds: [Round], limit: Int = 18) -> [Double] {
        Array(
            eighteenHoleValid(rounds)
                .sorted { $0.date < $1.date }
                .compactMap { $0.gross.map(Double.init) }
                .suffix(limit)
        )
    }

    static func holeAverages(rounds: [Round], course: String) -> [HoleStat] {
        let scoped = eighteenHoleValid(rounds).filter {
            !$0.isOtherCourse && $0.course.caseInsensitiveCompare(course) == .orderedSame && !$0.holes.isEmpty
        }
        var buckets: [Int: HoleBucket] = [:]
        for round in scoped {
            for hole in round.holes {
                guard let strokes = hole.strokes else { continue }
                var bucket = buckets[hole.number] ?? HoleBucket(par: hole.par, handicap: hole.handicap)
                bucket.add(strokes: strokes, toPar: hole.toPar ?? (strokes - hole.par), result: hole.result)
                buckets[hole.number] = bucket
            }
        }
        return buckets.keys.sorted().map { number in
            buckets[number]!.stat(number: number)
        }
    }

    static func perRound(
        _ rounds: [Round],
        filter: CourseFilter = .all,
        range: StatsRange = .all,
        groupedNames: [String] = [],
        now: Date = Date()
    ) -> PerRoundStats {
        let scoped = apply(eighteenHoleValid(ranged(rounds, range: range, now: now)), filter: filter, groupedNames: groupedNames)
        func series(_ pick: (Round) -> Int) -> PerRoundAverage {
            let values = scoped.map { Double(pick($0)) }
            return PerRoundAverage(mean: average(values), median: median(values), rounds: values.count)
        }
        return PerRoundStats(
            eagles: series { count(.eagle, in: $0).count },
            birdies: series { count(.birdie, in: $0).count },
            pars: series { count(.par, in: $0).count },
            bogeys: series { count(.bogey, in: $0).count },
            doubles: series { $0.counts.doubles + $0.counts.triples + $0.counts.worse }
        )
    }

    static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let mid = sorted.count / 2
        if sorted.count.isMultiple(of: 2) {
            return (sorted[mid - 1] + sorted[mid]) / 2
        }
        return sorted[mid]
    }

    static func hardestFromRounds(_ rounds: [Round], filter: CourseFilter, groupedNames: [String] = [], limit: Int = 4) -> [(String, HoleStat)] {
        let scoped = apply(rounds, filter: filter, groupedNames: groupedNames)
        let names = Set(scoped.map(\.course).filter { !$0.hasPrefix("x:") })
        var pairs: [(String, HoleStat)] = []
        for name in names {
            for hole in holeAverages(rounds: scoped, course: name) {
                pairs.append((name, hole))
            }
        }
        return pairs.sorted { $0.1.averageToPar > $1.1.averageToPar }.prefix(limit).map { $0 }
    }

    static func series(from rounds: [Round], kind: MetricChartKind, courseName: String?) -> [MetricPoint] {
        let valid = eighteenHoleValid(rounds)
            .filter { courseName == nil || $0.course.caseInsensitiveCompare(courseName!) == .orderedSame }
            .sorted { $0.date < $1.date }
        switch kind {
        case .gross:
            return valid.compactMap { round in
                round.gross.map { MetricPoint(date: round.date, value: Double($0), course: round.course) }
            }
        case .net:
            return valid.compactMap { round in
                round.net.map { MetricPoint(date: round.date, value: Double($0), course: round.course) }
            }
        case .differential:
            return valid.compactMap { round in
                round.differential.map { MetricPoint(date: round.date, value: $0, course: round.course) }
            }
        case .scoreKind(let score):
            return valid.map { round in
                MetricPoint(date: round.date, value: Double(count(score, in: round).count), course: round.course)
            }
        case .hole(let number):
            return valid.compactMap { round in
                guard let hole = round.holes.first(where: { $0.number == number }), let strokes = hole.strokes else {
                    return nil
                }
                return MetricPoint(date: round.date, value: Double(strokes), course: round.course)
            }
        case .handicap:
            return handicapSeries(valid).map { MetricPoint(date: $0.date, value: $0.handicap, course: $0.course) }
        }
    }

    static func rollingAverage(_ points: [MetricPoint], window: Int = 5) -> [MetricPoint] {
        guard window > 1, points.count > 1 else { return [] }
        return points.enumerated().map { index, point in
            let start = max(0, index - window + 1)
            let slice = points[start...index]
            let mean = slice.map(\.value).reduce(0, +) / Double(slice.count)
            return MetricPoint(date: point.date, value: mean, course: point.course)
        }
    }
}

private struct HoleBucket {
    var par: Int
    var handicap: Int
    var sum = 0.0
    var toPar = 0.0
    var samples = 0
    var best = 99
    var worst = 0
    var distribution = HoleDistribution(
        eagleOrBetter: 0,
        birdie: 0,
        par: 0,
        bogey: 0,
        double: 0,
        triplePlus: 0
    )

    mutating func add(strokes: Int, toPar value: Int, result: HoleResult) {
        sum += Double(strokes)
        toPar += Double(value)
        samples += 1
        best = min(best, strokes)
        worst = max(worst, strokes)
        switch result {
        case .eagleOrBetter: distribution.eagleOrBetter += 1
        case .birdie: distribution.birdie += 1
        case .par: distribution.par += 1
        case .bogey: distribution.bogey += 1
        case .doubleOrWorse: distribution.double += 1
        case .unknown: break
        }
    }

    func stat(number: Int) -> HoleStat {
        HoleStat(
            number: number,
            par: par,
            handicap: handicap,
            samples: samples,
            average: samples == 0 ? 0 : sum / Double(samples),
            averageToPar: samples == 0 ? 0 : toPar / Double(samples),
            averageLast16: nil,
            best: best == 99 ? nil : best,
            worst: worst == 0 ? nil : worst,
            distribution: distribution,
            comparisons: []
        )
    }
}

extension Calendar {
    static let gregorian: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar
    }()
}
