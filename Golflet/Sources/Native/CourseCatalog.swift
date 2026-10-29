import Foundation

enum CourseCatalog {
    static var sourceOverride: (@Sendable () async -> [GPSCourseSummary])?

    static func summaries(api: (any GolfletAPI)? = nil) async -> [GPSCourseSummary] {
        if let sourceOverride {
            return await sourceOverride()
        }
        if let remote = await fetchRemote(api: api) {
            CourseCache.saveList(remote)
            return merge(remote)
        }
        return merge(CourseCache.loadList())
    }

    static func entities(api: (any GolfletAPI)? = nil) async -> [GolfletCourseEntity] {
        await summaries(api: api).map(GolfletCourseEntity.init(summary:))
    }

    static func merge(_ list: GPSCourseList?) -> [GPSCourseSummary] {
        guard let list else { return [] }
        var seen = Set<String>()
        var result: [GPSCourseSummary] = []
        result.reserveCapacity(list.courses.count + list.nearby.count)
        for item in list.courses + list.nearby {
            if seen.insert(item.courseId).inserted {
                result.append(item)
            }
        }
        return result
    }

    static func matching(_ needle: String, in items: [GolfletCourseEntity]) -> [GolfletCourseEntity] {
        let folded = ClubPhrase.fold(needle)
        guard !folded.isEmpty else { return items }
        return items.filter {
            ClubPhrase.fold($0.label).contains(folded)
                || ClubPhrase.fold($0.clubName).contains(folded)
                || ClubPhrase.fold($0.courseName).contains(folded)
                || ClubPhrase.fold($0.clubCode).contains(folded)
                || ClubPhrase.fold($0.id).contains(folded)
        }
    }

    static func grouped(_ items: [GPSCourseSummary]) -> [ClubCourseGroup] {
        CourseGroups.make(items)
    }

    private static func fetchRemote(api: (any GolfletAPI)?) async -> GPSCourseList? {
        do {
            return try await (api ?? APIFactory.make()).gpsCourses(lat: nil, lng: nil)
        } catch {
            return nil
        }
    }
}
