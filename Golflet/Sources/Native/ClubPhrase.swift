import Foundation

enum ClubPhrase {
    static func code(for phrase: String) -> String {
        ClubCode.code(for: phrase.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    static func matchesCourse(_ hint: String, name: String, club: String, courseId: String) -> Bool {
        let needle = fold(hint)
        guard !needle.isEmpty else { return false }
        return fold(name).contains(needle)
            || fold(club).contains(needle)
            || fold(courseId).contains(needle)
    }

    static func fold(_ raw: String) -> String {
        raw.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
    }
}
