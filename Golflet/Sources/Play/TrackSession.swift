import Foundation

/// WhyGolf-style marking: the map moves under a fixed cursor.
/// Tee, then flag, then each shot end. A ball is holed only when the cursor
/// is on the cup and the player confirms with ENTER.
struct TrackPoint: Equatable, Sendable {
    var lat: Double
    var lng: Double
}

enum TrackPhase: Equatable, Sendable {
    case confirmTee
    case confirmFlag
    case tracking
    case penaltyWhere
    case relief
    case drop
}

struct TrackMark: Equatable, Sendable, Identifiable {
    var id: Int
    var at: TrackPoint
    var club: String?
    /// Counts as a stroke. A drop placement does not.
    var countsStroke: Bool
    var holed: Bool
    var penalty: Bool
    var drop: Bool
}

enum TrackSession {
    struct State: Equatable, Sendable {
        var phase: TrackPhase = .confirmTee
        var tee: TrackPoint?
        var flag: TrackPoint?
        var ball: TrackPoint?
        var marks: [TrackMark] = []
        var nextID: Int = 1

        var strokeCount: Int { marks.filter(\.countsStroke).count }

        var prompt: String {
            switch phase {
            case .confirmTee: return "Arrastrá el mapa para confirmar el tee"
            case .confirmFlag: return "Arrastrá el mapa para marcar la bandera"
            case .tracking: return "Arrastrá el mapa hasta donde terminó el golpe"
            case .penaltyWhere: return "Penalidad: ¿adónde fue?"
            case .relief: return "Penalidad. Elegí otra vez o drop"
            case .drop: return "Arrastrá el mapa hasta el drop"
            }
        }
    }

    /// Cursor sits on the flag icon. Near the green is not enough.
    static func onCup(meters: Double) -> Bool {
        meters >= 0 && meters <= 1.2
    }

    /// Putt readout when the cursor is on the green side of the hole but not in the cup.
    static func puttFeet(meters: Double) -> Int? {
        guard meters > 1.2, meters <= 25 else { return nil }
        return Int((meters * 3.28084).rounded())
    }

    static func set(_ state: State, at point: TrackPoint) -> State {
        var next = state
        switch state.phase {
        case .confirmTee:
            next.tee = point
            next.ball = point
            next.phase = .confirmFlag
        case .confirmFlag:
            next.flag = point
            next.phase = .tracking
        case .drop:
            next.ball = point
            next.marks.append(TrackMark(
                id: next.nextID,
                at: point,
                club: nil,
                countsStroke: false,
                holed: false,
                penalty: false,
                drop: true
            ))
            next.nextID += 1
            next.phase = .tracking
        case .tracking, .penaltyWhere, .relief:
            break
        }
        return next
    }

    struct EnterOutcome: Equatable, Sendable {
        var state: State
        var recorded: Bool
        var holed: Bool
    }

    /// ENTER confirms the cursor. `onCup` must already mean the cursor is on the flag.
    static func enter(_ state: State, at point: TrackPoint, club: String?, onCup: Bool, putting: Bool = false) -> EnterOutcome {
        var next = state
        switch state.phase {
        case .tracking:
            let holed = onCup && putting
            let spot = holed ? (state.flag ?? point) : point
            next.marks.append(TrackMark(
                id: next.nextID,
                at: spot,
                club: club,
                countsStroke: true,
                holed: holed,
                penalty: false,
                drop: false
            ))
            next.nextID += 1
            if holed {
                next.ball = state.flag ?? spot
            } else {
                next.ball = spot
            }
            next.phase = .tracking
            return EnterOutcome(state: next, recorded: true, holed: holed)
        case .penaltyWhere:
            next.marks.append(TrackMark(
                id: next.nextID,
                at: point,
                club: club,
                countsStroke: true,
                holed: false,
                penalty: true,
                drop: false
            ))
            next.nextID += 1
            next.phase = .relief
            return EnterOutcome(state: next, recorded: true, holed: false)
        case .confirmTee, .confirmFlag, .relief, .drop:
            return EnterOutcome(state: state, recorded: false, holed: false)
        }
    }

    static func beginPenalty(_ state: State) -> State {
        guard state.phase == .tracking else { return state }
        var next = state
        next.phase = .penaltyWhere
        return next
    }

    /// Stroke-and-distance: the penalty stroke already counted. The ball goes back
    /// to where the previous stroke was played. No second penalty and no guessed drop.
    static func reload(_ state: State) -> State {
        guard state.phase == .relief else { return state }
        var next = state
        next.ball = previousBall(beforeLastPenalty: state)
        next.phase = .tracking
        return next
    }

    static func chooseDrop(_ state: State) -> State {
        guard state.phase == .relief else { return state }
        var next = state
        next.phase = .drop
        return next
    }

    static func cancel(_ state: State) -> State {
        var next = state
        switch state.phase {
        case .penaltyWhere:
            next.phase = .tracking
        case .relief, .drop:
            if let last = next.marks.last, last.penalty {
                next.marks.removeLast()
            }
            next.phase = .tracking
        case .confirmTee, .confirmFlag, .tracking:
            break
        }
        return next
    }

    private static func previousBall(beforeLastPenalty state: State) -> TrackPoint? {
        let prior = state.marks.dropLast().last { $0.countsStroke && !$0.penalty }
        return prior?.at ?? state.tee ?? state.ball
    }
}
