import SwiftUI

struct ClubsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var selectedClubID: Int = -1
    @State private var url = ""
    @State private var matricula = ""
    @State private var clave = ""
    @State private var savePassword = true
    @State private var syncPassword = ""
    @State private var saveOnSync = false

    var body: some View {
        GScreen {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Golfistics")
                        GTitle(text: "Clubes")
                    }
                    Text("Golflet entra a Golfistics con tu matrícula solo para leer tus tarjetas. Nunca cambia nada en tu cuenta.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    ForEach(model.clubs) { club in
                        clubCard(club)
                    }

                    linkForm

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }

                    if let user = model.user {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Tu cuenta")
                                .font(GType.section)
                                .foregroundStyle(p.ink)
                            Text(user.email)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
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
        .task {
            if model.catalogue.isEmpty {
                model.catalogue = (try? await model.api.clubCatalogue()) ?? []
            }
            if selectedClubID == -1, let first = model.catalogue.first {
                selectedClubID = first.id
            }
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
                    }
                    Spacer()
                    Circle().fill(club.lastSyncStatus == "error" ? p.negative : p.positive).frame(width: 8, height: 8)
                }
                Text(club.passwordSaved ? "Clave guardada" : "Sin clave guardada")
                    .font(GType.label)
                    .foregroundStyle(club.passwordSaved ? p.positive : p.ink3)
                if !club.passwordSaved {
                    SecureField("Clave para actualizar", text: $syncPassword)
                        .font(GType.body)
                        .accessibilityIdentifier("club-sync-password")
                    Toggle("Guardarla encriptada", isOn: $saveOnSync)
                        .font(GType.label)
                        .tint(p.primary)
                }
                Button {
                    Task { await model.syncClub(club, password: club.passwordSaved ? nil : syncPassword, savePassword: saveOnSync) }
                } label: {
                    Text(model.syncSession != nil ? "Actualizando…" : "Actualizar")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .disabled(model.isBusy)
                .accessibilityIdentifier("club-sync-\(club.accountId)")
                if club.passwordSaved {
                    Button("Olvidar la clave guardada") {
                        Task { await model.forgetPassword(club) }
                    }
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                }
                Button("Desvincular club") {
                    Task { await model.unlink(club) }
                }
                .font(GType.label)
                .foregroundStyle(p.negative)
            }
        }
    }

    private var linkForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(model.clubs.isEmpty ? "Vincular mi club" : "Sumar club")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GField(label: "Club") {
                Picker("Club", selection: $selectedClubID) {
                    ForEach(model.catalogue) { club in
                        Text(club.name).tag(club.id)
                    }
                    Text("Otro club · pegar link de Golfistics").tag(0)
                }
                .accessibilityIdentifier("club-picker")
            }
            if selectedClubID == 0 {
                GField(label: "Link de Golfistics") {
                    TextField("https://…/golf/login.php", text: $url)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.URL)
                        .accessibilityIdentifier("club-url")
                }
            }
            GField(label: "Matrícula") {
                TextField("Tu matrícula", text: $matricula)
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("club-matricula")
            }
            GField(label: "Clave de Golfistics") {
                SecureField("La misma que usás en el sitio del club", text: $clave)
                    .accessibilityIdentifier("club-clave")
            }
            Toggle(isOn: $savePassword) {
                Text("Guardar la clave (encriptada) para actualizar mis tarjetas todos los días. Si no, te la pido cada vez que actualices.")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
            .tint(p.primary)
            .accessibilityIdentifier("club-save-password")

            Button {
                Task {
                    let clubID = selectedClubID == 0 ? nil : selectedClubID
                    await model.addClub(clubID: clubID, urlString: url, matricula: matricula, clave: clave, savePassword: savePassword)
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
