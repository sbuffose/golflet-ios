import Foundation

/// Paths to remap when `API_v5.md` lands on the web repo.
enum GroupsAPIPaths {
    static let list = "/api/groups"
    static let pendingInvites = "/api/invites"
    static let sharePrefs = "/api/me/share"

    static func detail(_ id: String) -> String { "/api/groups/\(id)" }
    static func leave(_ id: String) -> String { "/api/groups/\(id)/leave" }
    static func invite(_ id: String) -> String { "/api/groups/\(id)/invite" }
    static func disableInvite(_ id: String) -> String { "/api/groups/\(id)/invite/disable" }
    static func view(_ id: String) -> String { "/api/groups/\(id)/view" }
    static func comparison(_ id: String) -> String { "/api/groups/\(id)/comparison" }
    static func member(_ groupID: String, userID: String) -> String {
        "/api/groups/\(groupID)/members/\(userID)"
    }
    static func memberRole(_ groupID: String, userID: String) -> String {
        "/api/groups/\(groupID)/members/\(userID)/role"
    }
    static func preview(_ token: String) -> String { "/api/g/\(token)" }
    static func accept(_ token: String) -> String { "/api/g/\(token)/accept" }
    static func decline(_ token: String) -> String { "/api/g/\(token)/decline" }
}

enum GroupsParser {
    static func groups(from json: [String: Any]) -> [GolfletGroup] {
        let items = json["groups"] as? [Any] ?? json["data"] as? [Any] ?? []
        return items.compactMap { group(from: $0) }
    }

    static func group(from raw: Any?) -> GolfletGroup? {
        guard let item = raw as? [String: Any] else { return nil }
        let blob = item["group"] as? [String: Any] ?? item
        let id = string(blob["id"] ?? blob["group_id"])
        let name = string(blob["name"] ?? blob["title"])
        guard !id.isEmpty, !name.isEmpty else { return nil }
        let members = members(from: blob["members"] ?? blob["member_list"])
        let owner = member(from: blob["owner"]) ?? members.first(where: \.isOwner) ?? members.first
        guard let owner else { return nil }
        let myRole = role(blob["my_role"] ?? blob["role"]) ?? members.first { $0.id == string(blob["me_id"]) }?.role ?? .member
        return GolfletGroup(
            id: id,
            name: name,
            photoURL: optionalString(blob["photo_url"] ?? blob["photo"] ?? blob["image_url"]),
            owner: owner,
            members: members.isEmpty ? [owner] : members,
            myRole: myRole,
            invite: inviteLink(from: blob["invite"] ?? blob["invite_link"])
        )
    }

    static func invites(from json: [String: Any]) -> [GroupInvitePreview] {
        let items = json["invites"] as? [Any] ?? json["pending"] as? [Any] ?? []
        return items.compactMap { invite(from: $0) }
    }

    static func invite(from raw: Any?) -> GroupInvitePreview? {
        guard let item = raw as? [String: Any] else { return nil }
        let blob = item["invite"] as? [String: Any] ?? item
        let token = string(blob["token"] ?? blob["invite_token"])
        let name = string(blob["name"] ?? blob["group_name"] ?? blob["title"])
        guard !token.isEmpty, !name.isEmpty else { return nil }
        let owner = member(from: blob["owner"])
        return GroupInvitePreview(
            token: token,
            groupID: optionalString(blob["group_id"] ?? blob["id"]),
            name: name,
            photoURL: optionalString(blob["photo_url"] ?? blob["photo"]),
            ownerName: owner?.name ?? string(blob["owner_name"]),
            ownerInitials: owner?.initials ?? initials(string(blob["owner_name"])),
            members: members(from: blob["members"]),
            alreadyMember: JSONFlex.bool(from: blob["already_member"]) ?? false
        )
    }

    static func viewConfig(from json: [String: Any]) -> GroupViewConfig {
        let blob = json["view"] as? [String: Any] ?? json
        let metrics = (blob["metrics"] as? [Any] ?? []).compactMap { value -> GroupMetricKind? in
            GroupMetricKind(rawValue: string(value))
        }
        let charts = (blob["charts"] as? [Any] ?? []).compactMap { value -> GroupChartKind? in
            GroupChartKind(rawValue: string(value))
        }
        let range = StatsRange(rawValue: string(blob["range"])) ?? .year
        let course = optionalString(blob["course"] ?? blob["course_filter"])
        return GroupViewConfig(
            metrics: metrics.isEmpty ? GroupViewConfig.default.metrics : metrics,
            charts: charts.isEmpty ? GroupViewConfig.default.charts : charts,
            range: range,
            courseFilter: course == "all" ? nil : course
        )
    }

    static func sharePrefs(from json: [String: Any]) -> SharePrefs {
        let blob = json["share"] as? [String: Any] ?? json["prefs"] as? [String: Any] ?? json
        var prefs = SharePrefs.allShared
        for category in ShareCategory.allCases {
            if let value = JSONFlex.bool(from: blob[category.rawValue]) {
                prefs.set(category, shared: value)
            }
        }
        return prefs
    }

    static func comparison(from json: [String: Any], fallback: GroupViewConfig) -> GroupComparison {
        let blob = json["comparison"] as? [String: Any] ?? json
        let config = (blob["view"] as? [String: Any]).map { viewConfig(from: $0) } ?? fallback
        let groupID = string(blob["group_id"] ?? json["group_id"])
        let rowsRaw = blob["rows"] as? [Any] ?? blob["metrics"] as? [Any] ?? []
        let rows: [GroupComparisonRow] = rowsRaw.compactMap { raw in
            guard let item = raw as? [String: Any],
                  let metric = GroupMetricKind(rawValue: string(item["metric"] ?? item["id"]))
            else { return nil }
            let values = (item["values"] as? [Any] ?? item["members"] as? [Any] ?? []).compactMap { valueRaw -> MemberMetricValue? in
                guard let map = valueRaw as? [String: Any] else { return nil }
                let id = string(map["id"] ?? map["member_id"])
                guard !id.isEmpty else { return nil }
                let shared = JSONFlex.bool(from: map["shared"] ?? map["visible"]) ?? (map["value"] != nil)
                return MemberMetricValue(
                    memberID: id,
                    memberName: string(map["name"] ?? map["member_name"]),
                    initials: string(map["initials"]).isEmpty ? initials(string(map["name"])) : string(map["initials"]),
                    shared: shared,
                    value: shared ? JSONFlex.double(from: map["value"]) : nil,
                    text: shared ? optionalString(map["text"] ?? map["label"]) : nil
                )
            }
            return GroupComparisonRow(metric: metric, values: values)
        }
        return GroupComparison(groupID: groupID, config: config, rows: rows)
    }

    static func inviteLink(from raw: Any?) -> GroupInviteLink? {
        if let token = raw as? String, !token.isEmpty {
            return .make(token: token)
        }
        guard let item = raw as? [String: Any] else { return nil }
        let token = string(item["token"] ?? item["invite_token"])
        guard !token.isEmpty else { return nil }
        let url = URL(string: string(item["url"] ?? item["link"])) ?? GolfletURL.inviteURL(token: token)
        let enabled = JSONFlex.bool(from: item["enabled"] ?? item["active"]) ?? true
        return GroupInviteLink(token: token, url: url, enabled: enabled)
    }

    static func members(from raw: Any?) -> [GroupMember] {
        guard let items = raw as? [Any] else { return [] }
        return items.compactMap(member(from:))
    }

    static func member(from raw: Any?) -> GroupMember? {
        guard let item = raw as? [String: Any] else { return nil }
        let id = string(item["id"] ?? item["user_id"] ?? item["member_id"])
        let name = string(item["name"] ?? item["display_name"])
        guard !id.isEmpty, !name.isEmpty else { return nil }
        return GroupMember(
            id: id,
            name: name,
            initials: optionalString(item["initials"]) ?? initials(name),
            photoURL: optionalString(item["photo_url"] ?? item["photo"]),
            role: role(item["role"]) ?? .member,
            isOwner: JSONFlex.bool(from: item["is_owner"] ?? item["owner"]) ?? false
        )
    }

    static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }

    private static func role(_ raw: Any?) -> GroupRole? {
        GroupRole(rawValue: string(raw).lowercased())
    }

    private static func string(_ raw: Any?) -> String {
        if let value = raw as? String { return value }
        if let value = raw as? Int { return String(value) }
        return ""
    }

    private static func optionalString(_ raw: Any?) -> String? {
        let value = string(raw)
        return value.isEmpty ? nil : value
    }
}
