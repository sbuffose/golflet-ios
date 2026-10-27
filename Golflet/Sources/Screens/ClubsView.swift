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

    var body: some View {
        GScreen(id: "screen-clubes") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Golfistics App")
                        GTitle(text: "Clubes")
                    }
                    Text("Golflet entra a la App de Golfistics con tu matrícula y clave y trae todos tus clubes. Nunca cambia nada en tu cuenta.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

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
            Text(model.clubs.first?.passwordSaved == true ? "Clave guardada para todos los clubes" : "Sin clave guardada")
                .font(GType.label)
                .foregroundStyle(model.clubs.first?.passwordSaved == true ? p.positive : p.ink3)
            if needsSyncPassword {
                SecureField("Clave para actualizar", text: $syncPassword)
                    .font(GType.body)
                    .accessibilityIdentifier("club-sync-password")
                Toggle("Guardarla encriptada", isOn: $saveOnSync)
                    .font(GType.label)
                    .tint(p.primary)
            }
            if model.clubs.contains(where: \.passwordSaved) {
                Button("Olvidar la clave de todos los clubes") {
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
            Text("Vincular Golfistics App")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GField(label: "Matrícula") {
                TextField("Tu matrícula", text: $matricula)
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("club-matricula")
            }
            GField(label: "Clave de Golfistics") {
                SecureField("La misma que usás en la App", text: $clave)
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
