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
    static func period(_ id: String, kind: ComparativoKind, off: Int) -> String {
        "/api/groups/\(id)/period?kind=\(kind.rawValue)&off=\(off)"
    }
    static func member(_ groupID: String, userID: String) -> String {
        "/api/groups/\(groupID)/members/\(userID)"
    }
    static func memberProfile(_ groupID: String, memberID: String) -> String {
        "/api/groups/\(groupID)/members/\(memberID)/profile"
    }
    static func memberRound(_ groupID: String, memberID: String, roundID: String) -> String {
        let encoded = roundID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? roundID
        return "/api/groups/\(groupID)/members/\(memberID)/rounds/\(encoded)"
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

    static func period(from json: [String: Any], fallbackKind: ComparativoKind, fallbackOff: Int) -> ComparativoData {
        let group = json["group"] as? [String: Any] ?? [:]
        let periodBlob = json["period"] as? [String: Any] ?? [:]
        let kind = ComparativoKind(rawValue: string(periodBlob["kind"])) ?? fallbackKind
        let period = ComparativoPeriod(
            kind: kind,
            off: JSONFlex.int(from: periodBlob["off"]) ?? fallbackOff,
            short: string(periodBlob["short"]),
            label: string(periodBlob["label"]),
            inProgress: JSONFlex.bool(from: periodBlob["in_progress"]) ?? false,
            prevOff: JSONFlex.int(from: periodBlob["prev_off"]),
            nextOff: JSONFlex.int(from: periodBlob["next_off"])
        )
        let members = (json["members"] as? [Any] ?? []).compactMap(periodMember(from:))
        let stats = (json["stats"] as? [Any] ?? []).compactMap(statDef(from:))
        var boards: [String: ComparativoBoard] = [:]
        if let raw = json["boards"] as? [String: Any] {
            for (key, value) in raw {
                if let board = board(from: value, key: key) { boards[key] = board }
            }
        }
        let minsBlob = json["mins"] as? [String: Any] ?? [:]
        let mins = ComparativoMins(
            r: JSONFlex.int(from: minsBlob["r"]) ?? 1,
            gh: JSONFlex.int(from: minsBlob["gh"]) ?? 9,
            dr: JSONFlex.int(from: minsBlob["dr"]) ?? 9,
            mg: JSONFlex.int(from: minsBlob["mg"]) ?? 3,
            pr: JSONFlex.int(from: minsBlob["pr"]) ?? 1,
            gp: JSONFlex.int(from: minsBlob["gp"]) ?? 6
        )
        let data = json["data"] as? [String: Any] ?? [:]
        let lb = json["leaderboard"] as? [String: Any] ?? [:]
        return ComparativoData(
            groupID: string(group["id"] ?? json["group_id"]),
            groupName: string(group["name"] ?? json["group_name"]),
            period: period,
            members: members,
            stats: stats,
            boards: boards,
            leaderboard: ComparativoLeaderboard(
                rows: boardRows(from: lb["rows"]).compactMap { row in
                    guard let pos = row.pos else { return nil }
                    return ComparativoLeaderRow(memberID: row.memberID, pos: pos, state: row.state)
                },
                rest: boardRows(from: lb["rest"]).map {
                    ComparativoLeaderRow(memberID: $0.memberID, pos: $0.pos ?? 0, state: $0.state)
                }
            ),
            mins: mins,
            gpsOrCardsAny: JSONFlex.bool(from: data["gps_or_cards_any"] ?? json["gps_or_cards_any"]) ?? false
        )
    }

    static func memberProfile(from json: [String: Any], groupID: String, memberID: String) -> GroupMemberProfile {
        let group = json["group"] as? [String: Any] ?? [:]
        let memberBlob = json["member"] as? [String: Any] ?? [:]
        let member = periodMember(from: memberBlob) ?? ComparativoMember(
            memberID: memberID,
            name: string(memberBlob["name"]),
            initials: initials(string(memberBlob["name"])),
            color: optionalString(memberBlob["color"]),
            isMe: JSONFlex.bool(from: memberBlob["is_me"]) ?? false,
            profileShared: JSONFlex.bool(from: memberBlob["profile"]) ?? true,
            stats: [:]
        )
        let sharesRaw = json["shares"] as? [String: Any] ?? [:]
        var shares: [String: Bool] = [:]
        for (key, value) in sharesRaw {
            shares[key] = JSONFlex.bool(from: value) ?? false
        }
        let locked = JSONFlex.bool(from: json["locked"]) ?? (member.profileShared == false && member.isMe == false)
        let clubs = (json["clubs"] as? [Any] ?? []).compactMap { optionalString($0) }
        let yearBlob = json["year"] as? [String: Any]
        let history = (json["hi_history"] as? [Any] ?? []).compactMap { raw -> HIPoint? in
            guard let item = raw as? [String: Any],
                  let date = LivePayloadMapper.parseDayPublic(item["date"] as? String ?? item["week"] as? String),
                  let hi = JSONFlex.double(from: item["hi"] ?? item["handicap"] ?? item["handicap_index"])
            else { return nil }
            return HIPoint(date: date, handicap: hi)
        }
        let rounds: [ProfileRound]?
        if json["rounds"] == nil {
            rounds = nil
        } else {
            rounds = (json["rounds"] as? [Any] ?? []).compactMap(profileRound(from:))
        }
        let resolvedID = string(group["id"] ?? json["group_id"])
        return GroupMemberProfile(
            groupID: resolvedID.isEmpty ? groupID : resolvedID,
            groupName: string(group["name"]),
            member: member,
            locked: locked,
            clubs: clubs,
            shares: shares,
            year: yearBlob.map(profileYear(from:)),
            hiHistory: history,
            rounds: rounds
        )
    }

    static func lockedProfile(groupID: String, groupName: String, memberID: String, name: String, isMe: Bool) -> GroupMemberProfile {
        GroupMemberProfile(
            groupID: groupID,
            groupName: groupName,
            member: ComparativoMember(
                memberID: memberID,
                name: name,
                initials: initials(name),
                color: nil,
                isMe: isMe,
                profileShared: false,
                stats: [:]
            ),
            locked: true,
            clubs: [],
            shares: [:],
            year: nil,
            hiHistory: [],
            rounds: nil
        )
    }

    static func scorecard(from json: [String: Any], groupID: String) -> SharedScorecard? {
        let card = json["card"] as? [String: Any] ?? json
        let memberBlob = json["member"] as? [String: Any] ?? [:]
        let member = periodMember(from: memberBlob) ?? ComparativoMember(
            memberID: string(memberBlob["member_id"] ?? memberBlob["id"]),
            name: string(memberBlob["name"]),
            initials: initials(string(memberBlob["name"])),
            color: optionalString(memberBlob["color"]),
            isMe: JSONFlex.bool(from: memberBlob["is_me"]) ?? false,
            profileShared: true,
            stats: [:]
        )
        let holes = (card["holes"] as? [Any] ?? []).compactMap { raw -> SharedHole? in
            guard let item = raw as? [String: Any] else { return nil }
            let number = JSONFlex.int(from: item["hole"] ?? item["number"])
            guard let number else { return nil }
            return SharedHole(
                hole: number,
                par: JSONFlex.int(from: item["par"]),
                score: JSONFlex.int(from: item["score"] ?? item["strokes"])
            )
        }
        let date = LivePayloadMapper.parseDayPublic(card["date"] as? String)
        return SharedScorecard(
            groupID: groupID,
            member: member,
            date: date,
            dateLabel: ComparativoFormat.day(date),
            courseLabel: string(card["course_label"] ?? card["course"]),
            gross: JSONFlex.int(from: card["gross"]),
            net: JSONFlex.int(from: card["net"]),
            toPar: JSONFlex.int(from: card["to_par"]),
            putts: JSONFlex.int(from: card["putts"]),
            gir: JSONFlex.int(from: card["gir"]),
            fir: JSONFlex.int(from: card["fir"]),
            holes: holes
        )
    }

    static func needsClub(from json: [String: Any], fallback: String) -> NeedsClubPayload {
        let clubs = (json["clubs"] as? [Any] ?? []).compactMap { raw -> ClubCatalogEntry? in
            guard let item = raw as? [String: Any] else { return nil }
            let id = JSONFlex.int(from: item["id"] ?? item["club_id"])
            let name = string(item["name"] ?? item["club_name"])
            guard let id, !name.isEmpty else { return nil }
            return ClubCatalogEntry(
                id: id,
                name: name,
                baseURL: string(item["base_url"]),
                directLogin: JSONFlex.bool(from: item["direct_login"]) ?? true
            )
        }
        return NeedsClubPayload(
            message: string(json["message"]).isEmpty ? fallback : string(json["message"]),
            matricula: optionalString(json["matricula"]),
            clubs: clubs
        )
    }

    private static func periodMember(from raw: Any?) -> ComparativoMember? {
        guard let item = raw as? [String: Any] else { return nil }
        let id = string(item["member_id"] ?? item["id"])
        let name = string(item["name"] ?? item["display_name"])
        guard !id.isEmpty, !name.isEmpty else { return nil }
        var stats: [String: ComparativoStatValue] = [:]
        if let rawStats = item["stats"] as? [String: Any] {
            for (key, value) in rawStats {
                stats[key] = statValue(from: value)
            }
        }
        return ComparativoMember(
            memberID: id,
            name: name,
            initials: optionalString(item["initials"]) ?? initials(name),
            color: optionalString(item["color"]),
            isMe: JSONFlex.bool(from: item["is_me"]) ?? false,
            profileShared: JSONFlex.bool(from: item["profile"]) ?? true,
            stats: stats
        )
    }

    private static func statDef(from raw: Any?) -> ComparativoStatDef? {
        guard let item = raw as? [String: Any] else { return nil }
        let key = string(item["key"] ?? item["id"])
        guard !key.isEmpty else { return nil }
        return ComparativoStatDef(
            key: key,
            short: string(item["short"]).isEmpty ? string(item["label"]) : string(item["short"]),
            label: string(item["label"]).isEmpty ? key : string(item["label"]),
            desc: string(item["desc"] ?? item["description"]),
            format: string(item["fmt"] ?? item["format"]).isEmpty ? "f" : string(item["fmt"] ?? item["format"]),
            minKey: optionalString(item["min"]),
            lowerIsBetter: JSONFlex.bool(from: item["low"]) ?? false,
            gps: JSONFlex.bool(from: item["gps"]) ?? false
        )
    }

    private static func statValue(from raw: Any?) -> ComparativoStatValue {
        let item = raw as? [String: Any] ?? [:]
        var extra: [String: String] = [:]
        if let map = item["extra"] as? [String: Any] {
            for (key, value) in map {
                extra[key] = string(value)
            }
        }
        return ComparativoStatValue(
            value: JSONFlex.double(from: item["v"] ?? item["value"]),
            n: JSONFlex.int(from: item["n"]),
            have: JSONFlex.int(from: item["have"]),
            need: JSONFlex.int(from: item["need"]),
            hidden: JSONFlex.bool(from: item["hidden"]) ?? false,
            extra: extra
        )
    }

    private static func board(from raw: Any?, key: String) -> ComparativoBoard? {
        guard let item = raw as? [String: Any] else { return nil }
        let leaders = (item["leaders"] as? [Any] ?? []).compactMap { optionalString($0) }
        return ComparativoBoard(
            key: key,
            leaders: leaders,
            ranked: JSONFlex.bool(from: item["ranked"]) ?? !leaders.isEmpty,
            rows: boardRows(from: item["rows"])
        )
    }

    private static func boardRows(from raw: Any?) -> [ComparativoBoardRow] {
        guard let items = raw as? [Any] else { return [] }
        return items.compactMap { itemRaw in
            guard let item = itemRaw as? [String: Any] else { return nil }
            let id = string(item["member_id"] ?? item["id"])
            guard !id.isEmpty else { return nil }
            return ComparativoBoardRow(
                memberID: id,
                pos: JSONFlex.int(from: item["pos"]),
                state: ComparativoRowState(rawValue: string(item["state"])) ?? .ranked
            )
        }
    }

    private static func profileYear(from item: [String: Any]) -> ProfileYear {
        var types: [String: ProfileTypeStat] = [:]
        if let raw = item["types"] as? [String: Any] {
            for (key, value) in raw {
                guard let map = value as? [String: Any] else { continue }
                types[key] = ProfileTypeStat(
                    perRound: JSONFlex.double(from: map["per_round"]),
                    total: JSONFlex.int(from: map["total"])
                )
            }
        }
        var par: [String: ProfileParStat] = [:]
        if let raw = item["par"] as? [String: Any] {
            for (key, value) in raw {
                guard let map = value as? [String: Any] else { continue }
                par[key] = ProfileParStat(
                    avg: JSONFlex.double(from: map["avg"]),
                    n: JSONFlex.int(from: map["n"])
                )
            }
        }
        let putting = item["putting"] as? [String: Any]
        return ProfileYear(
            rounds: JSONFlex.int(from: item["rounds"]),
            avgGross: JSONFlex.double(from: item["avg_gross"]),
            bestGross: optionalString(item["best_gross"]),
            avgNet: JSONFlex.double(from: item["avg_net"]),
            bestNet: optionalString(item["best_net"]),
            handicapIndex: JSONFlex.double(from: item["handicap_index"]),
            types: types,
            par: par,
            putting: putting.map {
                ProfilePutting(
                    rounds: JSONFlex.int(from: $0["rounds"]),
                    roundsGir: JSONFlex.int(from: $0["rounds_gir"]),
                    roundsFir: JSONFlex.int(from: $0["rounds_fir"]),
                    avgPutts: JSONFlex.double(from: $0["avg_putts"]),
                    avgGir: JSONFlex.double(from: $0["avg_gir"]),
                    avgFir: JSONFlex.double(from: $0["avg_fir"])
                )
            }
        )
    }

    private static func profileRound(from raw: Any?) -> ProfileRound? {
        guard let item = raw as? [String: Any] else { return nil }
        let id = string(item["round_id"] ?? item["id"])
        guard !id.isEmpty else { return nil }
        let date = LivePayloadMapper.parseDayPublic(item["date"] as? String)
        return ProfileRound(
            roundID: id,
            date: date,
            dateLabel: ComparativoFormat.day(date),
            courseLabel: string(item["course_label"] ?? item["course"]),
            gross: JSONFlex.int(from: item["gross"]),
            net: JSONFlex.int(from: item["net"]),
            toPar: JSONFlex.int(from: item["to_par"])
        )
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
