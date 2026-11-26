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

    /// First given-name token. A surname-first club line stays on the surname until `companionLabel` sees a collision.
    static func givenToken(_ name: String) -> String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let body: String
        if let comma = trimmed.firstIndex(of: ",") {
            body = trimmed[trimmed.index(after: comma)...].trimmingCharacters(in: .whitespacesAndNewlines)
        } else {
            body = trimmed
        }
        return body.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? trimmed
    }

    /// Unique names keep the given name. A shared token uses the match-grid rule.
    static func companionLabel(_ name: String, peers: [String]) -> String {
        let plain = givenToken(name)
        guard !plain.isEmpty else { return "" }
        if peers.filter({ same(givenToken($0), plain) }).count < 2 { return plain }
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if let comma = trimmed.firstIndex(of: ",") {
            let surname = trimmed[..<comma].trimmingCharacters(in: .whitespacesAndNewlines)
            let initial = surname.first.map { String($0).uppercased(with: Locale(identifier: "es")) } ?? ""
            return initial.isEmpty ? plain : "\(plain) \(initial)."
        }
        return shortName(trimmed, peers: peers)
    }

    /// «con Joaquín L. y Augusto L. +1». Nil when there is nobody.
    static func companionsLine(from names: [String]) -> String? {
        let cleaned = names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        guard !cleaned.isEmpty else { return nil }
        let labels = cleaned.map { companionLabel($0, peers: cleaned) }
        let head = labels.prefix(2).joined(separator: " y ")
        if labels.count > 2 { return "con \(head) +\(labels.count - 2)" }
        return "con \(head)"
    }

    private static func same(_ a: String, _ b: String) -> Bool {
        a.compare(b, options: .caseInsensitive, locale: Locale(identifier: "es")) == .orderedSame
    }

    struct HoleState: Equatable {
        var up: Int
        var played: Int
        var remaining: Int
        var finished: Bool
        var text: String
    }

    struct Standing: Equatable {
        var text: String
        var tone: String
        var versus: String
    }

    static func statusText(up: Int, remaining: Int, finished: Bool) -> String {
        let margin = abs(up)
        if finished {
            if margin == 0 { return "Empate" }
            return remaining > 0 ? "\(margin)&\(remaining)" : "\(margin) arriba"
        }
        if margin == 0 { return "All square" }
        return margin == remaining ? "Dormie (\(margin) arriba)" : "\(margin) arriba"
    }

    /// Net match between two score rows. A hole counts when both cells are entered. Zero is «no terminó» and is not a score.
    static func match(a: [Int?], b: [Int?], aDots: [Int] = [], bDots: [Int] = []) -> HoleState {
        var up = 0
        var played = 0
        var closed = false
        for hole in 0..<holes {
            if closed { break }
            let rawA = hole < a.count ? a[hole] : nil
            let rawB = hole < b.count ? b[hole] : nil
            guard let rawA, let rawB, (0...20).contains(rawA), (0...20).contains(rawB) else { continue }
            let netA: Int? = rawA > 0 ? rawA - (hole < aDots.count ? aDots[hole] : 0) : nil
            let netB: Int? = rawB > 0 ? rawB - (hole < bDots.count ? bDots[hole] : 0) : nil
            played += 1
            if let netA, let netB {
                if netA < netB { up += 1 } else if netB < netA { up -= 1 }
            } else if netA != nil {
                up += 1
            } else if netB != nil {
                up -= 1
            }
            if abs(up) > holes - played { closed = true }
        }
        let remaining = holes - played
        let finished = closed || remaining == 0
        return HoleState(up: up, played: played, remaining: remaining, finished: finished, text: statusText(up: up, remaining: remaining, finished: finished))
    }

    static func standing(aId: String, bId: String, aName: String, bName: String, state: HoleState, me: String = "me") -> Standing {
        func who(_ id: String, _ name: String) -> String { id == me ? "Vos" : name }
        func other(of id: String) -> String { id == aId ? who(bId, bName) : who(aId, aName) }
        if state.finished {
            if state.up == 0 { return Standing(text: "Empate", tone: "even", versus: "\(who(aId, aName)) vs \(who(bId, bName))") }
            let winner = state.up > 0 ? aId : bId
            let winnerName = winner == aId ? aName : bName
            return Standing(text: "Ganó \(who(winner, winnerName)) \(state.text)", tone: winner == me ? "me" : "them", versus: other(of: winner))
        }
        if state.up == 0 { return Standing(text: state.text, tone: "even", versus: "\(who(aId, aName)) vs \(who(bId, bName))") }
        let leader = state.up > 0 ? aId : bId
        let leaderName = leader == aId ? aName : bName
        return Standing(text: "\(who(leader, leaderName)) \(state.text)", tone: leader == me ? "me" : "them", versus: other(of: leader))
    }

    /// The track total replaces the cell. The same number is not added on top.
    static func applyHoleScore(_ scores: [Int?], hole: Int, strokes: Int) -> [Int?] {
        guard (1...holes).contains(hole), (1...20).contains(strokes) else { return scores }
        var next = scores
        if next.count < holes { next += Array(repeating: nil, count: holes - next.count) }
        next[hole - 1] = strokes
        return next
    }
}
