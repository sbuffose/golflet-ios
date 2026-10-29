import Foundation

public struct WidgetSnapshot: Hashable, Codable, Sendable {
    public var handicap: Double
    public var lastGross: Int?
    public var lastNet: Int?
    public var lastCourse: String?
    public var lastRoundId: String?
    public var lastDate: String?
    public var nextCourse: String?
    public var nextWhen: String?
    public var nextDeepLink: String?

    public init(
        handicap: Double,
        lastGross: Int? = nil,
        lastNet: Int? = nil,
        lastCourse: String? = nil,
        lastRoundId: String? = nil,
        lastDate: String? = nil,
        nextCourse: String? = nil,
        nextWhen: String? = nil,
        nextDeepLink: String? = nil
    ) {
        self.handicap = handicap
        self.lastGross = lastGross
        self.lastNet = lastNet
        self.lastCourse = lastCourse
        self.lastRoundId = lastRoundId
        self.lastDate = lastDate
        self.nextCourse = nextCourse
        self.nextWhen = nextWhen
        self.nextDeepLink = nextDeepLink
    }

    public static let placeholder = WidgetSnapshot(handicap: 0)

    public var isPlaceholder: Bool {
        lastCourse == nil && nextCourse == nil && lastGross == nil
    }

    public var lastLine: String {
        guard let course = lastCourse else { return "Todavía no hay rondas" }
        var score = ""
        if let lastGross {
            score = "\(lastGross)"
            if let lastNet { score += " / \(lastNet)" }
        }
        if score.isEmpty { return course }
        return "\(score) · \(course)"
    }

    public var handicapLine: String {
        KitFormat.one(handicap)
    }

    public var lastRoundURL: URL? {
        guard let lastRoundId else { return nil }
        return URL(string: "golflet://round/\(lastRoundId)")
    }

    public var nextRoundURL: URL? {
        nextDeepLink.flatMap(URL.init(string:))
    }

    /// Lightweight `/api/data` parse for the widget timeline. The extension
    /// has no App Group, so it cannot reuse the app session — 401 is expected
    /// until the portal group exists and the token can be shared.
    public static func parseAPI(_ data: Data) -> WidgetSnapshot? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        let player = json["player"] as? [String: Any]
        let handicap = jsonNumber(player?["handicap_index"])
            ?? jsonNumber((json["hi_history"] as? [[String: Any]])?.last?["hi"])
            ?? 0
        let rounds = json["rounds"] as? [[String: Any]] ?? []
        let last = rounds.first
        let course = string(last?["course_label"]) ?? string(last?["course"])
        let date = string(last?["date"]).flatMap(shortDate)
        return WidgetSnapshot(
            handicap: handicap,
            lastGross: jsonInt(last?["gross"]),
            lastNet: jsonInt(last?["net"]),
            lastCourse: course,
            lastRoundId: string(last?["round_id"]) ?? string(last?["id"]),
            lastDate: date
        )
    }

    private static func string(_ raw: Any?) -> String? {
        guard let value = raw as? String else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func jsonNumber(_ raw: Any?) -> Double? {
        if let number = raw as? Double { return number }
        if let number = raw as? Int { return Double(number) }
        if let number = raw as? NSNumber { return number.doubleValue }
        if let text = raw as? String { return Double(text.replacingOccurrences(of: ",", with: ".")) }
        return nil
    }

    private static func jsonInt(_ raw: Any?) -> Int? {
        if let number = raw as? Int { return number }
        if let number = raw as? Double { return Int(number.rounded()) }
        if let number = raw as? NSNumber { return number.intValue }
        if let text = raw as? String { return Int(text) }
        return nil
    }

    private static func shortDate(_ raw: String) -> String? {
        let iso = DateFormatter()
        iso.locale = Locale(identifier: "en_US_POSIX")
        iso.timeZone = TimeZone(secondsFromGMT: 0)
        iso.dateFormat = "yyyy-MM-dd"
        guard let date = iso.date(from: String(raw.prefix(10))) else { return raw }
        let day = DateFormatter()
        day.locale = Locale(identifier: "es_AR")
        day.dateFormat = "d"
        let month = DateFormatter()
        month.locale = Locale(identifier: "es_AR")
        month.dateFormat = "MMM"
        let monthText = month.string(from: date).replacingOccurrences(of: ".", with: "").uppercased()
        return "\(day.string(from: date)) \(monthText)"
    }
}
