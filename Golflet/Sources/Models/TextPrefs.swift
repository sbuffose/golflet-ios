import Foundation

enum TextSizePref: String, CaseIterable, Identifiable, Codable, Sendable {
    case normal
    case large
    case extraLarge = "xl"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .normal: return "Normal"
        case .large: return "Grande"
        case .extraLarge: return "Muy grande"
        }
    }

    var multiplier: CGFloat {
        switch self {
        case .normal: return 1.00
        case .large: return 1.15
        case .extraLarge: return 1.30
        }
    }

    var apiValue: String { rawValue }

    static func parse(_ raw: Any?) -> TextSizePref? {
        if let number = JSONFlex.double(from: raw) {
            if number >= 1.24 || number >= 124 { return .extraLarge }
            if number >= 1.08 || number >= 108 { return .large }
            if number > 0 { return .normal }
        }
        let value = string(raw)
        switch value {
        case "normal", "default", "md", "100", "1", "1.0", "1.00":
            return .normal
        case "large", "grande", "lg", "115", "1.15":
            return .large
        case "xl", "extra_large", "extralarge", "extra-large", "muy_grande", "muy-grande", "xxx", "130", "1.3", "1.30":
            return .extraLarge
        default:
            return nil
        }
    }
}

enum TextWeightPref: String, CaseIterable, Identifiable, Codable, Sendable {
    case normal
    case marked

    var id: String { rawValue }

    var title: String {
        switch self {
        case .normal: return "Normal"
        case .marked: return "Más marcado"
        }
    }

    var apiValue: String { rawValue }

    static func parse(_ raw: Any?) -> TextWeightPref? {
        if let flag = JSONFlex.bool(from: raw) {
            return flag ? .marked : .normal
        }
        let value = string(raw)
        switch value {
        case "normal", "regular", "default":
            return .normal
        case "marked", "bold", "semibold", "heavy", "more", "mas_marcado", "más_marcado", "mas-marcado":
            return .marked
        default:
            return nil
        }
    }
}

enum TextRole: Sendable {
    case body
    case title
    case hero

    var extraFactor: CGFloat {
        switch self {
        case .body: return 1.00
        case .title: return 0.70
        case .hero: return 0.40
        }
    }

    static func infer(base: CGFloat) -> TextRole {
        if base >= 56 { return .hero }
        if base >= 28 { return .title }
        return .body
    }
}

struct TextPrefs: Hashable, Codable, Sendable {
    var size: TextSizePref = .normal
    var weight: TextWeightPref = .normal

    static let `default` = TextPrefs()
    static let minCombined: CGFloat = 0.92
    static let maxCombined: CGFloat = 1.50

    var signature: String { "\(size.rawValue)|\(weight.rawValue)" }

    func scaledSize(_ base: CGFloat, dynamic: CGFloat = 1, role: TextRole? = nil) -> CGFloat {
        let combined = min(Self.maxCombined, max(Self.minCombined, size.multiplier * dynamic))
        let factor = (role ?? TextRole.infer(base: base)).extraFactor
        let applied = 1 + (combined - 1) * factor
        return (base * applied * 10).rounded() / 10
    }
}

enum TextPrefsRuntime {
    static var current = TextPrefs.default
    static var dynamicMultiplier: CGFloat = 1
}

enum TextPrefsStore {
    static let key = "golflet.textPrefs"

    static func load(defaults: UserDefaults = .standard) -> TextPrefs {
        if let testing = RuntimeFlags.testingTextPrefs { return testing }
        guard let data = defaults.data(forKey: key),
              let prefs = try? JSONDecoder().decode(TextPrefs.self, from: data)
        else { return .default }
        return prefs
    }

    static func save(_ prefs: TextPrefs, defaults: UserDefaults = .standard) {
        if RuntimeFlags.isUITesting { return }
        if let data = try? JSONEncoder().encode(prefs) {
            defaults.set(data, forKey: key)
        }
    }
}

enum TextPrefsParser {
    static let listPath = "/api/me/settings"

    static func prefs(from json: [String: Any]) -> TextPrefs? {
        let blobs: [[String: Any]] = [
            json,
            json["settings"] as? [String: Any],
            json["user"] as? [String: Any],
            json["me"] as? [String: Any],
            (json["user"] as? [String: Any])?["settings"] as? [String: Any],
            (json["inicio"] as? [String: Any])
        ].compactMap { $0 }

        var parsed = TextPrefs.default
        var found = false
        for blob in blobs {
            if let size = TextSizePref.parse(
                blob["text_size"] ?? blob["textSize"] ?? blob["font_size"] ?? blob["type_size"] ?? blob["size"]
            ) {
                parsed.size = size
                found = true
            }
            if let weight = TextWeightPref.parse(
                blob["text_weight"] ?? blob["textWeight"] ?? blob["font_weight"] ?? blob["type_weight"] ?? blob["weight"]
            ) {
                parsed.weight = weight
                found = true
            }
        }
        return found ? parsed : nil
    }

    static func jsonBody(_ prefs: TextPrefs) -> [String: Any] {
        [
            "text_size": prefs.size.apiValue,
            "text_weight": prefs.weight.apiValue
        ]
    }
}

private func string(_ raw: Any?) -> String {
    if let value = raw as? String {
        return value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }
    if let value = raw as? Int { return String(value) }
    if let value = raw as? Double { return String(value) }
    return ""
}
