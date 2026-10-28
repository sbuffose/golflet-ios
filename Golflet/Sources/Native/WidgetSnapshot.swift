import Foundation

struct WidgetSnapshot: Hashable, Codable, Sendable {
    var handicap: Double
    var lastGross: Int?
    var lastNet: Int?
    var lastCourse: String?
    var lastRoundId: String?
    var lastDate: String?
    var nextCourse: String?
    var nextWhen: String?
    var nextDeepLink: String?

    var lastLine: String {
        guard let course = lastCourse else { return "Todavía no hay rondas" }
        var score = ""
        if let lastGross {
            score = "\(lastGross)"
            if let lastNet { score += " / \(lastNet)" }
        }
        if score.isEmpty { return course }
        return "\(score) · \(course)"
    }

    var handicapLine: String {
        FormatAR.one(handicap)
    }

    var lastRoundURL: URL? {
        guard let lastRoundId else { return nil }
        return URL(string: "golflet://round/\(lastRoundId)")
    }

    var nextRoundURL: URL? {
        nextDeepLink.flatMap(URL.init(string:))
    }

    static func make(home: HomeSnapshot, next: NextRoundHint? = nil) -> WidgetSnapshot {
        let last = home.lastRound
        return WidgetSnapshot(
            handicap: home.handicapIndex,
            lastGross: last?.gross,
            lastNet: last?.net,
            lastCourse: last?.displayCourse,
            lastRoundId: last?.roundId,
            lastDate: last.map { FormatAR.dayMonth($0.date).day + " " + FormatAR.dayMonth($0.date).month },
            nextCourse: next?.course,
            nextWhen: next?.when,
            nextDeepLink: next?.deepLink
        )
    }
}

struct NextRoundHint: Hashable, Sendable {
    var course: String
    var when: String
    var deepLink: String
}

enum WidgetSnapshotStore {
    static let key = "golflet.widget-snapshot"

    static func save(_ snap: WidgetSnapshot) {
        if let data = try? JSONEncoder().encode(snap) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func load() -> WidgetSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
}
