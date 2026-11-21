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
    @State private var showsScorecards = false
    @State private var highlightPartners = false
    @State private var modeOpen = false
    @State private var groupPlaces: [String: Int] = [:]
    @Namespace private var roundZoom

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
                        if model.rounds.isEmpty && model.clubs.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Vinculá tu matrícula para ver tu hándicap y tus tarjetas.")
                                    .font(GType.body)
                                    .foregroundStyle(p.ink)
                                NavigationLink { ClubsView() } label: {
                                    Text("Vincular matrícula")
                                        .font(GType.headline)
                                        .foregroundStyle(Color.white)
                                        .frame(maxWidth: .infinity, minHeight: 44)
                                        .background(p.primary)
                                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("vincular-matricula")
                            }
                        }
                        if model.clubs.contains(where: { $0.lastSyncStatus == "error" }) {
                            Text("No se pudo actualizar. Probá de nuevo desde Cuenta.")
                                .font(GType.body)
                                .foregroundStyle(p.ink)
                                .accessibilityIdentifier("sync-failed")
                        }
                        handicapCard
                        homeCircle
                        if model.homeMode == .mej, !model.liveShots.isEmpty {
                            SGCard(shots: model.liveShots)
                        }
                        lastRound
                        teeTimesCard
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 160)
                }
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    Color.clear.frame(height: 24)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("screen-inicio")
        .onAppear {
            Task { await model.refreshTeeTimes() }
        }
        .task(id: model.groups.map(\.id).joined(separator: ",")) {
            await loadGroupPlaces()
        }
        .onChange(of: model.selectedTab) { _, tab in
            if tab == .inicio {
                Task { await model.refreshTeeTimes() }
            }
        }
        .navigationDestination(for: Round.self) { round in
            RoundDetailView(round: round)
                .modifier(RoundZoomDestination(id: round.roundId, space: roundZoom))
        }
        .navigationDestination(for: HomeMoreRoute.self) { route in
            switch route {
            case .resumen: SummaryView()
            case .rondas: RoundsView()
            case .cancha: CourseView()
            case .bolsa: BagView()
            case .sg: SGHomeView()
            }
        }
        .metricDestinations()
        .navigationDestination(isPresented: Bindable(model).showsClubs) {
            ClubsView()
        }
        .navigationDestination(for: Profesor.self) { profesor in
            ProfesorDetailView(profesor: profesor)
                .golfletChrome()
        }
        .sheet(isPresented: $showsHcpImpact) {
            if let impact = homeImpact {
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
        .onChange(of: model.celebrateCards) { _, value in
            guard let value else { return }
            Task { await countUpCards(to: value) }
        }
    }

    private func presentProfesor(_ profesor: Profesor) {
        showsHomeProfesores = false
        showsAgregarProfesor = false
        model.presentedProfesor = profesor
    }

    private func header(scroll: ScrollViewProxy) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                CaddieMark(height: 36)
                if let club = model.clubs.first {
                    Button {
                        model.requestSync(club)
                    } label: {
                        GOverline(text: club.name)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Actualizar \(club.name)")
                    .accessibilityIdentifier("home-sync-\(club.accountId)")
                } else {
                    GOverline(text: "Golflet")
                }
                Spacer()
                if let major = ProMajor.current(on: Date()) {
                    Link(destination: major.url) {
                        Text(major.short)
                            .font(GFont.ui(11, weight: .bold))
                            .foregroundStyle(Color(hex: major.foreground))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 6)
                            .background(Color(hex: major.background))
                            .clipShape(Capsule())
                    }
                    .accessibilityLabel(major.name)
                    .accessibilityIdentifier("major-badge")
                }
                ZStack(alignment: .topTrailing) {
                    Button { model.openAvatar() } label: {
                        AvatarCircle(initials: model.profile.initials)
                    }
                    .buttonStyle(.plain)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
                    .accessibilityIdentifier("avatar-button")
                    .accessibilityLabel(model.unreadBadgeText.map { "Notificaciones, \($0) sin leer" } ?? "Tu cuenta")
                    if let badge = model.unreadBadgeText {
                        GProbe(id: "avatar-badge", label: "\(badge) sin leer")
                    }
                }
            }
            HomeGreetingHeader(
                name: model.profile.greetingName,
                booking: model.nextTeeTime,
                onTab: { revealPartners(scroll) }
            )
        }
    }

    private var parkedHomeActions: some View {
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink {
                PlayHubView()
            } label: {
                Text("Preparar la salida")
                    .font(GType.headline)
                    .foregroundStyle(p.primary)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-open-jugar")
            Button { model.showsReconstruct = true } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Cargar una vuelta ya jugada")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("Marcá cada golpe. El punto es manual y la distancia, estimada.")
                        .font(GType.label)
                        .foregroundStyle(p.ink.opacity(0.65))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("reconstruct-start")
            Button {
                Task { await model.bringLatestCard() }
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Traer última tarjeta")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text(model.cardNote.isEmpty ? "Lee el club con la clave guardada." : model.cardNote)
                        .font(GType.label)
                        .foregroundStyle(p.ink.opacity(0.65))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(16)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(model.cardBusy)
            .accessibilityIdentifier("bring-latest-card")
        }
    }

    private var handicapCard: some View {
        let snap = model.home
        return GCard(fill: p.primary, radius: 28, padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 8) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Handicap index", color: p.onPrimary.opacity(0.55))
                        NavigationLink(value: MetricRoute.handicap) {
                            CountUpText(value: snap.handicapIndex, format: FormatAR.one)
                                .font(GType.statHero)
                                .tracking(-4.4)
                                .tabular()
                                .foregroundStyle(p.onPrimary)
                                .minimumScaleFactor(0.55)
                                .lineLimit(1)
                                .fixedSize(horizontal: true, vertical: false)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("metric-handicap")
                        .accessibilityElement(children: .contain)
                        .overlay { GProbe(id: "metric-handicap", label: "Handicap index") }
                        if let when = model.officialHistory.max(by: { $0.date < $1.date })?.date ?? snap.lastRound?.date {
                            Text("Índice al \(FormatAR.webDay(when))")
                                .font(GType.label)
                                .foregroundStyle(p.onPrimary.opacity(0.7))
                                .lineLimit(1)
                        }
                        if !snap.trendSinceLabel.isEmpty {
                            let arrow = snap.trendDelta < 0 ? "↓" : "↑"
                            Text("\(arrow) \(FormatAR.one(abs(snap.trendDelta))) \(snap.trendSinceLabel)")
                                .font(GType.label)
                                .foregroundStyle(p.onPrimary.opacity(0.7))
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .layoutPriority(1)
                    Spacer(minLength: 4)
                    VStack(alignment: .trailing, spacing: 0) {
                        HomeHcpPeople(
                            profesores: model.profesores,
                            groups: model.groups,
                            places: groupPlaces,
                            onProfesor: { presentProfesor($0) },
                            onProfesores: { showsHomeProfesores = true },
                            onAddProfesor: { showsAgregarProfesor = true },
                            onGroup: { model.presentGroupDetail($0.id) },
                            onGroups: {
                                if model.groups.count == 1, let group = model.groups.first {
                                    model.presentGroupDetail(group.id)
                                } else {
                                    model.presentGroups()
                                }
                            },
                            onCreate: { model.presentCreateGroup() },
                            compact: true
                        )
                        Button { model.showsPlay = true } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "location.fill")
                                    .font(.system(size: 12, weight: .semibold))
                                    .accessibilityHidden(true)
                                Text("Jugar")
                                    .font(GType.label)
                            }
                            .foregroundStyle(p.onPrimary)
                            .padding(.horizontal, 12)
                            .frame(minHeight: 36)
                            .background(p.accent)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Jugar")
                        .accessibilityIdentifier("play-start")
                        Button { showsHcpImpact = true } label: {
                            Text("Cambios")
                                .font(GFont.ui(13, weight: .regular))
                                .underline()
                                .foregroundStyle(p.onPrimary.opacity(0.72))
                                .frame(minWidth: 44, minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-hcp-cambios")
                    }
                }
                Rectangle()
                    .fill(p.onPrimary.opacity(0.16))
                    .frame(height: 1)
                HStack(alignment: .top, spacing: 8) {
                    hiStat("Tarjetas", "\(snap.cards)", .roundList(.allCards))
                    hiStat("Mejor", snap.bestGross.map(String.init) ?? "–", .roundList(.bestGross(yearOnly: false)))
                    hiStat("Prom.", snap.yearAverage.map { FormatAR.one($0) } ?? "–", .roundList(.average(yearOnly: false)))
                    hiStat("Impacto", impactText, nil)
                }
            }
        }
        .background(alignment: .topLeading) {
            GProbe(id: "handicap-card", label: "Handicap index")
        }
    }

    /// Same endpoints as the trend line under the index. A shorter metrics range is not this number.
    private var homeImpact: HcpImpact? {
        if let official = OfficialSpan.impact(history: model.officialHistory, rounds: model.rounds) {
            return official
        }
        if let api = model.metricsSummary?.hcpImpact, api.showsDelta {
            return api
        }
        return localHcpImpact
    }

    private var impactText: String {
        guard let impact = homeImpact, impact.showsDelta else { return "–" }
        return hcpImpactValue(impact)
    }

    private func hiStat(_ label: String, _ value: String, _ route: MetricRoute?) -> some View {
        let stack = VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(GFont.ui(11, weight: .regular))
                .foregroundStyle(p.onPrimary.opacity(0.62))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Text(value)
                .font(GType.statM)
                .tabular()
                .foregroundStyle(p.onPrimary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        return Group {
            if let route {
                NavigationLink(value: route) { stack }
                    .buttonStyle(.plain)
            } else {
                Button { showsHcpImpact = true } label: { stack }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("metric-hcp-impact")
            }
        }
    }

    private var homeCircle: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let invite = model.pendingInvites.first {
                Button { model.presentInvite(invite) } label: {
                    HStack(spacing: 12) {
                        Text(invite.ownerInitials)
                            .font(GFont.ui(16, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 44, height: 44)
                            .background(p.surface2)
                            .clipShape(Circle())
                            .overlay(Circle().stroke(Color(hex: 0xC8102E), lineWidth: 2))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(invite.name)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .lineLimit(1)
                            Text("Te invita \(invite.ownerName)")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                                .lineLimit(1)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(p.ink3)
                            .accessibilityHidden(true)
                    }
                    .padding(.horizontal, 14)
                    .frame(maxWidth: .infinity)
                    .frame(height: 64)
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home-pending-invite")
                .accessibilityLabel("Invitación pendiente, \(invite.name)")
            }
        }
    }

    private func loadGroupPlaces() async {
        var next: [String: Int] = [:]
        for group in model.groups.prefix(3) {
            if Task.isCancelled { return }
            do {
                let config = try await model.api.groupView(groupID: group.id)
                let comparison = try await model.api.groupComparison(groupID: group.id, config: config)
                guard let mine = comparison.hero?.memberID,
                      let row = comparison.rows.first(where: { $0.metric == .gross }),
                      let place = row.rank(of: mine) else { continue }
                next[group.id] = place
            } catch {
                continue
            }
        }
        if !Task.isCancelled { groupPlaces = next }
    }

    private func heroMini(_ label: String, _ value: String, gold: Bool = false, access: String? = nil) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary.opacity(0.5))
                    .lineLimit(2)
                    .fixedSize(horizontal: false, vertical: true)
                MetricChevron(color: p.onPrimary.opacity(0.35))
            }
            Text(value)
                .font(GType.statM)
                .tabular()
                .lineLimit(1)
                .minimumScaleFactor(0.7)
                .foregroundStyle(gold ? p.accentOnNavy : p.onPrimary)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(access ?? label), \(value)")
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
            HStack {
                Text("Próxima reserva")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                if model.nextTeeTime != nil {
                    NavigationLink {
                        TeeTimesHubView()
                    } label: {
                        Text("Ver todas")
                            .font(GType.headline)
                            .foregroundStyle(p.ink2)
                    }
                    .accessibilityIdentifier("home-tees-all")
                }
            }
            GCard(radius: 22, padding: 16) {
                if let booking = model.nextTeeTime {
                    VStack(alignment: .leading, spacing: 12) {
                        teeTimeRow(booking)
                        ZStack(alignment: .topLeading) {
                            NavigationLink {
                                TeeTimePrepView(booking: booking)
                            } label: {
                                Text("Preparar la salida")
                                    .font(GType.headline)
                                    .foregroundStyle(p.onPrimary)
                                    .frame(maxWidth: .infinity, minHeight: 44)
                                    .background(p.primary)
                                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("home-open-jugar")
                            .accessibilityLabel("Preparar la salida")
                            GProbe(id: "home-open-jugar", label: "Preparar la salida")
                        }
                        .accessibilityElement(children: .contain)
                    }
                } else {
                    HStack(alignment: .top, spacing: 12) {
                        CaddieMark(height: 56)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Sin reservas próximas")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("Cuando reserves una salida en tu club, aparece acá.")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("home-tee-empty")
                }
            }
            .overlay {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .stroke(p.accentInk.opacity(highlightPartners ? 0.9 : 0), lineWidth: 2)
            }
        }
        .id("home-tee-times")
        .accessibilityIdentifier("home-tee-times")
        .accessibilityElement(children: .contain)
    }

    @ViewBuilder
    private var scorecardFetchCard: some View {
        if !model.scorecardFetches.isEmpty || model.scorecardFetchNote != nil {
            Button {
                showsScorecards = true
            } label: {
                HStack(spacing: 10) {
                    Text("Tarjetas del club")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Spacer(minLength: 8)
                    Text(scorecardCount)
                        .font(GType.label)
                        .foregroundStyle(Color(hex: BrandHex.red))
                        .lineLimit(1)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(p.ink3)
                }
                .padding(.horizontal, 16)
                .frame(minHeight: 44)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-scorecard-fetches")
            .accessibilityLabel("Tarjetas del club, \(scorecardCount)")
            .sheet(isPresented: $showsScorecards) {
                ScorecardFetchSheet(
                    jobs: model.scorecardFetches,
                    note: model.scorecardFetchNote,
                    refreshID: "home-scorecard-refresh",
                    sheetID: "home-scorecards"
                ) {
                    Task { await model.refreshScorecardFetches() }
                }
                .environment(model)
            }
        }
    }

    private var scorecardCount: String {
        let n = model.scorecardFetches.count
        if n == 0 { return "Sin búsquedas" }
        return n == 1 ? "1 búsqueda" : "\(n) búsquedas"
    }

    private func teeTimeRow(_ booking: TeeTime) -> some View {
        ZStack(alignment: .topLeading) {
            NavigationLink {
                TeeTimePrepView(booking: booking)
            } label: {
                let parts = teeParts(booking.startsAt)
                HStack(alignment: .center, spacing: 12) {
                    VStack(spacing: 0) {
                        Text(parts.day)
                            .font(GFont.ui(22, weight: .semibold))
                            .tabular()
                            .foregroundStyle(p.ink)
                        Text(parts.month)
                            .font(GType.overline)
                            .foregroundStyle(p.ink3)
                    }
                    .frame(width: 44)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(booking.clubName)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                        Text([booking.course, parts.weekday].filter { !$0.isEmpty }.joined(separator: " · "))
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(1)
                        if let partners = booking.companionsLine {
                            Text(partners)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                                .lineLimit(1)
                        }
                    }
                    Spacer(minLength: 8)
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(parts.time)
                            .font(GType.headline)
                            .tabular()
                            .foregroundStyle(p.ink)
                        Text("salida")
                            .font(GType.overline)
                            .foregroundStyle(p.ink3)
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(p.ink3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-tee-row-\(booking.id)")
            if let partners = booking.companionsLine {
                GProbe(id: "home-tee-partners-\(booking.id)", label: partners)
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func teeParts(_ date: Date) -> (day: String, month: String, weekday: String, time: String) {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.timeZone = .current
        f.dateFormat = "d"
        let day = f.string(from: date)
        f.dateFormat = "MMM"
        let month = f.string(from: date).replacingOccurrences(of: ".", with: "").uppercased()
        f.dateFormat = "EEEE"
        let weekday = f.string(from: date).capitalized
        f.dateFormat = "HH:mm"
        let time = f.string(from: date)
        return (day, month, weekday, time)
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

    private var modeChip: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.easeInOut(duration: reduceMotion ? 0 : 0.28)) { modeOpen.toggle() }
            } label: {
                HStack(spacing: 6) {
                    Text("Inicio ·")
                    Text(model.homeMode.title).fontWeight(.bold)
                    Image(systemName: "chevron.down")
                        .rotationEffect(.degrees(modeOpen ? 180 : 0))
                }
                .font(GType.headline)
                .foregroundStyle(p.ink2)
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .overlay(Capsule().stroke(p.hairline, lineWidth: 1.5))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-mode-chip")
            .accessibilityLabel("Modo del inicio: \(model.homeMode.title)")

            if modeOpen {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(ProfileMode.allCases) { mode in
                        Button { model.setHomeMode(mode); modeOpen = false } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(mode.title).font(GType.headline).foregroundStyle(p.ink)
                                        if mode == .clasico {
                                            Text("Recomendado").font(GType.label).foregroundStyle(p.primary2)
                                        }
                                    }
                                    Text(mode.blurb).font(GType.label).foregroundStyle(p.ink3)
                                }
                                Spacer()
                                Image(systemName: model.homeMode == mode ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(model.homeMode == mode ? p.primary : p.ink3)
                            }
                            .padding(10)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-mode-\(mode.rawValue)")
                    }
                    NavigationLink { PerfilModoView() } label: {
                        Text("También lo cambiás en tu perfil ›")
                            .font(GType.label)
                            .foregroundStyle(p.accentInk)
                    }
                }
                .padding(8)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 18).stroke(p.hairline, lineWidth: 1))
            }
        }
    }

    private var competitiveLead: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let round = model.activeLiveRound, round.endedAt == nil {
                Button { model.showsPlay = true } label: {
                    ProtoCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(PaceModality.parse(round.modality).label)
                                .font(GType.overline)
                                .foregroundStyle(p.ink3)
                            Text(round.course?.isEmpty == false ? round.course! : "Ronda en curso")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("Hoyo \(round.currentHole)")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("home-comp-match")
            } else {
                MatchStartPrompt()
            }
            if let booking = model.nextTeeTime {
                NavigationLink {
                    TeeTimePrepView(booking: booking)
                } label: {
                    ProtoCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Próximo tee time").font(GType.overline).foregroundStyle(p.ink3)
                            Text(booking.chipWhen).font(GType.headline).foregroundStyle(p.ink)
                            Text(booking.course.isEmpty ? booking.clubName : "\(booking.clubName) · \(booking.course)")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                    }
                }
                .accessibilityIdentifier("home-comp-tee")
            }
        }
    }

    private var socialLead: some View {
        VStack(alignment: .leading, spacing: 10) {
            NavigationLink { GroupsHubView() } label: {
                ProtoCard {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Grupos").font(GType.overline).foregroundStyle(p.ink3)
                        Text("Tus grupos y tus tee times").font(GType.headline)
                    }
                }
            }
        }
    }

    private var moreLegacy: some View {
        VStack(alignment: .leading, spacing: 10) {
            if model.homeMode == .comp { competitiveLead }
            else if model.homeMode == .soc { socialLead }
            modeChip
            parkedHomeActions
            Text("Más").font(GType.section).foregroundStyle(p.ink)
            ProtoCard {
                VStack(spacing: 0) {
                    NavigationLink(value: HomeMoreRoute.resumen) {
                        ProtoRow(title: "Resumen", subtitle: "Tendencia, métricas y gráfico")
                    }
                    .accessibilityIdentifier("home-more-resumen")
                    NavigationLink(value: HomeMoreRoute.rondas) {
                        ProtoRow(title: "Rondas", subtitle: "Todas tus tarjetas")
                    }
                    .accessibilityIdentifier("home-more-rondas")
                    NavigationLink(value: HomeMoreRoute.cancha) {
                        ProtoRow(title: "Cancha", subtitle: "Libreta y hoyo a hoyo")
                    }
                    .accessibilityIdentifier("home-more-cancha")
                    NavigationLink(value: HomeMoreRoute.bolsa) {
                        ProtoRow(title: "Mi bolsa", subtitle: "Palos y distancias")
                    }
                    .accessibilityIdentifier("home-more-bolsa")
                    NavigationLink(value: HomeMoreRoute.sg) {
                        ProtoRow(title: "Strokes gained", subtitle: "Solo con golpes marcados")
                    }
                    .accessibilityIdentifier("home-more-sg")
                    NavigationLink { BanderaHoyView() } label: {
                        ProtoRow(title: "Bandera de hoy", subtitle: "Si el club las cargó")
                    }
                    NavigationLink { CierreView() } label: {
                        ProtoRow(title: "Cierre de vuelta", subtitle: "Al terminar la vuelta")
                    }
                }
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
                NavigationLink(value: HomeMoreRoute.rondas) {
                    Text("Ver todas")
                        .font(GType.headline)
                        .foregroundStyle(p.ink2)
                }
                .accessibilityIdentifier("ver-todas")
            }
            if let round = model.home.lastRound {
                NavigationLink(value: round) {
                    RoundRow(round: round, style: .home)
                }
                .buttonStyle(.plain)
                .modifier(RoundZoomSource(id: round.roundId, space: roundZoom))
                .accessibilityIdentifier("last-round-card")
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
                                .foregroundStyle(p.accentInk)
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
                            Text(model.groups.isEmpty ? "Comparar con amigos" : "\(model.groups.count) \(model.groups.count == 1 ? "grupo" : "grupos")")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("Tabla, evolución y hoyo por hoyo con tus amigos. Solo si cada uno acepta.")
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
            NavigationLink {
                GroupsHubView()
            } label: {
                Text("Ver grupos y tee times")
                    .font(GType.headline)
                    .foregroundStyle(p.primary)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("home-hub-grupos")
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
                .foregroundStyle(Color.white.opacity(0.72))
                .lineLimit(1)
            Text(booking.chipWhen)
                .font(GType.headline)
                .tabular()
                .foregroundStyle(Color.white)
                .lineLimit(1)
        }
        .padding(.leading, 14)
        .padding(.trailing, 18)
        .padding(.vertical, 9)
        .frame(minHeight: 44, alignment: .leading)
        .background(Color(hex: BrandHex.navy))
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
            VStack(alignment: .leading, spacing: 8) {
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
                    Text(round.displayTitle)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                        .lineLimit(2)
                    HStack(alignment: .top, spacing: 6) {
                        if !round.isOtherCourse, !round.tee.isEmpty {
                            TeeDot(name: round.tee)
                                .padding(.top, 4)
                        }
                        Text(meta)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Spacer(minLength: 8)
                VStack(alignment: .trailing, spacing: 2) {
                    Text(round.gross.map(String.init) ?? "—")
                        .font(GType.statM)
                        .tabular()
                        .foregroundStyle(p.ink)
                    Text(round.net.map { "neto \($0)" } ?? "neto —")
                        .font(GType.label)
                        .tabular()
                        .foregroundStyle(p.ink3)
                }
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(p.ink3)
            }
            if round.official && !chips.isEmpty {
                SingleLineChipRow(chips: chips)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier(style == .home ? "last-round-chips" : "round-chips")
            }
            }
        }
    }

    private var chips: [(label: String, fill: Color, ink: Color)] {
        guard round.gross != nil else { return [] }
        let navy = Color(hex: 0x0B2545)
        let white = Color(hex: 0xFFFFFF)
        let gold = Color(hex: 0xC8A86A)
        let beige = Color(hex: 0xECE7DB)
        let red = Color(hex: 0xC8102E)
        let charcoal = Color(hex: 0x3E4C62)
        var items: [(label: String, fill: Color, ink: Color)] = [
            ("\(round.counts.birdies) Bir", navy, white),
            ("\(round.counts.pars) Par", beige, navy),
            ("\(round.counts.bogeys) Bog", red, white)
        ]
        let eagles = max(round.counts.eagles, StatsEngine.count(.eagle, in: round).count)
        if eagles > 0 {
            items.insert(("\(eagles) Ág", gold, navy), at: 0)
        }
        let doubles = round.holes.isEmpty
            ? round.counts.doubles + round.counts.triples + round.counts.worse
            : round.holes.filter { $0.result == .doubleOrWorse }.count
        if doubles > 0 {
            items.append(("\(doubles) Dob", charcoal, white))
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
        if !round.official { return "No oficial · \(round.displayCourse)\(round.tee.isEmpty ? "" : " · \(round.tee)")" }
        var parts = [round.displayCourse]
        if !round.tee.isEmpty, round.tee.caseInsensitiveCompare(round.course) != .orderedSame {
            parts.append(round.tee)
        }
        if let pos = round.position, let field = round.fieldSize {
            parts.append("\(pos)º de \(field)")
        }
        return parts.joined(separator: " · ")
    }
}

struct HomeHcpPeople: View {
    @Environment(\.palette) private var p
    let profesores: [Profesor]
    let groups: [GolfletGroup]
    var places: [String: Int] = [:]
    var onProfesor: (Profesor) -> Void
    var onProfesores: () -> Void
    var onAddProfesor: () -> Void
    var onGroup: (GolfletGroup) -> Void = { _ in }
    var onGroups: () -> Void
    var onCreate: () -> Void
    var compact: Bool = false

    private let face: CGFloat = 44

    var body: some View {
        if compact {
            compactStack
        } else {
            fullRows
        }
    }

    private var fullRows: some View {
        VStack(alignment: .leading, spacing: 8) {
            if profesores.isEmpty {
                addProfesor
            } else {
                profesorAvatarButton
            }
            if groups.isEmpty {
                createGroup
            } else {
                ForEach(Array(groups.prefix(3))) { group in
                    groupRow(group)
                }
                if groups.count > 3 {
                    Button(action: onGroups) {
                        Text("Ver todos")
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home-hcp-groups-all")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-hcp-people")
    }

    private var compactStack: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if profesores.isEmpty {
                compactAdd
            } else {
                compactProfesor
            }
            if groups.isEmpty {
                compactCreate
            } else {
                compactGroups
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-hcp-people")
    }

    private var compactProfesor: some View {
        Group {
            if profesores.count == 1, let first = profesores.first {
                NavigationLink(value: first) { compactFace(url: first.photoURL, initials: first.initials, verified: first.verified) }
            } else {
                Button(action: onProfesores) { compactFace(url: profesores.first?.photoURL, initials: profesores.first?.initials ?? "P", verified: profesores.contains { $0.verified }) }
            }
        }
        .buttonStyle(.plain)
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityIdentifier("home-hcp-profesor")
        .accessibilityLabel(profesorLabel)
        .overlay { GProbe(id: "home-hcp-profesor", label: profesorLabel).allowsHitTesting(false) }
    }

    private var compactAdd: some View {
        Button(action: onAddProfesor) {
            Text("+")
                .font(GFont.ui(16, weight: .semibold))
                .foregroundStyle(Color(hex: HomeHcpPeopleLayout.celeste))
                .frame(width: 28, height: 28)
                .overlay(Circle().strokeBorder(Color(hex: HomeHcpPeopleLayout.celeste), style: StrokeStyle(lineWidth: 1.5, dash: [3, 2])))
        }
        .buttonStyle(.plain)
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityIdentifier("home-hcp-add-profesor")
        .accessibilityLabel("Agregar profesor")
        .overlay { GProbe(id: "home-hcp-add-profesor", label: "Agregar profesor") }
    }

    private var compactGroups: some View {
        Button(action: onGroups) {
            HStack(spacing: -8) {
                ForEach(Array(groups.prefix(3))) { group in
                    HomeHcpAvatar(url: group.photoURL, initials: GroupsParser.initials(group.name), size: 22, fill: Color.white.opacity(0.16), ink: .white, ring: Color.white.opacity(0.85), verified: false, cacheID: group.id)
                }
                Text("\(groups.count) \(groups.count == 1 ? "grupo" : "grupos")")
                    .font(GFont.ui(12, weight: .regular))
                    .foregroundStyle(Color.white.opacity(0.82))
                    .lineLimit(1)
                    .padding(.leading, 10)
            }
        }
        .buttonStyle(.plain)
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityIdentifier("home-hcp-groups")
        .accessibilityLabel("\(groups.count) grupos")
        .overlay { GProbe(id: "home-hcp-groups", label: groups.first?.name ?? "Grupos").allowsHitTesting(false) }
    }

    private var compactCreate: some View {
        Button(action: onCreate) {
            Text("+")
                .font(GFont.ui(16, weight: .semibold))
                .foregroundStyle(Color(hex: 0xC8A86A))
                .frame(width: 28, height: 28)
                .overlay(Circle().stroke(Color(hex: 0xC8A86A), lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .frame(minWidth: 44, minHeight: 44)
        .accessibilityIdentifier("home-hcp-crear-grupo")
        .accessibilityLabel("Crear grupo")
        .overlay { GProbe(id: "home-hcp-crear-grupo", label: "Crear grupo") }
    }

    private func compactFace(url: String?, initials: String, verified: Bool) -> some View {
        HomeHcpAvatar(url: url, initials: initials, size: 28, fill: Color.white.opacity(0.16), ink: .white, ring: Color.white, verified: verified)
    }

    private var profesorAvatarButton: some View {
        Group {
            if profesores.count == 1, let first = profesores.first {
                NavigationLink(value: first) {
                    profesorAvatarLabel
                }
            } else {
                Button(action: onProfesores) {
                    profesorAvatarLabel
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-hcp-profesor")
        .accessibilityLabel(profesorLabel)
        .overlay {
            GProbe(id: "home-hcp-profesor", label: profesorLabel)
                .allowsHitTesting(false)
        }
    }

    private var profesorAvatarLabel: some View {
        row {
            if profesores.count == 1, let first = profesores.first {
                HomeHcpAvatar(
                    url: first.photoURL,
                    initials: first.initials,
                    size: face,
                    fill: p.surface2,
                    ink: p.ink,
                    ring: Color(hex: HomeHcpPeopleLayout.celeste),
                    verified: first.verified
                )
                copy(first.name, "Profesor")
            } else {
                profesorStack
                copy(HomeHcpPeopleLayout.profesorCaption(profesores.count) ?? "Profesores", "Tocá para verlos.")
            }
        }
    }

    private var addProfesor: some View {
        Button(action: onAddProfesor) {
            row {
                Text("+")
                    .font(GFont.ui(22, weight: .semibold))
                    .foregroundStyle(Color(hex: HomeHcpPeopleLayout.celeste))
                    .frame(width: face, height: face)
                    .overlay(Circle().strokeBorder(Color(hex: HomeHcpPeopleLayout.celeste), style: StrokeStyle(lineWidth: 1.5, dash: [3.5, 2.5])))
                copy(HomeHcpPeopleLayout.addLabel, "Todavía no hay uno vinculado.")
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-hcp-add-profesor")
        .accessibilityLabel("Agregar profesor")
        .overlay { GProbe(id: "home-hcp-add-profesor", label: "Agregar profesor") }
    }

    private func groupRow(_ group: GolfletGroup) -> some View {
        let players = group.memberCount
        let sub = players > 0 ? "\(players) \(players == 1 ? "jugador" : "jugadores")" : "Grupo"
        return Button { onGroup(group) } label: {
            row {
                HomeHcpAvatar(
                    url: group.photoURL,
                    initials: GroupsParser.initials(group.name),
                    size: face,
                    fill: p.surface2,
                    ink: p.primary,
                    ring: Color(hex: HomeHcpPeopleLayout.accent),
                    verified: false,
                    cacheID: group.id
                )
                copy(group.name, sub)
                if let place = places[group.id] {
                    Text("\(place)º")
                        .font(GType.headline)
                        .foregroundStyle(p.primary)
                        .accessibilityLabel("Puesto \(place)")
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(group.id == groups.first?.id ? "home-hcp-groups" : "home-hcp-group-\(group.id)")
        .accessibilityLabel("Tu grupo: \(group.name)")
        .overlay {
            if group.id == groups.first?.id {
                GProbe(id: "home-hcp-groups", label: group.name)
                    .allowsHitTesting(false)
            }
        }
    }

    private var createGroup: some View {
        Button(action: onCreate) {
            row {
                Text("+")
                    .font(GFont.ui(22, weight: .semibold))
                    .foregroundStyle(p.accent)
                    .frame(width: face, height: face)
                    .overlay(Circle().stroke(p.accent, lineWidth: 1.5))
                copy("Crear grupo", "Compará con tus amigos.")
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("home-hcp-crear-grupo")
        .accessibilityLabel("Crear grupo")
        .overlay { GProbe(id: "home-hcp-crear-grupo", label: "Crear grupo") }
    }

    private func row<Content: View>(@ViewBuilder content: () -> Content) -> some View {
        HStack(spacing: 12) {
            content()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(p.ink3)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 14)
        .frame(maxWidth: .infinity)
        .frame(height: 64)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .contentShape(Rectangle())
    }

    private func copy(_ title: String, _ line: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(GType.headline)
                .foregroundStyle(p.ink)
                .lineLimit(1)
            Text(line)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
                    size: face,
                    fill: p.surface2,
                    ink: p.ink,
                    ring: ring,
                    verified: profesor.verified
                )
                .zIndex(Double(shown.count - index))
            }
        }
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
    static let groupOverlap: CGFloat = 8
    static let numberPeopleGap: CGFloat = 12
    static let accent: UInt32 = BrandHex.red
    static let celeste: UInt32 = 0xC8A86A
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
        return stackWidth(count: shown, avatar: groupAvatar, overlap: groupOverlap, extraChip: false)
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

    var cacheID: String? = nil

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Color.clear
                .frame(width: size, height: size)
                .overlay {
                    Text(initials)
                        .font(GFont.ui(size <= 28 ? 10.5 : (size < 40 ? 12 : 16), weight: .semibold))
                        .foregroundStyle(ink)
                    if let cacheID, let data = GroupPhotoCache.data(for: cacheID), let image = UIImage(data: data) {
                        Image(uiImage: image).resizable().scaledToFill().frame(width: size, height: size)
                    } else if let url, let parsed = URL(string: url), parsed.scheme == "https" || parsed.scheme == "http" {
                        AsyncImage(url: parsed) { phase in
                            if let image = phase.image {
                                image.resizable().scaledToFill().frame(width: size, height: size)
                            }
                        }
                        .frame(width: size, height: size)
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
                .overlay(Circle().stroke(Color.white, lineWidth: 1.5))
                .offset(x: 2, y: 2)
                .accessibilityLabel("Verificado")
            }
        }
    }
}

struct ScorecardFetchSheet: View {
    @Environment(\.palette) private var p
    let jobs: [ScorecardFetchJob]
    var note: String? = nil
    var refreshID: String
    var sheetID: String
    var onRefresh: () -> Void

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text(scorecardSummary)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .accessibilityIdentifier("scorecard-count")
                    if jobs.contains(where: \.canRetry) {
                        GProbe(id: refreshID, label: "Buscar de nuevo")
                    }
                    if let note, !note.isEmpty {
                        Text(note)
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("home-scorecard-error")
                    }
                    if jobs.isEmpty {
                        emptyCard
                    } else {
                        ForEach(jobs) { job in
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(alignment: .center) {
                                    Text(job.clubName.isEmpty ? "Club" : job.clubName)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                        .lineLimit(1)
                                    Spacer(minLength: 8)
                                    Text(job.chipTitle)
                                        .font(GFont.ui(12, weight: .semibold))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(scorecardChipColor(job.chipTitle))
                                        .clipShape(Capsule())
                                }
                                if job.canRetry {
                                    Button(action: onRefresh) {
                                        Text("Buscar de nuevo")
                                            .font(GType.headline)
                                            .underline()
                                            .foregroundStyle(p.ink)
                                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier(refreshID)
                                    .accessibilityLabel("Buscar de nuevo")
                                }
                                if !whenLine(job).isEmpty {
                                    Text(whenLine(job))
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                                Text(job.label)
                                    .font(GType.body)
                                    .foregroundStyle(p.ink)
                                Text(job.lastCheckLine)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.vertical, 8)
                            .accessibilityElement(children: .contain)
                            .accessibilityIdentifier("home-scorecard-\(job.id)")
                        }
                    }
                }
                .padding(20)
            }
            .background(p.bg)
            .navigationTitle("Tarjetas del club")
            .navigationBarTitleDisplayMode(.inline)
        }
        .golfletChrome()
        .accessibilityIdentifier(sheetID)
    }

    private func scorecardChipColor(_ title: String) -> Color {
        switch title {
        case "No presentó": return Color(hex: 0x5C687B)
        case "Error": return Color(hex: 0xC8102E)
        default: return Color(hex: 0x0B2545)
        }
    }

    private var scorecardSummary: String {
        let absent = jobs.filter { $0.chipTitle == "No presentó" }.count
        let pending = jobs.filter { $0.chipTitle == "Pendiente" }.count
        let errors = jobs.filter { $0.chipTitle == "Error" }.count
        let bits = [
            absent > 0 ? "\(absent) sin tarjeta" : nil,
            pending > 0 ? "\(pending) pendiente\(pending == 1 ? "" : "s")" : nil,
            errors > 0 ? "\(errors) con error" : nil,
        ].compactMap { $0 }
        return bits.isEmpty ? "Sin búsquedas abiertas" : bits.joined(separator: " · ")
    }

    private func whenLine(_ job: ScorecardFetchJob) -> String {
        [job.date, job.time, job.course].filter { !$0.isEmpty }.joined(separator: " · ")
    }

    private var emptyCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            CaddieMark(height: 72)
            Text("Todavía no hay tarjeta")
                .font(GType.headline)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("scorecard-empty")
            Text("El club todavía no publicó la tarjeta de esta salida.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
                    Button {
                        dismiss()
                        model.presentCreateGroup()
                    } label: {
                        Text("Crear grupo")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.accent)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("home-groups-create-cta")
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
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(group.name)
                                            .font(GType.headline)
                                            .foregroundStyle(p.ink)
                                        Text(group.memberCount == 1 ? "1 integrante" : "\(group.memberCount) integrantes")
                                            .font(GType.label)
                                            .foregroundStyle(p.ink2)
                                            .accessibilityIdentifier("home-group-count-\(group.id)")
                                        let people = group.members.filter { !$0.isPending }
                                        if !people.isEmpty {
                                            HStack(spacing: 8) {
                                                MemberFaceStack(members: people, size: 28)
                                                Text(memberNames(people))
                                                    .font(GType.label)
                                                    .foregroundStyle(p.ink2)
                                                    .lineLimit(2)
                                            }
                                        }
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

enum TournamentName {
    /// Web `title()`: drop emoji, title-case all-caps words, then lowercase De/La/Del/Y/El/Los mid-phrase.
    static func title(_ raw: String) -> String {
        let stripped = raw.unicodeScalars.filter { scalar in
            let value = scalar.value
            if scalar.properties.isEmojiPresentation || value == 0xFE0F || value == 0x200D { return false }
            if (0x1F300...0x1FAFF).contains(value) || (0x2600...0x27BF).contains(value) { return false }
            return true
        }
        var text = String(String.UnicodeScalarView(stripped))
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        text = replacing(text, #"\b([A-ZÁÉÍÓÚÑ]{2,})\b"#) { word, _ in
            String(word.prefix(1)) + word.dropFirst().lowercased()
        }
        text = replacing(text, #"\b(De|La|Del|Y|El|Los)\b"#) { word, range in
            range.lowerBound == text.startIndex ? word : word.lowercased()
        }
        return text
    }

    /// Web `short()`: `title()`, then drop handicap ranges, hmp tokens and years.
    static func short(_ raw: String) -> String {
        title(raw)
            .replacingOccurrences(of: #"\b-?\d+([.,]\d+)?\s*-\s*\d+([.,]\d+)?\b"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\b\d+\s*hmp\b"#, with: "", options: [.regularExpression, .caseInsensitive])
            .replacingOccurrences(of: #"\b20\d\d\b"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func replacing(_ text: String, _ pattern: String, _ transform: (String, Range<String.Index>) -> String) -> String {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return text }
        let matches = regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
        var result = text
        for match in matches.reversed() {
            guard let range = Range(match.range, in: result) else { continue }
            result.replaceSubrange(range, with: transform(String(result[range]), range))
        }
        return result
    }
}

extension Round {
    var plainTournament: String { TournamentName.title(tournament) }

    var displayTitle: String {
        let title = TournamentName.short(tournament)
        return title.isEmpty ? "Ronda" : title
    }
}
