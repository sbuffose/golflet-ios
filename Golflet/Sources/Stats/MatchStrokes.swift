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
