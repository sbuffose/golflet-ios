import Foundation

/// Per-hole card from TRACK shots. A missing lie stays unconfirmed. A par 3 has no fairway. Nothing here overwrites a manual mark.
enum TrackCard {
    struct Fact: Equatable, Sendable {
        var penalty = false
        var holed = false
        var lost = false
        var putt = false
        var originGreen = false
        var endLie: String? = nil
        var direction: String? = nil
    }

    struct Slot<T: Equatable & Sendable>: Equatable, Sendable {
        var value: T?
        var state: String
    }

    struct Hole: Equatable, Sendable {
        var putts: Slot<Int>
        var drive: Slot<String>
        var gir: Slot<Bool>
    }

    static func derive(par: Int?, shots: [Fact]) -> Hole {
        let finished = shots.contains { $0.holed }
        let puttShots = shots.filter { !$0.penalty && !$0.lost && ($0.putt || $0.originGreen) }
        let knowPutts = shots.contains { $0.putt || $0.originGreen || $0.endLie != nil }
        let puttCount: Int? = finished && (!puttShots.isEmpty || knowPutts) ? puttShots.count : nil
        let putts = Slot(value: puttCount, state: puttCount == nil ? "unconfirmed" : "track")
        return Hole(putts: putts, drive: drive(par: par, shots: shots), gir: girSlot(par: par, shots: shots))
    }

    static func fact(_ shot: ReconstructionShot) -> Fact {
        let penalty = shot.penaltyStrokes > 0 || shot.result == "penalty"
        let lost = shot.result == "lost"
        let club = shot.club.lowercased()
        let onGreen = shot.lie == "green"
        return Fact(
            penalty: penalty,
            holed: shot.result == "holed",
            lost: lost,
            putt: !penalty && !lost && (onGreen || club == "pt" || club.contains("putt")),
            originGreen: !penalty && !lost && onGreen,
            endLie: nil,
            direction: nil
        )
    }

    /// The hole editor uses "hit" for a fairway find. TRACK says "fairway".
    static func editorFairway(_ drive: String?) -> String? {
        switch drive {
        case "fairway": return "hit"
        case "left", "right", "other": return drive
        default: return nil
        }
    }

    private static func drive(par: Int?, shots: [Fact]) -> Slot<String> {
        if par == 3 { return Slot(value: nil, state: "na") }
        guard par == 4 || par == 5 else { return Slot(value: nil, state: "unconfirmed") }
        guard let first = shots.first(where: { !$0.penalty && !$0.lost }) else {
            return Slot(value: nil, state: "unconfirmed")
        }
        if first.direction == "left" || first.direction == "right" {
            return Slot(value: first.direction, state: "track")
        }
        if first.endLie == "fairway" || first.direction == "center" {
            return Slot(value: "fairway", state: "track")
        }
        if let end = first.endLie, !end.isEmpty {
            return Slot(value: "other", state: "track")
        }
        return Slot(value: nil, state: "unconfirmed")
    }

    private static func girSlot(par: Int?, shots: [Fact]) -> Slot<Bool> {
        let value = gir(par: par, shots: shots)
        return Slot(value: value, state: value == nil ? "unconfirmed" : "track")
    }

    private static func gir(par: Int?, shots: [Fact]) -> Bool? {
        guard let par else { return nil }
        let regulation = par - 2
        var count = 0
        var greenAt: Int?
        var unknown = false
        for shot in shots {
            count += 1
            if shot.endLie == "green", greenAt == nil {
                greenAt = count
            } else if !shot.penalty, shot.endLie == nil, greenAt == nil, count <= regulation {
                unknown = true
            }
        }
        if let greenAt { return greenAt <= regulation }
        if count >= regulation, !unknown { return false }
        return nil
    }
}
