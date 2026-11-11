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
                GroupViewSettings(groupID: groupID, cards: comparison?.hero?.cards, config: $config) { updated in
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
                    Image(systemName: "gearshape")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(p.ink)
                        .frame(width: 44, height: 44)
                        .background(p.surface)
                        .clipShape(Circle())
                }
                .accessibilityLabel("Mi vista")
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

            if !rows.isEmpty, let selected {
                youCard(selected, group: group)
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(rows) { row in
                            let on = row.id == selected.id
                            Button { compareMetric = row.metric.rawValue } label: {
                                VStack(alignment: .leading, spacing: 10) {
                                    metricMark(row.metric)
                                    Text(row.metric.title)
                                        .font(GFont.ui(15, weight: .bold))
                                        .foregroundStyle(p.ink)
                                        .lineLimit(2)
                                        .multilineTextAlignment(.leading)
                                }
                                .padding(14)
                                .frame(minWidth: 118, minHeight: 92, alignment: .leading)
                                .background(on ? Color(hex: 0xC8A86A) : p.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                                .shadow(color: p.primary.opacity(0.12), radius: 10, y: 6)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("group-metric-\(row.metric.rawValue)")
                        }
                    }
                    .padding(.horizontal, 4)
                }
                .padding(.top, -42)
                .zIndex(1)
                podium(selected, group: group)
                rateChart(selected)
                rankList(selected, group: group)
                trophyStrip(rows, group: group)
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
        case .pars: return "Máquina de pares"
        case .eagles: return "Rey del águila"
        case .net: return "Mejor neto"
        case .gross: return "Mejor gross"
        default: return metric.title
        }
    }

    private func trophyStrip(_ rows: [GroupComparisonRow], group: GolfletGroup) -> some View {
        let winners = rows.compactMap { row -> (GroupComparisonRow, [MemberMetricValue])? in
            let ranked = row.ranked()
            guard let winner = ranked.first, let value = winner.value else { return nil }
            if !row.metric.lowerIsBetter, value == 0 { return nil }
            let tied = ranked.filter { $0.value == value }
            return (row, tied)
        }
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(winners, id: \.0.id) { item in
                    trophyCard(row: item.0, winners: item.1, group: group)
                }
            }
        }
        .accessibilityIdentifier("group-trophies")
    }

    private func trophyCard(row: GroupComparisonRow, winners: [MemberMetricValue], group: GolfletGroup) -> some View {
        let winner = winners[0]
        let photo = winner.photoURL ?? group.members.first { $0.id == winner.memberID }?.photoURL
        return VStack(alignment: .leading, spacing: 8) {
            Image(systemName: "medal.fill")
                .font(.system(size: 16))
                .foregroundStyle(Color(hex: 0xC8A86A))
                .accessibilityHidden(true)
            Text(trophyTitle(row.metric))
                .font(GFont.ui(16, weight: .bold))
                .foregroundStyle(p.ink)
                .lineLimit(2)
            HStack(spacing: 6) {
                GroupPhotoView(url: photo, initials: winner.initials, size: 22)
                Text(winners.map(\.memberName).joined(separator: ", "))
                    .font(GFont.ui(13, weight: .semibold))
                    .foregroundStyle(p.ink)
                    .lineLimit(1)
            }
        }
        .padding(14)
        .frame(minWidth: 168, alignment: .leading)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private struct PodiumCell: Identifiable {
        let id: String
        let slot: Int
        let place: Int
        let value: MemberMetricValue?
    }

    private struct FlagFly: Shape {
        func path(in rect: CGRect) -> Path {
            var path = Path()
            path.move(to: CGPoint(x: 0, y: 0))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            path.addLine(to: CGPoint(x: 0, y: rect.maxY))
            path.closeSubpath()
            return path
        }
    }

    private struct HoleFlag: View {
        var pole: CGFloat
        var fly: Color
        var dot: Color
        var body: some View {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 0) {
                    Circle().fill(dot).frame(width: 5, height: 5)
                    FlagFly().fill(fly).frame(width: 16, height: 12)
                }
                Rectangle().fill(Color.white).frame(width: 2, height: pole)
            }
            .accessibilityHidden(true)
        }
    }

    private func podium(_ row: GroupComparisonRow, group: GolfletGroup) -> some View {
        let ranked = Array(row.ranked().prefix(3))
        let placed = ranked.enumerated().map { index, value in
            (index: index, place: row.rank(of: value.memberID) ?? (index + 1), value: value)
        }
        let firsts = placed.filter { $0.place == 1 }
        let seconds = placed.filter { $0.place == 2 }
        let third = placed.first { $0.place == 3 }
        var slots: [(index: Int, place: Int, value: MemberMetricValue)?] = []
        if firsts.count >= 2 {
            slots = [nil, Optional(firsts[0]), firsts.count > 1 ? Optional(firsts[1]) : nil, third]
        } else if let lead = firsts.first {
            slots = [seconds.first, Optional(lead), third ?? seconds.dropFirst().first]
        }
        let cells: [PodiumCell] = slots.enumerated().map { offset, item in
            if let item {
                return PodiumCell(id: "step-\(item.index)", slot: item.index + 1, place: item.place, value: item.value)
            }
            return PodiumCell(id: "pad-\(offset)", slot: 0, place: 0, value: nil)
        }
        return HStack(alignment: .bottom, spacing: 8) {
            ForEach(cells) { cell in
                Group {
                    if let value = cell.value {
                        podiumStep(slot: cell.slot, place: cell.place, value: value, metric: row.metric, group: group)
                    } else {
                        Color.clear.frame(height: 1).accessibilityHidden(true)
                    }
                }
                .frame(maxWidth: .infinity)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 12)
        .background(p.primary)
        .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        .accessibilityIdentifier("group-podium")
    }

    private func podiumStep(slot: Int, place: Int, value: MemberMetricValue, metric: GroupMetricKind, group: GolfletGroup) -> some View {
        let photo = value.photoURL ?? group.members.first { $0.id == value.memberID }?.photoURL
        let ring: Color = place == 1 ? Color(hex: 0xC8A86A) : Color.white.opacity(0.85)
        let pole: CGFloat = place == 1 ? 40 : place == 2 ? 26 : 16
        let fly: Color = place == 1 ? Color(hex: 0xC8A86A) : place == 3 ? p.accent : Color.white
        let dot: Color = place == 1 ? p.accent : Color(hex: 0xC8A86A)
        return VStack(spacing: 4) {
            HoleFlag(pole: pole, fly: fly, dot: dot)
            Text("\(place)º")
                .font(GType.label)
                .foregroundStyle(Color(hex: 0xC8A86A))
            GroupPhotoView(url: photo, initials: value.initials, size: place == 1 ? 52 : 40)
                .overlay(Circle().stroke(ring, lineWidth: 3))
            Text(value.memberName)
                .font(GFont.ui(13, weight: .bold))
                .foregroundStyle(Color.white)
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .frame(minHeight: 32, alignment: .bottom)
            Text(display(value, metric: metric))
                .font(GFont.ui(place == 1 ? 36 : 26, weight: .bold))
                .foregroundStyle(place == 1 ? Color(hex: 0xC8A86A) : Color.white)
            if let sample = value.sample, sample < 3 {
                Text("Pocas tarjetas")
                    .font(GType.label)
                    .foregroundStyle(Color.white.opacity(0.88))
            } else if let per = value.perRound {
                Text("\(FormatAR.one(per)) por ronda")
                    .font(GType.label)
                    .foregroundStyle(Color.white.opacity(0.88))
                    .multilineTextAlignment(.center)
            }
            if let sample = value.sample, sample > 0 {
                Text(sample == 1 ? "1 tarjeta" : "\(sample) tarjetas")
                    .font(GType.label)
                    .foregroundStyle(Color.white.opacity(0.88))
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("group-podium-\(slot)")
    }

    private func rankList(_ row: GroupComparisonRow, group: GolfletGroup) -> some View {
        let ranked = row.ranked()
        let rest = Array(ranked.dropFirst(3))
        let leader = ranked.first?.value
        return VStack(spacing: 8) {
            ForEach(Array(rest.enumerated()), id: \.element.id) { offset, value in
                let place = row.rank(of: value.memberID) ?? (offset + 4)
                let photo = value.photoURL ?? group.members.first { $0.id == value.memberID }?.photoURL
                let width = barWidth(value: value.value, leader: leader, lowerIsBetter: row.metric.lowerIsBetter)
                HStack(spacing: 8) {
                    Text("\(place)º")
                        .font(GType.label)
                        .foregroundStyle(p.ink)
                        .frame(width: 28, alignment: .leading)
                    GroupPhotoView(url: photo, initials: value.initials, size: 28)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(value.memberName)
                            .font(GType.label)
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                        Text(rateLine(value))
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(1)
                        GeometryReader { geo in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Color(hex: 0xEFEBE2))
                                Capsule().fill(p.primary).frame(width: max(8, geo.size.width * width))
                                Circle()
                                    .fill(Color.white)
                                    .overlay(Circle().stroke(p.primary, lineWidth: 2))
                                    .frame(width: 12, height: 12)
                                    .offset(x: max(0, geo.size.width * width - 6))
                                FlagFly()
                                    .fill(p.accent)
                                    .frame(width: 8, height: 8)
                                    .frame(maxWidth: .infinity, alignment: .trailing)
                                    .offset(y: -8)
                            }
                        }
                        .frame(height: 14)
                    }
                    Text(display(value, metric: row.metric))
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                }
                .padding(8)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
        }
    }

    private func youCard(_ row: GroupComparisonRow, group: GolfletGroup) -> some View {
        let mineID = comparison?.hero?.memberID
        let ranked = row.ranked()
        let me = ranked.first { $0.memberID == mineID }
        return Group {
            if let me, let place = row.rank(of: me.memberID) {
                VStack(alignment: .leading, spacing: 6) {
                    HStack(alignment: .top) {
                        Text("\(place)º")
                            .font(GFont.ui(64, weight: .bold))
                            .foregroundStyle(Color.white)
                        Spacer()
                        if let delta = placeDelta(row, memberID: me.memberID) {
                            Text(delta > 0 ? "↑ \(delta)" : "↓ \(-delta)")
                                .font(GFont.ui(20, weight: .bold))
                                .foregroundStyle(delta > 0 ? Color(hex: 0xC8A86A) : Color.white)
                                .padding(.top, 12)
                        }
                    }
                    Text("\(wherePhrase(row.metric)) · \(display(me, metric: row.metric)) \(periodPhrase())")
                        .font(GFont.ui(18, weight: .bold))
                        .foregroundStyle(Color.white)
                    if let gap = gapLine(row, memberID: me.memberID) {
                        Text(gap)
                            .font(GFont.ui(16, weight: .bold))
                            .foregroundStyle(Color(hex: 0xC8A86A))
                    }
                    if let meta = metaLine(me, metric: row.metric) {
                        Text(meta)
                            .font(GFont.ui(14, weight: .semibold))
                            .foregroundStyle(Color(hex: 0xC8A86A))
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 16)
                .padding(.bottom, 56)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Tu puesto, \(place)º, \(wherePhrase(row.metric)) \(display(me, metric: row.metric))")
                .accessibilityIdentifier("group-hero")
            }
        }
    }

    private func metaLine(_ value: MemberMetricValue, metric: GroupMetricKind) -> String? {
        var bits: [String] = []
        if metric == .birdies, let cards = comparison?.hero?.cards, !cards.isEmpty { bits.append(cards) }
        if let sample = value.sample, sample < 3 { bits.append("Pocas tarjetas") }
        return bits.isEmpty ? nil : bits.joined(separator: " · ")
    }

    private func firstName(_ name: String) -> String {
        name.split(separator: " ").first.map(String.init) ?? name
    }

    private func wherePhrase(_ metric: GroupMetricKind) -> String {
        switch metric {
        case .birdies: return "en birdies"
        case .pars: return "en pares"
        case .eagles: return "en águilas"
        case .net: return "en mejor neto"
        case .rounds: return "en rondas"
        case .maxBirdies: return "en birdies por vuelta"
        case .streak: return "en la racha"
        case .regular: return "en regularidad"
        case .aces: return "en hoyos en uno"
        default: return "en \(metric.title.lowercased())"
        }
    }

    private func periodPhrase() -> String {
        switch config.range {
        case .week: return "esta semana"
        case .month: return "este mes"
        case .quarter: return "este trimestre"
        case .semester: return "este semestre"
        case .year: return "este año"
        case .all: return "en el histórico"
        }
    }

    private func metricMark(_ metric: GroupMetricKind) -> some View {
        let symbol: String = {
            switch metric {
            case .birdies, .maxBirdies: return "bird"
            case .eagles: return "bird.fill"
            case .pars: return "flag"
            case .streak: return "flag.2.crossed"
            case .aces: return "circle.fill"
            case .rounds: return "bag"
            case .net, .gross, .regular: return "list.bullet.rectangle"
            default: return "flag"
            }
        }()
        return Image(systemName: symbol)
            .font(.system(size: 22, weight: .semibold))
            .frame(width: 28, height: 28, alignment: .leading)
            .accessibilityHidden(true)
    }

    private func rateChart(_ row: GroupComparisonRow) -> some View {
        let ranked = Array(row.ranked().prefix(6))
        let useRate = ranked.contains { $0.perRound != nil }
        let raw: (MemberMetricValue) -> Double = { value in
            if useRate, let per = value.perRound { return per }
            return value.value ?? 0
        }
        let lead = ranked.first.map(raw) ?? 0
        let title = useRate && !row.metric.title.contains("por") ? "\(row.metric.title) por ronda" : row.metric.title
        let goal = ranked.first.map { useRate ? FormatAR.one(raw($0)) : display($0, metric: row.metric) } ?? ""
        return VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(GFont.ui(20, weight: .bold))
                .foregroundStyle(p.ink)
            HStack(alignment: .bottom, spacing: 8) {
                ForEach(ranked, id: \.id) { value in
                    let amount = raw(value)
                    let ratio: CGFloat = {
                        guard lead != 0, amount != 0 else { return 0.12 }
                        let scale = row.metric.lowerIsBetter ? lead / amount : amount / lead
                        return CGFloat(min(1, max(0.12, scale)))
                    }()
                    VStack(spacing: 4) {
                        ZStack(alignment: .bottom) {
                            Color.clear.frame(height: 84)
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(value.memberID == comparison?.hero?.memberID ? p.primary : Color(hex: 0xC8A86A))
                                .frame(width: 36, height: 84 * ratio)
                        }
                        Text(useRate ? FormatAR.one(amount) : display(value, metric: row.metric))
                            .font(GFont.ui(15, weight: .bold))
                            .foregroundStyle(p.ink)
                        Text(firstName(value.memberName))
                            .font(GFont.ui(12, weight: .bold))
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .overlay(alignment: .top) {
                Rectangle().fill(Color(hex: 0xC8A86A)).frame(height: 2).padding(.trailing, 36)
            }
            .overlay(alignment: .topTrailing) {
                Text(goal)
                    .font(GFont.ui(12, weight: .bold))
                    .foregroundStyle(p.ink)
            }
        }
        .padding(14)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func gapLine(_ row: GroupComparisonRow, memberID: String) -> String? {
        let ranked = row.ranked()
        guard ranked.count > 1, let index = ranked.firstIndex(where: { $0.memberID == memberID }), let mine = ranked[index].value else { return nil }
        let place = row.rank(of: memberID) ?? (index + 1)
        let leaders = ranked.filter { row.rank(of: $0.memberID) == 1 }
        if place == 1, leaders.count > 1 { return "Empate en la punta." }
        if place == 1, let second = ranked.dropFirst().first?.value, let name = ranked.dropFirst().first?.memberName {
            let delta = row.metric.lowerIsBetter ? second - mine : mine - second
            return "+\(shownDelta(delta)) sobre \(firstName(name))"
        }
        let ahead = ranked[..<index].last { row.rank(of: $0.memberID) != place }
        guard let ahead, let better = ahead.value else { return nil }
        let delta = row.metric.lowerIsBetter ? mine - better : better - mine
        return "a \(shownDelta(delta)) de \(firstName(ahead.memberName))"
    }

    private func placeDelta(_ row: GroupComparisonRow, memberID: String) -> Int? {
        let ranked = row.ranked()
        let withPrev = ranked.filter { $0.previous != nil }
        guard withPrev.count >= 2, withPrev.contains(where: { $0.memberID == memberID }), let current = row.rank(of: memberID) else { return nil }
        let sorted = withPrev.sorted { left, right in
            guard let a = left.previous, let b = right.previous else { return false }
            return row.metric.lowerIsBetter ? a < b : a > b
        }
        guard let index = sorted.firstIndex(where: { $0.memberID == memberID }), let mine = sorted[index].previous else { return nil }
        let ahead = sorted.filter { other in
            guard let value = other.previous else { return false }
            return row.metric.lowerIsBetter ? value < mine : value > mine
        }.count
        let delta = (ahead + 1) - current
        return delta == 0 ? nil : delta
    }

    private func shownDelta(_ delta: Double) -> String {
        delta.rounded() == delta ? String(Int(delta)) : FormatAR.one(delta)
    }

    private func barWidth(value: Double?, leader: Double?, lowerIsBetter: Bool) -> CGFloat {
        guard let value, let leader else { return 0 }
        if value == leader { return 1 }
        if leader == 0 { return 0 }
        let ratio = lowerIsBetter ? leader / value : value / leader
        return CGFloat(min(1, max(0.06, ratio)))
    }

    private func rateLine(_ value: MemberMetricValue) -> String {
        if let sample = value.sample, sample < 3 { return "Pocas tarjetas" }
        var bits: [String] = []
        if let per = value.perRound { bits.append("\(FormatAR.one(per)) por ronda") }
        if let sample = value.sample, sample > 0 { bits.append(sample == 1 ? "1 tarjeta" : "\(sample) tarjetas") }
        return bits.joined(separator: " · ")
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
        case .birdies, .pars, .eagles, .aces, .rounds, .maxBirdies, .streak:
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
