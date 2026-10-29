import Foundation

enum PaceAPIPaths {
    static let settings = "/api/me/settings"
    static let settingsAlt = "/api/settings"
    static let pace = "/api/pace"

    static func livePace(id: String) -> String {
        "/api/live-rounds/\(id)/pace"
    }

    static func paceAlerted(id: String) -> String {
        "/api/live-rounds/\(id)/pace/alerted"
    }
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
        let blob: [String: Any] = {
            if let nested = json["pace"] as? [String: Any] { return nested }
            return json
        }()
        let byPlayers = blob["by_players"] as? [String: Any] ?? blob["players"] as? [String: Any]
        let byModality = blob["by_modality"] as? [String: Any] ?? blob["modalities"] as? [String: Any]
        var minutes = JSONFlex.double(
            from: blob["min_per_hole"] ?? blob["minutes_per_hole"] ?? blob["minutesPerHole"] ?? json["min_per_hole"]
        )
        if minutes == nil, let players, let value = JSONFlex.double(from: byPlayers?["\(players)"]) {
            minutes = value
        }
        if minutes == nil, let modality {
            minutes = JSONFlex.double(from: byModality?[modality.lowercased()] ?? byModality?[modality])
        }
        let timeline = parseTimeline(blob["timeline"] ?? json["timeline"])
        if minutes == nil, let first = timeline.first?.minutes, first > 0 {
            minutes = first
        }
        return PaceConfig(
            minutesPerHole: minutes ?? PaceConfig.fallbackMinutes,
            players: players ?? JSONFlex.int(from: blob["players"]),
            modality: modality ?? optionalString(blob["modality"] ?? blob["format"]),
            source: optionalString(blob["source"]) ?? (minutes == nil ? "fallback" : "api"),
            estimate: JSONFlex.double(from: blob["estimate"]),
            scope: optionalString(blob["scope"]),
            totalMin: JSONFlex.double(from: blob["total_min"] ?? blob["totalMin"]),
            parWeighted: JSONFlex.bool(from: blob["par_weighted"] ?? blob["parWeighted"]) ?? false,
            timeline: timeline
        )
    }

    static func livePace(from json: [String: Any]) -> LiveRoundPace {
        let blob = json["pace"] as? [String: Any] ?? json
        return LiveRoundPace(
            expectedMin: JSONFlex.double(from: blob["expected_min"] ?? blob["expectedMin"]) ?? 0,
            elapsedMin: JSONFlex.double(from: blob["elapsed_min"] ?? blob["elapsedMin"]) ?? 0,
            behindMin: JSONFlex.double(from: blob["behind_min"] ?? blob["behindMin"]) ?? 0,
            alertDue: JSONFlex.bool(from: blob["alert_due"] ?? blob["alertDue"]) ?? false,
            alertText: optionalString(blob["alert_text"] ?? blob["alertText"]),
            alertHole: JSONFlex.int(from: blob["alert_hole"] ?? blob["alertHole"]) ?? PaceEngine.alertHole,
            thresholdMin: JSONFlex.double(from: blob["threshold_min"] ?? blob["thresholdMin"]) ?? PaceEngine.behindThresholdMinutes,
            enabled: JSONFlex.bool(from: blob["enabled"]) ?? true
        )
    }

    static func minutesPerHole(from course: [String: Any]) -> Double? {
        let pace = course["pace"] as? [String: Any]
        return JSONFlex.double(from: course["min_per_hole"] ?? course["minutes_per_hole"] ?? pace?["min_per_hole"] ?? pace?["minutes_per_hole"])
    }

    private static func parseTimeline(_ raw: Any?) -> [PaceTimelineHole] {
        guard let items = raw as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            guard let hole = JSONFlex.int(from: item["hole"]) else { return nil }
            return PaceTimelineHole(
                hole: hole,
                par: JSONFlex.int(from: item["par"]),
                minutes: JSONFlex.double(from: item["minutes"]) ?? 0,
                expectedEndMin: JSONFlex.double(from: item["expected_end_min"] ?? item["expectedEndMin"]) ?? 0
            )
        }
    }

    static func optionalString(_ raw: Any?) -> String? {
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
        let resolvedPlayers = PaceDefaults.clampPlayers(players)
        query.append("players=\(resolvedPlayers)")
        let resolvedModality = PaceDefaults.normalizeModality(modality)
        query.append("modality=\(resolvedModality.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? resolvedModality)")
        let suffix = "?\(query.joined(separator: "&"))"
        do {
            let json = try await request("GET", PaceAPIPaths.pace + suffix)
            return PaceParser.pace(from: json, players: resolvedPlayers, modality: resolvedModality)
        } catch {
            return .fallback
        }
    }

    func liveRoundPace(id: String) async throws -> LiveRoundPace {
        let json = try await request("GET", PaceAPIPaths.livePace(id: id))
        return PaceParser.livePace(from: json)
    }

    func markPaceAlerted(id: String) async throws {
        _ = try await request("POST", PaceAPIPaths.paceAlerted(id: id), body: [:])
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
        resetPaceAlerts()
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
        let resolvedPlayers = PaceDefaults.clampPlayers(players)
        let resolvedModality = PaceDefaults.normalizeModality(modality)
        let pars = [5, 4, 3, 4, 4, 4, 4, 4, 4, 5, 5, 3, 4, 4, 4, 4, 4, 4]
        var cursor = 0.0
        let timeline: [[String: Any]] = (1...18).map { hole in
            let minutes = PaceConfig.fallbackMinutes
            cursor += minutes
            return [
                "hole": hole,
                "par": pars[hole - 1],
                "minutes": minutes,
                "expected_end_min": cursor
            ]
        }
        return PaceParser.pace(from: [
            "estimate": 216,
            "source": "api",
            "scope": "course",
            "min_per_hole": PaceConfig.fallbackMinutes,
            "total_min": 216,
            "par_weighted": true,
            "timeline": timeline,
            "players": resolvedPlayers,
            "modality": resolvedModality
        ], players: resolvedPlayers, modality: resolvedModality)
    }
}
