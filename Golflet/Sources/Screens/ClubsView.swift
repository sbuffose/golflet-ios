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
    @State private var showsProfesores = false
    @State private var showsMissingClub = false

    var body: some View {
        GScreen(id: "screen-clubes") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 12) {
                        GOverline(text: "Tu cuenta")
                        HStack(alignment: .center, spacing: 14) {
                            Text(model.profile.initials)
                                .font(GFont.ui(22, weight: .semibold))
                                .foregroundStyle(p.onPrimary)
                                .frame(width: 64, height: 64)
                                .background(p.primary)
                                .clipShape(Circle())
                                .accessibilityIdentifier("cuenta-foto")
                            VStack(alignment: .leading, spacing: 4) {
                                Text(accountName)
                                    .font(GType.sheetTitle)
                                    .foregroundStyle(p.ink)
                                    .lineLimit(2)
                                if let mail = accountMail {
                                    Text(mail)
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                                HStack(spacing: 6) {
                                    if !fichaName.isEmpty {
                                        Text(fichaName)
                                            .font(GType.label)
                                            .foregroundStyle(p.ink2)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 3)
                                            .background(p.surface2)
                                            .clipShape(Capsule())
                                            .accessibilityIdentifier("cuenta-ficha")
                                    }
                                    Text("HI \(FormatAR.one(model.profile.currentHandicap))")
                                        .font(GType.label)
                                        .foregroundStyle(p.accent)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 3)
                                        .background(p.accentSoft)
                                        .clipShape(Capsule())
                                        .accessibilityIdentifier("cuenta-hi")
                                }
                            }
                        }
                        Button {} label: {
                            Text("Elegir foto")
                                .font(GType.headline)
                                .foregroundStyle(p.onPrimary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(p.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("cuenta-foto-elegir")
                        if !model.profesores.isEmpty {
                            Button { showsProfesores = true } label: {
                                Text("Mis profesores")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("home-hcp-profesor")
                            .accessibilityLabel("Mis profesores")
                        }
                    }

                    notificationsRow

                    if !model.clubs.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Clubes")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            GCard(radius: 18, padding: 4) {
                                VStack(spacing: 0) {
                                    ForEach(model.clubs) { club in
                                        clubCard(club)
                                        Hairline()
                                    }
                                    missingClubRow
                                }
                            }
                            if showsMissingClub {
                                linkForm
                            }
                        }
                    }

                    tuJuego
                    groupsSection
                    shareSection
                    accessibilitySection

                    if !model.clubs.isEmpty {
                        sharedActions
                    }

                    if model.clubs.isEmpty || model.needsClub != nil {
                        linkForm
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }

                    playSettingsSection

                    if model.user != nil {
                        VStack(alignment: .leading, spacing: 8) {
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
        .sheet(isPresented: $showsProfesores) {
            NavigationStack {
                HomeProfesoresSheet { profesor in
                    showsProfesores = false
                    model.presentProfesor(profesor)
                }
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: $showsTextPrefs) {
            NavigationStack {
                TextPrefsView()
            }
            .golfletChrome()
            .environment(model)
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Button { dismiss() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 14, weight: .semibold))
                        Text("Inicio")
                            .font(GType.headline)
                    }
                    .foregroundStyle(p.ink)
                }
                .accessibilityIdentifier("close-clubes")
                .accessibilityLabel("Inicio")
                Spacer()
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
    }

    private var accountName: String {
        let call = model.profile.firstName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !call.isEmpty { return call }
        let named = model.user?.name.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !named.isEmpty { return named }
        let shown = model.profile.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return shown.isEmpty ? "Tu cuenta" : shown
    }

    private var fichaName: String {
        let ficha = model.profile.displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return ficha == accountName ? "" : ficha
    }

    private var accountMail: String? {
        if let mail = model.user?.visibleEmail { return mail }
        return model.user == nil ? nil : "Entrás con tu matrícula"
    }

    private var tuJuego: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Tu juego")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 4) {
                VStack(spacing: 0) {
                    NavigationLink { PelotaView() } label: {
                        gearRow("Mi pelota", "La pelota con la que jugás")
                    }
                    .accessibilityIdentifier("cuenta-pelota")
                    Hairline()
                    NavigationLink { SorteosView() } label: {
                        gearRow("Sorteos", "Los que jugás con el club")
                    }
                    .accessibilityIdentifier("cuenta-sorteos")
                }
            }
        }
    }

    private func gearRow(_ title: String, _ subtitle: String) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text(subtitle)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(p.ink3)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
        .contentShape(Rectangle())
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
                        Text(model.unreadBadgeText == nil ? "Invitaciones a grupos y mensajes de tus clubes." : "Tenés novedades")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    Spacer()
                    if let badge = model.unreadBadgeText {
                        Text(badge)
                            .font(GFont.ui(11, weight: .semibold))
                            .foregroundStyle(p.onPrimary)
                            .padding(.horizontal, badge.count > 1 ? 5 : 0)
                            .frame(minWidth: 18, minHeight: 18)
                            .background(p.accent)
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
                                        .foregroundStyle(p.accentInk)
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
            Text("Ronda con GPS")
                .font(GType.section)
                .foregroundStyle(p.ink)
            Toggle(isOn: Binding(
                get: { model.playSettings.paceAlertEnabled },
                set: { model.setPaceAlertEnabled($0) }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Aviso de ritmo de juego")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("Al llegar al hoyo 10, si vas más de 10 minutos atrás del ritmo estimado de la cancha, te avisamos. El ritmo es una estimación de Golflet, no del club.")
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
                            Text("Elegí qué ven de vos los jugadores de tus grupos.")
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
        HStack(spacing: 12) {
            Text(clubMark(club.name))
                .font(GFont.ui(15, weight: .semibold))
                .foregroundStyle(p.primary)
                .frame(width: 36, height: 36)
                .background(p.surface2)
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 2) {
                Text(club.name)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .fixedSize(horizontal: false, vertical: true)
                Text(clubStatus(club))
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .lineLimit(2)
            }
            Spacer(minLength: 8)
            Button {
                Task { await model.syncClub(club, password: club.passwordSaved ? nil : syncPassword, savePassword: saveOnSync) }
            } label: {
                Text(clubSyncTitle(club))
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(p.hairline, lineWidth: 1))
            }
            .buttonStyle(.plain)
            .disabled(model.isBusy)
            .accessibilityIdentifier("club-sync-\(club.accountId)")
            .accessibilityLabel("Actualizar")
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 12)
    }

    private var missingClubRow: some View {
        Button { showsMissingClub = true } label: {
            HStack(spacing: 12) {
                Text("?")
                    .font(GFont.ui(16, weight: .semibold))
                    .foregroundStyle(p.ink2)
                    .frame(width: 36, height: 36)
                    .background(p.surface2)
                    .clipShape(Circle())
                VStack(alignment: .leading, spacing: 2) {
                    Text("Tengo otro club y no aparece")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("Contanos cuál y lo revisamos")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(p.ink3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 12)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("cuenta-club-faltante")
    }

    private func clubMark(_ name: String) -> String {
        let trimmed = name.replacingOccurrences(of: #"^(Club|Golf)\s+"#, with: "", options: .regularExpression)
        return String(trimmed.first ?? "?").uppercased()
    }

    private func clubSyncTitle(_ club: LinkedClub) -> String {
        if model.syncSession != nil || club.lastSyncStatus == "running" { return "Actualizando…" }
        return "Actualizar"
    }

    private func clubStatus(_ club: LinkedClub) -> String {
        if club.lastSyncStatus == "error" {
            return club.lastSyncMessage ?? "Error al actualizar"
        }
        if club.lastSyncStatus == "running" { return "Actualizando…" }
        let via = club.source == "app" ? " · con tu matrícula" : ""
        return "\(club.cardCount) tarjetas · \(ago(club.lastSyncAt))\(via)"
    }

    private func ago(_ date: Date?) -> String {
        guard let date else { return "nunca" }
        let seconds = Date().timeIntervalSince(date)
        if seconds < 90 { return "recién" }
        if seconds < 3600 { return "hace \(Int((seconds / 60).rounded())) min" }
        if seconds < 86400 { return "hace \(Int((seconds / 3600).rounded())) h" }
        let days = Int((seconds / 86400).rounded())
        return days == 1 ? "ayer" : "hace \(days) días"
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

            if let payload = model.needsClub {
                ClubPickerBlock(payload: payload) { club in
                    Task { await model.retryLinkWithClub(club) }
                }
            } else {
                Button {
                    Task { await model.revealClubPicker() }
                } label: {
                    Text("¿Tu club no aparece? Elegilo")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("club-picker-toggle")
            }

            Button {
                Task {
                    await model.addClub(matricula: matricula, clave: clave, savePassword: savePassword)
                    if model.errorMessage == nil, model.needsClub == nil {
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
        .onAppear {
            if matricula.isEmpty { matricula = model.lastLinkMatricula }
            if let pending = model.needsClub?.matricula, matricula.isEmpty {
                matricula = pending
            }
        }
    }
}
