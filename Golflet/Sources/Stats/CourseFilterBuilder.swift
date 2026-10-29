import Foundation

enum CourseFilterBuilder {
    static func from(courses: [Course], clubs: [LinkedClub], rounds: [Round]) -> [CourseFilter] {
        let groups = CourseGroups.make(from: courses)
        if !groups.isEmpty {
            return groups.map { group in
                CourseFilter(
                    id: group.groupingKey,
                    title: group.clubName.isEmpty ? group.clubCode : group.clubName,
                    courseNames: group.courses.map(\.name),
                    kind: .group
                )
            }
        }
        var buckets: [String: [String]] = [:]
        var order: [String] = []
        for round in rounds where !round.isOtherCourse {
            let key = round.clubCode.isEmpty ? round.clubName : round.clubCode
            guard !key.isEmpty else { continue }
            if buckets[key] == nil {
                order.append(key)
                buckets[key] = []
            }
            let name = round.displayCourse
            if buckets[key]?.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) != true {
                buckets[key]?.append(name)
            }
        }
        return order.compactMap { key in
            guard let names = buckets[key], !names.isEmpty else { return nil }
            let title = clubs.first { $0.code == key }?.name ?? rounds.first { $0.clubCode == key }?.clubName ?? key
            return CourseFilter(id: key, title: title, courseNames: names, kind: .group)
        }
    }
}
