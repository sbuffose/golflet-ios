import Foundation

/// Match-play strokes by hole stroke index. Same rules as web/lib/match-core.ts.
/// A card without a complete S.I. places nothing: the hole number is never used as a fallback.
enum MatchStrokes {
    static let holes = 18

    static func roundHalfUp(_ x: Double) -> Int {
        let c = (x * 1_000_000).rounded() / 1_000_000
        return Int(floor(c + 0.5))
    }

    static func strokesReceived(_ handicaps: [Double], allowance: Double) -> [Int] {
        guard let low = handicaps.min() else { return [] }
        return handicaps.map { roundHalfUp(($0 - low) * allowance / 100) }
    }

    /// Four players open as fourball (85%). Two, or any other count, open at 100%.
    static func defaultAllowance(players: Int) -> Double { players == 4 ? 85 : 100 }

    /// WHS course handicap, rounded half up. Nil when slope, rating or par is missing.
    static func courseHandicap(index: Double, slope: Double, rating: Double, par: Int) -> Int? {
        guard slope > 0, rating.isFinite, par > 0 else { return nil }
        return roundHalfUp(index * slope / 113 + (rating - Double(par)))
    }

    /// The tee the course name points at: Azul → azul, Colorada → rojo.
    static func teeName(forCourse course: String) -> String? {
        let folded = course.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es")).lowercased()
        let colors = ["colorada": "rojo", "roja": "rojo", "azul": "azul", "negra": "negro", "blanca": "blanco", "amarilla": "amarillo", "verde": "verde"]
        for word in folded.split(whereSeparator: { $0 == " " }) {
            if let tee = colors[String(word)] { return tee }
        }
        return nil
    }

    /// Indexes (0 = hole 1) with a usable S.I. Nil unless there are 18 distinct values, or exactly 9 and the rest empty.
    static func strokeHoles(_ si: [Int?]) -> [Int]? {
        var known: [Int] = []
        let limit = min(si.count, holes)
        for i in 0..<limit {
            guard let value = si[i] else { continue }
            guard (1...18).contains(value) else { return nil }
            known.append(i)
        }
        guard known.count == 18 || known.count == 9 else { return nil }
        let values = known.map { si[$0]! }
        guard Set(values).count == known.count else { return nil }
        return known
    }

    static func placed(_ si: [Int?]) -> Bool { strokeHoles(si) != nil }

    /// Strokes per hole for a player who receives `received`. All zeros when the S.I. is not loaded.
    static func holeStrokes(received: Int, si: [Int?]) -> [Int] {
        var out = Array(repeating: 0, count: holes)
        guard received > 0, let known = strokeHoles(si) else { return out }
        let order = known.sorted { a, b in
            let left = si[a] ?? 99
            let right = si[b] ?? 99
            if left != right { return left < right }
            return a < b
        }
        let count = order.count
        let base = received / count
        let extra = received % count
        for (rank, hole) in order.enumerated() {
            out[hole] = base + (rank < extra ? 1 : 0)
        }
        return out
    }

    static func card(from holes: [(hole: Int, par: Int?, si: Int?)]) -> (pars: [Int?], si: [Int?]) {
        var pars = Array<Int?>(repeating: nil, count: holesCount)
        var si = Array<Int?>(repeating: nil, count: holesCount)
        for hole in holes {
            guard (1...holesCount).contains(hole.hole) else { continue }
            if let par = hole.par, (3...6).contains(par) { pars[hole.hole - 1] = par }
            if let value = hole.si, (1...18).contains(value) { si[hole.hole - 1] = value }
        }
        return (pars, si)
    }

    private static var holesCount: Int { holes }

    /// Course named by the event, only when one course matches. A name or its first four letters wins;
    /// otherwise one color square. Two squares or two courses return nil. This never invents a stroke index.
    static func courseFromMarker(_ event: String, courses: [String]) -> String? {
        let title = event.trimmingCharacters(in: .whitespacesAndNewlines)
        let list = courses.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !title.isEmpty, !list.isEmpty else { return nil }
        let upper = fold(title)
        let byName = list.filter { course in
            markerWords(course).contains { word in
                let prefix = String(word.prefix(4))
                let pattern = "\\b\(NSRegularExpression.escapedPattern(for: prefix))"
                return upper.range(of: pattern, options: .regularExpression) != nil
            }
        }
        if byName.count == 1 { return byName[0] }
        let squares = ["🟥", "🟦", "🟩", "🟨", "⬛", "⬜"].filter { title.contains($0) }
        guard squares.count == 1, let square = squares.first else { return nil }
        let pattern: String
        switch square {
        case "🟥": pattern = "COLORAD|ROJ"
        case "🟦": pattern = "AZUL"
        case "🟩": pattern = "VERDE"
        case "🟨": pattern = "AMARILL"
        case "⬛": pattern = "NEGR"
        case "⬜": pattern = "BLANC"
        default: return nil
        }
        let hit = list.filter { fold($0).range(of: pattern, options: .regularExpression) != nil }
        return hit.count == 1 ? hit[0] : nil
    }

    private static func fold(_ text: String) -> String {
        text.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).uppercased()
    }

    private static func markerWords(_ name: String) -> [String] {
        fold(name).split { $0.isWhitespace }.map(String.init).filter { $0.count >= 4 && $0 != "CANCHA" }
    }

    /// «Joaquín L.» Given name plus the surname initial. A list that leads with a shared surname uses the first token that is not shared.
    static func shortName(_ name: String, peers: [String], me: Bool = false) -> String {
        if me { return "Vos" }
        let parts = name.split { $0.isWhitespace }.map(String.init)
        guard !parts.isEmpty else { return "" }
        if parts.count == 1 { return parts[0] }
        let lists = (peers.isEmpty ? [name] : peers).map { $0.split { $0.isWhitespace }.map(String.init) }
        let firstShared = lists.filter { !$0.isEmpty && same($0[0], parts[0]) }.count > 1
        if firstShared {
            var given = parts[parts.count - 1]
            for index in 1..<parts.count {
                let token = parts[index]
                let shared = lists.filter { $0.count > index && same($0[index], token) }.count > 1
                if !shared { given = token; break }
            }
            let initial = parts[0].first.map { String($0).uppercased(with: Locale(identifier: "es")) } ?? ""
            return "\(given) \(initial)."
        }
        let initial = parts[parts.count - 1].first.map { String($0).uppercased(with: Locale(identifier: "es")) } ?? ""
        return "\(parts[0]) \(initial)."
    }

    private static func same(_ a: String, _ b: String) -> Bool {
        a.compare(b, options: .caseInsensitive, locale: Locale(identifier: "es")) == .orderedSame
    }
}
