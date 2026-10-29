import Foundation

enum ProfesoresAPIPaths {
    static let list = "/api/profesores"

    static func detail(_ id: String) -> String { "/api/profesores/\(id)" }
}

enum ProfesoresParser {
    static func list(from json: [String: Any]) -> [Profesor] {
        if let items = array(json["profesores"])
            ?? array(object(json["inicio"])?["profesores"])
            ?? array(json["teachers"])
            ?? array(json["items"]) {
            return items.compactMap { profesor(from: $0) }
        }
        if let one = profesor(from: json["profesor"]
            ?? json["teacher"]
            ?? object(json["inicio"])?["profesor"]
            ?? object(json["inicio"])?["teacher"]) {
            return [one]
        }
        return []
    }

    static func profesor(from raw: Any?) -> Profesor? {
        guard let item = raw as? [String: Any] else { return nil }
        let blob = item["profesor"] as? [String: Any] ?? item
        let id = string(blob["profesor_id"] ?? blob["id"] ?? blob["teacher_id"] ?? item["profesor_id"])
        let name = string(blob["name"] ?? blob["display_name"] ?? blob["full_name"])
        guard !id.isEmpty, !name.isEmpty else { return nil }
        return Profesor(
            id: id,
            name: name,
            photoURL: optionalString(blob["photo_url"] ?? blob["photo"] ?? blob["avatar_url"] ?? blob["image_url"]),
            verified: JSONFlex.bool(from: blob["verified"] ?? blob["is_verified"]) ?? false,
            locations: strings(blob["locations"] ?? blob["clubs"] ?? blob["clubes"]),
            bio: optionalString(blob["bio"] ?? blob["about"]),
            pending: JSONFlex.bool(from: blob["pending"]) ?? false,
            canViewMetrics: JSONFlex.bool(from: blob["can_view_metrics"]) ?? false,
            canHearAudio: JSONFlex.bool(from: blob["can_hear_audio"]) ?? false,
            newContent: JSONFlex.int(from: blob["new_content"]) ?? 0
        )
    }

    private static func array(_ raw: Any?) -> [Any]? {
        raw as? [Any]
    }

    private static func object(_ raw: Any?) -> [String: Any]? {
        raw as? [String: Any]
    }

    private static func string(_ raw: Any?) -> String {
        if let value = raw as? String { return value.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let value = raw as? Int { return String(value) }
        return ""
    }

    private static func optionalString(_ raw: Any?) -> String? {
        let value = string(raw)
        return value.isEmpty ? nil : value
    }

    private static func strings(_ raw: Any?) -> [String] {
        if let items = raw as? [Any] {
            return items.compactMap { optionalString($0) }
        }
        if let value = optionalString(raw) {
            return [value]
        }
        return []
    }
}
