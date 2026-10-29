import Foundation

enum ProfesoresAPIPaths {
    static let list = "/api/profesores"
    static let search = "/api/profesores/search"
    static let match = "/api/profesores/match"
    static let matchAnswers = "/api/profesores/match/answers"

    static func detail(_ id: String) -> String {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return "/api/profesores/\(encoded)"
    }

    static func searchQuery(_ query: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        let encoded = query.addingPercentEncoding(withAllowedCharacters: allowed) ?? query
        return "\(search)?q=\(encoded)"
    }
}

enum ProfesoresParser {
    static func searchResults(from json: [String: Any]) -> [Profesor] {
        list(from: json, defaultLinked: false)
    }

    static func list(from json: [String: Any], defaultLinked: Bool = true) -> [Profesor] {
        if let items = array(json["profesores"])
            ?? array(object(json["inicio"])?["profesores"])
            ?? array(json["teachers"])
            ?? array(json["items"]) {
            return items.compactMap { profesor(from: $0, defaultLinked: defaultLinked) }
        }
        if let one = profesor(from: json["profesor"]
            ?? json["teacher"]
            ?? object(json["inicio"])?["profesor"]
            ?? object(json["inicio"])?["teacher"], defaultLinked: defaultLinked) {
            return [one]
        }
        return []
    }

    static func profesor(from raw: Any?, defaultLinked: Bool = true) -> Profesor? {
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
            newContent: JSONFlex.int(from: blob["new_content"]) ?? 0,
            linked: JSONFlex.bool(from: blob["linked"] ?? blob["is_linked"]) ?? defaultLinked,
            matricula: optionalString(blob["matricula"] ?? blob["license"] ?? blob["reg"])
        )
    }

    static func addBody(id: String, source: String?) -> [String: Any] {
        var body: [String: Any] = ["profesor_id": id]
        if let source, !source.isEmpty { body["source"] = source }
        return body
    }

    static func matchAnswers(from json: [String: Any]) -> ProfesorMatchAnswers {
        let blob = object(json["answers"]) ?? json
        let availabilityRaw = object(blob["availability"]) ?? [:]
        var availability: [String: [String]] = [:]
        for (day, value) in availabilityRaw {
            availability[day] = strings(value)
        }
        return ProfesorMatchAnswers(
            availability: availability,
            hcp: JSONFlex.double(from: blob["hcp"] ?? blob["handicap"]),
            playFreq: optionalString(blob["play_freq"] ?? blob["playFreq"]),
            locations: strings(blob["locations"]),
            budget: optionalString(blob["budget"]),
            classFreq: optionalString(blob["class_freq"] ?? blob["classFreq"]),
            suggestedHcp: JSONFlex.double(from: json["suggested_hcp"] ?? blob["suggested_hcp"]),
            locationChoices: strings(json["locations"] ?? json["location_choices"])
        )
    }

    static func matchAnswersBody(_ answers: ProfesorMatchAnswers) -> [String: Any] {
        var body: [String: Any] = [
            "availability": answers.availability,
            "locations": answers.locations
        ]
        if let hcp = answers.hcp { body["hcp"] = hcp }
        if let playFreq = answers.playFreq { body["play_freq"] = playFreq }
        if let budget = answers.budget { body["budget"] = budget }
        if let classFreq = answers.classFreq { body["class_freq"] = classFreq }
        return body
    }

    static func matches(from json: [String: Any]) -> [ProfesorMatch] {
        let rows = array(json["matches"]) ?? array(json["profesores"]) ?? []
        return rows.compactMap { raw in
            guard let item = raw as? [String: Any], let profesor = profesor(from: item, defaultLinked: false) else { return nil }
            return ProfesorMatch(
                profesor: profesor,
                reasons: strings(item["reasons"] ?? item["why"]),
                priceMin: JSONFlex.int(from: item["price_min"] ?? item["priceMin"]),
                priceMax: JSONFlex.int(from: item["price_max"] ?? item["priceMax"])
            )
        }
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
