import Foundation

enum PaceDefaults {
    static let players = 4
    static let modality = "medal"
    static let minutesPerHole = 12.0
    static let alertHole = 10
    static let thresholdMin = 10.0

    static func clampPlayers(_ value: Int?) -> Int {
        min(max(value ?? players, 1), 4)
    }

    static func normalizeModality(_ value: String?) -> String {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if trimmed.isEmpty { return modality }
        if let known = PaceModality(rawValue: trimmed.lowercased()) {
            return known.rawValue
        }
        return trimmed
    }
}

enum PaceModality: String, CaseIterable, Hashable, Sendable {
    case medal
    case stableford
    case match
    case fourball

    var label: String {
        switch self {
        case .medal: return "Medal"
        case .stableford: return "Stableford"
        case .match: return "Match"
        case .fourball: return "Fourball"
        }
    }

    static func parse(_ raw: String?) -> PaceModality {
        PaceModality(rawValue: (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) ?? .medal
    }
}

struct PaceTimelineHole: Hashable, Sendable {
    var hole: Int
    var par: Int?
    var minutes: Double
    var expectedEndMin: Double
}

struct PaceConfig: Hashable, Sendable {
    var minutesPerHole: Double
    var players: Int?
    var modality: String?
    var source: String
    var estimate: Double? = nil
    var scope: String? = nil
    var totalMin: Double? = nil
    var parWeighted: Bool = false
    var timeline: [PaceTimelineHole] = []

    static let fallbackMinutes = PaceDefaults.minutesPerHole
    static let fallback = PaceConfig(
        minutesPerHole: fallbackMinutes,
        players: nil,
        modality: nil,
        source: "fallback",
        estimate: nil,
        scope: nil,
        totalMin: nil,
        parWeighted: false,
        timeline: []
    )
}

struct LiveRoundPace: Hashable, Sendable {
    var expectedMin: Double
    var elapsedMin: Double
    var behindMin: Double
    var alertDue: Bool
    var alertText: String?
    var alertHole: Int
    var thresholdMin: Double
    var enabled: Bool
}

struct PlaySettings: Hashable, Codable, Sendable {
    var paceAlertEnabled: Bool

    static let `default` = PlaySettings(paceAlertEnabled: true)
}

enum PaceEngine {
    static let alertHole = PaceDefaults.alertHole
    static let behindThresholdMinutes = PaceDefaults.thresholdMin

    static func expectedMinutes(holesReached: Int, minutesPerHole: Double) -> Double {
        Double(max(holesReached - 1, 0)) * minutesPerHole
    }

    static func elapsedMinutes(from startedAt: Date, now: Date) -> Double {
        now.timeIntervalSince(startedAt) / 60
    }

    static func behindMinutes(elapsed: Double, holesReached: Int, minutesPerHole: Double) -> Double {
        elapsed - expectedMinutes(holesReached: holesReached, minutesPerHole: minutesPerHole)
    }

    static func shouldAlert(
        hole: Int,
        startedAt: Date?,
        now: Date = Date(),
        minutesPerHole: Double,
        alertEnabled: Bool,
        alreadyAlerted: Bool
    ) -> Bool {
        guard alertEnabled, !alreadyAlerted, hole == alertHole, let startedAt else { return false }
        return behindMinutes(
            elapsed: elapsedMinutes(from: startedAt, now: now),
            holesReached: hole,
            minutesPerHole: minutesPerHole
        ) > behindThresholdMinutes
    }

    static func durationLabel(_ minutes: Double) -> String {
        let total = max(Int(minutes.rounded()), 0)
        if total < 60 { return "\(total) min" }
        let hours = total / 60
        let mins = total % 60
        if mins == 0 { return "\(hours) h" }
        return "\(hours) h \(mins) min"
    }

    static func fallbackAlertText(elapsed: Double, expected: Double) -> String {
        "Vas más de 10 minutos atrasado del ritmo de la cancha. Llevás \(durationLabel(elapsed)). El ritmo esperado era \(durationLabel(expected))."
    }
}

struct PaceSession: Hashable, Codable, Sendable {
    var roundId: String
    var startedAt: Date
    var holeEnteredAt: [Int: Date]
    var alertedHole10: Bool

    mutating func markStart(_ date: Date) {
        if date < startedAt { startedAt = date }
    }

    mutating func enter(hole: Int, at date: Date = Date()) {
        if holeEnteredAt[hole] == nil {
            holeEnteredAt[hole] = date
        }
    }

    func elapsedOnHole(_ hole: Int, now: Date = Date()) -> TimeInterval {
        guard let entered = holeEnteredAt[hole] else { return 0 }
        let next = holeEnteredAt.keys.filter { $0 > hole }.min().flatMap { holeEnteredAt[$0] } ?? now
        return next.timeIntervalSince(entered)
    }
}

enum PlaySettingsStore {
    static let key = "golflet.play-settings"

    static func load() -> PlaySettings {
        guard let data = UserDefaults.standard.data(forKey: key),
              let settings = try? JSONDecoder().decode(PlaySettings.self, from: data)
        else { return .default }
        return settings
    }

    static func save(_ settings: PlaySettings) {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}

enum PaceSessionStore {
    private static let key = "golflet.pace-session"

    static func load(roundId: String) -> PaceSession? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let session = try? JSONDecoder().decode(PaceSession.self, from: data),
              session.roundId == roundId
        else { return nil }
        return session
    }

    static func save(_ session: PaceSession) {
        if let data = try? JSONEncoder().encode(session) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func make(roundId: String, startedAt: Date, hole: Int) -> PaceSession {
        if var existing = load(roundId: roundId) {
            existing.markStart(startedAt)
            existing.enter(hole: hole, at: startedAt)
            save(existing)
            return existing
        }
        let session = PaceSession(
            roundId: roundId,
            startedAt: startedAt,
            holeEnteredAt: [hole: startedAt],
            alertedHole10: false
        )
        save(session)
        return session
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }
}
