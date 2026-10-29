import Foundation

enum NotificationKind: String, Hashable, Sendable {
    case groupInvite = "group_invite"
    case clubMessage = "club_message"

    var title: String {
        switch self {
        case .groupInvite: return "Invitación"
        case .clubMessage: return "Mensaje del club"
        }
    }
}

struct InboxNotification: Identifiable, Hashable, Sendable {
    var id: String
    var kind: NotificationKind
    var title: String
    var body: String
    var createdAt: Date
    var isUnread: Bool
    var inviteToken: String?
    var invite: GroupInvitePreview?
    var clubCode: String?
    var clubName: String?

    func resolvedInvite(from pending: [GroupInvitePreview]) -> GroupInvitePreview? {
        if let invite { return invite }
        guard let token = inviteToken, !token.isEmpty else { return nil }
        if let match = pending.first(where: { $0.token == token }) { return match }
        return GroupInvitePreview(
            token: token,
            groupID: nil,
            name: title,
            photoURL: nil,
            ownerName: "",
            ownerInitials: "IN",
            members: [],
            alreadyMember: false
        )
    }
}

struct NotificationsInbox: Hashable, Sendable {
    var unreadCount: Int
    var badge: String?
    var items: [InboxNotification]

    static let empty = NotificationsInbox(unreadCount: 0, badge: nil, items: [])

    var badgeText: String? {
        NotificationBadge.display(count: unreadCount, badge: badge)
    }
}

struct UnreadNotifications: Hashable, Sendable {
    var unreadCount: Int
    var badge: String?

    static let empty = UnreadNotifications(unreadCount: 0, badge: nil)

    var badgeText: String? {
        NotificationBadge.display(count: unreadCount, badge: badge)
    }
}

enum NotificationBadge {
    static func text(_ count: Int) -> String? {
        guard count > 0 else { return nil }
        return count > 9 ? "9+" : "\(count)"
    }

    static func display(count: Int, badge: String?) -> String? {
        if let badge {
            let trimmed = badge.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.isEmpty || trimmed == "0" { return nil }
            return trimmed
        }
        return text(count)
    }
}
