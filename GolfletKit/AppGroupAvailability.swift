import Foundation

/// Shared-container gate. `group.com.sbuffose.golflet` is not on the
/// developer portal yet — do not add the `application-groups` entitlement
/// until that identifier exists.
public enum AppGroupAvailability {
    public static let identifier = "group.com.sbuffose.golflet"

    /// TODO: flip to `true` after creating `group.com.sbuffose.golflet` and
    /// adding `com.apple.security.application-groups` to both the app and the
    /// widget entitlements. Until then the extension cannot read the app
    /// UserDefaults / Keychain (HI snapshot, session token).
    public static var isEnabled: Bool { false }

    public static var sharedDefaults: UserDefaults? {
        guard isEnabled else { return nil }
        return UserDefaults(suiteName: identifier)
    }
}
