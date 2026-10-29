import Foundation

extension MockAPIClient {
    private static let notificationsLock = NSLock()
    private static var notificationStore = MockNotificationStore.seed()
    private static var notificationsUnavailable = false

    static func resetNotifications() {
        notificationsLock.lock()
        notificationStore = MockNotificationStore.seed()
        notificationsUnavailable = false
        notificationsLock.unlock()
    }

    static func setNotificationsUnavailable(_ unavailable: Bool) {
        notificationsLock.lock()
        notificationsUnavailable = unavailable
        notificationsLock.unlock()
    }

    static func dropInviteNotification(token: String) {
        notificationsLock.lock()
        notificationStore.items.removeAll { $0.inviteToken == token }
        notificationStore.unreadCount = notificationStore.items.filter(\.isUnread).count
        notificationsLock.unlock()
    }

    func notifications() async throws -> NotificationsInbox {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return try mutateNotifications { store, unavailable in
            if unavailable { throw GolfletError.server("No se pudo completar.") }
            return NotificationsInbox(
                unreadCount: store.unreadCount,
                items: store.items.sorted { $0.createdAt > $1.createdAt }
            )
        }
    }

    func markNotificationsRead(ids: [String]) async throws {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        try mutateNotifications { store, unavailable in
            if unavailable { throw GolfletError.server("No se pudo completar.") }
            if ids.isEmpty {
                for index in store.items.indices {
                    store.items[index].isUnread = false
                }
            } else {
                for index in store.items.indices where ids.contains(store.items[index].id) {
                    store.items[index].isUnread = false
                }
            }
            store.unreadCount = store.items.filter(\.isUnread).count
        }
    }

    private func mutateNotifications<T>(_ work: (inout MockNotificationStore, Bool) throws -> T) rethrows -> T {
        Self.notificationsLock.lock()
        defer { Self.notificationsLock.unlock() }
        return try work(&Self.notificationStore, Self.notificationsUnavailable)
    }
}

struct MockNotificationStore: Sendable {
    var items: [InboxNotification]
    var unreadCount: Int

    static func seed() -> MockNotificationStore {
        let invite = GroupInvitePreview(
            token: "invite-mdp",
            groupID: "g-mdp",
            name: "Sábados de MdP",
            photoURL: nil,
            ownerName: "Clara Ruiz",
            ownerInitials: "CR",
            members: [
                GroupMember(id: "clara", name: "Clara Ruiz", initials: "CR", photoURL: nil, role: .admin, isOwner: true),
                GroupMember(id: "nico", name: "Nico Díaz", initials: "ND", photoURL: nil, role: .member, isOwner: false)
            ],
            alreadyMember: false
        )
        let now = Date()
        let items = [
            InboxNotification(
                id: "n-invite-mdp",
                kind: .groupInvite,
                title: "Invitación a Sábados de MdP",
                body: "Clara Ruiz te invitó al grupo.",
                createdAt: now.addingTimeInterval(-3_600),
                isUnread: true,
                inviteToken: invite.token,
                invite: invite,
                clubCode: nil,
                clubName: nil
            ),
            InboxNotification(
                id: "n-club-jockey",
                kind: .clubMessage,
                title: "Mensaje de Jockey Club",
                body: "Este sábado el tee de Colorada se mueve a las 8.",
                createdAt: now.addingTimeInterval(-18_000),
                isUnread: true,
                inviteToken: nil,
                invite: nil,
                clubCode: "118",
                clubName: "Jockey Club Buenos Aires"
            )
        ]
        return MockNotificationStore(items: items, unreadCount: items.filter(\.isUnread).count)
    }
}
