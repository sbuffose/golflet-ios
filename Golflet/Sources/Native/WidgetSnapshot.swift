import Foundation

extension WidgetSnapshot {
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

    /// App-only store until `group.com.sbuffose.golflet` exists. The widget
    /// timeline fetches `/api/data` instead of reading this container.
    static var defaults: UserDefaults {
        AppGroupAvailability.sharedDefaults ?? .standard
    }

    static func save(_ snap: WidgetSnapshot) {
        if let data = try? JSONEncoder().encode(snap) {
            defaults.set(data, forKey: key)
        }
    }

    static func load() -> WidgetSnapshot? {
        guard let data = defaults.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }
}
