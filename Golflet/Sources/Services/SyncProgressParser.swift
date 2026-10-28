import Foundation

enum SyncProgressParser {
    static func parse(_ json: [String: Any]) -> SyncAPIProgress? {
        let blob = (json["progress"] as? [String: Any]) ?? json
        guard let stage = SyncStage.parse(blob["stage"] as? String) else { return nil }
        return SyncAPIProgress(
            club: blob["club"] as? String,
            clubIndex: JSONFlex.int(from: blob["club_index"]),
            clubCount: JSONFlex.int(from: blob["club_count"]),
            clubCode: string(blob["club_code"]),
            clubLogo: string(blob["club_logo"]),
            clubInitials: string(blob["club_initials"]),
            stage: stage,
            done: JSONFlex.int(from: blob["done"]),
            total: JSONFlex.int(from: blob["total"]),
            listTotal: JSONFlex.int(from: blob["list_total"]),
            finished: blob["finished"] as? Bool ?? (stage == .done),
            error: (blob["error"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty,
            cardsTotal: JSONFlex.int(from: blob["cards_total"] ?? blob["total"]),
            stats: parseStats(blob["stats"])
        )
    }

    static func parseStats(_ raw: Any?) -> SyncLiveStats? {
        guard let blob = raw as? [String: Any] else { return nil }
        let best = blob["best_gross"]
        let bestObject = best as? [String: Any]
        return SyncLiveStats(
            rounds: JSONFlex.int(from: blob["rounds"]),
            roundsWithHoles: JSONFlex.int(from: blob["rounds_with_holes"]),
            holes: JSONFlex.int(from: blob["holes"]),
            eagles: JSONFlex.int(from: blob["eagles"] ?? blob["eagle"] ?? blob["eagle_or_better"]),
            birdies: JSONFlex.int(from: blob["birdies"] ?? blob["birdie"]),
            pars: JSONFlex.int(from: blob["pars"] ?? blob["par"]),
            bogeys: JSONFlex.int(from: blob["bogeys"] ?? blob["bogey"]),
            doublesPlus: JSONFlex.int(from: blob["doubles_plus"] ?? blob["doubles"] ?? blob["double_plus"]),
            days: JSONFlex.int(from: blob["days"]),
            bestGross: JSONFlex.int(from: bestObject?["gross"] ?? bestObject?["score"] ?? best),
            bestGrossDate: parseDay(bestObject?["date"] ?? blob["best_gross_date"]),
            bestGrossCourse: string(bestObject?["course"] ?? blob["best_gross_course"]),
            months: parseMonths(blob["months"]),
            lastCard: parseLastCard(blob["last_card"])
        )
    }

    static func parseLastCard(_ raw: Any?) -> SyncLastCard? {
        guard let blob = raw as? [String: Any] else { return nil }
        let holes = parseLastHoles(blob["holes"])
        let par = JSONFlex.int(from: blob["par"])
            ?? (holes.compactMap(\.par).isEmpty ? nil : holes.compactMap(\.par).reduce(0, +))
        return SyncLastCard(
            date: parseDay(blob["date"]),
            course: string(blob["course"]),
            club: string(blob["club"] ?? blob["club_name"] ?? blob["club_played"]),
            otherCourse: JSONFlex.bool(from: blob["other_course"]) ?? false,
            gross: JSONFlex.int(from: blob["gross"]),
            par: par,
            holes: holes
        )
    }

    private static func parseLastHoles(_ raw: Any?) -> [SyncLastHole] {
        if let objects = raw as? [[String: Any]] {
            return objects.compactMap { hole in
                guard let number = JSONFlex.int(from: hole["hole"] ?? hole["number"]) else { return nil }
                return SyncLastHole(
                    number: number,
                    par: JSONFlex.int(from: hole["par"]),
                    strokes: JSONFlex.int(from: hole["strokes"])
                )
            }
        }
        if let tuples = raw as? [[Any]] {
            return tuples.compactMap { row in
                guard let number = JSONFlex.int(from: row.first) else { return nil }
                return SyncLastHole(
                    number: number,
                    par: row.count > 1 ? JSONFlex.int(from: row[1]) : nil,
                    strokes: row.count > 2 ? JSONFlex.int(from: row[2]) : nil
                )
            }
        }
        return []
    }

    private static func parseMonths(_ raw: Any?) -> [SyncMonthPoint] {
        if let items = raw as? [[String: Any]] {
            return items.compactMap { item in
                let month = string(item["month"] ?? item["ym"] ?? item["key"])
                let rounds = JSONFlex.int(from: item["rounds"] ?? item["days"] ?? item["count"]) ?? 0
                guard let month else { return nil }
                return SyncMonthPoint(month: month, rounds: rounds)
            }
        }
        if let ints = raw as? [Int] {
            return ints.enumerated().map { index, rounds in
                let month = String(format: "%02d", index + 1)
                return SyncMonthPoint(month: month, rounds: rounds)
            }
        }
        return []
    }

    private static func parseDay(_ raw: Any?) -> Date? {
        guard let raw else { return nil }
        if let date = raw as? Date { return date }
        if let number = JSONFlex.double(from: raw), number > 1_000_000 {
            return Date(timeIntervalSince1970: number > 10_000_000_000 ? number / 1000 : number)
        }
        guard let text = raw as? String else { return nil }
        if let day = DayStamp.parse(text) { return day }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: text) { return date }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: text)
    }

    private static func string(_ raw: Any?) -> String? {
        guard let text = raw as? String else { return nil }
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

enum SyncStepCopy {
    static func label(stage: SyncStage, state: SyncStepState, club: String, progress: SyncAPIProgress) -> String {
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
            return total > 0 ? "Leyendo tarjetas" : "Buscando tarjetas nuevas"
        case .handicap:
            return state == .done ? "Historial de hándicap al día" : "Leyendo tu historial de hándicap"
        case .save:
            if state == .done { return "Rondas guardadas" }
            return "Guardando rondas"
        case .done:
            return "Listo"
        }
    }

    static func counter(stage: SyncStage, state: SyncStepState, progress: SyncAPIProgress) -> String? {
        guard state == .active, stage == .cards || stage == .save, let total = progress.total, total > 0 else {
            return nil
        }
        return "\(progress.done ?? 0) / \(total)"
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

enum SyncClubIdentity {
    private static let stop = Set(["de", "del", "la", "las", "los", "el", "y", "e", "club", "golf", "country", "the", "and", "cc", "gc", "g", "c", "asociacion", "asociación", "sociedad", "sa"])

    static func isDetecting(_ name: String?) -> Bool {
        guard let name, !name.isEmpty else { return true }
        return name == "Golfistics App" || name == "tu club"
    }

    static func initials(name: String?, provided: String? = nil) -> String {
        if let provided, !provided.isEmpty { return provided.uppercased() }
        let words = (name ?? "")
            .replacingOccurrences(of: "[()·.,]", with: " ", options: .regularExpression)
            .split(separator: " ")
            .map(String.init)
            .filter { !$0.isEmpty }
        let kept = words.filter { !stop.contains($0.lowercased()) }
        let source = kept.isEmpty ? words : kept
        let letters = source.prefix(2).compactMap { $0.first }.map(String.init)
        return (letters.isEmpty ? "G" : letters.joined()).uppercased()
    }

    static func logoURL(_ path: String?) -> URL? {
        guard let path, !path.isEmpty else { return nil }
        if path.hasPrefix("http://") || path.hasPrefix("https://") { return URL(string: path) }
        let suffix = path.hasPrefix("/") ? path : "/\(path)"
        return URL(string: "https://golflet.vercel.app\(suffix)")
    }
}

private extension String {
    var nilIfEmpty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
