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

/// One row of a handicap revision: which scorecard moved, and why.
struct HIShiftGroup: Equatable, Identifiable, Sendable {
    var id: String { title }
    var title: String
    var cards: [IndexCardRef]
}

/// Scorecard evidence for an official index revision. A course name alone is not a card.
enum HIChangeLabel {
    static let unidentified = "No puedo identificar la tarjeta."

    static func groups(_ shift: IndexShift) -> [HIShiftGroup] {
        guard shift.verified else { return [] }
        return [
            HIShiftGroup(title: "Entró en las 8", cards: shift.enteredBest8),
            HIShiftGroup(title: "Salió de las 8", cards: shift.leftBest8),
            HIShiftGroup(title: "Salió de las últimas 20", cards: shift.agedOut),
            HIShiftGroup(title: "Entró en las últimas 20", cards: shift.enteredWindow)
        ].filter { !$0.cards.isEmpty }
    }

    /// The Handicap Index move. This number is not the scorecard differential.
    static func indexLine(delta: Double) -> String {
        if delta > 0.049 { return "El índice subió \(FormatAR.one(delta))" }
        if delta < -0.049 { return "El índice bajó \(FormatAR.one(abs(delta)))" }
        return "El índice no se movió"
    }

    /// One scorecard. "diferencial" is the card's differential, never the index.
    static func cardText(_ card: IndexCardRef) -> String {
        var bits = [FormatAR.syncDay(card.date)]
        let course = card.course.trimmingCharacters(in: .whitespacesAndNewlines)
        if !course.isEmpty { bits.append(course) }
        bits.append("diferencial \(FormatAR.one(card.differential))")
        if let gross = card.gross { bits.append("gross \(gross)") }
        return bits.joined(separator: " · ")
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
