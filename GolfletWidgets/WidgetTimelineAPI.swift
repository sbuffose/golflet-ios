import Foundation
import GolfletKit

/// Widget timeline source. No shared container and no Keychain access group,
/// so this call is unauthenticated until `group.com.sbuffose.golflet` exists.
enum WidgetTimelineAPI {
    static let endpoint = URL(string: "https://golflet.vercel.app/api/data")!

    static func fetch() async -> WidgetSnapshot {
        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 || status == 403 {
                return .placeholder
            }
            guard (200..<300).contains(status) else { return .placeholder }
            return WidgetSnapshot.parseAPI(data) ?? .placeholder
        } catch {
            return .placeholder
        }
    }
}
