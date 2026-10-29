import Foundation

struct PaceConfig: Hashable, Sendable {
    var minutesPerHole: Double
    var players: Int?
    var modality: String?
    var source: String

    static let fallbackMinutes = 12.0
    static let fallback = PaceConfig(minutesPerHole: fallbackMinutes, players: nil, modality: nil, source: "fallback")
}

struct PlaySettings: Hashable, Codable, Sendable {
    var paceAlertEnabled: Bool

    static let `default` = PlaySettings(paceAlertEnabled: true)
}

enum PaceEngine {
    static let alertHole = 10
    static let behindThresholdMinutes = 10.0

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
