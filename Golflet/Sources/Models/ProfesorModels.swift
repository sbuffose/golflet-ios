import Foundation

struct Profesor: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var photoURL: String?
    var verified: Bool
    var locations: [String]
    var bio: String?
    var pending: Bool
    var canViewMetrics: Bool
    var canHearAudio: Bool
    var newContent: Int

    var initials: String {
        let letters = GroupsParser.initials(name)
        return letters.isEmpty ? "P" : letters
    }

    var locationsLine: String? {
        let shown = locations
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(2)
        return shown.isEmpty ? nil : shown.joined(separator: " · ")
    }
}

enum ProfesorSearch {
    static func matches(_ query: String, in catalog: [Profesor]) -> [Profesor] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard needle.count >= 2 else { return [] }
        return catalog.filter {
            $0.name.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
        }
    }
}
