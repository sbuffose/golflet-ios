import SwiftUI

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shownCards: Int?
    @State private var cardsGold = false

    var body: some View {
        GScreen(id: "screen-inicio") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 28) {
                    if model.isLoaded {
                        Text("home-ready")
                            .font(.system(size: 1))
                            .foregroundStyle(.clear)
                            .frame(width: 1, height: 1)
                            .accessibilityIdentifier("home-ready")
                    }
                    header
                    handicapCard
                    lastRound
                    yearRow
                    recurring
                    groups
                    clubs
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 96)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen-inicio")
        .metricDestinations()
        .onChange(of: model.celebrateCards) { _, value in
            guard let value else { return }
            Task { await countUpCards(to: value) }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                GOverline(text: model.clubs.first?.name ?? "Golflet")
                Spacer()
                if let club = model.clubs.first {
                    Button {
                        model.requestSync(club)
                    } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(p.ink2)
                            .frame(width: 36, height: 36)
                            .background(p.surface)
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Actualizar")
                    .accessibilityIdentifier("home-sync-\(club.accountId)")
                }
                ZStack(alignment: .topTrailing) {
                    Button { model.openAvatar() } label: {
                        AvatarCircle(initials: model.profile.initials)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("avatar-button")
                    .accessibilityLabel(model.unreadBadgeText.map { "Notificaciones, \($0) sin leer" } ?? "Tu cuenta")
                    if let badge = model.unreadBadgeText {
                        Text(badge)
                            .font(GFont.ui(10, weight: .semibold))
                            .foregroundStyle(Color(hex: 0xF7F5F0))
                            .padding(.horizontal, badge.count > 1 ? 4 : 0)
                            .frame(minWidth: 16, minHeight: 16)
                            .background(Color(hex: 0xB4553F))
                            .clipShape(Capsule())
                            .offset(x: 6, y: -5)
                            .allowsHitTesting(false)
                            .accessibilityHidden(true)
                        GProbe(id: "avatar-badge", label: "\(badge) sin leer")
                    }
                }
                .padding(.top, 4)
            }
            Text("Hola, \(model.profile.displayName.components(separatedBy: " ").first ?? model.profile.displayName)")
                .font(GType.largeTitle)
                .tracking(-1.9)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("home-greeting")
            Button { model.showsPlay = true } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Jugar")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                        Text("Ronda con GPS")
                            .font(GType.label)
                            .foregroundStyle(p.onPrimary.opacity(0.65))
                    }
                    Spacer()
                    Image(systemName: "location.fill")
                        .foregroundStyle(p.accent)
                }
                .padding(16)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("play-start")
            .padding(.top, 6)
        }
    }

    private var handicapCard: some View {
        let snap = model.home
        return GCard(fill: p.primary, radius: 28, padding: 20) {
            VStack(alignment: .leading, spacing: 18) {
                NavigationLink(value: MetricRoute.handicap) {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .top) {
                            GOverline(text: "Handicap index", color: p.onPrimary.opacity(0.55))
                            Spacer()
                            Text("Tendencia estimada · 40 rondas")
                                .font(GType.label)
                                .foregroundStyle(p.onPrimary.opacity(0.5))
                            MetricChevron(color: p.onPrimary.opacity(0.4))
                        }
                        HStack(alignment: .center, spacing: 16) {
                            Text(FormatAR.one(snap.handicapIndex))
                                .font(GType.statHero)
                                .tracking(-4.4)
                                .tabular()
                                .foregroundStyle(p.onPrimary)
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                            Sparkline(values: snap.trendValues, color: p.accent)
                                .frame(height: 54)
                        }
                        HStack(spacing: 6) {
                            Image(systemName: snap.trendDelta <= 0 ? "arrow.down" : "arrow.up")
                                .font(.system(size: 11, weight: .semibold))
                            Text("\(FormatAR.one(abs(snap.trendDelta))) \(snap.trendSinceLabel)")
                                .font(GType.label)
                        }
                        .foregroundStyle(p.onPrimary.opacity(0.7))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-handicap")

                HStack(alignment: .top) {
                    NavigationLink(value: MetricRoute.roundList(.allCards)) {
                        heroMini("Tarjetas", "\(shownCards ?? snap.cards)", gold: cardsGold)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-tarjetas")
                    Spacer()
                    NavigationLink(value: MetricRoute.roundList(.bestGross(yearOnly: false))) {
                        heroMini("Mejor gross", snap.bestGross.map(String.init) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-best-gross")
                    Spacer()
                    NavigationLink(value: MetricRoute.roundList(.average(yearOnly: true))) {
                        heroMini("Promedio \(Calendar.gregorian.component(.year, from: Date()))", snap.yearAverage.map(FormatAR.one) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-average")
                }
                .padding(.top, 4)
            }
        }
        .accessibilityIdentifier("handicap-card")
    }

    private func heroMini(_ label: String, _ value: String, gold: Bool = false) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.5))
                    .lineLimit(1)
                MetricChevron(color: p.onPrimary.opacity(0.35))
            }
            Text(value)
                .font(GType.statM)
                .tabular()
                .lineLimit(1)
                .foregroundStyle(gold ? p.accent : p.onPrimary)
        }
        .contentShape(Rectangle())
    }

    private func countUpCards(to target: Int) async {
        if reduceMotion {
            shownCards = target
            return
        }
        shownCards = 0
        cardsGold = true
        let duration = 0.9
        let start = Date()
        while Date().timeIntervalSince(start) < duration {
            let t = min(1, Date().timeIntervalSince(start) / duration)
            let eased = 1 - pow(1 - t, 3)
            shownCards = Int((Double(target) * eased).rounded())
            try? await Task.sleep(for: .milliseconds(16))
        }
        shownCards = target
        try? await Task.sleep(for: .seconds(1.6))
        cardsGold = false
        model.celebrateCards = nil
    }

    private var lastRound: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Última ronda")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Button("Ver todas") { model.selectedTab = .rondas }
                    .font(GType.headline)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("ver-todas")
            }
            if let round = model.home.lastRound {
                Button { model.presentedRound = round } label: {
                    RoundRow(round: round, style: .home)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("last-round-card")
            }
        }
    }

    private var yearRow: some View {
        let snap = model.home
        let year = Calendar.gregorian.component(.year, from: Date())
        let valid = StatsEngine.eighteenHoleValid(model.rounds)
        let yearRounds = valid.filter { Calendar.gregorian.component(.year, from: $0.date) == year }
        let yearShare = valid.isEmpty ? 0 : Double(yearRounds.count) / Double(valid.count)
        return VStack(alignment: .leading, spacing: 12) {
            Text("Este año")
                .font(GType.section)
                .foregroundStyle(p.ink)
            HStack(spacing: 10) {
                NavigationLink(value: MetricRoute.roundList(.yearRounds)) {
                    AccentStatCard(
                        tint: .primary,
                        icon: "flag.fill",
                        title: "Rondas",
                        value: "\(snap.yearRoundCount)",
                        share: yearShare,
                        shareNoun: "las rondas",
                        compact: true
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-year-rounds")
                NavigationLink(value: MetricRoute.roundList(.bestGross(yearOnly: true))) {
                    AccentStatCard(
                        tint: .primary,
                        icon: "trophy.fill",
                        title: "Mejor",
                        value: snap.yearBestGross.map(String.init) ?? "—",
                        compact: true
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-year-best")
                NavigationLink(value: MetricRoute.scoreKind(.birdie, .yearRounds)) {
                    AccentStatCard(
                        tint: .gold,
                        icon: ScoreKind.birdie.symbolName,
                        title: "Birdies",
                        value: "\(snap.yearBirdies)",
                        share: StatsEngine.holeShare(.birdie, in: yearRounds),
                        compact: true
                    )
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("metric-year-birdies")
            }
        }
    }

    private var recurring: some View {
        Group {
            if let report = model.recurring, let first = report.items.first {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Después de la ronda")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    NavigationLink(value: MetricRoute.recurring) {
                        GCard(radius: 22, padding: 16) {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text("Errores que se repiten")
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Spacer()
                                    MetricChevron(color: p.ink3)
                                }
                                Text(first.text)
                                    .font(GType.body)
                                    .foregroundStyle(p.ink2)
                                Text("En \(report.roundsConsidered) de las últimas \(report.lastN) rondas")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home-recurring")
                }
            }
        }
    }

    private var groups: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Grupos")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if let invite = model.pendingInvites.first {
                Button {
                    model.presentedInvite = invite
                } label: {
                    GCard(radius: 22, padding: 16) {
                        HStack(spacing: 12) {
                            Image(systemName: "person.2.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(p.accent)
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Invitación pendiente")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(invite.name)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            Spacer()
                            MetricChevron(color: p.ink3)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home-pending-invite")
            }
            Button { model.showsGroups = true } label: {
                GCard(radius: 22, padding: 16) {
                    HStack(spacing: 12) {
                        Image(systemName: "person.3.fill")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(p.primary)
                        VStack(alignment: .leading, spacing: 4) {
                            Text(model.groups.isEmpty ? "Crear un grupo" : "\(model.groups.count) \(model.groups.count == 1 ? "grupo" : "grupos")")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text(model.groups.first?.name ?? "Compará tu juego con amigos")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                        Spacer()
                        MetricChevron(color: p.ink3)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-grupos")
        }
    }

    private var clubs: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Mis clubes")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 22, padding: 16) {
                VStack(spacing: 14) {
                    ForEach(model.clubs) { club in
                        HStack(spacing: 10) {
                            NavigationLink(value: MetricRoute.roundList(.club(club))) {
                                HStack(spacing: 12) {
                                    Text(String(club.name.prefix(1)))
                                        .font(GFont.ui(14, weight: .semibold))
                                        .foregroundStyle(p.onPrimary)
                                        .frame(width: 32, height: 32)
                                        .background(p.primary)
                                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(club.name)
                                            .font(GType.headline)
                                            .foregroundStyle(p.ink)
                                        HStack(spacing: 6) {
                                            Circle().fill(club.lastSyncStatus == "error" ? p.negative : p.positive).frame(width: 6, height: 6)
                                            Text(clubCountLine(club))
                                                .font(GType.label)
                                                .foregroundStyle(p.ink2)
                                                .lineLimit(1)
                                        }
                                    }
                                    Spacer(minLength: 4)
                                    MetricChevron(color: p.ink3)
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("metric-club-\(club.accountId)")
                            Button {
                                model.requestSync(club)
                            } label: {
                                Image(systemName: "arrow.clockwise")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(p.ink2)
                                    .frame(width: 32, height: 32)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Actualizar")
                            .accessibilityIdentifier("home-club-\(club.accountId)")
                        }
                    }
                    Button { model.showsClubs = true } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "plus")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(p.ink3)
                                .frame(width: 32, height: 32)
                                .background(p.surface2)
                                .clipShape(Circle())
                            VStack(alignment: .leading, spacing: 2) {
                                Text(model.clubs.isEmpty ? "Vincular Golfistics App" : "Tu cuenta de Golfistics")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(model.clubs.isEmpty ? "Matrícula y clave de la App" : "Actualizar trae todos tus clubes")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("add-club-home")
                }
            }
        }
    }

    private func clubCountLine(_ club: LinkedClub) -> String {
        let n = model.rounds.filter { $0.clubCode == club.code }.count
        let cards = n > 0 ? n : club.cardCount
        if cards > 0 { return "\(cards) tarjetas" }
        return club.lastSyncMessage ?? "Sin tarjetas"
    }
}

struct RoundRow: View {
    @Environment(\.palette) private var p
    let round: Round
    var style: Style = .list

    enum Style { case home, list }

    var body: some View {
        GCard(radius: 22, padding: 16) {
            HStack(alignment: .center, spacing: 14) {
                let dm = FormatAR.dayMonth(round.date)
                VStack(spacing: 0) {
                    Text(dm.day)
                        .font(GFont.ui(22, weight: .semibold))
                        .tabular()
                        .foregroundStyle(p.ink)
                    Text(dm.month)
                        .font(GType.overline)
                        .foregroundStyle(p.ink3)
                }
                .frame(width: 44)
                VStack(alignment: .leading, spacing: 4) {
                    Text(round.displayTitle)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                        .lineLimit(1)
                    HStack(spacing: 6) {
                        if !round.isOtherCourse, !round.tee.isEmpty {
                            TeeDot(name: round.tee)
                        }
                        Text(meta)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(round.gross.map(String.init) ?? "—")
                        .font(GType.statM)
                        .tabular()
                        .foregroundStyle(p.ink)
                    Text(round.net.map(String.init) ?? "—")
                        .font(GType.label)
                        .tabular()
                        .foregroundStyle(p.ink3)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(p.ink3)
            }
        }
    }

    private var meta: String {
        if round.isOtherCourse {
            var parts = [round.clubName]
            if round.displayCourse.caseInsensitiveCompare(round.clubName) != .orderedSame {
                parts.append(round.displayCourse)
            }
            return parts.joined(separator: " · ")
        }
        var parts = [round.displayCourse]
        if !round.tee.isEmpty, round.tee.caseInsensitiveCompare(round.course) != .orderedSame {
            parts.append(round.tee)
        }
        if let pos = round.position, let field = round.fieldSize {
            parts.append("\(pos)° de \(field)")
        }
        return parts.joined(separator: " · ")
    }
}

extension Round {
    var displayTitle: String {
        var title = tournament
        let junk = ["0-54", "0-36", "0-15.9", "18hmp", "36hmp", "🟦", "🟥", "Sabado", "Sábado", "Domingo", "Miercoles", "Miércoles"]
        for token in junk {
            title = title.replacingOccurrences(of: token, with: "")
        }
        title = title.replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if title.count > 28 {
            let words = title.split(separator: " ").prefix(4)
            title = words.joined(separator: " ")
        }
        return title
    }
}
