import Foundation
import SwiftUI

enum StatsRange: String, CaseIterable, Hashable, Codable, Sendable, Identifiable {
    case threeMonths = "3m"
    case sixMonths = "6m"
    case twelveMonths = "12m"
    case calendarYear = "year"
    case all = "all"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .threeMonths: return "3 meses"
        case .sixMonths: return "6 meses"
        case .twelveMonths: return "12 meses"
        case .calendarYear: return "Este año"
        case .all: return "Histórico"
        }
    }

    /// The row shows the full name. It has to fit at 375 without scrolling.
    var compactTitle: String { title }

    var query: String { rawValue }

    func startDate(now: Date = Date(), calendar: Calendar = .gregorian) -> Date? {
        switch self {
        case .threeMonths: return calendar.date(byAdding: .month, value: -3, to: now)
        case .sixMonths: return calendar.date(byAdding: .month, value: -6, to: now)
        case .twelveMonths: return calendar.date(byAdding: .month, value: -12, to: now)
        case .calendarYear:
            var cal = calendar
            cal.timeZone = TimeZone(secondsFromGMT: -3 * 3600) ?? .gmt
            let year = cal.component(.year, from: now)
            return cal.date(from: DateComponents(year: year, month: 1, day: 1))
        case .all:
            return nil
        }
    }

    static let defaultsKey = "golflet.statsRange"

    static func persisted(defaults: UserDefaults = .standard) -> StatsRange {
        guard let raw = defaults.string(forKey: defaultsKey) else { return .all }
        if raw == "1m" { return .threeMonths }
        return StatsRange(rawValue: raw) ?? .all
    }

    func persist(defaults: UserDefaults = .standard) {
        defaults.set(rawValue, forKey: Self.defaultsKey)
    }
}

struct MetricPoint: Hashable, Identifiable, Sendable {
    var id: String { "\(date.timeIntervalSince1970)-\(value)-\(course)" }
    var date: Date
    var value: Double
    var course: String
}

struct MetricChartQuery: Hashable, Sendable {
    var title: String
    var kind: MetricChartKind
    var courseName: String?
    var range: StatsRange
}

enum MetricChartKind: Hashable, Sendable {
    case gross
    case net
    case differential
    case scoreKind(ScoreKind)
    case hole(Int)
    case handicap

    var apiMetric: String? {
        switch self {
        case .gross: return "gross"
        case .net: return "net"
        case .differential: return "average"
        case .scoreKind(.eagle): return "eagles"
        case .scoreKind(.birdie): return "birdies"
        case .scoreKind(.par): return "pars"
        case .scoreKind(.bogey): return "bogeys"
        case .handicap: return "handicap"
        case .hole: return nil
        }
    }

    var usesMonthly: Bool {
        if case .scoreKind = self { return true }
        return false
    }
}
