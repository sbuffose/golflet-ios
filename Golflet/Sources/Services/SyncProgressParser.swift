import Foundation

enum SyncProgressParser {
    static func parse(_ json: [String: Any]) -> SyncAPIProgress? {
        let blob = (json["progress"] as? [String: Any]) ?? json
        guard let stage = SyncStage.parse(blob["stage"] as? String) else { return nil }
        return SyncAPIProgress(
            club: blob["club"] as? String,
            stage: stage,
            done: JSONFlex.int(from: blob["done"]),
            total: JSONFlex.int(from: blob["total"]),
            listTotal: JSONFlex.int(from: blob["list_total"]),
            finished: blob["finished"] as? Bool ?? (stage == .done),
            error: (blob["error"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            cardsTotal: JSONFlex.int(from: blob["cards_total"] ?? blob["total"])
        )
    }
}

enum SyncStepCopy {
    static func label(stage: SyncStage, state: SyncStepState, club: String, progress: SyncAPIProgress) -> String {
        let done = progress.done ?? 0
        let total = progress.total ?? 0
        switch stage {
        case .connect:
            return state == .done ? "Conectado con \(club)" : "Conectando con \(club)"
        case .list:
            if state == .done {
                if let list = progress.listTotal { return "\(list) tarjetas en Golfistics" }
                return "Tarjetas encontradas"
            }
            return "Buscando tus tarjetas"
        case .cards:
            if state == .done {
                let n = progress.cardsTotal ?? total
                return n > 0 ? "\(n) tarjetas nuevas leídas" : "Sin tarjetas nuevas"
            }
            return total > 0 ? "Leyendo tarjetas · \(done) de \(total)" : "Buscando tarjetas nuevas"
        case .handicap:
            return state == .done ? "Historial de hándicap al día" : "Leyendo tu historial de hándicap"
        case .save:
            if state == .done { return "Rondas guardadas" }
            return total > 0 ? "Guardando rondas · \(done) de \(total)" : "Guardando rondas"
        case .done:
            return "Listo"
        }
    }

    static func state(for stage: SyncStage, progress: SyncAPIProgress, outcome: SyncSession.Outcome) -> SyncStepState {
        if outcome == .failed, progress.stage == stage { return .error }
        let current = progress.stage == .done ? SyncStage.save : progress.stage
        guard let here = SyncStage.visible.firstIndex(of: stage),
              let active = SyncStage.visible.firstIndex(of: current)
        else { return .todo }
        if outcome == .succeeded || progress.stage == .done || here < active { return .done }
        if here == active { return .active }
        return .todo
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
