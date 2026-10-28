import Foundation

struct OfflineLiveRound: Hashable, Codable, Sendable {
    var localId: String
    var courseId: String
    var course: String?
    var tee: String?
    var currentHole: Int
}

enum OfflinePlay {
    static let prefix = "offline-"
    private static let key = "golflet.offline-live-rounds"
    private static let activeKey = "golflet.active-play"
    private static let gpsKey = "golflet.last-gps"

    static func isLocal(_ id: String) -> Bool {
        id.hasPrefix(prefix)
    }

    static func begin(course: GPSCourseDetail, tee: String?) -> LiveRound {
        let local = OfflineLiveRound(
            localId: prefix + UUID().uuidString,
            courseId: course.courseId,
            course: course.course,
            tee: tee ?? course.course,
            currentHole: 1
        )
        var items = pending()
        items.append(local)
        savePending(items)
        saveActive(roundId: local.localId, courseId: course.courseId, hole: 1, courseName: course.course)
        return LiveRound(
            id: local.localId,
            courseId: course.courseId,
            clubCode: course.clubCode,
            course: course.course,
            date: DayStamp.today(),
            tee: local.tee,
            currentHole: 1,
            startedAt: Date(),
            endedAt: nil,
            roundId: nil,
            recapId: nil,
            shots: 0
        )
    }

    static func pending() -> [OfflineLiveRound] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let items = try? JSONDecoder().decode([OfflineLiveRound].self, from: data)
        else { return [] }
        return items
    }

    static func lookup(_ localId: String) -> OfflineLiveRound? {
        pending().first { $0.localId == localId }
    }

    static func remove(_ localId: String) {
        savePending(pending().filter { $0.localId != localId })
        if loadActive()?.roundId == localId { clearActive() }
    }

    static func remap(_ drafts: [ShotDraft], to liveRoundId: String) -> [ShotDraft] {
        drafts.map { draft in
            var copy = draft
            copy.liveRoundId = liveRoundId
            return copy
        }
    }

    static func saveActive(roundId: String, courseId: String, hole: Int, courseName: String) {
        let body: [String: Any] = [
            "round_id": roundId,
            "course_id": courseId,
            "hole": hole,
            "course": courseName
        ]
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            UserDefaults.standard.set(data, forKey: activeKey)
        }
    }

    static func loadActive() -> (roundId: String, courseId: String, hole: Int, courseName: String)? {
        guard let data = UserDefaults.standard.data(forKey: activeKey),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["round_id"] as? String
        else { return nil }
        return (
            id,
            json["course_id"] as? String ?? "",
            JSONFlex.int(from: json["hole"]) ?? 1,
            json["course"] as? String ?? ""
        )
    }

    static func clearActive() {
        UserDefaults.standard.removeObject(forKey: activeKey)
    }

    static func saveLastGPS(_ coord: GPSCoord, accuracy: Double?) {
        var body: [String: Any] = ["lat": coord.lat, "lng": coord.lng]
        if let accuracy { body["accuracy_m"] = accuracy }
        if let data = try? JSONSerialization.data(withJSONObject: body) {
            UserDefaults.standard.set(data, forKey: gpsKey)
        }
    }

    static func lastGPS() -> (GPSCoord, Double?)? {
        guard let data = UserDefaults.standard.data(forKey: gpsKey),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lat = JSONFlex.double(from: json["lat"]),
              let lng = JSONFlex.double(from: json["lng"])
        else { return nil }
        return (GPSCoord(lat: lat, lng: lng), JSONFlex.double(from: json["accuracy_m"]))
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
        UserDefaults.standard.removeObject(forKey: activeKey)
        UserDefaults.standard.removeObject(forKey: gpsKey)
    }

    private static func savePending(_ items: [OfflineLiveRound]) {
        if let data = try? JSONEncoder().encode(items) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}

extension DayStamp {
    static func today() -> String {
        let c = Calendar.gregorian.dateComponents([.year, .month, .day], from: Date())
        return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }
}
