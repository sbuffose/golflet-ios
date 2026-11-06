import Foundation
#if canImport(UIKit)
import UIKit
#endif

struct HandbookFile: Identifiable, Equatable {
    var id: String { url.path }
    var url: URL
    var title: String
    var preview: String = ""
}

enum CourseHandbook {
    struct Block: Equatable, Sendable {
        var heading: String
        var lines: [String]
    }

    struct Document: Equatable, Sendable {
        var filename: String
        var title: String
        var includesWind: Bool
        var blocks: [Block]

        var plainText: String {
            ([title] + blocks.flatMap { [$0.heading] + $0.lines }).joined(separator: "\n")
        }
    }

    static func make(
        courseName: String,
        strategy: CourseStrategy?,
        booking: TeeTime?,
        includeWind: Bool,
        level: StrategyLevel
    ) -> Document {
        let course = courseName.trimmingCharacters(in: .whitespacesAndNewlines)
        let shownCourse = booking.flatMap { $0.course.isEmpty ? nil : $0.course } ?? (course.isEmpty ? "Cancha" : course)
        var blocks: [Block] = []
        if let booking {
            blocks.append(Block(
                heading: "Horario",
                lines: [booking.chipWhen, booking.clubName, shownCourse].filter { !$0.isEmpty }
            ))
        } else {
            blocks.append(Block(heading: "Horario", lines: ["No hay un tee time reservado. La libreta es de \(shownCourse)."]))
        }
        if includeWind {
            blocks.append(Block(heading: "Viento del horario", lines: windLines(booking)))
        }
        if let overview = strategy?.overview?.trimmingCharacters(in: .whitespacesAndNewlines), !overview.isEmpty {
            blocks.append(Block(heading: "Cómo jugar la cancha", lines: [overview]))
        }
        let holes = (strategy?.holes ?? []).sorted { $0.hole < $1.hole }
        if holes.isEmpty {
            blocks.append(Block(heading: "Hoyos", lines: ["Todavía no hay un plan publicado para esta cancha."]))
        } else {
            for hole in holes {
                blocks.append(Block(heading: "Hoyo \(hole.hole)", lines: holeLines(hole, level: level, wind: includeWind ? booking?.windKmh : nil, from: includeWind ? booking?.windFrom : nil)))
            }
        }
        let suffix = includeWind ? "con-viento" : "sin-viento"
        let safe = shownCourse
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR"))
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
        return Document(
            filename: "libreta-\(safe)-\(suffix).pdf",
            title: includeWind ? "Libreta \(shownCourse) · con viento" : "Libreta \(shownCourse) · sin viento",
            includesWind: includeWind,
            blocks: blocks
        )
    }

    static func windLines(_ booking: TeeTime?) -> [String] {
        guard let booking else {
            return ["No hay un tee time reservado, así que esta libreta no trae viento."]
        }
        guard let kmh = booking.windKmh else {
            return ["Este horario no trae viento. No inventamos km/h ni cambiamos el palo."]
        }
        var lines = ["Viento \(kmh) km/h"]
        if let from = booking.windFrom, !from.isEmpty {
            lines.append("Desde \(from).")
        } else {
            lines.append("El horario no dice de dónde viene.")
        }
        lines.append("El plan de cada hoyo queda como está publicado. Sin la dirección contra la salida no cambiamos el palo.")
        return lines
    }

    private static func holeLines(_ hole: HoleStrategy, level: StrategyLevel, wind: Int?, from: String?) -> [String] {
        var lines: [String] = []
        if let title = hole.planTitle, !title.isEmpty { lines.append(title) }
        if let plan = hole.resolvedPlan(level: level), !plan.isEmpty { lines.append(plan) }
        if let club = hole.resolvedClub(level: level), !club.isEmpty { lines.append("Palo de salida: \(club)") }
        if let target = hole.teeTarget, !target.isEmpty { lines.append("Apuntá: \(target)") }
        if let miss = hole.missNote, !miss.isEmpty { lines.append(miss) }
        for hazard in hole.hazards where !hazard.note.orEmpty.isEmpty || hazard.rangeLabel != nil {
            var bit = hazard.title
            if let range = hazard.rangeLabel { bit += " · \(range)" }
            if let note = hazard.note, !note.isEmpty { bit += ". \(note)" }
            lines.append(bit)
        }
        if let wind {
            var bit = "Viento del horario: \(wind) km/h"
            if let from, !from.isEmpty { bit += " desde \(from)" }
            lines.append(bit)
        }
        if lines.isEmpty { lines.append("Sin plan publicado para este hoyo.") }
        return lines
    }
}

private extension Optional where Wrapped == String {
    var orEmpty: String { self ?? "" }
}

#if canImport(UIKit)
enum CourseHandbookPDF {
    static func write(_ document: CourseHandbook.Document) throws -> URL {
        let page = CGRect(x: 0, y: 0, width: 612, height: 792)
        let renderer = UIGraphicsPDFRenderer(bounds: page)
        let data = renderer.pdfData { context in
            var y: CGFloat = 48
            func begin() {
                context.beginPage()
                y = 48
            }
            func draw(_ text: String, font: UIFont, gap: CGFloat) {
                let style = NSMutableParagraphStyle()
                style.lineBreakMode = .byWordWrapping
                let attrs: [NSAttributedString.Key: Any] = [.font: font, .paragraphStyle: style, .foregroundColor: UIColor.black]
                let bounds = (text as NSString).boundingRect(
                    with: CGSize(width: 532, height: 4000),
                    options: [.usesLineFragmentOrigin, .usesFontLeading],
                    attributes: attrs,
                    context: nil
                )
                if y + bounds.height > 750 { begin() }
                (text as NSString).draw(
                    in: CGRect(x: 40, y: y, width: 532, height: ceil(bounds.height) + 2),
                    withAttributes: attrs
                )
                y += ceil(bounds.height) + gap
            }
            begin()
            draw(document.title, font: .boldSystemFont(ofSize: 22), gap: 14)
            for block in document.blocks {
                draw(block.heading, font: .boldSystemFont(ofSize: 14), gap: 4)
                draw(block.lines.joined(separator: "\n"), font: .systemFont(ofSize: 12), gap: 14)
            }
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(document.filename)
        try data.write(to: url, options: .atomic)
        return url
    }
}
#endif

enum ScoreSpike {
    struct Mark: Equatable, Sendable {
        var date: Date
        var gross: Int
        var reason: String
    }

    static func marks(in rounds: [Round], courseName: String?) -> [Mark] {
        let valid = rounds
            .filter { $0.isValid && $0.holesPlayed >= 18 }
            .filter { courseName == nil || $0.course.caseInsensitiveCompare(courseName ?? "") == .orderedSame }
            .sorted { $0.date < $1.date }
        let grosses = valid.compactMap(\.gross).map(Double.init)
        let median = StatsEngine.median(grosses)
        let repeatHoles = recurringDoubles(valid)
        return valid.compactMap { round in
            guard let gross = round.gross else { return nil }
            let blowups = round.counts.doubles + round.counts.triples + round.counts.worse
            let above = median.map { Double(gross) >= $0 + 5 } ?? false
            guard blowups >= 2 || above else { return nil }
            return Mark(date: round.date, gross: gross, reason: reason(round, blowups: blowups, above: above, repeatHoles: repeatHoles))
        }
    }

    private static func recurringDoubles(_ rounds: [Round]) -> Set<Int> {
        guard rounds.count >= 3 else { return [] }
        var hits: [Int: Int] = [:]
        for round in rounds {
            for hole in round.holes where (hole.toPar ?? 0) >= 2 {
                hits[hole.number, default: 0] += 1
            }
        }
        return Set(hits.filter { $0.value * 3 >= rounds.count }.map(\.key))
    }

    private static func reason(_ round: Round, blowups: Int, above: Bool, repeatHoles: Set<Int>) -> String {
        var parts: [String] = []
        if blowups > 0 {
            parts.append(blowups == 1 ? "1 doble o peor" : "\(blowups) dobles o peor")
        } else if above {
            parts.append("por encima de tu mediana")
        }
        let bad = round.holes.filter { ($0.toPar ?? 0) >= 2 }.map(\.number)
        if !bad.isEmpty {
            let shown = bad.prefix(3).map(String.init).joined(separator: ", ")
            parts.append("hoyos \(shown)")
        }
        let repeated = bad.filter { repeatHoles.contains($0) }
        if let hole = repeated.first {
            parts.append("el hoyo \(hole) se te repite")
        }
        return parts.joined(separator: " · ")
    }
}
