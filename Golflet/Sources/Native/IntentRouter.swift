import Foundation
import Observation

enum NativeAction: Hashable, Sendable {
    case startRound(hint: String)
    case recordShot(club: String)
    case recordRecap
    case openRound(id: String)
    case openInvite(token: String)
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
    static func inviteURL(token: String) -> URL {
        URL(string: "https://\(AssociatedDomains.host)\(AssociatedDomains.invitePathPrefix)\(token)")!
    }

    static func inviteToken(from url: URL) -> String? {
        let host = (url.host ?? "").lowercased()
        if url.scheme == "http" || url.scheme == "https" {
            guard host == AssociatedDomains.host || host == "www.\(AssociatedDomains.host)" else { return nil }
            return token(in: url.pathComponents)
        }
        guard url.scheme == "golflet" else { return nil }
        var parts = [url.host].compactMap { $0?.isEmpty == false ? $0 : nil }
        parts.append(contentsOf: url.pathComponents.filter { $0 != "/" })
        return token(in: parts)
    }

    static func parse(_ url: URL) -> NativeAction? {
        if let token = inviteToken(from: url) {
            return .openInvite(token: token)
        }
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

    private static func token(in parts: [String]) -> String? {
        guard let index = parts.firstIndex(where: { $0.caseInsensitiveCompare("g") == .orderedSame }),
              let raw = parts.dropFirst(index + 1).first
        else { return nil }
        let cleaned = raw.trimmingCharacters(in: CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_")).inverted)
        return cleaned.isEmpty ? nil : cleaned
    }
}
