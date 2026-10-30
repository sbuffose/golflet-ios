import PhotosUI
import SwiftUI

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
    @State private var confirmLeave = false
    @State private var comparativoRoute: ComparativoRoute?
    @State private var profileRoute: MemberProfileRoute?

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
        .safeAreaInset(edge: .top) { closeBar(action: { model.presentedGroupID = nil }, id: "close-grupo") }
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
                GroupViewSettings(groupID: groupID, config: $config) { updated in
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
            Task {
                guard let data = try? await item?.loadTransferable(type: Data.self), let group else { return }
                await model.updateGroup(group, name: nil, photoJPEG: GroupPhoto.jpegData(from: data))
            }
        }
    }

    @ViewBuilder
    private func content(_ group: GolfletGroup) -> some View {
        VStack(alignment: .leading, spacing: 22) {
            header(group)
            if group.isAdmin {
                adminTools(group)
            }
            members(group)
            comparisonSection
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
                GroupPhotoView(url: group.photoURL, initials: GroupsParser.initials(group.name), size: 64)
                VStack(alignment: .leading, spacing: 4) {
                    GOverline(text: group.isAdmin ? "Admin" : "Miembro")
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
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Text("Cambiar foto")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
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
            ForEach(group.members) { member in
                GCard(radius: 16, padding: 14) {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 12) {
                            GroupPhotoView(url: member.photoURL, initials: member.initials, size: 36)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(member.name)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(member.isOwner ? "Dueño · \(member.role.title)" : member.role.title)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            Spacer()
                        }
                        Button {
                            profileRoute = MemberProfileRoute(groupID: group.id, memberID: member.id)
                        } label: {
                            Text("Ver perfil")
                                .font(GType.label)
                                .foregroundStyle(p.primary)
                        }
                        .accessibilityIdentifier("group-profile-\(member.id)")
                        GProbe(id: "group-profile-\(member.id)", label: "Ver perfil")
                        if group.isAdmin {
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

    private var comparisonSection: some View {
        VStack(alignment: .leading, spacing: 12) {
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

            if let comparison {
                ForEach(comparison.rows) { row in
                    ForEach(row.values) { value in
                        GProbe(
                            id: "compare-\(row.metric.rawValue)-\(value.memberID)",
                            label: "\(value.memberName), \(display(value, metric: row.metric))"
                        )
                    }
                    comparisonCard(row)
                }
            }
        }
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
        .accessibilityIdentifier("compare-\(row.metric.rawValue)")
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

    private func load() async {
        do {
            config = try await model.api.groupView(groupID: groupID)
            await reloadComparison()
        } catch {
            model.errorMessage = error.localizedDescription
        }
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
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let groupID: String
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
                    Text("Elegí qué métricas y gráficos ves, el orden, el período y la cancha. Nadie más cambia esta vista.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    Text("Período")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(StatsRange.allCases) { range in
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
