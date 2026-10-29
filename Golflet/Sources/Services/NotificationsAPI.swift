import Foundation

/// Planned web shape: GET /api/me/notifications with unread_count + items.
/// Mark-read is POST /api/me/notifications/read. Field names are not locked yet.
enum NotificationsAPIPaths {
    static let list = "/api/me/notifications"
    static let read = "/api/me/notifications/read"
    static let readAliases = [
        "/api/me/notifications/mark-read",
        "/api/me/notifications/mark_read"
    ]
}

enum NotificationsParser {
    static func inbox(from json: [String: Any]) -> NotificationsInbox {
        let blob = json["inbox"] as? [String: Any] ?? json["data"] as? [String: Any] ?? json
        let items = notifications(from: blob)
        let unread = JSONFlex.int(
            from: blob["unread_count"]
                ?? blob["unreadCount"]
                ?? blob["unread"]
                ?? json["unread_count"]
        ) ?? items.filter(\.isUnread).count
        return NotificationsInbox(unreadCount: max(0, unread), items: items)
    }

    static func notifications(from json: [String: Any]) -> [InboxNotification] {
        let raw = json["notifications"]
            ?? json["items"]
            ?? json["inbox"]
            ?? json["messages"]
            ?? json["data"]
        let rows: [Any]
        if let array = raw as? [Any] {
            rows = array
        } else if let boxed = raw as? [String: Any], let nested = boxed["notifications"] as? [Any] {
            rows = nested
        } else {
            rows = []
        }
        return rows.compactMap { notification(from: $0) }
            .sorted { $0.createdAt > $1.createdAt }
    }

    static func notification(from raw: Any?) -> InboxNotification? {
        guard let item = raw as? [String: Any] else { return nil }
        let blob = item["notification"] as? [String: Any] ?? item
        let id = string(
            blob["id"]
                ?? blob["notification_id"]
                ?? blob["uuid"]
                ?? blob["invite_token"]
                ?? blob["token"]
        )
        let kind = kind(from: blob["kind"] ?? blob["type"] ?? blob["category"])
        let title = string(
            blob["title"]
                ?? blob["heading"]
                ?? blob["subject"]
                ?? blob["group_name"]
                ?? blob["club_name"]
        )
        let body = string(
            blob["body"]
                ?? blob["text"]
                ?? blob["message"]
                ?? blob["preview"]
                ?? blob["subtitle"]
        )
        guard !id.isEmpty || !title.isEmpty || kind != nil else { return nil }
        let invite = GroupsParser.invite(from: blob["invite"] ?? blob["invitation"])
        let token = optionalString(
            blob["invite_token"]
                ?? blob["inviteToken"]
                ?? (blob["invite"] is [String: Any] ? nil : blob["invite"])
                ?? (blob["token"] as? String)
                ?? invite?.token
        )
        let resolvedKind = kind ?? (token != nil || invite != nil ? .groupInvite : .clubMessage)
        let resolvedTitle = title.isEmpty
            ? (invite?.name.isEmpty == false ? invite!.name : resolvedKind.title)
            : title
        let created = parseDate(
            blob["created_at"]
                ?? blob["createdAt"]
                ?? blob["created"]
                ?? blob["sent_at"]
                ?? blob["date"]
        ) ?? .distantPast
        return InboxNotification(
            id: id.isEmpty ? (token ?? "n-\(resolvedKind.rawValue)-\(Int(created.timeIntervalSince1970))") : id,
            kind: resolvedKind,
            title: resolvedTitle,
            body: body,
            createdAt: created,
            isUnread: isUnread(blob),
            inviteToken: token ?? invite?.token,
            invite: invite,
            clubCode: optionalString(blob["club_code"] ?? blob["club"] ?? blob["club_id"] ?? blob["account_id"]),
            clubName: optionalString(blob["club_name"] ?? blob["clubName"] ?? blob["from"])
        )
    }

    static func markReadBody(ids: [String]) -> [String: Any] {
        if ids.isEmpty { return ["all": true] }
        if ids.count == 1 { return ["id": ids[0], "ids": ids] }
        return ["ids": ids]
    }

    private static func kind(from raw: Any?) -> NotificationKind? {
        let value = string(raw).lowercased().replacingOccurrences(of: "-", with: "_")
        switch value {
        case "group_invite", "invite", "invitation", "invitacion", "invitación", "group":
            return .groupInvite
        case "club_message", "message", "club", "member_message", "club_msg":
            return .clubMessage
        default:
            return NotificationKind(rawValue: value)
        }
    }

    private static func isUnread(_ blob: [String: Any]) -> Bool {
        if let unread = JSONFlex.bool(from: blob["unread"] ?? blob["is_unread"] ?? blob["isUnread"]) {
            return unread
        }
        if let read = JSONFlex.bool(from: blob["read"] ?? blob["is_read"] ?? blob["isRead"]) {
            return !read
        }
        if let readAt = optionalString(blob["read_at"] ?? blob["readAt"]) {
            return readAt.isEmpty
        }
        if string(blob["status"]).lowercased() == "read" { return false }
        return true
    }

    private static func parseDate(_ raw: Any?) -> Date? {
        if let date = raw as? Date { return date }
        if let seconds = JSONFlex.double(from: raw), seconds > 1_000_000 {
            return Date(timeIntervalSince1970: seconds > 10_000_000_000 ? seconds / 1000 : seconds)
        }
        guard let text = raw as? String, !text.isEmpty else { return nil }
        if let day = DayStamp.parse(text), text.count <= 10 { return day }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: text) { return date }
        iso.formatOptions = [.withInternetDateTime]
        if let date = iso.date(from: text) { return date }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        for format in ["yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd'T'HH:mm:ss"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: text) { return date }
        }
        return nil
    }

    private static func string(_ raw: Any?) -> String {
        if let value = raw as? String { return value.trimmingCharacters(in: .whitespacesAndNewlines) }
        if let value = raw as? Int { return String(value) }
        return ""
    }

    private static func optionalString(_ raw: Any?) -> String? {
        if raw is [String: Any] || raw is [Any] { return nil }
        let value = string(raw)
        return value.isEmpty ? nil : value
    }
}
