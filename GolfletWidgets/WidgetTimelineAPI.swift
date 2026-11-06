import Foundation
import GolfletKit
import Security
import UIKit

/// Lock-screen source without an App Group.
/// The extension cannot read the app Keychain (no access group in the profile).
/// It asks `GET /api/widget/snapshot?device=` for the snapshot the app registered
/// with the session bearer. `/api/data` stays as a fallback when a bearer is
/// already in this process. TODO: when `group.com.sbuffose.golflet` exists,
/// prefer the shared container and stop depending on the device id.
enum WidgetTimelineAPI {
    static let dataEndpoint = URL(string: "https://golflet.vercel.app/api/data")!
    static let snapshotEndpoint = URL(string: "https://golflet.vercel.app/api/widget/snapshot")!

    static func fetch() async -> WidgetSnapshot {
        if let shared = sharedSnapshot(), !shared.isPlaceholder {
            return shared
        }
        if let remote = await fetchDeviceSnapshot(), !remote.isPlaceholder {
            return remote
        }
        if let authed = await fetchAuthenticatedData(), !authed.isPlaceholder {
            return authed
        }
        return shared ?? .placeholder
    }

    static func deviceID() -> String {
        UIDevice.current.identifierForVendor?.uuidString ?? "golflet-device"
    }

    private static func sharedSnapshot() -> WidgetSnapshot? {
        guard let defaults = UserDefaults(suiteName: AppGroupAvailability.identifier),
              AppGroupAvailability.isEnabled,
              let data = defaults.data(forKey: "golflet.widget-snapshot")
        else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    private static func fetchDeviceSnapshot() async -> WidgetSnapshot? {
        var parts = URLComponents(url: snapshotEndpoint, resolvingAgainstBaseURL: false)
        parts?.queryItems = [URLQueryItem(name: "device", value: deviceID())]
        guard let url = parts?.url else { return nil }
        return await get(url, bearer: nil)
    }

    private static func fetchAuthenticatedData() async -> WidgetSnapshot? {
        await get(dataEndpoint, bearer: KeychainToken.read())
    }

    private static func get(_ url: URL, bearer: String?) async -> WidgetSnapshot? {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 12
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let bearer, !bearer.isEmpty {
            request.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization")
        }
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard (200..<300).contains(status) else { return nil }
            return WidgetSnapshot.parseAPI(data)
        } catch {
            return nil
        }
    }
}

/// The widget process has no shared keychain. This only hits if a token was
/// written into the extension's own keychain, which today never happens.
enum KeychainToken {
    static func read() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: "com.sbuffose.golflet.session",
            kSecAttrAccount as String: "bearer",
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
