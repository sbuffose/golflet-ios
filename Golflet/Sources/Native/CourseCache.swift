import Foundation

enum CourseCache {
    private static var folder: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let dir = base.appendingPathComponent("golflet-cache", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func saveList(_ list: GPSCourseList) {
        write(encodeList(list), name: "courses.json")
    }

    static func loadList() -> GPSCourseList? {
        guard let json = read(name: "courses.json") else { return nil }
        return decodeList(json)
    }

    static func save(detail: GPSCourseDetail, strategy: CourseStrategy?) {
        write(encodeDetail(detail), name: "course-\(detail.courseId).json")
        if let strategy {
            write(encodeStrategy(strategy), name: "strategy-\(detail.courseId).json")
        }
    }

    static func load(courseId: String) -> (detail: GPSCourseDetail, strategy: CourseStrategy?)? {
        guard let json = read(name: "course-\(courseId).json"),
              let detail = decodeDetail(json)
        else { return nil }
        let strategy = read(name: "strategy-\(courseId).json").flatMap(decodeStrategy)
        return (detail, strategy)
    }

    static func reset() {
        try? FileManager.default.removeItem(at: folder)
    }

    private static func write(_ json: [String: Any], name: String) {
        guard JSONSerialization.isValidJSONObject(json),
              let data = try? JSONSerialization.data(withJSONObject: json, options: [.sortedKeys])
        else { return }
        try? data.write(to: folder.appendingPathComponent(name), options: .atomic)
    }

    private static func read(name: String) -> [String: Any]? {
        guard let data = try? Data(contentsOf: folder.appendingPathComponent(name)),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return nil }
        return json
    }

    private static func encodeList(_ list: GPSCourseList) -> [String: Any] {
        [
            "courses": list.courses.map(encodeSummary),
            "nearby": list.nearby.map(encodeSummary)
        ]
    }

    private static func decodeList(_ json: [String: Any]) -> GPSCourseList? {
        let courses = (json["courses"] as? [[String: Any]] ?? []).compactMap(decodeSummary)
        let nearby = (json["nearby"] as? [[String: Any]] ?? []).compactMap(decodeSummary)
        return GPSCourseList(courses: courses, nearby: nearby)
    }

    private static func encodeSummary(_ item: GPSCourseSummary) -> [String: Any] {
        [
            "course_id": item.courseId,
            "club_code": item.clubCode,
            "club_name": item.clubName,
            "course": item.course,
            "label": item.label,
            "course_key": item.courseKey,
            "holes_cached": item.holesCached,
            "mine": item.mine,
            "distance_km": item.distanceKm as Any,
            "course_label": item.courseLabel as Any,
            "club_course_count": item.clubCourseCount as Any,
            "display_name": item.displayName as Any
        ]
    }

    private static func decodeSummary(_ json: [String: Any]) -> GPSCourseSummary? {
        guard let id = json["course_id"] as? String else { return nil }
        return GPSCourseSummary(
            courseId: id,
            clubCode: json["club_code"] as? String ?? "",
            clubName: json["club_name"] as? String ?? "",
            course: json["course"] as? String ?? "",
            label: json["label"] as? String ?? json["course"] as? String ?? "",
            courseKey: json["course_key"] as? String ?? "",
            holesCached: JSONFlex.int(from: json["holes_cached"]) ?? 0,
            mine: JSONFlex.bool(from: json["mine"]) ?? false,
            distanceKm: JSONFlex.double(from: json["distance_km"]),
            courseLabel: json["course_label"] as? String,
            clubCourseCount: JSONFlex.int(from: json["club_course_count"]),
            displayName: json["display_name"] as? String
        )
    }

    private static func encodeDetail(_ detail: GPSCourseDetail) -> [String: Any] {
        [
            "course_id": detail.courseId,
            "club_code": detail.clubCode,
            "club_name": detail.clubName,
            "course": detail.course,
            "course_key": detail.courseKey,
            "par": detail.par,
            "hole_count": detail.holeCount,
            "warnings": detail.warnings,
            "attribution": detail.attribution as Any,
            "holes": detail.holes.map { hole -> [String: Any] in
                [
                    "number": hole.number,
                    "par": hole.par,
                    "hcp": hole.hcp as Any,
                    "yards": hole.yards,
                    "tee": encodeCoord(hole.tee) as Any,
                    "green": [
                        "front": encodeCoord(hole.green.front) as Any,
                        "center": encodeCoord(hole.green.center) as Any,
                        "back": encodeCoord(hole.green.back) as Any
                    ]
                ]
            }
        ]
    }

    private static func decodeDetail(_ json: [String: Any]) -> GPSCourseDetail? {
        guard let id = json["course_id"] as? String else { return nil }
        let holes = (json["holes"] as? [[String: Any]] ?? []).compactMap { hole -> GPSHole? in
            guard let number = JSONFlex.int(from: hole["number"]) else { return nil }
            let green = hole["green"] as? [String: Any] ?? [:]
            return GPSHole(
                number: number,
                par: JSONFlex.int(from: hole["par"]) ?? 4,
                hcp: JSONFlex.int(from: hole["hcp"]),
                yards: (hole["yards"] as? [String: Int]) ?? [:],
                green: GPSGreen(
                    front: decodeCoord(green["front"]),
                    center: decodeCoord(green["center"]),
                    back: decodeCoord(green["back"])
                ),
                tee: decodeCoord(hole["tee"])
            )
        }
        return GPSCourseDetail(
            courseId: id,
            clubCode: json["club_code"] as? String ?? "",
            clubName: json["club_name"] as? String ?? "",
            course: json["course"] as? String ?? "",
            courseKey: json["course_key"] as? String ?? "",
            par: JSONFlex.int(from: json["par"]) ?? 72,
            holeCount: JSONFlex.int(from: json["hole_count"]) ?? holes.count,
            holes: holes,
            warnings: json["warnings"] as? [String] ?? [],
            attribution: json["attribution"] as? String
        )
    }

    private static func encodeStrategy(_ strategy: CourseStrategy) -> [String: Any] {
        [
            "course_id": strategy.courseId,
            "course_key": strategy.courseKey,
            "overview": strategy.overview as Any,
            "published_holes": strategy.publishedHoles,
            "holes": strategy.holes.map { hole -> [String: Any] in
                [
                    "hole": hole.hole,
                    "plan_title": hole.planTitle as Any,
                    "plan_text": hole.planText as Any,
                    "tee_club": hole.teeClub as Any
                ]
            }
        ]
    }

    private static func decodeStrategy(_ json: [String: Any]) -> CourseStrategy? {
        guard let id = json["course_id"] as? String else { return nil }
        let holes = (json["holes"] as? [[String: Any]] ?? []).compactMap { hole -> HoleStrategy? in
            guard let number = JSONFlex.int(from: hole["hole"]) else { return nil }
            return HoleStrategy(
                hole: number,
                planTitle: hole["plan_title"] as? String,
                planText: hole["plan_text"] as? String,
                teeClub: hole["tee_club"] as? String,
                teeTarget: nil,
                target: nil,
                hazards: [],
                why: nil,
                missSide: nil,
                missNote: nil,
                greenSlope: nil,
                greenLeave: nil,
                greenNotes: nil,
                variants: [:],
                publishedAt: nil
            )
        }
        return CourseStrategy(
            courseId: id,
            courseKey: json["course_key"] as? String ?? "",
            overview: json["overview"] as? String,
            overviewPublishedAt: nil,
            publishedHoles: (json["published_holes"] as? [Int]) ?? holes.map(\.hole),
            holes: holes
        )
    }

    private static func encodeCoord(_ coord: GPSCoord?) -> [String: Any]? {
        guard let coord else { return nil }
        return ["lat": coord.lat, "lng": coord.lng]
    }

    private static func decodeCoord(_ raw: Any?) -> GPSCoord? {
        guard let json = raw as? [String: Any],
              let lat = JSONFlex.double(from: json["lat"]),
              let lng = JSONFlex.double(from: json["lng"])
        else { return nil }
        return GPSCoord(lat: lat, lng: lng)
    }
}
