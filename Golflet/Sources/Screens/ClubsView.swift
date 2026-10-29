import SwiftUI

struct ClubsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var matricula = ""
    @State private var clave = ""
    @State private var savePassword = true
    @State private var syncPassword = ""
    @State private var saveOnSync = false
    @State private var showsTextPrefs = false

    var body: some View {
        GScreen(id: "screen-clubes") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Tu ficha del club")
                        GTitle(text: "Clubes")
                    }
                    Text("Golflet entra con tu matrícula y contraseña y trae todos tus clubes. Nunca cambia nada en tu cuenta.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    notificationsRow
                    groupsSection
                    shareSection
                    accessibilitySection

                    ForEach(model.clubs) { club in
                        clubCard(club)
                    }

                    if !model.clubs.isEmpty {
                        sharedActions
                    }

                    if model.clubs.isEmpty {
                        linkForm
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }

                    playSettingsSection

                    if let user = model.user {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Tu cuenta")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            if let email = user.visibleEmail {
                                Text(email)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            Button("Salir") {
                                Task {
                                    await model.signOut()
                                    dismiss()
                                }
                            }
                            .font(GType.headline)
                            .foregroundStyle(p.negative)
                            .accessibilityIdentifier("auth-logout")
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-clubes")
        .sheet(isPresented: $showsTextPrefs) {
            NavigationStack {
                TextPrefsView()
            }
            .golfletChrome()
            .environment(model)
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(p.ink2)
                        .frame(width: 32, height: 32)
                        .background(p.surface)
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("close-clubes")
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
    }

    private var notificationsRow: some View {
        Button { model.presentNotifications() } label: {
            GCard(radius: 16, padding: 14) {
                HStack(spacing: 12) {
                    Image(systemName: "bell")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(p.primary)
                        .frame(width: 36, height: 36)
                        .background(p.surface2)
                        .clipShape(Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Notificaciones")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text(model.unreadBadgeText == nil ? "Invitaciones y mensajes de club" : "Tenés novedades")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    Spacer()
                    if let badge = model.unreadBadgeText {
                        Text(badge)
                            .font(GFont.ui(11, weight: .semibold))
                            .foregroundStyle(Color(hex: 0xF7F5F0))
                            .padding(.horizontal, badge.count > 1 ? 5 : 0)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(Color(hex: 0xB4553F))
                            .clipShape(Capsule())
                            .accessibilityIdentifier("perfil-notificaciones-badge")
                    }
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(p.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("perfil-notificaciones")
    }

    private var groupsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Grupos")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if !model.pendingInvites.isEmpty {
                ForEach(model.pendingInvites) { invite in
                    Button {
                        model.presentInvite(invite)
                    } label: {
                        GCard(radius: 16, padding: 14) {
                            HStack(spacing: 12) {
                                GroupPhotoView(url: invite.photoURL, initials: invite.ownerInitials, size: 36)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(invite.name)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Text("Invitación pendiente")
                                        .font(GType.label)
                                        .foregroundStyle(p.accent)
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 12, weight: .semibold))
                                    .foregroundStyle(p.ink3)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("perfil-pending-\(invite.token)")
                }
            }
            ForEach(model.groups.prefix(3)) { group in
                Button {
                    model.presentGroupDetail(group.id)
                } label: {
                    HStack {
                        Text(group.name)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Spacer()
                        Text("\(group.memberCount)")
                            .font(GType.label)
                            .tabular()
                            .foregroundStyle(p.ink3)
                    }
                    .padding(.vertical, 4)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("perfil-group-\(group.id)")
            }
            Button {
                model.presentGroups()
            } label: {
                Text(model.groups.isEmpty ? "Crear o unirte a un grupo" : "Ver todos los grupos")
                    .font(GType.headline)
                    .foregroundStyle(p.primary)
            }
            .accessibilityIdentifier("perfil-grupos")
        }
        .task { await model.refreshGroups() }
    }

    private var playSettingsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Jugar")
                .font(GType.section)
                .foregroundStyle(p.ink)
            Toggle(isOn: Binding(
                get: { model.playSettings.paceAlertEnabled },
                set: { model.setPaceAlertEnabled($0) }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Aviso de ritmo")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("Si vas más de 10 minutos atrasado, te avisamos en el hoyo 10.")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
            }
            .tint(p.primary)
            .accessibilityIdentifier("setting-pace-alert")
        }
        .task { await model.refreshPlaySettings() }
    }

    private var shareSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Privacidad")
                .font(GType.section)
                .foregroundStyle(p.ink)
            Button {
                model.presentSharePrefs()
            } label: {
                GCard(radius: 16, padding: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Qué comparto")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("Elegí qué ven tus grupos")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(p.ink3)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("perfil-que-comparto")
        }
    }

    private var accessibilitySection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Accesibilidad")
                .font(GType.section)
                .foregroundStyle(p.ink)
            Button { showsTextPrefs = true } label: {
                GCard(radius: 16, padding: 14) {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Tamaño y grosor del texto")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text(textPrefsSummary)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(p.ink3)
                    }
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("perfil-texto")
        }
    }

    private var textPrefsSummary: String {
        let size = model.textPrefs.size.title
        let weight = model.textPrefs.weight.title
        if model.textPrefs.weight == .normal {
            return size
        }
        return "\(size) · \(weight)"
    }

    private var needsSyncPassword: Bool {
        model.clubs.contains { !$0.passwordSaved }
    }

    private func clubCard(_ club: LinkedClub) -> some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(club.name)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text("Matrícula \(club.matricula) · \(club.cardCount) tarjetas")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                        if club.roundsWithHoles > 0 || club.roundsStored > 0 {
                            Text("\(club.roundsWithHoles) con hoyos · \(club.roundsStored) guardadas")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                    }
                    Spacer()
                    Circle().fill(club.lastSyncStatus == "error" ? p.negative : p.positive).frame(width: 8, height: 8)
                }
                Button {
                    Task { await model.syncClub(club, password: club.passwordSaved ? nil : syncPassword, savePassword: saveOnSync) }
                } label: {
                    Text(model.syncSession != nil ? "Actualizando…" : "Actualizar todos los clubes")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(model.isBusy)
                .accessibilityIdentifier("club-sync-\(club.accountId)")
            }
        }
    }

    private var sharedActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(model.clubs.first?.passwordSaved == true ? "Contraseña guardada para todos los clubes" : "Sin contraseña guardada")
                .font(GType.label)
                .foregroundStyle(model.clubs.first?.passwordSaved == true ? p.positive : p.ink3)
            if needsSyncPassword {
                SecureField("Contraseña para actualizar", text: $syncPassword)
                    .font(GType.body)
                    .accessibilityIdentifier("club-sync-password")
                Toggle("Guardarla encriptada", isOn: $saveOnSync)
                    .font(GType.label)
                    .tint(p.primary)
            }
            if model.clubs.contains(where: \.passwordSaved) {
                Button("Olvidar la contraseña de todos los clubes") {
                    if let club = model.clubs.first {
                        Task { await model.forgetPassword(club) }
                    }
                }
                .font(GType.label)
                .foregroundStyle(p.ink2)
            }
            Button("Desvincular todos los clubes") {
                if let club = model.clubs.first {
                    Task { await model.unlink(club) }
                }
            }
            .font(GType.label)
            .foregroundStyle(p.negative)
        }
    }

    private var linkForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Vincular mi ficha del club")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GField(label: "Matrícula") {
                TextField("Tu matrícula", text: $matricula)
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("club-matricula")
            }
            GField(label: "Contraseña") {
                SecureField("La misma que para entrar a tu club", text: $clave)
                    .accessibilityIdentifier("club-clave")
            }
            Toggle(isOn: $savePassword) {
                Text("Guardar mi contraseña (cifrada) para traer mis tarjetas nuevas todos los días")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            .tint(p.primary)
            .accessibilityIdentifier("club-save-password")

            Button {
                Task {
                    await model.addClub(matricula: matricula, clave: clave, savePassword: savePassword)
                    if model.errorMessage == nil {
                        matricula = ""
                        clave = ""
                    }
                }
            } label: {
                Text(model.syncSession != nil ? "Leyendo tus tarjetas…" : "Vincular y traer tarjetas")
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .disabled(matricula.isEmpty || clave.isEmpty || model.isBusy)
            .accessibilityIdentifier("club-connect")
        }
    }
}
