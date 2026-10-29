import Foundation

/// API_v5 §11 — live paths from golflet.vercel.app/groups.js.
enum GroupsAPIPaths {
    static let list = "/api/groups"
    static let sharePrefs = "/api/me/sharing"

    static func detail(_ id: String) -> String { "/api/groups/\(id)" }
    static func leave(_ id: String) -> String { "/api/groups/\(id)/leave" }
    static func respond(_ id: String) -> String { "/api/groups/\(id)/respond" }
    static func link(_ id: String) -> String { "/api/groups/\(id)/link" }
    static func photo(_ id: String) -> String { "/api/groups/\(id)/photo" }
    static func invites(_ id: String) -> String { "/api/groups/\(id)/invites" }
    static func view(_ id: String) -> String { "/api/groups/\(id)/view" }
    static func holes(_ id: String) -> String { "/api/groups/\(id)/holes" }
    static func member(_ groupID: String, userID: String) -> String {
        "/api/groups/\(groupID)/members/\(userID)"
    }
    static func join(_ token: String) -> String {
        "/api/groups/join/\(token)"
    }
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
        let members = members(from: blob["members"] ?? blob["member_list"] ?? item["members"])
        let isAdmin = JSONFlex.bool(from: blob["is_admin"] ?? item["is_admin"]) ?? false
        let owner = member(from: blob["owner"])
            ?? members.first(where: \.isOwner)
            ?? members.first
            ?? GroupMember(
                id: "owner-\(id)",
                name: name,
                initials: initials(name),
                photoURL: optionalString(blob["photo_url"]),
                role: isAdmin ? .admin : .member,
                isOwner: true
            )
        let myRole = role(blob["my_role"] ?? blob["role"])
            ?? (isAdmin ? .admin : members.first { $0.id == string(blob["me_id"]) }?.role)
            ?? .member
        return GolfletGroup(
            id: id,
            name: name,
            photoURL: optionalString(blob["photo_url"] ?? blob["photo"] ?? blob["image_url"]),
            owner: owner,
            members: members.isEmpty ? [owner] : members,
            myRole: myRole,
            invite: inviteLink(from: blob["invite"] ?? blob["invite_link"] ?? blob["link"])
        )
    }

    static func invites(from json: [String: Any]) -> [GroupInvitePreview] {
        let items = json["invitations"] as? [Any]
            ?? json["invites"] as? [Any]
            ?? json["pending"] as? [Any]
            ?? []
        return items.compactMap { invite(from: $0) }
    }

    static func invite(from raw: Any?, fallbackToken: String = "") -> GroupInvitePreview? {
        guard let item = raw as? [String: Any] else { return nil }
        let group = item["group"] as? [String: Any]
        let blob = item["invite"] as? [String: Any] ?? group ?? item
        let groupID = optionalString(blob["group_id"] ?? blob["id"] ?? item["group_id"])
        var token = string(blob["token"] ?? blob["invite_token"] ?? item["token"])
        if token.isEmpty { token = fallbackToken }
        if token.isEmpty, let groupID { token = "group:\(groupID)" }
        let name = string(blob["name"] ?? blob["group_name"] ?? blob["title"] ?? item["name"])
        guard !token.isEmpty, !name.isEmpty else { return nil }
        let owner = member(from: blob["owner"])
        let ownerName = owner?.name
            ?? (blob["owner"] as? String)
            ?? string(blob["owner_name"] ?? item["invited_by"])
        return GroupInvitePreview(
            token: token,
            groupID: groupID,
            name: name,
            photoURL: optionalString(blob["photo_url"] ?? blob["photo"]),
            ownerName: ownerName,
            ownerInitials: owner?.initials ?? initials(ownerName),
            members: members(from: blob["members"]),
            alreadyMember: JSONFlex.bool(from: blob["already_member"] ?? item["already_member"])
                ?? (string(item["status"]) == "accepted")
        )
    }

    static func viewConfig(from json: [String: Any]) -> GroupViewConfig {
        let blob = json["view"] as? [String: Any] ?? json
        let metrics = (blob["metrics"] as? [Any] ?? []).compactMap { value -> GroupMetricKind? in
            GroupMetricKind.parse(string(value))
        }
        let charts = (blob["charts"] as? [Any] ?? []).compactMap { value -> GroupChartKind? in
            GroupChartKind(rawValue: string(value))
        }
        let sections = (blob["sections"] as? [Any] ?? []).compactMap { string($0) }
        let range = StatsRange(rawValue: string(blob["range"])) ?? .year
        let course = optionalString(blob["course"] ?? blob["course_filter"])
        var resolvedCharts = charts
        if resolvedCharts.isEmpty {
            if sections.contains("trend") { resolvedCharts.append(contentsOf: [.grossTrend, .handicapTrend]) }
            if sections.contains("holes") { resolvedCharts.append(.birdies) }
        }
        return GroupViewConfig(
            metrics: metrics.isEmpty ? GroupViewConfig.default.metrics : metrics,
            charts: resolvedCharts.isEmpty ? GroupViewConfig.default.charts : resolvedCharts,
            range: range,
            courseFilter: course == "all" ? nil : course
        )
    }

    static func sharePrefs(from json: [String: Any]) -> SharePrefs {
        let blob = json["share"] as? [String: Any] ?? json["prefs"] as? [String: Any] ?? json
        var prefs = SharePrefs.allShared
        for category in ShareCategory.allCases {
            if let value = JSONFlex.bool(from: blob[category.apiKey] ?? blob[category.rawValue]) {
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
                  let metric = GroupMetricKind.parse(string(item["metric"] ?? item["id"]))
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
        var token = string(item["token"] ?? item["invite_token"])
        let urlString = string(item["url"] ?? item["link"] ?? item["whatsapp_url"])
        if token.isEmpty, let parsed = URL(string: urlString) {
            token = GolfletURL.inviteToken(from: parsed) ?? ""
        }
        guard !token.isEmpty else { return nil }
        let url = URL(string: string(item["url"] ?? item["link"])) ?? GolfletURL.inviteURL(token: token)
        let expired = JSONFlex.bool(from: item["expired"]) ?? false
        let enabled = (JSONFlex.bool(from: item["enabled"] ?? item["active"]) ?? true) && !expired
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
