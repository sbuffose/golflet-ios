import Foundation

extension LiveGolfletAPI {
    func notifications() async throws -> NotificationsInbox {
        do {
            return NotificationsParser.inbox(from: try await request("GET", NotificationsAPIPaths.list))
        } catch {
            return .empty
        }
    }

    func markNotificationsRead(ids: [String]) async throws {
        let body = NotificationsParser.markReadBody(ids: ids)
        var lastError: Error = GolfletError.server("No se pudo marcar como leído.")
        for path in [NotificationsAPIPaths.read] + NotificationsAPIPaths.readAliases {
            do {
                _ = try await request("POST", path, body: body)
                return
            } catch {
                lastError = error
            }
            do {
                _ = try await request("PATCH", path == NotificationsAPIPaths.read ? NotificationsAPIPaths.list : path, body: body)
                return
            } catch {
                lastError = error
            }
        }
        throw lastError
    }
}
