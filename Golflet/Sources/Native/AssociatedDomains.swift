import Foundation

/// Universal-link host for group invites. Entitlement lives on the app only:
/// `com.apple.developer.associated-domains = [applinks:golflet.vercel.app]`.
enum AssociatedDomains {
    static let host = "golflet.vercel.app"
    static let applinks = "applinks:golflet.vercel.app"
    static let invitePathPrefix = "/g/"
}
