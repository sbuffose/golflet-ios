import Foundation

enum TeeTimesAPIPaths {
    static let list = "/api/tee-times"
    static let current = "/api/tee-times/current"
}

enum TeeTimesParser {
    static func list(from json: [String: Any]) -> [TeeTime] {
        let raw = json["tee_times"]
            ?? json["teeTimes"]
            ?? json["bookings"]
            ?? json["upcoming"]
            ?? json["items"]
            ?? json["data"]
        return parseList(raw).sorted { $0.startsAt < $1.startsAt }
    }

    static func parseList(_ raw: Any?) -> [TeeTime] {
        if let items = raw as? [Any] {
            return items.compactMap(parse(_:))
        }
        if let item = raw as? [String: Any] {
            if let nested = item["tee_times"]
                ?? item["teeTimes"]
                ?? item["bookings"]
                ?? item["upcoming"]
                ?? item["items"]
                ?? item["data"] {
                return parseList(nested)
            }
            if let single = parse(item) { return [single] }
        }
        return []
    }

    static func parse(_ raw: Any?) -> TeeTime? {
        guard let item = raw as? [String: Any] else { return nil }
        let club = firstNonEmpty(
            string(item["club_name"]),
            string(item["clubName"]),
            string(item["club"]),
            string((item["club"] as? [String: Any])?["name"])
        )
        let course = firstNonEmpty(
            string(item["course"]),
            string(item["course_name"]),
            string(item["course_label"]),
            string(item["courseName"])
        )
        guard let startsAt = parseStarts(item) else { return nil }
        let id = firstNonEmpty(
            string(item["id"]),
            string(item["tee_time_id"]),
            string(item["booking_id"]),
            string(item["reservation_id"]),
            "\(club)-\(Int(startsAt.timeIntervalSince1970))"
        )
        return TeeTime(
            id: id,
            startsAt: startsAt,
            clubName: club.isEmpty ? "Club" : club,
            clubCode: firstNonEmpty(string(item["club_code"]), string(item["clubCode"]), string((item["club"] as? [String: Any])?["code"])),
            course: course,
            companions: companions(from: item["companions"] ?? item["partners"] ?? item["players"] ?? item["playing_partners"])
        )
    }

    static func companions(from raw: Any?) -> [String] {
        if let names = raw as? [String] {
            return names.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        }
        if let items = raw as? [Any] {
            return items.compactMap { item -> String? in
                if let name = item as? String {
                    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    return trimmed.isEmpty ? nil : trimmed
                }
                guard let map = item as? [String: Any] else { return nil }
                let joined = [string(map["first_name"]), string(map["last_name"])]
                    .filter { !$0.isEmpty }
                    .joined(separator: " ")
                let name = firstNonEmpty(
                    string(map["name"]),
                    string(map["display_name"]),
                    string(map["full_name"]),
                    joined
                )
                return name.isEmpty ? nil : name
            }
        }
        if let csv = raw as? String {
            return csv.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        }
        return []
    }

    private static func parseStarts(_ item: [String: Any]) -> Date? {
        if let date = parseDateTime(item["starts_at"] ?? item["start_at"] ?? item["startsAt"] ?? item["tee_time"] ?? item["datetime"] ?? item["scheduled_at"] ?? item["when"]) {
            return date
        }
        guard let day = parseDay(item["date"] ?? item["day"]) else { return nil }
        guard let clock = parseClock(item["time"] ?? item["hour"] ?? item["starts"]) else { return day }
        var parts = Calendar.gregorian.dateComponents([.year, .month, .day], from: day)
        parts.hour = clock.hour
        parts.minute = clock.minute
        parts.second = clock.second
        return Calendar.gregorian.date(from: parts) ?? day
    }

    private static func parseDay(_ raw: Any?) -> Date? {
        if let date = raw as? Date { return date }
        guard let text = optionalString(raw) else { return nil }
        if let d = DayStamp.parse(text) { return d }
        return parseDateTime(text)
    }

    private static func parseClock(_ raw: Any?) -> (hour: Int, minute: Int, second: Int)? {
        if let text = optionalString(raw) {
            let parts = text.split(separator: ":")
            guard let hour = parts.first.flatMap({ Int($0) }) else { return nil }
            let minute = parts.count > 1 ? Int(parts[1]) ?? 0 : 0
            let second = parts.count > 2 ? Int(parts[2]) ?? 0 : 0
            return (hour, minute, second)
        }
        if let hour = JSONFlex.int(from: raw) {
            return (hour, 0, 0)
        }
        return nil
    }

    private static func parseDateTime(_ raw: Any?) -> Date? {
        if let date = raw as? Date { return date }
        guard let text = optionalString(raw) else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: text) { return d }
        iso.formatOptions = [.withInternetDateTime]
        if let d = iso.date(from: text) { return d }
        return DayStamp.parse(text)
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

    private static func firstNonEmpty(_ values: String...) -> String {
        values.first { !$0.isEmpty } ?? ""
    }
}
