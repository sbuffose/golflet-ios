import Foundation

/// Shared-container gate. `group.com.sbuffose.golflet` is not on the
/// developer portal yet — do not add the `application-groups` entitlement
/// until that identifier exists.
public enum AppGroupAvailability {
    public static let identifier = "group.com.sbuffose.golflet"

    /// TODO: flip to `true` only after `group.com.sbuffose.golflet` exists on
    /// the developer portal and both entitlements list it. Adding the
    /// entitlement before that breaks TestFlight signing. No App Store Connect
    /// key is available in this environment, so the group stays off.
    /// Until then the widget reads `GET /api/widget/snapshot?device=` (the app
    /// registers that device with the session bearer). It cannot read the app
    /// Keychain: there is no keychain access group in the current profiles.
    public static var isEnabled: Bool { false }

    public static var sharedDefaults: UserDefaults? {
        guard isEnabled else { return nil }
        return UserDefaults(suiteName: identifier)
    }
}
