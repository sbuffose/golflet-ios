import Foundation

/// Universal-link host for group invites. Entitlement lives on the app only:
/// `com.apple.developer.associated-domains = [applinks:golflet.vercel.app]`.
enum AssociatedDomains {
    static let host = "golflet.vercel.app"
    static let applinks = "applinks:golflet.vercel.app"
    static let invitePathPrefix = "/g/"
}

enum PendingInviteStore {
    static let key = "golflet.pendingInviteToken"

    static func save(_ token: String, defaults: UserDefaults = .standard) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        defaults.set(trimmed, forKey: key)
    }

    static func load(defaults: UserDefaults = .standard) -> String? {
        guard let token = defaults.string(forKey: key), !token.isEmpty else { return nil }
        return token
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }
}
