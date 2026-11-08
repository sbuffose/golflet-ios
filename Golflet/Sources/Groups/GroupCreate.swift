import Foundation

/// One submit, one group. The same key is a retry. Another key is another group,
/// even when the name matches.
actor GroupCreateLedger {
    static let shared = GroupCreateLedger()

    private var done: [String: GolfletGroup] = [:]
    private var inflight: [String: Task<GolfletGroup, Error>] = [:]

    func reset() {
        done.removeAll()
        inflight.removeAll()
    }

    func run(key: String, _ work: @Sendable @escaping () async throws -> GolfletGroup) async throws -> GolfletGroup {
        if let hit = done[key] { return hit }
        if let task = inflight[key] { return try await task.value }
        let task = Task { try await work() }
        inflight[key] = task
        do {
            let group = try await task.value
            done[key] = group
            inflight[key] = nil
            return group
        } catch {
            inflight[key] = nil
            throw error
        }
    }
}

enum GroupCreateDecode {
    /// Builds a group from the create response. A missing name uses the name the
    /// player just typed. A failed follow-up read can still keep that group.
    /// Returns nil only when there is no id to hang the group on.
    static func group(from json: [String: Any], requestedName: String, fetched: GolfletGroup? = nil) -> GolfletGroup? {
        if let fetched, !fetched.id.isEmpty { return fetched }
        let blob = normalized(json, requestedName: requestedName)
        return GroupsParser.group(from: blob)
    }

    static func normalized(_ json: [String: Any], requestedName: String) -> [String: Any] {
        var blob = (json["group"] as? [String: Any]) ?? json
        let name = string(blob["name"] ?? blob["title"])
        if name.isEmpty {
            let trimmed = requestedName.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { blob["name"] = trimmed }
        }
        if string(blob["id"] ?? blob["group_id"]).isEmpty {
            let id = string(json["id"] ?? json["group_id"])
            if !id.isEmpty { blob["id"] = id }
        } else if blob["id"] == nil, let id = blob["group_id"] {
            blob["id"] = id
        }
        return blob
    }

    private static func string(_ raw: Any?) -> String {
        if let value = raw as? String { return value.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let value = JSONFlex.int(from: raw) { return String(value) }
        return ""
    }
}
