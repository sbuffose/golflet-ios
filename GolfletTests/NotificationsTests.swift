import XCTest
@testable import Golflet

final class NotificationsTests: XCTestCase {
    override func setUp() {
        super.setUp()
        MockAPIClient.resetGroups()
        MockAPIClient.resetNotifications()
    }

    func testBadgeCapsAtNinePlusAndHidesAtZero() {
        XCTAssertNil(NotificationBadge.text(0))
        XCTAssertEqual(NotificationBadge.text(1), "1")
        XCTAssertEqual(NotificationBadge.text(9), "9")
        XCTAssertEqual(NotificationBadge.text(10), "9+")
        XCTAssertEqual(NotificationBadge.text(99), "9+")
        XCTAssertNil(NotificationsInbox.empty.badgeText)
        XCTAssertEqual(NotificationsInbox(unreadCount: 12, items: []).badgeText, "9+")
    }

    func testParsesPlannedInboxShapeNewestFirst() {
        let json: [String: Any] = [
            "unread_count": 2,
            "notifications": [
                [
                    "id": "n-old",
                    "kind": "club_message",
                    "title": "Mensaje de Jockey",
                    "body": "Tee a las 8.",
                    "created_at": "2026-03-01T10:00:00Z",
                    "read_at": "2026-03-01T11:00:00Z",
                    "club_code": "118",
                    "club_name": "Jockey Club Buenos Aires"
                ],
                [
                    "id": "n-new",
                    "type": "invitation",
                    "title": "Invitación a Sábados",
                    "text": "Clara te invitó.",
                    "created_at": "2026-03-02T12:00:00.000Z",
                    "unread": true,
                    "invite_token": "invite-mdp",
                    "invite": [
                        "token": "invite-mdp",
                        "name": "Sábados de MdP",
                        "invited_by": "Clara Ruiz"
                    ]
                ]
            ]
        ]
        let inbox = NotificationsParser.inbox(from: json)
        XCTAssertEqual(inbox.unreadCount, 2)
        XCTAssertEqual(inbox.items.map(\.id), ["n-new", "n-old"])
        XCTAssertEqual(inbox.items.first?.kind, .groupInvite)
        XCTAssertEqual(inbox.items.first?.inviteToken, "invite-mdp")
        XCTAssertEqual(inbox.items.first?.invite?.name, "Sábados de MdP")
        XCTAssertTrue(inbox.items.first?.isUnread == true)
        XCTAssertEqual(inbox.items.last?.kind, .clubMessage)
        XCTAssertEqual(inbox.items.last?.clubName, "Jockey Club Buenos Aires")
        XCTAssertFalse(inbox.items.last?.isUnread == true)
    }

    func testParsesAliasesAndHidesMissingInviteOnClubMessage() {
        let item = NotificationsParser.notification(from: [
            "notification_id": 44,
            "category": "member_message",
            "subject": "Cancha cerrada",
            "preview": "Mañana no se juega.",
            "sent_at": "2026-04-04 09:15:00",
            "is_read": 0,
            "club": "209"
        ])
        XCTAssertEqual(item?.id, "44")
        XCTAssertEqual(item?.kind, .clubMessage)
        XCTAssertEqual(item?.title, "Cancha cerrada")
        XCTAssertEqual(item?.body, "Mañana no se juega.")
        XCTAssertEqual(item?.clubCode, "209")
        XCTAssertTrue(item?.isUnread == true)
        XCTAssertNil(item?.invite)
        XCTAssertNil(item?.inviteToken)
    }

    func testZeroUnreadCountHidesBadgeEvenIfItemsExist() {
        let inbox = NotificationsParser.inbox(from: [
            "unread_count": 0,
            "notifications": [
                ["id": "n1", "kind": "club_message", "title": "Hola", "body": "Nada"]
            ]
        ])
        XCTAssertEqual(inbox.unreadCount, 0)
        XCTAssertNil(inbox.badgeText)
        XCTAssertEqual(inbox.items.count, 1)
    }

    func testMarkReadBodyAndPaths() {
        XCTAssertEqual(NotificationsAPIPaths.list, "/api/me/notifications")
        XCTAssertEqual(NotificationsAPIPaths.read, "/api/me/notifications/read")
        let all = NotificationsParser.markReadBody(ids: [])
        XCTAssertEqual(all["all"] as? Bool, true)
        let one = NotificationsParser.markReadBody(ids: ["n-1"])
        XCTAssertEqual(one["id"] as? String, "n-1")
        XCTAssertEqual(one["ids"] as? [String], ["n-1"])
    }

    func testMockInboxAndMarkRead() async throws {
        let api = MockAPIClient(autoSession: true)
        let inbox = try await api.notifications()
        XCTAssertEqual(inbox.unreadCount, 2)
        XCTAssertEqual(inbox.badgeText, "2")
        XCTAssertEqual(inbox.items.map(\.id), ["n-invite-mdp", "n-club-jockey"])
        XCTAssertEqual(inbox.items.first?.kind, .groupInvite)
        XCTAssertEqual(inbox.items.last?.kind, .clubMessage)
        XCTAssertTrue(inbox.items.allSatisfy(\.isUnread))

        try await api.markNotificationsRead(ids: inbox.items.map(\.id))
        let after = try await api.notifications()
        XCTAssertEqual(after.unreadCount, 0)
        XCTAssertNil(after.badgeText)
        XCTAssertTrue(after.items.allSatisfy { !$0.isUnread })
    }

    func testUnavailableAPIHidesInbox() async throws {
        MockAPIClient.setNotificationsUnavailable(true)
        let api = MockAPIClient(autoSession: true)
        MockAPIClient.setNotificationsUnavailable(true)
        do {
            _ = try await api.notifications()
            XCTFail("El mock tenía que fallar si el API no está")
        } catch {
            XCTAssertEqual(error as? GolfletError, .server("No se pudo completar."))
        }
        MockAPIClient.setNotificationsUnavailable(false)
    }

    func testAcceptInviteDropsInviteNotification() async throws {
        let api = MockAPIClient(autoSession: true)
        _ = try await api.acceptInvite(token: "invite-mdp")
        let inbox = try await api.notifications()
        XCTAssertFalse(inbox.items.contains { $0.inviteToken == "invite-mdp" })
        XCTAssertEqual(inbox.items.map(\.id), ["n-club-jockey"])
        XCTAssertEqual(inbox.unreadCount, 1)
    }
}
