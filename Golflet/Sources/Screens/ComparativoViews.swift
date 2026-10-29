import SwiftUI

struct ComparativoView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let groupID: String
    @State var kind: ComparativoKind
    @State var off: Int
    @State private var data: ComparativoData?
    @State private var errorText: String?
    @State private var profileRoute: MemberProfileRoute?
    @State private var statKey: String?

    var body: some View {
        GScreen(id: "screen-comparativo") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: data?.groupName ?? "Grupo")
                        GTitle(text: "Comparativo", size: 30)
                    }
                    periodChrome
                    if let errorText {
                        Text(errorText)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    } else if let data {
                        leaderboard(data)
                        tiles(data)
                        Text("Solo cuentan tarjetas reales de 18 hoyos y rondas con GPS \(data.period.kind.windowFoot). Promedios y porcentajes piden un mínimo: \(ComparativoFormat.count(data.mins.r, one: "ronda", many: "rondas")), \(ComparativoFormat.count(data.mins.gh, one: "hoyo con GIR", many: "hoyos con GIR")) para GIR, \(ComparativoFormat.count(data.mins.dr, one: "salida medida", many: "salidas medidas")) para fairways. Quien no comparte una métrica no aparece en ese ranking.")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    } else {
                        Text("Cargando…")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-comparativo")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-comparativo") }
        .task(id: "\(kind.rawValue)-\(off)") { await load() }
        .navigationDestination(item: $profileRoute) { route in
            MemberProfileView(groupID: route.groupID, memberID: route.memberID)
        }
        .navigationDestination(item: Binding(
            get: { statKey.map { ComparativoRoute(groupID: groupID, kind: kind, off: off, stat: $0) } },
            set: { statKey = $0?.stat }
        )) { route in
            if let data {
                ComparativoStatView(data: data, statKey: route.stat ?? "", onMember: openProfile)
            }
        }
    }

    private var periodChrome: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                ForEach(ComparativoKind.allCases) { item in
                    Button {
                        kind = item
                        off = 0
                    } label: {
                        Text(item.title)
                            .font(GType.headline)
                            .foregroundStyle(item == kind ? p.onPrimary : p.ink)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 8)
                            .background(item == kind ? p.primary : p.surface2)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("comp-kind-\(item.rawValue)")
                }
            }
            .accessibilityIdentifier("comp-kinds")

            HStack {
                Button {
                    if let prev = data?.period.prevOff { off = prev }
                } label: {
                    Text("‹")
                        .font(GType.sheetTitle)
                        .foregroundStyle(data?.period.prevOff == nil ? p.ink3 : p.ink)
                }
                .disabled(data?.period.prevOff == nil)
                .accessibilityIdentifier("comp-prev")

                VStack(spacing: 2) {
                    Text(data?.period.short ?? "—")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("\(data?.period.label ?? "")\(data?.period.inProgress == true ? " · en curso" : "")")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("comp-period")

                Button {
                    if let next = data?.period.nextOff { off = next }
                } label: {
                    Text("›")
                        .font(GType.sheetTitle)
                        .foregroundStyle(data?.period.nextOff == nil ? p.ink3 : p.ink)
                }
                .disabled(data?.period.nextOff == nil)
                .accessibilityIdentifier("comp-next")
            }
        }
    }

    private func leaderboard(_ data: ComparativoData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Leaderboard")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if data.leaderboard.rows.isEmpty {
                GCard(radius: 16, padding: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Nadie cargó tarjetas \(data.period.off == 0 ? data.period.kind.thisLabel.lowercased() : "en \(data.period.kind.thatLabel)")")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text("Las tarjetas llegan solas cuando sincroniza tu club.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                        if data.period.prevOff != nil {
                            Button("Ver \(data.period.kind.previousLabel)") {
                                off = data.period.prevOff ?? off
                            }
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                            .accessibilityIdentifier("comp-empty-prev")
                        }
                    }
                }
                .accessibilityIdentifier("comp-empty")
            } else {
                ForEach(data.leaderboard.rows) { row in
                    if let member = data.member(row.memberID) {
                        leaderRow(data: data, member: member, pos: row.pos, out: false)
                    }
                }
                ForEach(data.leaderboard.rest) { row in
                    if let member = data.member(row.memberID) {
                        leaderRow(data: data, member: member, pos: nil, out: true, state: row.state)
                    }
                }
                Text("Ordenado por mejor neto vs par; si empatan, mejor gross y después promedio.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
        }
    }

    private func leaderRow(
        data: ComparativoData,
        member: ComparativoMember,
        pos: Int?,
        out: Bool,
        state: ComparativoRowState? = nil
    ) -> some View {
        let net = member.stats["best_net"]
        let gross = member.stats["best_gross"]
        let value = net?.value != nil ? net : gross
        let caption = net?.value != nil ? "mejor neto" : "mejor gross"
        return GCard(radius: 16, padding: 14) {
            HStack(alignment: .center, spacing: 12) {
                Text(pos.map { "\($0)" } ?? "—")
                    .font(GType.headline)
                    .tabular()
                    .foregroundStyle(p.ink3)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 4) {
                    memberName(member)
                    Text(out ? restLabel(data, state) : leaderSub(member))
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
                Spacer(minLength: 8)
                if !out {
                    Button {
                        statKey = net?.value != nil ? "best_net" : "best_gross"
                    } label: {
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(ComparativoFormat.toPar(value?.value))
                                .font(GType.headline)
                                .tabular()
                                .foregroundStyle(p.ink)
                            Text(caption)
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("comp-lead-\(member.memberID)")
                }
            }
        }
        .accessibilityIdentifier("comp-row-\(member.memberID)")
    }

    private func tiles(_ data: ComparativoData) -> some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(ComparativoData.groups, id: \.title) { group in
                VStack(alignment: .leading, spacing: 10) {
                    Text(group.title)
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    if group.title.hasPrefix("Greens"), !data.gpsOrCardsAny {
                        GCard(radius: 16, padding: 14) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Sin datos de greens, fairways ni putts \(data.period.off == 0 ? data.period.kind.thisLabel.lowercased() : "en el período")")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text("Las tarjetas del club traen solo los golpes por hoyo. Estos números salen de las rondas jugadas con el GPS de Golflet o de lo que cada uno carga en su tarjeta.")
                                    .font(GType.body)
                                    .foregroundStyle(p.ink2)
                            }
                        }
                        .accessibilityIdentifier("comp-gps-empty")
                    } else {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            ForEach(group.keys, id: \.self) { key in
                                tile(data, key: key)
                            }
                        }
                    }
                }
            }
        }
    }

    private func tile(_ data: ComparativoData, key: String) -> some View {
        let def = data.stat(key)
        let board = data.boards[key]
        let leader = board?.leaders.first.flatMap(data.member)
        let names = (board?.leaders ?? []).compactMap { data.member($0)?.firstName }
        let anyData = data.members.contains { member in
            let stat = member.stats[key]
            return stat?.hidden != true && stat?.value != nil
        }
        let detail: String = {
            if !names.isEmpty {
                let shown = names.prefix(2).joined(separator: ", ")
                return names.count > 2 ? "\(shown) y \(names.count - 2) más" : shown
            }
            return anyData ? (board?.ranked == true ? "Sin líder" : "Nadie llega al mínimo") : "Sin datos"
        }()
        return Button {
            statKey = key
        } label: {
            GCard(radius: 16, padding: 12) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(def?.short ?? key)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    Text(ComparativoFormat.number(leader?.stats[key]?.value, format: def?.format ?? "f"))
                        .font(GType.sheetTitle)
                        .tabular()
                        .foregroundStyle(p.ink)
                    Text(detail)
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                        .lineLimit(2)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("comp-tile-\(key)")
    }

    private func memberName(_ member: ComparativoMember) -> some View {
        Button {
            openProfile(member)
        } label: {
            HStack(spacing: 6) {
                Text(member.isMe ? "\(member.name) (vos)" : member.name)
                    .font(GType.headline)
                    .foregroundStyle(member.profileShared || member.isMe ? p.primary : p.ink)
                    .multilineTextAlignment(.leading)
                if !member.profileShared && !member.isMe {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(p.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(!member.profileShared && !member.isMe)
        .accessibilityIdentifier("comp-who-\(member.memberID)")
    }

    private func openProfile(_ member: ComparativoMember) {
        if member.profileShared || member.isMe {
            profileRoute = MemberProfileRoute(groupID: groupID, memberID: member.memberID)
        }
    }

    private func leaderSub(_ member: ComparativoMember) -> String {
        var parts: [String] = []
        if let rounds = member.stats["rounds"]?.value {
            parts.append(ComparativoFormat.count(Int(rounds.rounded()), one: "ronda", many: "rondas"))
        }
        if let avg = member.stats["avg_gross"]?.value {
            parts.append("prom. \(FormatAR.one(avg))")
        }
        if let hi = member.stats["hi_change"], let def = data?.stat("hi_change") {
            parts.append("HI \(ComparativoFormat.number(hi.value, format: def.format))")
        }
        return parts.joined(separator: " · ")
    }

    private func restLabel(_ data: ComparativoData, _ state: ComparativoRowState?) -> String {
        if state == .hidden { return "No comparte sus scores" }
        if data.period.off == 0 { return "Sin tarjetas \(data.period.kind.thisLabel.lowercased())" }
        return "Sin tarjetas en el período"
    }

    private func load() async {
        errorText = nil
        do {
            data = try await model.api.groupPeriod(groupID: groupID, kind: kind, off: off)
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct ComparativoStatView: View {
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let data: ComparativoData
    let statKey: String
    var onMember: (ComparativoMember) -> Void

    var body: some View {
        let def = data.stat(statKey)
        GScreen(id: "screen-comparativo-stat") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: data.groupName)
                        GTitle(text: def?.label ?? "Ranking", size: 28)
                    }
                    if let desc = def?.desc, !desc.isEmpty {
                        Text(desc)
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                    if let board = data.boards[statKey], let def {
                        ForEach(board.rows) { row in
                            if let member = data.member(row.memberID) {
                                rankingRow(def: def, member: member, row: row, lead: board.leaders.contains(member.memberID))
                            }
                        }
                        Text(footer(def))
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-comparativo-stat")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-comparativo-stat") }
    }

    private func rankingRow(def: ComparativoStatDef, member: ComparativoMember, row: ComparativoBoardRow, lead: Bool) -> some View {
        let stat = member.stats[def.key]
        let subtitle: String = {
            switch row.state {
            case .ranked: return ComparativoFormat.extraSample(def: def, value: stat ?? ComparativoStatValue(value: nil, n: nil, have: nil, need: nil, hidden: false, extra: [:]))
            case .belowMin:
                let words = ComparativoFormat.minWords(def.minKey)
                return "Necesita \(ComparativoFormat.count(stat?.need ?? 0, one: words.0, many: words.1)) (tiene \(stat?.have ?? 0))"
            case .noData:
                return def.gps ? "Sin datos de GPS ni de tarjeta" : "Sin datos en el período"
            case .hidden:
                return "No comparte esta métrica"
            }
        }()
        return GCard(fill: lead ? p.accentSoft : p.surface, radius: 16, padding: 14) {
            HStack(alignment: .top, spacing: 10) {
                Text(row.pos.map { "\($0)" } ?? "—")
                    .font(GType.headline)
                    .tabular()
                    .foregroundStyle(p.ink3)
                    .frame(width: 22)
                VStack(alignment: .leading, spacing: 4) {
                    Button {
                        onMember(member)
                    } label: {
                        Text(member.isMe ? "\(member.name) (vos)" : member.name)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .multilineTextAlignment(.leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("comp-stat-who-\(member.memberID)")
                    Text(subtitle)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
                Spacer()
                Text(row.state == .hidden ? "No compartido" : ComparativoFormat.number(stat?.value, format: def.format))
                    .font(GType.headline)
                    .tabular()
                    .foregroundStyle(p.ink)
            }
        }
        .accessibilityIdentifier("comp-stat-row-\(member.memberID)")
    }

    private func footer(_ def: ComparativoStatDef) -> String {
        var parts = [def.lowerIsBetter ? "Menos es mejor." : "Más es mejor."]
        if let minKey = def.minKey, let min = data.mins.value(for: minKey) {
            let words = ComparativoFormat.minWords(minKey)
            parts.append("Para entrar en el ranking: \(ComparativoFormat.count(min, one: words.0, many: words.1)) en \(data.period.kind == .semana ? "la semana" : "el mes").")
        }
        parts.append(def.gps
            ? "Sale de las rondas con GPS de Golflet y de lo que cada uno carga en su tarjeta (una ronda vinculada cuenta una sola vez)."
            : "Sale de las tarjetas del club.")
        parts.append("Empates comparten el puesto.")
        return parts.joined(separator: " ")
    }
}

struct MemberProfileView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let groupID: String
    let memberID: String
    @State private var profile: GroupMemberProfile?
    @State private var errorText: String?
    @State private var cardRoute: MemberCardRoute?

    var body: some View {
        GScreen(id: "screen-grupo-perfil") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    if let errorText {
                        Text(errorText)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    } else if let profile {
                        header(profile)
                        if profile.locked {
                            locked(profile)
                        } else {
                            openProfile(profile)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-grupo-perfil")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-grupo-perfil") }
        .task { await load() }
        .navigationDestination(item: $cardRoute) { route in
            MemberCardView(groupID: route.groupID, memberID: route.memberID, roundID: route.roundID)
        }
    }

    private func header(_ profile: GroupMemberProfile) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            GOverline(text: profile.groupName)
            GTitle(text: profile.member.isMe ? "\(profile.member.name) (vos)" : profile.member.name, size: 30)
            if !profile.locked, !profile.clubs.isEmpty {
                Text(profile.clubs.joined(separator: " · "))
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
        }
    }

    private func locked(_ profile: GroupMemberProfile) -> some View {
        GCard(radius: 16, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text(profile.member.isMe ? "Así te ven: tu perfil está cerrado" : "\(profile.member.firstName) no comparte su perfil")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text(profile.member.isMe
                     ? "Los jugadores de tus grupos solo ven tu nombre. Podés abrirlo en Qué comparto."
                     : "Solo ves su nombre. Sus números que comparta siguen apareciendo en la tabla y el comparativo del grupo.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                if profile.member.isMe {
                    Button("Ir a Qué comparto") {
                        model.showsSharePrefs = true
                    }
                    .font(GType.headline)
                    .foregroundStyle(p.primary)
                    .accessibilityIdentifier("profile-open-share")
                }
            }
        }
        .accessibilityIdentifier("profile-locked")
    }

    @ViewBuilder
    private func openProfile(_ profile: GroupMemberProfile) -> some View {
        if profile.member.isMe {
            GCard(fill: p.accentSoft, radius: 16, padding: 14) {
                Text("Así te ven los jugadores de este grupo.")
                    .font(GType.body)
                    .foregroundStyle(p.ink)
            }
            .accessibilityIdentifier("profile-asi-te-ven")
        }
        if let year = profile.year {
            Text("Últimos 12 meses")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if profile.shares["scores"] == true {
                statGrid([
                    ("Rondas", year.rounds.map { FormatAR.int($0) } ?? "—", nil, "profile-rounds"),
                    ("Promedio gross", year.avgGross.map(FormatAR.one) ?? "—", year.bestGross.map { "Mejor \($0)" }, "profile-avg-gross"),
                    ("Promedio neto", year.avgNet.map(FormatAR.one) ?? "—", year.bestNet.map { "Mejor \($0)" }, "profile-avg-net")
                ])
            }
            if profile.shares["handicap"] == true {
                statGrid([
                    ("Hándicap Index", year.handicapIndex.map(FormatAR.one) ?? "—", profile.hiHistory.count >= 2 ? "Hace un año \(FormatAR.one(profile.hiHistory[0].handicap))" : nil, "profile-hi")
                ])
            }
        }
        cards(profile)
        let hidden = ["scores": "Rondas y scores", "handicap": "Hándicap", "score_types": "Águilas, birdies, pares y bogeys", "holes": "Promedios por par", "gir_fir": "Greens y fairways", "putting": "Putts", "rounds_detail": "Tarjetas hoyo por hoyo"]
            .compactMap { key, label in profile.shares[key] == false ? label : nil }
        Text(hidden.isEmpty
             ? "Nunca se comparten notas, audios, estrategia ni salidas reservadas."
             : "\(profile.member.isMe ? "No compartís" : "No comparte"): \(hidden.joined(separator: ", ")). Nunca se comparten notas, audios, estrategia ni salidas reservadas.")
            .font(GType.label)
            .foregroundStyle(p.ink3)
    }

    private func cards(_ profile: GroupMemberProfile) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tarjetas")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if let rounds = profile.rounds {
                if rounds.isEmpty {
                    Text("Todavía no tiene tarjetas.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                } else {
                    ForEach(rounds) { round in
                        Button {
                            cardRoute = MemberCardRoute(groupID: groupID, memberID: memberID, roundID: round.roundID)
                        } label: {
                            GCard(radius: 16, padding: 14) {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(round.dateLabel) · \(round.courseLabel)")
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Text("Gross \(round.gross.map(FormatAR.int) ?? "—")\(round.net.map { " · neto \(FormatAR.int($0))" } ?? "")\(round.toPar.map { " · \(ComparativoFormat.toPar(Double($0)))" } ?? "")")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("profile-round-\(round.roundID)")
                    }
                    Text("Las últimas 20.")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
            } else {
                GCard(radius: 16, padding: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(profile.member.isMe ? "Tus tarjetas no se comparten" : "No comparte sus tarjetas hoyo por hoyo")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text(profile.member.isMe
                             ? "Si querés que tus grupos abran cada ronda, activá “Mis tarjetas hoyo por hoyo” en Qué comparto."
                             : "Ves sus promedios, no cada ronda.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
                .accessibilityIdentifier("profile-cards-locked")
            }
        }
    }

    private func statGrid(_ items: [(String, String, String?, String)]) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
            ForEach(items, id: \.3) { item in
                GCard(radius: 16, padding: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(item.0)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                        Text(item.1)
                            .font(GType.sheetTitle)
                            .tabular()
                            .foregroundStyle(p.ink)
                        if let sub = item.2 {
                            Text(sub)
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                    }
                }
                .accessibilityIdentifier(item.3)
            }
        }
    }

    private func load() async {
        do {
            profile = try await model.api.memberProfile(groupID: groupID, memberID: memberID)
        } catch {
            errorText = error.localizedDescription
        }
    }
}

struct MemberCardView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let groupID: String
    let memberID: String
    let roundID: String
    @State private var card: SharedScorecard?
    @State private var errorText: String?

    var body: some View {
        GScreen(id: "screen-grupo-tarjeta") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    if let errorText {
                        Text(errorText)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    } else if let card {
                        GOverline(text: card.member.isMe ? "\(card.member.name) (vos)" : card.member.name)
                        GTitle(text: "\(card.dateLabel) · \(card.courseLabel)", size: 28)
                        HStack(spacing: 10) {
                            pill("Gross", card.gross.map(FormatAR.int) ?? "—")
                            pill("Neto", card.net.map(FormatAR.int) ?? "—")
                            pill("vs par", ComparativoFormat.toPar(card.toPar.map(Double.init)))
                        }
                        nine("Ida", card.holes.filter { $0.hole <= 9 })
                        nine("Vuelta", card.holes.filter { $0.hole > 9 })
                        Text(card.member.isMe ? "Así ven tu tarjeta los jugadores del grupo." : "\(card.member.firstName) comparte sus tarjetas con el grupo. Las notas de la ronda nunca se comparten.")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-grupo-tarjeta")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-grupo-tarjeta") }
        .task { await load() }
    }

    private func pill(_ title: String, _ value: String) -> some View {
        VStack(spacing: 2) {
            Text(value)
                .font(GType.headline)
                .tabular()
                .foregroundStyle(p.ink)
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 10)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func nine(_ title: String, _ holes: [SharedHole]) -> some View {
        GCard(radius: 16, padding: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(title)
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                HStack(spacing: 4) {
                    ForEach(holes) { hole in
                        VStack(spacing: 4) {
                            Text("\(hole.hole)")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                            Text(hole.score.map(FormatAR.int) ?? "—")
                                .font(GType.headline)
                                .tabular()
                                .foregroundStyle(ink(for: hole.toPar))
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
        }
        .accessibilityIdentifier("card-nine-\(title.lowercased())")
    }

    private func ink(for toPar: Int?) -> Color {
        guard let toPar else { return p.ink }
        if toPar <= -1 { return p.accent }
        if toPar == 0 { return p.primary }
        if toPar >= 2 { return p.negative }
        return p.ink
    }

    private func load() async {
        do {
            card = try await model.api.memberRound(groupID: groupID, memberID: memberID, roundID: roundID)
        } catch {
            errorText = error.localizedDescription
        }
    }
}
