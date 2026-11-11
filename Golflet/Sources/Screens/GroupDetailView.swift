import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

struct GroupDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let groupID: String
    @State private var comparison: GroupComparison?
    @State private var config = GroupViewConfig.default
    @State private var showsViewSettings = false
    @State private var editingName = ""
    @State private var pickerItem: PhotosPickerItem?
    @State private var showPhotoChoices = false
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var matriculaDraft = ""
    @State private var confirmLeave = false
    @State private var comparativoRoute: ComparativoRoute?
    @State private var profileRoute: MemberProfileRoute?
    @State private var compareMetric: String?

    private var group: GolfletGroup? {
        model.groups.first { $0.id == groupID }
    }

    var body: some View {
        GScreen(id: "screen-grupo") {
            ScrollView(showsIndicators: false) {
                if let group {
                    content(group)
                } else {
                    Text("Este grupo ya no está.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                        .padding(20)
                }
            }
        }
        .accessibilityIdentifier("screen-grupo")
        .safeAreaInset(edge: .top) {
            closeBar(action: {
                if model.presentedGroupID != nil {
                    model.presentedGroupID = nil
                } else {
                    model.presentedInvite = nil
                }
            }, id: "close-grupo")
        }
        .task(id: groupID) { await load() }
        .onAppear { Task { await load() } }
        .sheet(item: Bindable(model).inviteShare) { payload in
            NavigationStack {
                InviteShareView(payload: payload)
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: $showsViewSettings) {
            NavigationStack {
                GroupViewSettings(groupID: groupID, config: $config, cards: comparison?.hero?.cards) { updated in
                    config = updated
                    Task { await reloadComparison() }
                }
            }
            .golfletChrome()
            .environment(model)
        }
        .confirmationDialog("¿Salís del grupo?", isPresented: $confirmLeave, titleVisibility: .visible) {
            Button("Salir del grupo", role: .destructive) {
                if let group { Task { await model.leaveGroup(group) } }
            }
            Button("Cancelar", role: .cancel) {}
        }
        .navigationDestination(item: $comparativoRoute) { route in
            ComparativoView(groupID: route.groupID, kind: route.kind, off: route.off)
        }
        .navigationDestination(item: $profileRoute) { route in
            MemberProfileView(groupID: route.groupID, memberID: route.memberID)
        }
        .onChange(of: pickerItem) { _, item in
            Task { await loadPickedPhoto(item) }
        }
        .confirmationDialog("Foto del grupo", isPresented: $showPhotoChoices, titleVisibility: .visible) {
            if UIImagePickerController.isSourceTypeAvailable(.camera) {
                Button("Sacar foto") { showCamera = true }
            }
            Button("Elegir de la biblioteca") { showLibrary = true }
            Button("Cancelar", role: .cancel) {}
        }
        .photosPicker(isPresented: $showLibrary, selection: $pickerItem, matching: .images)
        .sheet(isPresented: $showCamera) {
            GroupCameraPicker { data in
                showCamera = false
                Task { await savePhoto(data) }
            }
        }
    }

    private func loadPickedPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        if let picked = try? await item.loadTransferable(type: PickedGroupImage.self) {
            await savePhoto(picked.data)
        } else if let data = try? await item.loadTransferable(type: Data.self) {
            await savePhoto(data)
        }
        pickerItem = nil
    }

    private func savePhoto(_ data: Data) async {
        guard let group, !data.isEmpty else { return }
        let jpeg = GroupPhoto.jpegData(from: data)
        guard !jpeg.isEmpty else {
            model.errorMessage = "No pudimos leer esa foto. La anterior sigue igual."
            return
        }
        await model.updateGroup(group, name: nil, photoJPEG: jpeg)
    }

    @ViewBuilder
    private func content(_ group: GolfletGroup) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            header(group)
            if group.isAdmin {
                adminTools(group)
            }
            members(group)
            MatchHistorySection(
                records: group.matchRecords,
                matches: group.recentMatches,
                canAttach: true,
                onPhoto: { matchID, data in
                    _ = await model.saveMatchPhoto(groupID: group.id, matchID: matchID, jpeg: data)
                }
            )
            comparisonSection(group)
            comparativoEntry
            Button {
                confirmLeave = true
            } label: {
                Text("Salir del grupo")
                    .font(GType.headline)
                    .foregroundStyle(p.negative)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .accessibilityIdentifier("group-leave")

            if let error = model.errorMessage {
                Text(error)
                    .font(GType.label)
                    .foregroundStyle(p.negative)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 28)
    }

    private func header(_ group: GolfletGroup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 14) {
                GroupPhotoView(url: group.photoURL, initials: GroupsParser.initials(group.name), size: 64, cacheID: group.id)
                VStack(alignment: .leading, spacing: 4) {
                    GOverline(text: group.isAdmin ? "Administrador" : "Miembro")
                    Text(group.name)
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                        .accessibilityIdentifier("group-title")
                    Text("Dueño: \(group.owner.name)")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
            }
            if group.isAdmin {
                GField(label: "Nombre") {
                    TextField("Nombre del grupo", text: $editingName)
                        .accessibilityIdentifier("group-edit-name")
                }
                Button {
                    Task { await model.updateGroup(group, name: editingName, photoJPEG: nil) }
                } label: {
                    Text("Guardar nombre")
                        .font(GType.headline)
                        .foregroundStyle(p.primary)
                }
                .disabled(editingName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isBusy)
                .accessibilityIdentifier("group-save-name")
                Button {
                    showPhotoChoices = true
                } label: {
                    Text("Cambiar foto")
                        .font(GType.headline)
                        .foregroundStyle(p.primary)
                }
                .accessibilityIdentifier("group-edit-photo")
            }
        }
        .onAppear { editingName = group.name }
        .onChange(of: group.name) { _, name in
            if editingName.isEmpty { editingName = name }
        }
    }

    private func adminTools(_ group: GolfletGroup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Link de invitación")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if let invite = group.invite, invite.enabled {
                GCard(radius: 16, padding: 14) {
                    Text(invite.url.absoluteString)
                        .font(GType.label)
                        .foregroundStyle(p.ink)
                        .textSelection(.enabled)
                        .accessibilityIdentifier("group-invite-url")
                }
                HStack(spacing: 10) {
                    Button {
                        Task { await model.regenerateInvite(group) }
                    } label: {
                        Text("Regenerar")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(p.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .accessibilityIdentifier("group-regen-link")
                    Button {
                        Task { await model.disableInvite(group) }
                    } label: {
                        Text("Desactivar")
                            .font(GType.headline)
                            .foregroundStyle(p.negative)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(p.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .accessibilityIdentifier("group-disable-link")
                }
            } else {
                Text("El link está desactivado.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                Button {
                    Task { await model.regenerateInvite(group) }
                } label: {
                    Text("Generar un link nuevo")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .accessibilityIdentifier("group-regen-link")
            }
        }
    }

    private func members(_ group: GolfletGroup) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Jugadores")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if group.isAdmin {
                addByMatricula(group)
            }
            ForEach(group.members + group.pendingMembers) { member in
                GCard(radius: 16, padding: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 12) {
                            GroupPhotoView(url: member.photoURL, initials: member.initials, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(memberLine(member))
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            Spacer()
                        }
                        if !member.isPending {
                            Button {
                                profileRoute = MemberProfileRoute(groupID: group.id, memberID: member.id)
                            } label: {
                                Text("Ver perfil")
                                    .font(GType.label)
                                    .foregroundStyle(p.primary)
                            }
                            .accessibilityIdentifier("group-profile-\(member.id)")
                            GProbe(id: "group-profile-\(member.id)", label: "Ver perfil")
                        }
                        if group.isAdmin, !member.isPending {
                            HStack(spacing: 10) {
                                Button {
                                    Task {
                                        await model.setMemberRole(
                                            group: group,
                                            member: member,
                                            role: member.role == .admin ? .member : .admin
                                        )
                                    }
                                } label: {
                                    Text(member.role == .admin ? "Sacar admin" : "Hacer admin")
                                        .font(GType.label)
                                        .foregroundStyle(p.primary)
                                }
                                .accessibilityIdentifier("group-role-\(member.id)")
                                if member.id != group.owner.id, member.id != model.user?.id {
                                    Button {
                                        Task { await model.removeMember(group: group, member: member) }
                                    } label: {
                                        Text("Sacar")
                                            .font(GType.label)
                                            .foregroundStyle(p.negative)
                                    }
                                    .accessibilityIdentifier("group-remove-\(member.id)")
                                }
                            }
                        }
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("group-member-\(member.id)")
            }
        }
    }

    private var comparativoEntry: some View {
        GCard(radius: 16, padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text("Comparativo")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("Leaderboard, birdies, pares, GIR y más, por semana o por mes")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                HStack(spacing: 10) {
                    Button {
                        comparativoRoute = ComparativoRoute(groupID: groupID, kind: .semana, off: 0, stat: nil)
                    } label: {
                        Text("Esta semana")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .accessibilityIdentifier("group-comp-semana")
                    Button {
                        comparativoRoute = ComparativoRoute(groupID: groupID, kind: .mes, off: 0, stat: nil)
                    } label: {
                        Text("Este mes")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(p.surface2)
                            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                    .accessibilityIdentifier("group-comp-mes")
                }
                GProbe(id: "group-comparativo", label: "Comparativo")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("group-comparativo")
    }

    private func comparisonSection(_ group: GolfletGroup) -> some View {
        let rows = comparison?.rows ?? []
        let selected = rows.first { $0.metric.rawValue == compareMetric } ?? rows.first
        return VStack(alignment: .leading, spacing: 16) {
            HStack {
                Text("Comparación")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Button { showsViewSettings = true } label: {
                    Text("Mi vista")
                        .font(GType.label)
                        .foregroundStyle(p.primary)
                }
                .accessibilityIdentifier("group-my-view")
            }
            Text("Esta vista es tuya. El admin no te la arma.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
            Text("\(config.range.title)\(config.courseFilter.map { " · \($0)" } ?? " · Todas")")
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier("group-view-range")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(GroupPeriod.allCases) { period in
                        Button {
                            selectPeriod(period)
                        } label: {
                            Text(period.short)
                                .font(GType.label)
                                .foregroundStyle(config.range == period ? p.onPrimary : p.ink)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(config.range == period ? p.primary : p.surface2)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(period.title)
                        .accessibilityIdentifier("group-period-\(period.rawValue)")
                    }
                }
            }

            if let hero = comparison?.hero {
                VStack(spacing: 2) {
                    Text("Tu puesto")
                        .font(GType.label)
                        .foregroundStyle(Color(hex: 0x8C6A2F))
                    Text("\(hero.rank)º")
                        .font(GFont.ui(52, weight: .bold))
                        .foregroundStyle(p.ink)
                    Text("en birdies")
                        .font(GType.body)
                        .foregroundStyle(p.ink)
                    if let cards = hero.cards {
                        Text(cards)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .multilineTextAlignment(.center)
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .padding(.horizontal, 12)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("group-hero")
            }

            if !rows.isEmpty {
                Text("Trofeos")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                trophyStrip(rows, group: group)
                Text("Ranking")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(rows) { row in
                            Button { compareMetric = row.metric.rawValue } label: {
                                Text(row.metric.title)
                                    .font(GType.label)
                                    .foregroundStyle(row.id == selected?.id ? p.onPrimary : p.ink)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(row.id == selected?.id ? p.primary : p.surface)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("group-metric-\(row.metric.rawValue)")
                        }
                    }
                }
                if let selected {
                    podium(selected, group: group)
                }
            }

            if let comparison {
                ForEach(comparison.rows) { row in
                    comparisonCard(row)
                }
            }
        }
        .padding(.bottom, 8)
    }

    private func trophyTitle(_ metric: GroupMetricKind) -> String {
        switch metric {
        case .birdies: return "Rey del birdie"
        case .pars: return "Más pares"
        case .eagles: return "Más águilas"
        case .net: return "Mejor neto"
        case .gross: return "Mejor gross"
        default: return metric.title
        }
    }

    private func trophyStrip(_ rows: [GroupComparisonRow], group: GolfletGroup) -> some View {
        let winners = rows.compactMap { row -> (GroupComparisonRow, MemberMetricValue)? in
            guard let winner = row.ranked().first else { return nil }
            return (row, winner)
        }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(winners, id: \.0.id) { item in
                    trophyCard(row: item.0, winner: item.1, group: group)
                }
            }
        }
        .accessibilityIdentifier("group-trophies")
    }

    private func trophyCard(row: GroupComparisonRow, winner: MemberMetricValue, group: GolfletGroup) -> some View {
        let photo = winner.photoURL ?? group.members.first { $0.id == winner.memberID }?.photoURL
        return HStack(spacing: 10) {
            Image(systemName: "medal.fill")
                .font(.system(size: 22))
                .foregroundStyle(Color(hex: 0xC8A86A))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 4) {
                Text(trophyTitle(row.metric))
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    GroupPhotoView(url: photo, initials: winner.initials, size: 28)
                    Text(winner.memberName)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .lineLimit(1)
                }
            }
        }
        .padding(12)
        .frame(width: 250, alignment: .leading)
        .background(p.surface)
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Color(hex: 0xC8A86A), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func podium(_ row: GroupComparisonRow, group: GolfletGroup) -> some View {
        let top = Array(row.ranked().prefix(3))
        let order = top.count >= 3 ? [1, 0, 2] : top.count == 2 ? [1, 0] : Array(top.indices)
        let gap = podiumGap(row, top: top)
        return HStack(alignment: .bottom, spacing: 8) {
            ForEach(order, id: \.self) { index in
                podiumStep(slot: index + 1, place: row.rank(of: top[index].memberID) ?? (index + 1), value: top[index], metric: row.metric, group: group, gap: index == 0 ? gap : nil)
            }
        }
        .accessibilityIdentifier("group-podium")
    }

    private func podiumStep(slot: Int, place: Int, value: MemberMetricValue, metric: GroupMetricKind, group: GolfletGroup, gap: String?) -> some View {
        let photo = value.photoURL ?? group.members.first { $0.id == value.memberID }?.photoURL
        return VStack(spacing: 4) {
            Text("\(place)º")
                .font(GType.label)
                .foregroundStyle(Color(hex: 0x8C6A2F))
            if slot == 1 {
                Image(systemName: "medal.fill")
                    .font(.system(size: 18))
                    .foregroundStyle(Color(hex: 0xC8A86A))
                    .accessibilityHidden(true)
            }
            GroupPhotoView(url: photo, initials: value.initials, size: slot == 1 ? 64 : 52)
            Text(value.memberName)
                .font(GType.label)
                .foregroundStyle(p.ink)
                .multilineTextAlignment(.center)
                .lineLimit(2)
            Text(display(value, metric: metric))
                .font(GFont.ui(28, weight: .bold))
                .foregroundStyle(p.ink)
            if let per = value.perRound {
                Text("\(FormatAR.one(per)) por ronda")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            if let gap {
                Text(gap)
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .frame(height: slot == 1 ? 228 : slot == 2 ? 184 : 156, alignment: .bottom)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(slot == 1 ? Color(hex: 0xC8A86A) : Color.clear, lineWidth: 2)
        )
        .accessibilityIdentifier("group-podium-\(slot)")
    }

    private func podiumGap(_ row: GroupComparisonRow, top: [MemberMetricValue]) -> String? {
        guard !row.metric.lowerIsBetter, top.count >= 2, let first = top[0].value, let second = top[1].value, first > second else { return nil }
        let delta = first - second
        let shown = delta.rounded() == delta ? String(Int(delta)) : FormatAR.one(delta)
        return "+\(shown) \(row.metric.title.lowercased()) sobre \(top[1].memberName)"
    }

    private func comparisonCard(_ row: GroupComparisonRow) -> some View {
        GCard(radius: 16, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                Text(row.metric.title)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                ForEach(Array(row.values.enumerated()), id: \.element.id) { _, value in
                    HStack {
                        Text(value.memberName)
                            .font(GType.body)
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                        Spacer()
                        if value.shared, let rank = row.rank(of: value.memberID) {
                            Text("#\(rank)")
                                .font(GType.label)
                                .tabular()
                                .foregroundStyle(p.ink3)
                        }
                        Text(display(value, metric: row.metric))
                            .font(GType.headline)
                            .tabular()
                            .foregroundStyle(value.shared ? p.ink : p.ink3)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(value.memberName), \(display(value, metric: row.metric))")
                    .accessibilityIdentifier("compare-\(row.metric.rawValue)-\(value.memberID)")
                }
            }
        }
    }

    private func display(_ value: MemberMetricValue, metric: GroupMetricKind) -> String {
        guard value.shared else { return MemberMetricValue.hiddenLabel }
        if let text = value.text, !text.isEmpty { return text }
        guard let number = value.value else { return "—" }
        switch metric {
        case .birdies, .pars, .eagles:
            return FormatAR.int(Int(number.rounded()))
        case .gir, .fir:
            return "\(FormatAR.int(Int(number.rounded())))%"
        case .gpsDrive, .bagCarry:
            return "\(FormatAR.int(Int(number.rounded()))) yd"
        default:
            return FormatAR.one(number)
        }
    }

    private func memberLine(_ member: GroupMember) -> String {
        var parts: [String] = []
        if member.isPending { parts.append("Invitación pendiente") }
        if let matricula = member.matricula, !matricula.isEmpty {
            parts.append("Matrícula \(matricula)")
        }
        if parts.isEmpty {
            return member.isOwner ? "Dueño · \(member.role.title)" : member.role.title
        }
        return parts.joined(separator: " · ")
    }

    private func addByMatricula(_ group: GolfletGroup) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            GField(label: "Matrícula") {
                TextField("Matrícula", text: $matriculaDraft)
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("group-matricula")
            }
            Button {
                let value = matriculaDraft
                matriculaDraft = ""
                Task { await model.inviteByMatricula(group, matricula: value) }
            } label: {
                Text("Sumar jugador")
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .disabled(matriculaDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || model.isBusy)
            .accessibilityIdentifier("group-add-matricula")
        }
    }

    private func load() async {
        do {
            config = try await model.api.groupView(groupID: groupID)
            await reloadComparison()
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }

    private func selectPeriod(_ period: GroupPeriod) {
        guard config.range != period else { return }
        config.range = period
        Task { await reloadComparison() }
    }

    private func reloadComparison() async {
        do {
            comparison = try await model.api.groupComparison(groupID: groupID, config: config)
        } catch {
            model.errorMessage = error.localizedDescription
        }
    }
}

struct GroupViewSettings: View {
    static func fewCards(_ cards: String) -> Bool {
        guard let match = cards.range(of: #"\d+ de 18"#, options: .regularExpression) else { return false }
        let n = Int(cards[match].split(separator: " ").first.map(String.init) ?? "") ?? 0
        return n < 3
    }

    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let groupID: String
    var cards: String? = nil
    @Binding var config: GroupViewConfig
    var onSave: (GroupViewConfig) -> Void
    @State private var draft: GroupViewConfig = .default

    var body: some View {
        GScreen(id: "screen-vista-grupo") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Solo para vos")
                        GTitle(text: "Mi vista", size: 30)
                    }
                    if let cards {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Tu resumen")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            Text(GroupViewSettings.fewCards(cards) ? "Pocas tarjetas" : cards)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            if GroupViewSettings.fewCards(cards) {
                                Text(cards)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                        }
                        .accessibilityIdentifier("vista-resumen")
                    }
                    Text("Elegí qué métricas y gráficos ves, el orden, el período y la cancha. Nadie más cambia esta vista.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    Text("Período")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(GroupPeriod.allCases) { range in
                            Button {
                                draft.range = range
                            } label: {
                                HStack {
                                    Text(range.title)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Spacer()
                                    if draft.range == range {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(p.primary)
                                    }
                                }
                                .padding(.vertical, 6)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("view-range-\(range.rawValue)")
                        }
                    }

                    Text("Cancha")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    ForEach(courseOptions, id: \.self) { course in
                        Button {
                            draft.courseFilter = course == "Todas" ? nil : course
                        } label: {
                            HStack {
                                Text(course)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Spacer()
                                if (draft.courseFilter ?? "Todas") == course || (draft.courseFilter == nil && course == "Todas") {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(p.primary)
                                }
                            }
                            .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("view-course-\(course.lowercased())")
                    }

                    Text("Métricas")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    ForEach(Array(draft.metrics.enumerated()), id: \.element) { index, metric in
                        HStack {
                            Text(metric.title)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Spacer()
                            Button {
                                guard index > 0 else { return }
                                draft.metrics.swapAt(index, index - 1)
                            } label: {
                                Image(systemName: "chevron.up")
                                    .foregroundStyle(p.ink2)
                            }
                            .accessibilityIdentifier("view-metric-up-\(metric.rawValue)")
                            Button {
                                guard index + 1 < draft.metrics.count else { return }
                                draft.metrics.swapAt(index, index + 1)
                            } label: {
                                Image(systemName: "chevron.down")
                                    .foregroundStyle(p.ink2)
                            }
                            .accessibilityIdentifier("view-metric-down-\(metric.rawValue)")
                            Button {
                                draft.metrics.removeAll { $0 == metric }
                            } label: {
                                Image(systemName: "minus.circle")
                                    .foregroundStyle(p.negative)
                            }
                            .accessibilityIdentifier("view-metric-remove-\(metric.rawValue)")
                        }
                    }
                    ForEach(GroupMetricKind.allCases.filter { !draft.metrics.contains($0) }) { metric in
                        Button {
                            draft.metrics.append(metric)
                        } label: {
                            Text("Agregar \(metric.title)")
                                .font(GType.label)
                                .foregroundStyle(p.primary)
                        }
                        .accessibilityIdentifier("view-metric-add-\(metric.rawValue)")
                    }

                    Text("Gráficos")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    ForEach(GroupChartKind.allCases) { chart in
                        Toggle(isOn: Binding(
                            get: { draft.charts.contains(chart) },
                            set: { on in
                                if on {
                                    if !draft.charts.contains(chart) { draft.charts.append(chart) }
                                } else {
                                    draft.charts.removeAll { $0 == chart }
                                }
                            }
                        )) {
                            Text(chart.title)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                        }
                        .tint(p.primary)
                        .accessibilityIdentifier("view-chart-\(chart.rawValue)")
                    }

                    Button {
                        Task {
                            await model.saveGroupView(groupID: groupID, config: draft)
                            onSave(draft)
                            dismiss()
                        }
                    } label: {
                        Text("Guardar mi vista")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .accessibilityIdentifier("view-save")
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-vista-grupo")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-vista-grupo") }
        .onAppear { draft = config }
    }

    private var courseOptions: [String] {
        var names = ["Todas"]
        for course in model.courses where !names.contains(course.name) {
            names.append(course.name)
        }
        return names
    }
}

struct PickedGroupImage: Transferable {
    var data: Data

    static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(importedContentType: .image) { data in
            PickedGroupImage(data: data)
        }
    }
}

struct GroupCameraPicker: UIViewControllerRepresentable {
    var onImage: (Data) -> Void

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onImage: onImage)
    }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onImage: (Data) -> Void
        init(onImage: @escaping (Data) -> Void) { self.onImage = onImage }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            let image = info[.originalImage] as? UIImage
            onImage(image?.jpegData(compressionQuality: 0.82) ?? Data())
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            onImage(Data())
        }
    }
}
