import Foundation

struct RecapQueued: Hashable, Sendable {
    var clientId: String
    var roundId: String?
    var liveRoundId: String?
    var transcript: String
    var summary: String?
    var source: String?
    var model: String?
    var durationS: Double?
    var audio: Data?
}

enum RecapQueue {
    private static let key = "golflet.recap-queue"

    static func enqueue(_ item: RecapQueued) {
        var items = all()
        items.removeAll { $0.clientId == item.clientId }
        items.append(item)
        save(Array(items.suffix(20)))
    }

    static func all() -> [RecapQueued] {
        guard let data = UserDefaults.standard.data(forKey: key),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return raw.compactMap { item in
            guard let id = item["client_id"] as? String else { return nil }
            let audioB64 = item["audio_b64"] as? String
            return RecapQueued(
                clientId: id,
                roundId: item["round_id"] as? String,
                liveRoundId: item["live_round_id"] as? String,
                transcript: item["transcript"] as? String ?? "",
                summary: item["summary"] as? String,
                source: item["source"] as? String,
                model: item["model"] as? String,
                durationS: JSONFlex.double(from: item["duration_s"]),
                audio: audioB64.flatMap { Data(base64Encoded: $0) }
            )
        }
    }

    static func remove(clientIds: Set<String>) {
        save(all().filter { !clientIds.contains($0.clientId) })
    }

    static func reset() {
        UserDefaults.standard.removeObject(forKey: key)
    }

    private static func save(_ items: [RecapQueued]) {
        let raw: [[String: Any]] = items.map { item in
            var body: [String: Any] = [
                "client_id": item.clientId,
                "transcript": item.transcript
            ]
            if let roundId = item.roundId { body["round_id"] = roundId }
            if let liveRoundId = item.liveRoundId { body["live_round_id"] = liveRoundId }
            if let summary = item.summary { body["summary"] = summary }
            if let source = item.source { body["source"] = source }
            if let model = item.model { body["model"] = model }
            if let durationS = item.durationS { body["duration_s"] = durationS }
            if let audio = item.audio, audio.count <= 400_000 {
                body["audio_b64"] = audio.base64EncodedString()
            }
            return body
        }
        if let data = try? JSONSerialization.data(withJSONObject: raw) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }
}
