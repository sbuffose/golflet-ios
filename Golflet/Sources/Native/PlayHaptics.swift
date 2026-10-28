import UIKit

enum PlayHaptics {
    static func shot() {
        guard !RuntimeFlags.isUITesting else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
    }

    static func holeChange() {
        guard !RuntimeFlags.isUITesting else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }
}
