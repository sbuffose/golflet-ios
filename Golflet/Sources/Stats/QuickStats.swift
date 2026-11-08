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

    static func apply(stored: HoleMark?, incoming: HoleMark) -> (mark: HoleMark, applied: Bool) {
        if let stored, incoming.rev < stored.rev {
            return (stored, false)
        }
        var mark = incoming
        mark.drive = accountDrive(incoming.drive)
        return (mark, true)
    }

    static func shouldCommit(sent: Int, latest: Int, response: Int) -> Bool {
        sent == latest && response == sent
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
