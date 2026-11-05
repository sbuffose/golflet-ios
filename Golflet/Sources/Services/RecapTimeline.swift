import Foundation

enum RecapTone: String, Equatable, Sendable {
    case good
    case bad
    case even
}

enum RecapAgreement: Equatable, Sendable {
    case coincide
    case mismatch(spoken: String, card: String)

    var label: String {
        switch self {
        case .coincide:
            return "Coincide con la tarjeta"
        case .mismatch(let spoken, let card):
            return "No coincide: el relato dice \(spoken) y la tarjeta es \(card)"
        }
    }

    var coincides: Bool {
        if case .coincide = self { return true }
        return false
    }
}

struct RecapCardHole: Equatable, Sendable {
    var number: Int
    var par: Int
    var strokes: Int?
    var toPar: Int?
    var result: HoleResult
}

struct RecapHoleLine: Identifiable, Equatable, Sendable {
    var id: String
    var kind: RecapTone
    var title: String
    var text: String
}

struct RecapHoleBeat: Identifiable, Equatable, Sendable {
    var id: String
    var hole: Int?
    var tone: RecapTone
    var title: String
    var scoreLine: String?
    var toParLine: String?
    var lines: [RecapHoleLine]
    var agreement: RecapAgreement?
}

enum RecapTimeline {
    static func latestHole(in text: String) -> Int? {
        mentions(in: text).last?.hole
    }

    static func claimedResult(in text: String) -> HoleResult? {
        let folded = fold(text)
        guard let expression = try? NSRegularExpression(pattern: claimPattern, options: [.caseInsensitive]) else { return nil }
        let ns = folded as NSString
        let matches = expression.matches(in: folded, range: NSRange(location: 0, length: ns.length))
        guard let last = matches.last else { return nil }
        let token = ns.substring(with: last.range(at: 1)).lowercased()
        return result(for: token, source: ns as String, endingAt: last.range.location)
    }

    static func build(
        transcript: String,
        mistakes: [RecapMistake],
        positives: [RecapPositive],
        card: [RecapCardHole]
    ) -> [RecapHoleBeat] {
        let cardByHole = Dictionary(uniqueKeysWithValues: card.map { ($0.number, $0) })
        var slices: [Int: [String]] = [:]
        var order: [Int] = []
        let found = mentions(in: transcript)
        for (index, mention) in found.enumerated() {
            let end = index + 1 < found.count ? found[index + 1].lower : transcript.endIndex
            let slice = transcript[mention.lower..<end].trimmingCharacters(in: .whitespacesAndNewlines)
            if slices[mention.hole] == nil { order.append(mention.hole) }
            if !slice.isEmpty { slices[mention.hole, default: []].append(slice) }
        }

        var seen = Set(order)
        let extras = (mistakes.compactMap(\.hole) + positives.compactMap(\.hole))
            .filter { (1...18).contains($0) && seen.insert($0).inserted }
            .sorted()
        order.append(contentsOf: extras)

        var beats: [RecapHoleBeat] = order.map { hole in
            beat(
                hole: hole,
                slices: slices[hole] ?? [],
                mistakes: mistakes.filter { $0.hole == hole },
                positives: positives.filter { $0.hole == hole },
                card: cardByHole[hole]
            )
        }

        let looseMistakes = mistakes.filter { $0.hole == nil }
        let loosePositives = positives.filter { $0.hole == nil }
        if !looseMistakes.isEmpty || !loosePositives.isEmpty {
            beats.append(beat(
                hole: nil,
                slices: [],
                mistakes: looseMistakes,
                positives: loosePositives,
                card: nil
            ))
        }
        return beats
    }

    private struct Mention {
        var hole: Int
        var lower: String.Index
        var upper: String.Index
    }

    private static func beat(
        hole: Int?,
        slices: [String],
        mistakes: [RecapMistake],
        positives: [RecapPositive],
        card: RecapCardHole?
    ) -> RecapHoleBeat {
        var lines: [RecapHoleLine] = []
        for item in positives {
            lines.append(RecapHoleLine(id: "p-\(item.id)", kind: .good, title: "Bien", text: item.text))
        }
        for item in mistakes {
            lines.append(RecapHoleLine(id: "m-\(item.id)", kind: .bad, title: item.label, text: item.text))
        }
        if lines.isEmpty {
            let text = slices.joined(separator: " ").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                let kind = claimedResult(in: text).map(tone(for:)) ?? .even
                lines.append(RecapHoleLine(id: "s-\(hole ?? 0)", kind: kind, title: "Relato", text: text))
            }
        }
        let spoken = (slices + lines.map(\.text)).joined(separator: " ")
        let agreement = agreement(spoken: spoken, card: card)
        let tone = tone(card: card, lines: lines, spoken: spoken, agreement: agreement)
        return RecapHoleBeat(
            id: hole.map { "h-\($0)" } ?? "general",
            hole: hole,
            tone: tone,
            title: hole.map { "Hoyo \($0)" } ?? "Sin hoyo",
            scoreLine: card.map { scoreLine($0) },
            toParLine: card?.toPar.map { FormatAR.signedInt($0) },
            lines: lines,
            agreement: agreement
        )
    }

    private static func scoreLine(_ card: RecapCardHole) -> String {
        if let strokes = card.strokes {
            return "Par \(card.par) · \(strokes)"
        }
        return "Par \(card.par)"
    }

    private static func agreement(spoken: String, card: RecapCardHole?) -> RecapAgreement? {
        guard let card, let spokenResult = claimedResult(in: spoken), spokenResult != .unknown else { return nil }
        let cardResult = card.result == .unknown ? HoleResult(className: nil, toPar: card.toPar) : card.result
        guard cardResult != .unknown else { return nil }
        if spokenResult == cardResult { return .coincide }
        return .mismatch(spoken: name(spokenResult), card: name(cardResult))
    }

    private static func tone(card: RecapCardHole?, lines: [RecapHoleLine], spoken: String, agreement: RecapAgreement?) -> RecapTone {
        if let agreement, !agreement.coincides { return .bad }
        if let toPar = card?.toPar {
            if toPar < 0 { return .good }
            if toPar > 0 { return .bad }
            if lines.contains(where: { $0.kind == .bad }) { return .bad }
            if lines.contains(where: { $0.kind == .good }) { return .good }
            return .even
        }
        if let result = card?.result, result != .unknown { return tone(for: result) }
        if lines.contains(where: { $0.kind == .bad }) { return .bad }
        if lines.contains(where: { $0.kind == .good }) { return .good }
        return claimedResult(in: spoken).map(tone(for:)) ?? .even
    }

    private static func tone(for result: HoleResult) -> RecapTone {
        switch result {
        case .eagleOrBetter, .birdie: return .good
        case .bogey, .doubleOrWorse: return .bad
        case .par, .unknown: return .even
        }
    }

    static func name(_ result: HoleResult) -> String {
        switch result {
        case .eagleOrBetter: return "eagle"
        case .birdie: return "birdie"
        case .par: return "par"
        case .bogey: return "bogey"
        case .doubleOrWorse: return "doble bogey"
        case .unknown: return "sin resultado"
        }
    }

    private static func mentions(in text: String) -> [Mention] {
        let source = alignedFold(text) ?? text.lowercased()
        guard let expression = try? NSRegularExpression(pattern: holePattern, options: [.caseInsensitive]) else { return [] }
        let ns = source as NSString
        var found: [Mention] = []
        for match in expression.matches(in: source, range: NSRange(location: 0, length: ns.length)) {
            guard match.numberOfRanges > 2 else { continue }
            let token = ns.substring(with: match.range(at: 2))
            guard let hole = holeNumber(token), let bounds = range(in: text, nsRange: match.range(at: 1)) else { continue }
            found.append(Mention(hole: hole, lower: bounds.lowerBound, upper: bounds.upperBound))
        }
        found.sort { $0.lower < $1.lower }
        var kept: [Mention] = []
        for mention in found {
            if let last = kept.last, mention.lower < last.upper { continue }
            kept.append(mention)
        }
        return kept
    }

    private static func holeNumber(_ token: String) -> Int? {
        let folded = fold(token)
        if let value = Int(folded), (1...18).contains(value) { return value }
        return words[folded]
    }

    private static func result(for token: String, source: String, endingAt location: Int) -> HoleResult? {
        if token.contains("eagle") || token.contains("aguila") || token.contains("albatros") || token.contains("hoyo en uno") {
            return .eagleOrBetter
        }
        if token.contains("birdie") || token.contains("birdi") || token.contains("pajarito") {
            return .birdie
        }
        if token.contains("doble") || token.contains("double") {
            return .doubleOrWorse
        }
        if token.contains("bogey") || token.contains("boguey") {
            return .bogey
        }
        if token.contains("par") {
            let prefix = (source as NSString).substring(with: NSRange(location: max(0, location - 8), length: min(8, location)))
            if prefix.contains("doble") || prefix.contains("double") { return .doubleOrWorse }
            return .par
        }
        return nil
    }

    private static func alignedFold(_ text: String) -> String? {
        let folded = fold(text)
        guard folded.utf16.count == text.utf16.count else { return nil }
        return folded
    }

    private static func fold(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_AR"))
    }

    private static func range(in text: String, nsRange: NSRange) -> Range<String.Index>? {
        let utf16 = text.utf16
        guard let start16 = utf16.index(utf16.startIndex, offsetBy: nsRange.location, limitedBy: utf16.endIndex),
              let end16 = utf16.index(start16, offsetBy: nsRange.length, limitedBy: utf16.endIndex),
              let start = String.Index(start16, within: text),
              let end = String.Index(end16, within: text) else { return nil }
        return start..<end
    }

    private static let words: [String: Int] = [
        "uno": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5,
        "seis": 6, "siete": 7, "ocho": 8, "nueve": 9, "diez": 10,
        "once": 11, "doce": 12, "trece": 13, "catorce": 14, "quince": 15,
        "dieciseis": 16, "diecisiete": 17, "dieciocho": 18
    ]

    private static let holePattern = #"(?:^|[^A-Za-z0-9])((?:hoyo(?:\s+(?:numero|nro|no))?|(?:en\s+el|del|al|por\s+el)|el)\s+(dieciocho|diecisiete|dieciseis|catorce|quince|trece|once|doce|diez|nueve|ocho|siete|seis|cinco|cuatro|tres|dos|uno|\d{1,2}))\b"#

    private static let claimPattern = #"(hoyo en uno|albatros|aguila|eagle|pajarito|birdie|birdi|doble bogey|double bogey|doble|double|bogey|boguey|(?:hice|fue|quede|sali|un|a la)\s+par\b(?!\s*\d)|\bpar\b(?!\s*\d))"#
}
