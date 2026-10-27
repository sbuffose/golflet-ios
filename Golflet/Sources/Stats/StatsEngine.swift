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

    static func apply(_ rounds: [Round], filter: CourseFilter) -> [Round] {
        guard let name = filter.courseName else { return rounds }
        return rounds.filter { $0.course.caseInsensitiveCompare(name) == .orderedSame }
    }

    static func home(rounds: [Round], now: Date = Date()) -> HomeSnapshot {
        let sorted = rounds.sorted { $0.date > $1.date }
        let valid18 = eighteenHoleValid(rounds)
        let calendar = Calendar(identifier: .gregorian)
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
            yearBirdies: yearRounds.map(\.counts.birdies).reduce(0, +),
            lastRound: sorted.first
        )
    }

    static func summary(rounds: [Round], filter: CourseFilter) -> SummarySnapshot {
        let scoped = apply(rounds, filter: filter)
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

    static func course(named name: String, rounds: [Round], courses: [Course], tees: [TeeRating]) -> CourseSnapshot {
        let valid18 = eighteenHoleValid(rounds).filter { $0.course.caseInsensitiveCompare(name) == .orderedSame }
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

    static func hardestHoles(from stats: [CourseHoleStats], filter: CourseFilter, limit: Int = 4) -> [(CourseHoleStats, HoleStat)] {
        let scoped: [CourseHoleStats]
        if let name = filter.courseName {
            scoped = stats.filter { $0.course.caseInsensitiveCompare(name) == .orderedSame }
        } else {
            scoped = stats
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
}

extension Calendar {
    static let gregorian: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt
        return calendar
    }()
}
