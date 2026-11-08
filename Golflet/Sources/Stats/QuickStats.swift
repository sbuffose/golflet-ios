import Foundation

struct QuickHole: Equatable, Sendable {
    var hole: Int
    var par: Int
}

struct QuickTotals: Equatable, Sendable {
    var putts: Int?
    var gir: Int?
    var fir: Int?
}

struct MarkWrite: Equatable, Sendable {
    var mark: HoleMark
    var applied: Bool
    var conflict: String?
    var idempotent: Bool
}

struct HoleMark: Equatable, Sendable {
    var hole: Int
    var putts: Int?
    var gir: Bool?
    var drive: String?
    var rev: Int
}

enum QuickStats {
    /// A total is present only when every eligible hole has that stat.
    /// One marked hole leaves the dictionary empty, so the card totals stay.
    static func noteFields(marks: [HoleMark], holes: [QuickHole]) -> [String: Int] {
        let by = Dictionary(marks.map { ($0.hole, $0) }, uniquingKeysWith: { _, latest in latest })
        var fields: [String: Int] = [:]
        if !holes.isEmpty, holes.allSatisfy({ by[$0.hole]?.putts != nil }) {
            fields["putts"] = holes.reduce(0) { $0 + (by[$1.hole]?.putts ?? 0) }
        }
        if !holes.isEmpty, holes.allSatisfy({ by[$0.hole]?.gir != nil }) {
            fields["gir"] = holes.filter { by[$0.hole]?.gir == true }.count
        }
        let drives: Set<String> = ["left", "right", "other", "fairway", "hit"]
        let firHoles = holes.filter { $0.par != 3 }
        if !firHoles.isEmpty, firHoles.allSatisfy({ drives.contains(by[$0.hole]?.drive ?? "") }) {
            fields["fir"] = firHoles.filter {
                let drive = by[$0.hole]?.drive
                return drive == "fairway" || drive == "hit"
            }.count
        }
        return fields
    }

    /// Same rev and same payload is a retry. Same rev and a different payload does not write.
    /// A lower rev is stale, including a write that arrives after the hole was cleared.
    static func apply(stored: HoleMark?, incoming: HoleMark) -> MarkWrite {
        var mark = incoming
        mark.drive = accountDrive(incoming.drive)
        guard let stored else {
            return MarkWrite(mark: mark, applied: true, conflict: nil, idempotent: false)
        }
        if mark.rev < stored.rev {
            return MarkWrite(mark: stored, applied: false, conflict: "stale", idempotent: false)
        }
        if mark.rev == stored.rev {
            if samePayload(stored, mark) {
                return MarkWrite(mark: stored, applied: true, conflict: nil, idempotent: true)
            }
            return MarkWrite(mark: stored, applied: false, conflict: "revision", idempotent: false)
        }
        return MarkWrite(mark: mark, applied: true, conflict: nil, idempotent: false)
    }

    static func nextRev(stored: Int?) -> Int {
        guard let stored, stored >= 1 else { return 1 }
        return stored + 1
    }

    static func accepts(hole: Int, drive: String?, holes: [QuickHole]) -> Bool {
        guard let card = holes.first(where: { $0.hole == hole }) else { return false }
        if card.par == 3, drive != nil { return false }
        return true
    }

    static func driveForAccount(par: Int, fairway: String?) -> String? {
        if par == 3 { return nil }
        return accountDrive(fairway)
    }

    /// A finished response is saved or a conflict. It does not stay on a spinner.
    static func phaseAfter(sent: Int, responseRev: Int, conflict: String?) -> String {
        if conflict == "revision" || conflict == "stale" { return "conflict" }
        if conflict == nil, responseRev == sent { return "saved" }
        return "conflict"
    }

    static func saveMessage(_ phase: String) -> String {
        switch phase {
        case "saving": return "Guardando…"
        case "saved": return "Guardado en tu cuenta"
        case "conflict": return "Otra edición llegó antes. Reintentá para traer la cuenta."
        default: return "No se pudo guardar. Lo que marcaste sigue en el teléfono."
        }
    }

    static func shouldCommit(sent: Int, latest: Int, response: Int) -> Bool {
        sent == latest && response == sent
    }

    private static func samePayload(_ stored: HoleMark, _ incoming: HoleMark) -> Bool {
        stored.hole == incoming.hole && stored.putts == incoming.putts && stored.gir == incoming.gir && stored.drive == incoming.drive
    }

    static func accountView(totals: QuickTotals, marks: [HoleMark], holes: [QuickHole]) -> (totals: QuickTotals, fields: [String: Int]) {
        (totals, noteFields(marks: marks, holes: holes))
    }

    static func accountDrive(_ fairway: String?) -> String? {
        switch fairway {
        case "hit": return "fairway"
        case "left", "right", "other", "fairway": return fairway
        default: return nil
        }
    }

    static func localFairway(_ drive: String?) -> String? {
        switch drive {
        case "fairway": return "hit"
        case "left", "right", "other": return drive
        default: return nil
        }
    }
}
