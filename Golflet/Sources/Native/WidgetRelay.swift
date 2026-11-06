import Foundation
import UIKit
import WidgetKit

/// Pushes the lock-screen snapshot without an App Group.
/// Posts the JSON to `/api/widget/snapshot` with the session bearer and the
/// device id the widget will send back. Then reloads GolfletHome.
/// The route is not on golflet.vercel.app yet (404). The call is ignored until
/// it exists. TODO: create `group.com.sbuffose.golflet` on the portal, then
/// share this JSON in the container instead.
enum WidgetRelay {
    static func schedule(_ snap: WidgetSnapshot) {
        let testing = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
        if !testing {
            WidgetCenter.shared.reloadTimelines(ofKind: "GolfletHome")
            WidgetCenter.shared.reloadAllTimelines()
        }
        guard !RuntimeFlags.isUITesting else { return }
        guard KeychainStore.loadToken() != nil else { return }
        Task { await push(snap) }
    }

    static func push(_ snap: WidgetSnapshot) async {
        guard let token = KeychainStore.loadToken() else { return }
        let device = UIDevice.current.identifierForVendor?.uuidString ?? "golflet-device"
        var body: [String: Any] = [
            "device": device,
            "handicap": snap.handicap
        ]
        if let lastGross = snap.lastGross { body["last_gross"] = lastGross }
        if let lastNet = snap.lastNet { body["last_net"] = lastNet }
        if let lastCourse = snap.lastCourse { body["last_course"] = lastCourse }
        if let lastRoundId = snap.lastRoundId { body["last_round_id"] = lastRoundId }
        if let lastDate = snap.lastDate { body["last_date"] = lastDate }
        if let nextCourse = snap.nextCourse { body["next_course"] = nextCourse }
        if let nextWhen = snap.nextWhen { body["next_when"] = nextWhen }
        if let nextDeepLink = snap.nextDeepLink { body["next_deep_link"] = nextDeepLink }
        guard let url = URL(string: "https://golflet.vercel.app/api/widget/snapshot"),
              let data = try? JSONSerialization.data(withJSONObject: body)
        else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 12
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.httpBody = data
        _ = try? await URLSession.shared.data(for: request)
    }
}
