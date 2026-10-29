import SwiftUI
import UIKit

struct HomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shownCards: Int?
    @State private var cardsGold = false
    @State private var showsHcpImpact = false
    @State private var showsHomeGroups = false
    @State private var showsHomeProfesores = false
    @State private var showsAgregarProfesor = false
    @State private var presentedProfesor: Profesor?
    @State private var highlightPartners = false
    @State private var hcpCardWidth = HomeHcpPeopleLayout.cardInnerWidth(screenWidth: HomeHcpPeopleLayout.currentScreenWidth)

    var body: some View {
        GScreen(id: "screen-inicio") {
            ScrollViewReader { proxy in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 28) {
                        if model.isLoaded {
                            Text("home-ready")
                                .font(.system(size: 1))
                                .foregroundStyle(.clear)
                                .frame(width: 1, height: 1)
                                .accessibilityIdentifier("home-ready")
                        }
                        header(scroll: proxy)
                        handicapCard
                        lastRound
                        teeTimesCard
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
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen-inicio")
        .metricDestinations()
        .sheet(isPresented: $showsHcpImpact) {
            if let impact = model.metricsSummary?.hcpImpact ?? localHcpImpact {
                NavigationStack {
                    HcpImpactSheet(impact: impact)
                }
                .golfletChrome()
            }
        }
        .sheet(isPresented: $showsHomeGroups) {
            NavigationStack {
                HomeGroupsSheet()
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: $showsHomeProfesores) {
            NavigationStack {
                HomeProfesoresSheet { profesor in
                    presentProfesor(profesor)
                }
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: $showsAgregarProfesor) {
            NavigationStack {
                AgregarProfesorSheet { profesor in
                    presentProfesor(profesor)
                }
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(item: $presentedProfesor) { profesor in
            NavigationStack {
                ProfesorDetailView(profesor: profesor)
            }
            .golfletChrome()
        }
        .onChange(of: model.celebrateCards) { _, value in
            guard let value else { return }
            Task { await countUpCards(to: value) }
        }
    }

    private func presentProfesor(_ profesor: Profesor) {
        let dismissing = showsHomeProfesores || showsAgregarProfesor
        showsHomeProfesores = false
        showsAgregarProfesor = false
        if dismissing {
            Task { @MainActor in
                presentedProfesor = profesor
            }
        } else {
            presentedProfesor = profesor
        }
    }

    private func homeHcpPeople() -> HomeHcpPeople {
        HomeHcpPeople(
            profesores: model.profesores,
            groups: model.groups,
            onProfesor: { presentProfesor($0) },
            onProfesores: { showsHomeProfesores = true },
            onAddProfesor: { showsAgregarProfesor = true },
            onGroups: { showsHomeGroups = true },
            onCreate: { model.presentCreateGroup() }
        )
    }

    private func header(scroll: ScrollViewProxy) -> some View {
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
            HomeGreetingHeader(
                name: model.profile.greetingName,
                booking: model.nextTeeTime,
                onTab: { revealPartners(scroll) }
            )
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
        let peopleWidth = HomeHcpPeopleLayout.columnWidth(
            profesorCount: model.profesores.count,
            groupCount: model.groups.count
        )
        let numberWidth = HomeHcpPeopleLayout.numberWidth(snap.handicapIndex)
        let place = HomeHcpPeopleLayout.place(
            cardWidth: hcpCardWidth,
            numberWidth: numberWidth,
            peopleWidth: peopleWidth
        )
        return GCard(fill: p.primary, radius: 28, padding: 20) {
            VStack(alignment: .leading, spacing: 18) {
                if place == .above {
                    homeHcpPeople()
                        .frame(maxWidth: .infinity, alignment: .trailing)
                        .accessibilityIdentifier("home-hcp-people-above")
                }
                VStack(alignment: .leading, spacing: 12) {
                    NavigationLink(value: MetricRoute.handicap) {
                        HStack(alignment: .top) {
                            GOverline(text: "Handicap index", color: p.onPrimary.opacity(0.55))
                            Spacer()
                            Text("Tendencia estimada · 40 rondas")
                                .font(GType.label)
                                .foregroundStyle(p.onPrimary.opacity(0.5))
                            MetricChevron(color: p.onPrimary.opacity(0.4))
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    HStack(alignment: .top, spacing: 12) {
                        NavigationLink(value: MetricRoute.handicap) {
                            VStack(alignment: .leading, spacing: 10) {
                                Text(FormatAR.one(snap.handicapIndex))
                                    .font(GType.statHero)
                                    .tracking(-4.4)
                                    .tabular()
                                    .foregroundStyle(p.onPrimary)
                                    .minimumScaleFactor(0.55)
                                    .lineLimit(1)
                                HStack(spacing: 6) {
                                    Image(systemName: snap.trendDelta <= 0 ? "arrow.down" : "arrow.up")
                                        .font(.system(size: 11, weight: .semibold))
                                    Text("\(FormatAR.one(abs(snap.trendDelta))) \(snap.trendSinceLabel)")
                                        .font(GType.label)
                                }
                                .foregroundStyle(p.onPrimary.opacity(0.7))
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("metric-handicap")
                        .accessibilityElement(children: .contain)
                        .overlay { GProbe(id: "metric-handicap", label: "Handicap index") }
                        if place == .beside {
                            homeHcpPeople()
                        }
                    }
                }
                .background {
                    GeometryReader { geo in
                        Color.clear.preference(key: HomeHcpCardWidthKey.self, value: geo.size.width)
                    }
                }

                HStack(alignment: .top) {
                    NavigationLink(value: MetricRoute.roundList(.allCards)) {
                        heroMini("Tarjetas", "\(shownCards ?? snap.cards)", gold: cardsGold)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-tarjetas")
                    .accessibilityElement(children: .contain)
                    .overlay { GProbe(id: "metric-tarjetas", label: "Tarjetas") }
                    Spacer()
                    NavigationLink(value: MetricRoute.roundList(.bestGross(yearOnly: false))) {
                        heroMini("Mejor gross", snap.bestGross.map(String.init) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-best-gross")
                    .accessibilityElement(children: .contain)
                    .overlay { GProbe(id: "metric-best-gross", label: "Mejor gross") }
                    Spacer()
                    NavigationLink(value: MetricRoute.roundList(.average(yearOnly: true))) {
                        heroMini("Promedio \(Calendar.gregorian.component(.year, from: Date()))", snap.yearAverage.map(FormatAR.one) ?? "—")
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-average")
                    .accessibilityElement(children: .contain)
                    .overlay { GProbe(id: "metric-average", label: "Promedio") }
                    if let impact = model.metricsSummary?.hcpImpact ?? localHcpImpact {
                        Spacer()
                        Button { showsHcpImpact = true } label: {
                            heroMini(hcpImpactLabel(impact), hcpImpactValue(impact), gold: impact.delta < 0)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("metric-hcp-impact")
                    }
                }
                .padding(.top, 4)
            }
        }
        .onPreferenceChange(HomeHcpCardWidthKey.self) { width in
            if width > 0 { hcpCardWidth = width }
        }
        .accessibilityIdentifier("handicap-card")
        .accessibilityElement(children: .contain)
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
                .minimumScaleFactor(0.7)
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

    private var teeTimesCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Próximos tee times")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 22, padding: 16) {
                if model.upcomingTeeTimes.isEmpty {
                    Text("No tenés reservas próximas en tu club")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                        .accessibilityIdentifier("home-tee-empty")
                } else {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(Array(model.upcomingTeeTimes.enumerated()), id: \.element.id) { index, booking in
                            if index > 0 { Hairline() }
                            teeTimeRow(booking)
                        }
                    }
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(p.accent.opacity(highlightPartners ? 0.9 : 0), lineWidth: 2)
            }
        }
        .id("home-tee-times")
        .accessibilityIdentifier("home-tee-times")
        .accessibilityElement(children: .contain)
    }

    private func teeTimeRow(_ booking: TeeTime) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(booking.chipWhen)
                .font(GType.headline)
                .tabular()
                .foregroundStyle(p.ink)
            Text(booking.clubName)
                .font(GType.body)
                .foregroundStyle(p.ink)
            if !booking.course.isEmpty {
                Text(booking.course)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            if let partners = booking.companionsLine {
                Text(partners)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                GProbe(id: "home-tee-partners-\(booking.id)", label: partners)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-tee-row-\(booking.id)")
    }

    private func revealPartners(_ proxy: ScrollViewProxy) {
        withAnimation(.easeInOut(duration: 0.35)) {
            proxy.scrollTo("home-tee-times", anchor: .center)
            highlightPartners = true
        }
        Task {
            try? await Task.sleep(for: .milliseconds(1400))
            withAnimation(.easeOut(duration: 0.4)) {
                highlightPartners = false
            }
        }
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
                                Text(model.clubs.isEmpty ? "Vincular mi ficha del club" : "Tu cuenta")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(model.clubs.isEmpty ? "Matrícula y contraseña" : "Actualizar trae todos tus clubes")
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

    private var localHcpImpact: HcpImpact? {
        let ranged = StatsEngine.eighteenHoleValid(StatsEngine.ranged(model.rounds, range: model.statsRange))
        guard let first = ranged.last, let last = ranged.first else { return nil }
        let delta = last.handicapIndex - first.handicapIndex
        guard abs(delta) >= 0.05 else { return nil }
        return HcpImpact(
            delta: delta,
            start: first.handicapIndex,
            now: last.handicapIndex,
            estimated: true,
            counting: [],
            dropped: []
        )
    }

    private func hcpImpactLabel(_ impact: HcpImpact) -> String {
        impact.estimated ? "Handicap estimado" : "Handicap"
    }

    private func hcpImpactValue(_ impact: HcpImpact) -> String {
        let arrow = impact.delta < 0 ? "↓" : (impact.delta > 0 ? "↑" : "·")
        return "\(arrow)\(FormatAR.one(abs(impact.delta)))"
    }

    private func clubCountLine(_ club: LinkedClub) -> String {
        let n = model.rounds.filter { $0.clubCode == club.code }.count
        let cards = n > 0 ? n : club.cardCount
        if cards > 0 { return "\(cards) tarjetas" }
        return club.lastSyncMessage ?? "Sin tarjetas"
    }
}

struct TeeTimeTab: View {
    let booking: TeeTime

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text("Próximo tee time")
                .font(GType.overline)
                .foregroundStyle(Color(hex: 0xC8A86A))
                .lineLimit(1)
            Text(booking.chipWhen)
                .font(GType.headline)
                .tabular()
                .foregroundStyle(Color(hex: 0xF7F5F0))
                .lineLimit(1)
        }
        .padding(.leading, 14)
        .padding(.trailing, 18)
        .padding(.vertical, 9)
        .frame(minHeight: 44, alignment: .leading)
        .background(Color(hex: 0x0F3D2E))
        .clipShape(
            UnevenRoundedRectangle(
                cornerRadii: RectangleCornerRadii(
                    topLeading: 16,
                    bottomLeading: 16,
                    bottomTrailing: 0,
                    topTrailing: 0
                ),
                style: .continuous
            )
        )
        .shadow(color: Color.black.opacity(0.16), radius: 8, x: -2, y: 2)
        .contentShape(
            UnevenRoundedRectangle(
                cornerRadii: RectangleCornerRadii(
                    topLeading: 16,
                    bottomLeading: 16,
                    bottomTrailing: 0,
                    topTrailing: 0
                ),
                style: .continuous
            )
        )
    }
}

struct RoundRow: View {
    @Environment(\.palette) private var p
    let round: Round
    var style: Style = .list
    var showYearUnderMonth = false

    enum Style { case home, list }

    var body: some View {
        GCard(radius: 22, padding: 16) {
            HStack(alignment: .center, spacing: 14) {
                let dm = FormatAR.dayMonth(round.date)
                let year = Calendar.gregorian.component(.year, from: round.date)
                let current = Calendar.gregorian.component(.year, from: Date())
                VStack(spacing: 0) {
                    Text(dm.day)
                        .font(GFont.ui(22, weight: .semibold))
                        .tabular()
                        .foregroundStyle(p.ink)
                    Text(dm.month)
                        .font(GType.overline)
                        .foregroundStyle(p.ink3)
                    if showYearUnderMonth, year != current {
                        Text(String(year))
                            .font(GType.overline)
                            .foregroundStyle(p.ink3)
                    }
                }
                .frame(width: 44)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        if round.isCompetition {
                            Image(systemName: "trophy.fill")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(Color(hex: 0x86672F))
                                .accessibilityIdentifier("round-trophy")
                        }
                        Text(round.displayTitle)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .lineLimit(2)
                    }
                    HStack(spacing: 6) {
                        if !round.isOtherCourse, !round.tee.isEmpty {
                            TeeDot(name: round.tee)
                        }
                        Text(meta)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(1)
                    }
                    if style == .list, !chips.isEmpty {
                        HStack(spacing: 4) {
                            ForEach(chips, id: \.label) { chip in
                                Text(chip.label)
                                    .font(.system(size: 10, weight: .semibold))
                                    .foregroundStyle(chip.ink)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 3)
                                    .background(chip.fill)
                                    .clipShape(Capsule())
                            }
                        }
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

    private var chips: [(label: String, fill: Color, ink: Color)] {
        var items: [(String, Color, Color)] = []
        let eagles = max(round.counts.eagles, StatsEngine.count(.eagle, in: round).count)
        if eagles > 0 { items.append(("\(eagles) Á", Color(hex: 0xC8A86A).opacity(0.22), Color(hex: 0x8A6D32))) }
        if round.counts.birdies > 0 { items.append(("\(round.counts.birdies) B", p.positive.opacity(0.16), p.positive)) }
        if round.counts.pars > 0 { items.append(("\(round.counts.pars) P", p.surface2, p.ink2)) }
        if round.counts.bogeys > 0 { items.append(("\(round.counts.bogeys) G", Color(hex: 0xB4553F).opacity(0.14), Color(hex: 0xB4553F))) }
        let doubles = round.counts.doubles + round.counts.triples + round.counts.worse
        if doubles > 0 { items.append(("\(doubles)+", p.negative.opacity(0.14), p.negative)) }
        if let putts = round.putts {
            items.append(("\(putts) putts", p.surface2, p.ink2))
        }
        return items
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

struct HomeHcpPeople: View {
    @Environment(\.palette) private var p
    let profesores: [Profesor]
    let groups: [GolfletGroup]
    var onProfesor: (Profesor) -> Void
    var onProfesores: () -> Void
    var onAddProfesor: () -> Void
    var onGroups: () -> Void
    var onCreate: () -> Void

    private let groupAvatar: CGFloat = HomeHcpPeopleLayout.groupAvatar
    private let profesorAvatar: CGFloat = HomeHcpPeopleLayout.profesorAvatar

    var body: some View {
        VStack(alignment: .trailing, spacing: HomeHcpPeopleLayout.stackSpacing) {
            if profesores.isEmpty {
                addProfesor
            } else {
                profesorAvatarButton
            }
            if groups.isEmpty {
                createGroup
            } else {
                groupsColumn
            }
        }
        .fixedSize(horizontal: true, vertical: true)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-hcp-people")
    }

    private var profesorAvatarButton: some View {
        Button {
            if profesores.count == 1, let first = profesores.first {
                onProfesor(first)
            } else {
                onProfesores()
            }
        } label: {
            if let caption = HomeHcpPeopleLayout.profesorCaption(profesores.count) {
                VStack(alignment: .trailing, spacing: 6) {
                    profesorStack
                    Text(caption)
                        .font(GType.label)
                        .foregroundStyle(p.onPrimary.opacity(0.7))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
            } else {
                profesorStack
            }
        }
        .buttonStyle(.plain)
        .contentShape(Rectangle())
        .frame(minWidth: 44, minHeight: 44, alignment: .topTrailing)
        .accessibilityIdentifier("home-hcp-profesor")
        .accessibilityLabel(profesorLabel)
        .overlay { GProbe(id: "home-hcp-profesor", label: profesorLabel) }
    }

    private var addProfesor: some View {
        Button(action: onAddProfesor) {
            VStack(alignment: .trailing, spacing: 6) {
                ZStack {
                    Circle()
                        .strokeBorder(
                            Color(hex: HomeHcpPeopleLayout.celeste),
                            style: StrokeStyle(lineWidth: 1.5, dash: [3.5, 2.5])
                        )
                    Image(systemName: "person.badge.plus")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: HomeHcpPeopleLayout.celeste))
                }
                .frame(width: profesorAvatar, height: profesorAvatar)
                Text(HomeHcpPeopleLayout.addLabel)
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-hcp-add-profesor")
        .accessibilityLabel("Agregar profesor")
        .overlay { GProbe(id: "home-hcp-add-profesor", label: "Agregar profesor") }
    }

    private var groupsColumn: some View {
        Button(action: onGroups) {
            VStack(alignment: .trailing, spacing: 6) {
                groupStack
                Text(groups.count == 1 ? "1 grupo" : "\(groups.count) grupos")
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-hcp-groups")
        .accessibilityLabel(groups.count == 1 ? "1 grupo" : "\(groups.count) grupos")
        .overlay { GProbe(id: "home-hcp-groups", label: groups.count == 1 ? "1 grupo" : "\(groups.count) grupos") }
    }

    private var createGroup: some View {
        Button(action: onCreate) {
            VStack(alignment: .trailing, spacing: 6) {
                Text("+")
                    .font(GFont.ui(22, weight: .semibold))
                    .foregroundStyle(p.primary)
                    .frame(width: groupAvatar, height: groupAvatar)
                    .background(p.accent)
                    .clipShape(Circle())
                Text("Crear grupo")
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.7))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-hcp-crear-grupo")
        .accessibilityLabel("Crear grupo")
        .overlay { GProbe(id: "home-hcp-crear-grupo", label: "Crear grupo") }
    }

    /// Web HI-card avatar: 28pt, celeste ring, dark fill, blue verified, max 3 + "N profes".
    private var profesorStack: some View {
        let shown = Array(profesores.prefix(HomeHcpPeopleLayout.profesorVisible))
        let ring = Color(hex: HomeHcpPeopleLayout.celeste)
        return HStack(spacing: -HomeHcpPeopleLayout.profesorOverlap) {
            ForEach(Array(shown.enumerated()), id: \.element.id) { index, profesor in
                HomeHcpAvatar(
                    url: profesor.photoURL,
                    initials: profesor.initials,
                    size: profesorAvatar,
                    fill: Color(hex: 0x1E5440),
                    ink: p.onPrimary,
                    ring: ring,
                    verified: profesor.verified
                )
                .zIndex(Double(shown.count - index))
            }
        }
        .allowsHitTesting(false)
    }

    private var groupStack: some View {
        let shown = Array(groups.prefix(HomeHcpPeopleLayout.groupVisible))
        let extra = groups.count - shown.count
        let ring = Color(hex: HomeHcpPeopleLayout.gold)
        return HStack(spacing: -HomeHcpPeopleLayout.groupOverlap) {
            ForEach(shown) { group in
                HomeHcpAvatar(
                    url: group.photoURL,
                    initials: GroupsParser.initials(group.name),
                    size: groupAvatar,
                    fill: p.onPrimary,
                    ink: p.primary,
                    ring: ring,
                    verified: false
                )
            }
            HomeHcpCountChip(
                text: extra > 0 ? "+\(extra)" : "\(groups.count)",
                size: groupAvatar,
                fill: p.accent,
                ink: p.primary,
                ring: ring
            )
        }
        .allowsHitTesting(false)
    }

    private var profesorLabel: String {
        if profesores.count == 1, let name = profesores.first?.name {
            return "Tu profesor: \(name)"
        }
        return HomeHcpPeopleLayout.profesorCaption(profesores.count) ?? "Tus profesores"
    }
}

enum HomeHcpPeoplePlacement: String, Equatable, Sendable {
    case beside
    case above
}

enum HomeHcpPeopleLayout {
    static let profesorVisible = 3
    static let groupVisible = 4
    static let stackSpacing: CGFloat = 8
    static let profesorAvatar: CGFloat = 28
    static let groupAvatar: CGFloat = 36
    static let profesorOverlap: CGFloat = 7
    static let groupOverlap: CGFloat = 12
    static let numberPeopleGap: CGFloat = 12
    static let gold: UInt32 = 0xC8A86A
    static let celeste: UInt32 = 0x75AADB
    static let seWidth: CGFloat = 320
    static let seContentWidth: CGFloat = 280
    static let seCardWidth: CGFloat = 240
    static let pageGutter: CGFloat = 20
    static let cardPadding: CGFloat = 20
    static let addLabel = "Agregar profesor"

    static var currentScreenWidth: CGFloat {
        UIScreen.main.bounds.width
    }

    static func cardInnerWidth(screenWidth: CGFloat) -> CGFloat {
        screenWidth - pageGutter * 2 - cardPadding * 2
    }

    static func profesorCaption(_ count: Int) -> String? {
        count >= 2 ? "\(count) profes" : nil
    }

    static func stackWidth(count: Int, avatar: CGFloat, overlap: CGFloat, extraChip: Bool) -> CGFloat {
        let n = max(1, count + (extraChip ? 1 : 0))
        return avatar + CGFloat(n - 1) * (avatar - overlap)
    }

    static func profesorWidth(count: Int) -> CGFloat {
        if count == 0 { return max(profesorAvatar, labelWidth(addLabel)) }
        let shown = min(count, profesorVisible)
        return stackWidth(count: shown, avatar: profesorAvatar, overlap: profesorOverlap, extraChip: false)
    }

    static func groupWidth(count: Int) -> CGFloat {
        if count == 0 { return max(groupAvatar, labelWidth("Crear grupo")) }
        let shown = min(count, groupVisible)
        return stackWidth(count: shown, avatar: groupAvatar, overlap: groupOverlap, extraChip: true)
    }

    static func columnWidth(profesorCount: Int, groupCount: Int) -> CGFloat {
        max(profesorWidth(count: profesorCount), groupWidth(count: groupCount))
    }

    static func numberWidth(_ value: Double) -> CGFloat {
        let text = FormatAR.one(value) as NSString
        let font = UIFont(name: GFont.postScript(.semibold), size: 80)
            ?? .systemFont(ofSize: 80, weight: .semibold)
        return ceil(text.size(withAttributes: [
            .font: font,
            .kern: -4.4
        ]).width)
    }

    static func labelWidth(_ text: String) -> CGFloat {
        let font = UIFont(name: GFont.postScript(.medium), size: 12.5)
            ?? .systemFont(ofSize: 12.5, weight: .medium)
        return ceil((text as NSString).size(withAttributes: [.font: font]).width)
    }

    static func place(cardWidth: CGFloat, numberWidth: CGFloat, peopleWidth: CGFloat) -> HomeHcpPeoplePlacement {
        if cardWidth <= seCardWidth + 1 { return .above }
        if numberWidth + numberPeopleGap + peopleWidth > cardWidth { return .above }
        return .beside
    }
}

private struct HomeHcpCardWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        let next = nextValue()
        if next > 0 { value = next }
    }
}

struct HomeHcpAvatar: View {
    var url: String?
    var initials: String
    var size: CGFloat
    var fill: Color
    var ink: Color
    var ring: Color
    var verified: Bool

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ZStack {
                Text(initials)
                    .font(GFont.ui(size <= 28 ? 10.5 : (size < 40 ? 12 : 16), weight: .semibold))
                    .foregroundStyle(ink)
                if let url, let parsed = URL(string: url), parsed.scheme == "https" || parsed.scheme == "http" {
                    AsyncImage(url: parsed) { image in
                        image.resizable().scaledToFill()
                    } placeholder: {
                        Color.clear
                    }
                }
            }
            .frame(width: size, height: size)
            .background(fill)
            .clipShape(Circle())
            .overlay(Circle().stroke(ring, lineWidth: 2))

            if verified {
                let badge: CGFloat = size <= 28 ? 13 : 14
                ZStack {
                    Circle().fill(Color(hex: 0x1D9BF0))
                    Image(systemName: "checkmark")
                        .font(.system(size: size <= 28 ? 6.5 : 7, weight: .bold))
                        .foregroundStyle(.white)
                }
                .frame(width: badge, height: badge)
                .overlay(Circle().stroke(Color(hex: 0x0F3D2E), lineWidth: 1.5))
                .offset(x: 2, y: 2)
                .accessibilityLabel("Verificado")
            }
        }
    }
}

struct HomeHcpCountChip: View {
    var text: String
    var size: CGFloat
    var fill: Color
    var ink: Color
    var ring: Color

    var body: some View {
        Text(text)
            .font(GFont.ui(size < 40 ? 12 : 16, weight: .semibold))
            .foregroundStyle(ink)
            .frame(width: size, height: size)
            .background(fill)
            .clipShape(Circle())
            .overlay(Circle().stroke(ring, lineWidth: 2))
    }
}

struct HomeGroupsSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GScreen(id: "screen-home-groups") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Tus grupos")
                        GTitle(text: "Grupos", size: 34)
                    }
                    ForEach(model.groups) { group in
                        Button {
                            dismiss()
                            model.presentGroupDetail(group.id)
                        } label: {
                            GCard(radius: 18, padding: 14) {
                                HStack(spacing: 12) {
                                    GroupPhotoView(
                                        url: group.photoURL,
                                        initials: GroupsParser.initials(group.name),
                                        size: 44
                                    )
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(group.name)
                                            .font(GType.headline)
                                            .foregroundStyle(p.ink)
                                        Text(group.memberCount == 1 ? "1 integrante" : "\(group.memberCount) integrantes")
                                            .font(GType.label)
                                            .foregroundStyle(p.ink2)
                                    }
                                    Spacer()
                                    MetricChevron(color: p.ink3)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-group-\(group.id)")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-home-groups")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-home-groups") }
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
        return title.isEmpty ? "Ronda" : title
    }
}
