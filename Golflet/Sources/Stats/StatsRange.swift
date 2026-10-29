import Foundation
import SwiftUI

enum StatsRange: String, CaseIterable, Hashable, Codable, Sendable, Identifiable {
    case month = "1m"
    case threeMonths = "3m"
    case sixMonths = "6m"
    case year = "12m"
    case all = "all"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .month: return "Este mes"
        case .threeMonths: return "3 meses"
        case .sixMonths: return "6 meses"
        case .year: return "Año"
        case .all: return "Histórico"
        }
    }

    var query: String { rawValue }

    var monthsBack: Int? {
        switch self {
        case .month: return 1
        case .threeMonths: return 3
        case .sixMonths: return 6
        case .year: return 12
        case .all: return nil
        }
    }

    func startDate(now: Date = Date(), calendar: Calendar = .gregorian) -> Date? {
        guard let months = monthsBack else { return nil }
        return calendar.date(byAdding: .month, value: -months, to: now)
    }

    static let defaultsKey = "golflet.statsRange"

    static func persisted(defaults: UserDefaults = .standard) -> StatsRange {
        guard let raw = defaults.string(forKey: defaultsKey) else { return .all }
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
