import Foundation
import Observation

enum NativeAction: Hashable, Sendable {
    case startRound(hint: String)
    case recordShot(club: String)
    case recordRecap
    case openRound(id: String)
}

@MainActor
@Observable
final class IntentRouter {
    static let shared = IntentRouter()
    var pending: NativeAction?

    func post(_ action: NativeAction) {
        pending = action
    }

    func take() -> NativeAction? {
        let next = pending
        pending = nil
        return next
    }
}

enum GolfletURL {
    static func parse(_ url: URL) -> NativeAction? {
        guard url.scheme == "golflet" else { return nil }
        var parts = [url.host].compactMap { $0?.isEmpty == false ? $0 : nil }
        parts.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems
        switch parts.first {
        case "play":
            return .startRound(hint: query?.first(where: { $0.name == "course" })?.value ?? "")
        case "recap":
            return .recordRecap
        case "round":
            if let id = parts.dropFirst().first { return .openRound(id: id) }
            return nil
        case "shot":
            return .recordShot(club: query?.first(where: { $0.name == "club" })?.value ?? "7i")
        default:
            return nil
        }
    }
}
