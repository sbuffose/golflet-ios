import Foundation

enum PaceAPIPaths {
    static let settings = "/api/me/settings"
    static let settingsAlt = "/api/settings"
    static let pace = "/api/pace"
}

enum PaceParser {
    static func settings(from json: [String: Any]) -> PlaySettings {
        let blob = json["settings"] as? [String: Any] ?? json["me"] as? [String: Any] ?? json
        let alerts = blob["alerts"] as? [String: Any]
        let value = JSONFlex.bool(from: blob["pace_alert"]
            ?? blob["pace_alert_enabled"]
            ?? blob["paceAlert"]
            ?? alerts?["pace"]
            ?? alerts?["pace_alert"])
        return PlaySettings(paceAlertEnabled: value ?? true)
    }

    static func pace(from json: [String: Any], players: Int? = nil, modality: String? = nil) -> PaceConfig {
        let blob = json["pace"] as? [String: Any] ?? json
        let byPlayers = blob["by_players"] as? [String: Any] ?? blob["players"] as? [String: Any]
        let byModality = blob["by_modality"] as? [String: Any] ?? blob["modalities"] as? [String: Any]
        var minutes = JSONFlex.double(from: blob["minutes_per_hole"] ?? blob["minutesPerHole"] ?? json["minutes_per_hole"])
        if minutes == nil, let players, let value = JSONFlex.double(from: byPlayers?["\(players)"]) {
            minutes = value
        }
        if minutes == nil, let modality {
            minutes = JSONFlex.double(from: byModality?[modality.lowercased()] ?? byModality?[modality])
        }
        return PaceConfig(
            minutesPerHole: minutes ?? PaceConfig.fallbackMinutes,
            players: players ?? JSONFlex.int(from: blob["players"]),
            modality: modality ?? optionalString(blob["modality"] ?? blob["format"]),
            source: minutes == nil ? "fallback" : "api"
        )
    }

    static func minutesPerHole(from course: [String: Any]) -> Double? {
        let pace = course["pace"] as? [String: Any]
        return JSONFlex.double(from: course["minutes_per_hole"] ?? pace?["minutes_per_hole"])
    }

    private static func optionalString(_ raw: Any?) -> String? {
        if let value = raw as? String {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? nil : trimmed
        }
        return nil
    }
}

extension LiveGolfletAPI {
    func playSettings() async throws -> PlaySettings {
        if let json = try? await request("GET", PaceAPIPaths.settings) {
            return PaceParser.settings(from: json)
        }
        let json = try await request("GET", PaceAPIPaths.settingsAlt)
        return PaceParser.settings(from: json)
    }

    func savePlaySettings(_ settings: PlaySettings) async throws -> PlaySettings {
        let body = ["pace_alert": settings.paceAlertEnabled]
        if let json = try? await request("PATCH", PaceAPIPaths.settings, body: body) {
            return PaceParser.settings(from: json)
        }
        if let json = try? await request("PATCH", PaceAPIPaths.settingsAlt, body: body) {
            return PaceParser.settings(from: json)
        }
        return settings
    }

    func paceConfig(courseId: String?, clubCode: String?, players: Int?, modality: String?) async throws -> PaceConfig {
        var query: [String] = []
        if let courseId {
            query.append("course_id=\(courseId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? courseId)")
        }
        if let clubCode {
            query.append("club_code=\(clubCode.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? clubCode)")
        }
        if let players { query.append("players=\(players)") }
        if let modality {
            query.append("modality=\(modality.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? modality)")
        }
        let suffix = query.isEmpty ? "" : "?\(query.joined(separator: "&"))"
        do {
            let json = try await request("GET", PaceAPIPaths.pace + suffix)
            return PaceParser.pace(from: json, players: players, modality: modality)
        } catch {
            return .fallback
        }
    }
}

extension MockAPIClient {
    private static let settingsLock = NSLock()
    private static var mockPlaySettings = PlaySettings.default

    static func resetPlaySettings() {
        settingsLock.lock()
        mockPlaySettings = .default
        settingsLock.unlock()
        PlaySettingsStore.reset()
        PaceSessionStore.reset()
    }

    func playSettings() async throws -> PlaySettings {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        Self.settingsLock.lock()
        defer { Self.settingsLock.unlock() }
        return Self.mockPlaySettings
    }

    func savePlaySettings(_ settings: PlaySettings) async throws -> PlaySettings {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        Self.settingsLock.lock()
        Self.mockPlaySettings = settings
        Self.settingsLock.unlock()
        PlaySettingsStore.save(settings)
        return settings
    }

    func paceConfig(courseId: String?, clubCode: String?, players: Int?, modality: String?) async throws -> PaceConfig {
        _ = courseId
        _ = clubCode
        return PaceParser.pace(from: [
            "minutes_per_hole": 12,
            "source": "api"
        ], players: players, modality: modality)
    }
}
