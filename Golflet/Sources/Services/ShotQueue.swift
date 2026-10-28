import Foundation

enum ShotQueue {
    private static let key = "golflet.shot-queue"

    static func enqueue(_ draft: ShotDraft) {
        var items = all()
        items.append(draft)
        save(items)
    }

    static func all() -> [ShotDraft] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return raw.compactMap { item in
            guard let id = item["client_id"] as? String,
                  let live = item["live_round_id"] as? String,
                  let lat = JSONFlex.double(from: item["lat"]),
                  let lng = JSONFlex.double(from: item["lng"])
            else { return nil }
            return ShotDraft(
                clientId: id,
                hole: JSONFlex.int(from: item["hole"]) ?? 1,
                lat: lat,
                lng: lng,
                accuracyM: JSONFlex.double(from: item["accuracy_m"]),
                takenAt: ISO8601DateFormatter().date(from: item["taken_at"] as? String ?? "") ?? Date(),
                club: item["club"] as? String,
                lie: item["lie"] as? String,
                result: item["result"] as? String,
                direction: item["direction"] as? String,
                length: item["length"] as? String,
                mishit: JSONFlex.bool(from: item["mishit"]) ?? false,
                liveRoundId: live
            )
        }
    }

    static func remove(clientIds: Set<String>) {
        save(all().filter { !clientIds.contains($0.clientId) })
    }

    static func update(clientId: String, mutate: (inout ShotDraft) -> Void) {
        var items = all()
        guard let index = items.firstIndex(where: { $0.clientId == clientId }) else { return }
        mutate(&items[index])
        save(items)
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    static func payload(_ draft: ShotDraft) -> [String: Any] {
        var body: [String: Any] = [
            "client_id": String(draft.clientId.prefix(64)),
            "live_round_id": draft.liveRoundId,
            "hole": draft.hole,
            "lat": draft.lat,
            "lng": draft.lng,
            "taken_at": ISO8601DateFormatter().string(from: draft.takenAt)
        ]
        if let accuracy = draft.accuracyM { body["accuracy_m"] = accuracy }
        if let club = draft.club { body["club"] = club }
        if let lie = draft.lie { body["lie"] = lie }
        if let result = draft.result { body["result"] = result }
        if let direction = draft.direction { body["direction"] = direction }
        if let length = draft.length { body["length"] = length }
        if draft.mishit { body["mishit"] = true }
        return body
    }

    private static func save(_ items: [ShotDraft]) {
        let raw = items.suffix(200).map(payload)
        if let data = try? JSONSerialization.data(withJSONObject: Array(raw)) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}