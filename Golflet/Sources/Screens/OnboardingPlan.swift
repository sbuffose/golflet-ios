import Foundation

struct OnboardingFacts: Equatable {
    var name: String
    var handicap: Double?
    var clubName: String?
    var clubCode: String? = nil
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
            clubCode: clubs.first?.code,
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
            lines.append("Solo me faltan unos datos más")
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

enum OnboardingPlanKind: String, Equatable {
    case index, club, friends
}

struct OnboardingPlanItem: Equatable {
    var title: String
    var detail: String
    var figure: String
    var kind: OnboardingPlanKind
}

enum OnboardingPlanCards {
    /// El subtítulo habla del título. El número, el club o los grupos van aparte y solo si existen.
    static func items(facts: OnboardingFacts?, groupCount: Int) -> [OnboardingPlanItem] {
        let index: String = {
            guard let handicap = facts?.handicap else { return "–" }
            return FormatAR.one(handicap)
        }()
        let club = facts?.clubName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let friends: String = groupCount <= 0 ? "–" : "\(groupCount)"
        let friendLine: String = {
            if groupCount <= 0 { return "Cuando haya un grupo, salís juntos." }
            if groupCount == 1 { return "Un grupo para salir juntos." }
            return "\(groupCount) grupos para salir juntos."
        }()
        return [
            OnboardingPlanItem(
                title: "Tu índice",
                detail: index == "–"
                    ? "Cuando llegue el índice, vemos dónde se te escapan los golpes."
                    : "Desde este número vemos dónde se te escapan los golpes.",
                figure: index,
                kind: .index
            ),
            OnboardingPlanItem(
                title: "Tu club",
                detail: club.isEmpty
                    ? "Cuando tengamos el club, miramos lo que más te cuesta."
                    : "Ahí miramos lo que más te cuesta esta semana.",
                figure: club.isEmpty ? "–" : club,
                kind: .club
            ),
            OnboardingPlanItem(
                title: "Tus amigos",
                detail: friendLine,
                figure: friends,
                kind: .friends
            )
        ]
    }
}

enum OnboardingSyncBeat: String, CaseIterable, Equatable {
    case login
    case handicap
    case cards

    var title: String {
        switch self {
        case .login: return "Entraste"
        case .handicap: return "Hándicap"
        case .cards: return "Tarjetas"
        }
    }
}

struct OnboardingSyncFrame: Equatable {
    var phrase: String
    var fraction: Double
    var done: [OnboardingSyncBeat]
    var error: String?
}

/// Una sola frase, la de la etapa que el sync está haciendo ahora.
/// Un número o un club solo entra si `SyncAPIProgress` ya lo trajo.
/// Una etapa no figura como hecha hasta que el sync ya pasó de ahí.
enum OnboardingSyncCopy {
    static func frame(progress: SyncAPIProgress?, failed: Bool = false, message: String? = nil) -> OnboardingSyncFrame {
        let base = live(progress)
        guard failed else { return base }
        return OnboardingSyncFrame(
            phrase: base.phrase,
            fraction: base.fraction,
            done: base.done,
            error: message ?? progress?.error ?? "No pude traer tus tarjetas."
        )
    }

    private static func live(_ progress: SyncAPIProgress?) -> OnboardingSyncFrame {
        guard let progress else {
            return OnboardingSyncFrame(phrase: "Estoy entrando a tu club.", fraction: 0.08, done: [], error: nil)
        }
        var done: [OnboardingSyncBeat] = []
        if progress.stage != .connect { done.append(.login) }
        let cardsSeen = (progress.cardsTotal ?? 0) > 0 || (progress.stats?.rounds ?? 0) > 0 || (progress.done ?? 0) > 0
        let cardsFinished = progress.stage == .handicap || progress.stage == .save || progress.stage == .done
            || (progress.stage == .cards && (progress.total ?? 0) > 0 && (progress.done ?? 0) >= (progress.total ?? 1))
        if cardsFinished && cardsSeen { done.append(.cards) }
        if progress.stage == .save || progress.stage == .done { done.append(.handicap) }
        let fraction: Double = {
            switch progress.stage {
            case .connect:
                return SyncClubIdentity.isDetecting(progress.club) ? 0.08 : 0.28
            case .list:
                return 0.42
            case .cards:
                let total = progress.total ?? 0
                guard total > 0 else { return 0.48 }
                let ratio = min(1, Double(progress.done ?? 0) / Double(total))
                return 0.48 + 0.22 * ratio
            case .handicap:
                return 0.78
            case .save:
                return 0.9
            case .done:
                return 1
            }
        }()
        return OnboardingSyncFrame(phrase: liveLine(progress), fraction: fraction, done: done, error: nil)
    }

    static func liveLine(_ progress: SyncAPIProgress) -> String {
        switch progress.stage {
        case .connect:
            let count = progress.clubCount ?? 0
            if let club = progress.club?.trimmingCharacters(in: .whitespacesAndNewlines),
               !club.isEmpty,
               !SyncClubIdentity.isDetecting(club) {
                return "Conectando con \(club)."
            }
            return count > 1 ? "Conectando con tus clubes." : "Conectando con tu club."
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
