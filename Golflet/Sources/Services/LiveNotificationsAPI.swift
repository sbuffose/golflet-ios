import Foundation

extension LiveGolfletAPI {
    func notifications() async throws -> NotificationsInbox {
        do {
            return NotificationsParser.inbox(from: try await request("GET", NotificationsAPIPaths.list))
        } catch {
            return .empty
        }
    }

    func unreadNotifications() async throws -> UnreadNotifications {
        do {
            return NotificationsParser.unread(from: try await request("GET", NotificationsAPIPaths.unreadCount))
        } catch {
            return .empty
        }
    }

    func notification(id: String) async throws -> InboxNotification {
        let json = try await request("GET", NotificationsAPIPaths.detail(id))
        guard let item = NotificationsParser.notification(from: json["notification"] ?? json) else {
            throw GolfletError.decoding("notification")
        }
        return item
    }

    func markNotificationsRead(ids: [String], all: Bool) async throws {
        _ = try await request("POST", NotificationsAPIPaths.read, body: NotificationsParser.markReadBody(ids: ids, all: all))
    }
}
