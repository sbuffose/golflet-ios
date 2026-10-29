import Foundation

enum CourseDisplay {
    static func isSlug(_ raw: String, courseId: String? = nil) -> Bool {
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.isEmpty { return true }
        if let courseId, value.caseInsensitiveCompare(courseId) == .orderedSame { return true }
        if value.range(of: #"^\d+-[a-z0-9-]+$"#, options: .regularExpression) != nil { return true }
        if value.range(of: #"^club-\d+-"#, options: [.regularExpression, .caseInsensitive]) != nil { return true }
        return false
    }

    static func human(_ raw: String?, courseId: String? = nil) -> String? {
        guard let raw else { return nil }
        let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !isSlug(value, courseId: courseId) else { return nil }
        return value
    }

    static func clubFallback(_ code: String) -> String {
        let trimmed = code.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Club" : "Club \(trimmed)"
    }

    static func clubTitle(code: String, name: String, displayName: String? = nil, courseId: String? = nil) -> String {
        if let name = human(name, courseId: courseId) { return name }
        if let display = human(displayName, courseId: courseId), !display.contains("·") {
            return display
        }
        return clubFallback(code)
    }

    static func clubTitle(_ item: GPSCourseSummary) -> String {
        clubTitle(code: item.clubCode, name: item.clubName, displayName: item.displayName, courseId: item.courseId)
    }

    static func courseTitle(
        name: String,
        label: String = "",
        courseLabel: String? = nil,
        displayName: String? = nil,
        clubCode: String,
        clubName: String,
        courseId: String? = nil
    ) -> String {
        if let value = human(courseLabel, courseId: courseId) { return value }
        if let value = human(name, courseId: courseId) { return value }
        if let value = human(label, courseId: courseId) { return value }
        if let value = human(displayName, courseId: courseId) {
            if let part = value.split(separator: "·").last {
                let trimmed = part.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
            return value
        }
        return clubTitle(code: clubCode, name: clubName, displayName: displayName, courseId: courseId)
    }

    static func courseTitle(_ item: GPSCourseSummary) -> String {
        courseTitle(
            name: item.course,
            label: item.label,
            courseLabel: item.courseLabel,
            displayName: item.displayName,
            clubCode: item.clubCode,
            clubName: item.clubName,
            courseId: item.courseId
        )
    }

    static func fullName(_ item: GPSCourseSummary) -> String {
        if let value = human(item.displayName, courseId: item.courseId) { return value }
        let club = clubTitle(item)
        let course = courseTitle(item)
        if club.caseInsensitiveCompare(course) == .orderedSame { return club }
        return "\(club) · \(course)"
    }
}

struct ClubCourseGroup: Identifiable, Hashable {
    var id: String { groupingKey }
    var groupingKey: String
    var clubCode: String
    var clubName: String
    var distanceKm: Double?
    var courses: [GPSCourseSummary]

    var isSingle: Bool { courses.count == 1 }

    var courseCount: Int { courses.first?.clubCourseCount ?? courses.count }
}

struct ClubStatsGroup: Identifiable, Hashable {
    var id: String { groupingKey }
    var groupingKey: String
    var clubCode: String
    var clubName: String
    var courses: [Course]

    var isSingle: Bool { courses.count == 1 }
}

enum CourseGroups {
    static func make(_ items: [GPSCourseSummary]) -> [ClubCourseGroup] {
        var buckets: [String: [GPSCourseSummary]] = [:]
        var order: [String] = []
        for item in items {
            let key = key(code: item.clubCode, name: item.clubName, fallback: item.courseId)
            if buckets[key] == nil {
                order.append(key)
                buckets[key] = []
            }
            buckets[key]?.append(item)
        }
        return order.compactMap { key in
            guard var courses = buckets[key], !courses.isEmpty else { return nil }
            courses.sort {
                CourseDisplay.courseTitle($0).localizedStandardCompare(CourseDisplay.courseTitle($1)) == .orderedAscending
            }
            let first = courses[0]
            return ClubCourseGroup(
                groupingKey: key,
                clubCode: first.clubCode,
                clubName: CourseDisplay.clubTitle(first),
                distanceKm: courses.compactMap(\.distanceKm).min(),
                courses: courses
            )
        }
    }

    static func make(from courses: [Course]) -> [ClubStatsGroup] {
        var buckets: [String: [Course]] = [:]
        var order: [String] = []
        for course in courses where CourseDisplay.human(course.name) != nil || !course.clubCode.isEmpty || !course.clubName.isEmpty {
            let key = key(code: course.clubCode, name: course.clubName, fallback: course.id)
            if buckets[key] == nil {
                order.append(key)
                buckets[key] = []
            }
            buckets[key]?.append(course)
        }
        return order.compactMap { key in
            guard var list = buckets[key], !list.isEmpty else { return nil }
            list.sort {
                CourseDisplay.courseTitle(name: $0.name, clubCode: $0.clubCode, clubName: $0.clubName)
                    .localizedStandardCompare(
                        CourseDisplay.courseTitle(name: $1.name, clubCode: $1.clubCode, clubName: $1.clubName)
                    ) == .orderedAscending
            }
            let first = list[0]
            return ClubStatsGroup(
                groupingKey: key,
                clubCode: first.clubCode,
                clubName: CourseDisplay.clubTitle(code: first.clubCode, name: first.clubName),
                courses: list
            )
        }
    }

    private static func key(code: String, name: String, fallback: String) -> String {
        let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedCode.isEmpty { return trimmedCode }
        if let human = CourseDisplay.human(name) { return "name-\(human)" }
        return "id-\(fallback)"
    }
}
