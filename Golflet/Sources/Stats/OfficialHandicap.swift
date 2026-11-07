import Foundation

/// The index the player should see is the newest dated official point.
/// A later revision (3,7 el 4 nov) wins over the HI printed on an older card (3,1).
enum OfficialHandicap {
    static func latest(player: Double?, history: [HIPoint]) -> Double? {
        let dated = history.enumerated().max { lhs, rhs in
            if lhs.element.date != rhs.element.date { return lhs.element.date < rhs.element.date }
            return lhs.offset < rhs.offset
        }
        if let dated { return dated.element.handicap }
        return player
    }
}

/// What changed inside the best-8, using only scorecards that are actually linked.
/// The registration club is never a stand-in.
enum HIChangeLabel {
    static func line(entered: [String], exited: [String]) -> String? {
        let inn = entered.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        let out = exited.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        var bits: [String] = []
        if !inn.isEmpty { bits.append("Entró \(inn.joined(separator: ", "))") }
        if !out.isEmpty { bits.append("Salió \(out.joined(separator: ", "))") }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    static func line(entered: [IndexCardRef], exited: [IndexCardRef]) -> String? {
        line(
            entered: entered.map(\.course),
            exited: exited.map(\.course)
        )
    }
}

/// Six months on screen. Older months stay in the scroll. Labels stay short.
enum MonthWindow {
    static let visible = 6
    static let short = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
    static let full = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]

    struct Column: Equatable, Identifiable, Sendable {
        var id: String
        var year: Int
        var month: Int
        var birdies: Int
        var pars: Int
        var shortLabel: String
        var showsYear: Bool

        var fullLabel: String {
            "\(Self.fullName(month)) \(year)"
        }

        var detail: String {
            let birdie = birdies == 1 ? "1 birdie" : "\(birdies) birdies"
            let par = pars == 1 ? "1 par" : "\(pars) pares"
            return "\(fullLabel) · \(birdie) · \(par)"
        }

        private static func fullName(_ month: Int) -> String {
            guard month >= 1, month <= 12 else { return "" }
            return MonthWindow.full[month - 1]
        }
    }

    static func columns(from bars: [MonthlyScoreBar], calendar: Calendar = .gregorian) -> [Column] {
        let ordered = bars.sorted { $0.date < $1.date }
        return ordered.enumerated().map { index, bar in
            let parts = calendar.dateComponents([.year, .month], from: bar.date)
            let month = parts.month ?? 1
            let year = parts.year ?? 0
            let previousYear = index > 0 ? calendar.component(.year, from: ordered[index - 1].date) : nil
            let shortLabel = (month >= 1 && month <= 12) ? short[month - 1] : ""
            return Column(
                id: String(format: "%04d-%02d", year, month),
                year: year,
                month: month,
                birdies: bar.birdies,
                pars: bar.pars,
                shortLabel: shortLabel,
                showsYear: previousYear == nil || previousYear != year
            )
        }
    }
}
