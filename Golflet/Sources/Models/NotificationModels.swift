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
    var items: [InboxNotification]

    static let empty = NotificationsInbox(unreadCount: 0, items: [])

    var badgeText: String? {
        NotificationBadge.text(unreadCount)
    }
}

enum NotificationBadge {
    static func text(_ count: Int) -> String? {
        guard count > 0 else { return nil }
        return count > 9 ? "9+" : "\(count)"
    }
}
