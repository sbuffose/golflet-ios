import Foundation

enum SyncProgressParser {
    static func parse(_ json: [String: Any]) -> SyncProgress? {
        let blobs: [[String: Any]] = [
            json["progress"] as? [String: Any],
            json["sync"] as? [String: Any],
            json
        ].compactMap { $0 }

        for blob in blobs {
            if let progress = fromBlob(blob) { return progress }
        }
        return nil
    }

    static func parseLine(_ line: String) -> SyncProgress? {
        let trimmed = stripSSE(line)
        guard !trimmed.isEmpty, trimmed != "[DONE]" else { return nil }
        guard let data = trimmed.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let json = object as? [String: Any]
        else { return nil }
        return parse(json)
    }

    static func parseJSONObject(_ text: String) -> [String: Any]? {
        let trimmed = stripSSE(text)
        guard let data = trimmed.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data)
        else { return nil }
        return object as? [String: Any]
    }

    static func fromClub(_ club: LinkedClub) -> SyncProgress? {
        let status = club.lastSyncStatus?.lowercased() ?? ""
        let message = club.lastSyncMessage?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if status == "running" || status == "syncing" || !message.isEmpty && status != "ok" && status != "error" {
            return SyncProgress(
                phase: SyncProgress.Phase.parse(status) ?? inferPhase(message: message, current: nil),
                message: message.isEmpty ? "Leyendo tarjetas" : message,
                current: nil,
                total: club.cardCount > 0 ? club.cardCount : nil
            )
        }
        if let nested = parse(["message": message, "phase": status, "total": club.cardCount]) {
            return nested
        }
        return nil
    }

    static func staged(clubName: String, elapsed: TimeInterval, knownCards: Int?, compressed: Bool) -> SyncProgress {
        let connectEnd = compressed ? 0.12 : 6
        let enterEnd = compressed ? 0.20 : 12
        let readEnd = compressed ? 0.32 : 75
        let calcEnd = compressed ? 0.42 : 95
        let total = max(knownCards ?? 97, 1)

        if elapsed < connectEnd {
            return SyncProgress(phase: .connecting, message: "Conectando con \(clubName)")
        }
        if elapsed < enterEnd {
            return SyncProgress(phase: .connecting, message: "Entrando a Golfistics")
        }
        if elapsed < readEnd {
            let span = max(readEnd - enterEnd, 0.01)
            let fraction = min(1, max(0, (elapsed - enterEnd) / span))
            let current = min(total, max(1, Int((fraction * Double(total - 1)).rounded(.down) + 1)))
            return SyncProgress(
                phase: .reading,
                message: "Leyendo tarjetas · \(current) de \(total)",
                current: current,
                total: total
            )
        }
        if elapsed < calcEnd {
            return SyncProgress(phase: .calculating, message: "Calculando tu hándicap")
        }
        return SyncProgress(phase: .finishing, message: "Ordenando tus rondas")
    }

    private static func fromBlob(_ blob: [String: Any]) -> SyncProgress? {
        let message = firstString(blob, keys: ["message", "status_message", "last_sync_message", "detail", "text"])
        let current = JSONFlex.int(from: blob["current"] ?? blob["n"] ?? blob["cards_read"] ?? blob["read"] ?? blob["done"] ?? blob["index"])
        let total = JSONFlex.int(from: blob["total"] ?? blob["of"] ?? blob["cards_total"] ?? blob["count"] ?? blob["cards"])
        let phase = SyncProgress.Phase.parse(
            firstString(blob, keys: ["phase", "step", "status", "last_sync_status", "state"])
        )

        if message == nil && current == nil && phase == nil {
            return nil
        }
        if phase == nil, current == nil, let message, blob["ok"] is Bool, blob["progress"] == nil {
            return nil
        }

        return SyncProgress(
            phase: phase ?? inferPhase(message: message, current: current),
            message: message ?? "",
            current: current,
            total: total
        )
    }

    static func inferPhase(message: String?, current: Int?) -> SyncProgress.Phase {
        let text = (message ?? "").lowercased()
        if text.contains("hándicap") || text.contains("handicap") { return .calculating }
        if text.contains("orden") || text.contains("guardando") { return .finishing }
        if text.contains("leyendo") || text.contains("tarjeta") || current != nil { return .reading }
        if text.contains("conect") || text.contains("golfistics") { return .connecting }
        if text.contains("listo") { return .success }
        return current != nil ? .reading : .connecting
    }

    private static func firstString(_ blob: [String: Any], keys: [String]) -> String? {
        for key in keys {
            if let value = blob[key] as? String {
                let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
                if !trimmed.isEmpty { return trimmed }
            }
        }
        return nil
    }

    private static func stripSSE(_ line: String) -> String {
        var text = line.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.lowercased().hasPrefix("data:") {
            text = String(text.dropFirst(5)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        return text
    }
}
