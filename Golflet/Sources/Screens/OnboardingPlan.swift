import Foundation

struct OnboardingFacts: Equatable {
    var name: String
    var handicap: Double?
    var clubName: String?
    var roundCount: Int
    var firstRound: Date?
    var roundsPerYear: Double?
    var averageGross: Double?
    var hasBag: Bool
    var hasDistances: Bool

    var cadence: String? {
        guard roundCount >= 4, let perYear = roundsPerYear else { return nil }
        let perMonth = perYear / 12
        if perMonth >= 3 { return "semana" }
        if perMonth >= 1 { return "mes" }
        if perMonth >= 0.4 { return "unames" }
        return "cuando"
    }

    var scoreBand: String? {
        guard let gross = averageGross else { return nil }
        if gross >= 100 { return "100" }
        if gross >= 90 { return "90" }
        if gross >= 80 { return "80" }
        return "70"
    }
}

enum OnboardingRoute: Equatable {
    case matricula
    case reveal
}

enum OnboardingAsk: String, Equatable, CaseIterable {
    case score
    case frec
    case meta
    case debil
    case modo
    case bag
    case iron
}

enum OnboardingPlan {
    static func make(
        profile: PlayerProfile,
        clubs: [LinkedClub],
        rounds: [Round],
        bag: [BagClub],
        now: Date = Date()
    ) -> OnboardingFacts {
        let dated = rounds.sorted { $0.date < $1.date }
        let handicap = dated.last(where: { $0.handicapIndex > 0.05 })?.handicapIndex
            ?? (profile.currentHandicap > 0.05 ? profile.currentHandicap : nil)
        let grosses = dated.suffix(20).compactMap(\.gross).filter { $0 > 0 }
        let average = grosses.isEmpty ? nil : Double(grosses.reduce(0, +)) / Double(grosses.count)
        let club = clubs.first?.name ?? dated.last?.clubName
        let perYear = roundsPerYear(dates: dated.map(\.date), now: now)
        let trimmedName = profile.greetingName.trimmingCharacters(in: .whitespacesAndNewlines)
        let untouchedDefault = bag.map(\.name) == DefaultBag.clubs
            && bag.allSatisfy { $0.carry == nil && $0.total == nil }
        return OnboardingFacts(
            name: trimmedName,
            handicap: handicap,
            clubName: club?.isEmpty == false ? club : nil,
            roundCount: rounds.count,
            firstRound: dated.first?.date,
            roundsPerYear: perYear,
            averageGross: average,
            hasBag: !bag.isEmpty && !untouchedDefault,
            hasDistances: bag.contains { $0.carry != nil || $0.total != nil }
        )
    }

    /// After Golfistics returns. A missing snapshot stays on the form so the user can retry.
    static func routeAfterSync(signedIn: Bool, hasSnapshot: Bool, needsClub: Bool, authFailed: Bool) -> OnboardingRoute {
        if signedIn && hasSnapshot && !needsClub && !authFailed { return .reveal }
        return .matricula
    }

    static func asks(for facts: OnboardingFacts) -> [OnboardingAsk] {
        var items: [OnboardingAsk] = []
        if facts.handicap == nil && facts.averageGross == nil {
            items.append(.score)
        }
        if facts.cadence == nil {
            items.append(.frec)
        }
        items.append(.meta)
        items.append(.debil)
        items.append(.modo)
        if !facts.hasBag {
            items.append(.bag)
            items.append(.iron)
        } else if !facts.hasDistances {
            items.append(.iron)
        }
        return items
    }

    static func revealLines(for facts: OnboardingFacts) -> [String] {
        var lines: [String] = []
        let name = facts.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty {
            lines.append("Hola, soy Roberto.")
        } else {
            lines.append("Hola, \(firstName(name)). Soy Roberto.")
        }
        if let club = facts.clubName {
            lines.append("Te veo en \(club).")
        } else if facts.roundCount > 0 || facts.handicap != nil {
            lines.append("Ya estuve en tu ficha.")
        } else {
            lines.append("Todavía no hay tarjetas a tu nombre.")
        }
        if let handicap = facts.handicap {
            lines.append("Tu index es \(FormatAR.one(handicap)).")
        }
        if let first = facts.firstRound {
            lines.append("La primera tarjeta es de \(FormatAR.monthYear(first)).")
        }
        if let cadence = facts.cadence {
            lines.append(cadenceLine(cadence))
        }
        if facts.roundCount > 0 {
            lines.append("Me faltan un par de cosas para armarte el inicio.")
        } else {
            lines.append("Te pregunto lo justo para armar tu inicio.")
        }
        return lines
    }

    static func cadenceLine(_ code: String) -> String {
        switch code {
        case "semana": return "Jugás seguido, varias veces por mes."
        case "mes": return "Salís algunas veces por mes."
        case "unames": return "Jugás más o menos una vez por mes."
        default: return "Jugás cuando podés."
        }
    }

    private static func roundsPerYear(dates: [Date], now: Date) -> Double? {
        guard let first = dates.first else { return nil }
        let last = dates.last ?? now
        let span = max(last.timeIntervalSince(first), 30 * 24 * 3600)
        let years = span / (365.25 * 24 * 3600)
        return Double(dates.count) / max(years, 1.0 / 12)
    }

    private static func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }
}

/// Copy de la espera de sync. Las cuatro frases fijas dicen qué está haciendo
/// Roberto, no qué encontró. Un número, un club o un "leí N" solo entra si
/// `SyncAPIProgress` ya lo trajo.
enum OnboardingSyncCopy {
    static let waiting: [String] = [
        "Estoy entrando a Golfistics.",
        "Busco tu hándicap y tu club.",
        "Traigo las tarjetas que el club tenga.",
        "Cuando entren, armo tu ficha."
    ]

    static func lines(progress: SyncAPIProgress?, elapsedStages: Int) -> [String] {
        var count = min(max(elapsedStages, 1), waiting.count)
        if let progress {
            count = max(count, slot(for: progress.stage) + 1)
        }
        var lines = Array(waiting.prefix(count))
        guard let progress else { return lines }
        let index = slot(for: progress.stage)
        guard lines.indices.contains(index) else { return lines }
        lines[index] = liveLine(progress)
        return lines
    }

    static func slot(for stage: SyncStage) -> Int {
        switch stage {
        case .connect: return 0
        case .handicap: return 1
        case .list, .cards: return 2
        case .save, .done: return 3
        }
    }

    static func liveLine(_ progress: SyncAPIProgress) -> String {
        switch progress.stage {
        case .connect:
            if let club = progress.club?.trimmingCharacters(in: .whitespacesAndNewlines), !club.isEmpty {
                return "Conectando con \(club)."
            }
            return "Conectando con Golfistics."
        case .list:
            if let count = progress.listTotal, count > 0 {
                return "El club lista \(count) tarjetas."
            }
            return "Busco el listado de tarjetas."
        case .cards:
            if let total = progress.total, total > 0 {
                return "Leí \(progress.done ?? 0) de \(total)."
            }
            return "Estoy leyendo tarjetas."
        case .handicap:
            return "Miro el historial de hándicap."
        case .save:
            if let total = progress.total, total > 0, let done = progress.done {
                return "Guardé \(done) de \(total)."
            }
            return "Estoy guardando lo que ya leí."
        case .done:
            return "Listo. Te muestro la ficha."
        }
    }
}
