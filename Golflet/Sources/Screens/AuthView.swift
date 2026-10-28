import SwiftUI

struct AuthView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.openURL) private var openURL
    @State private var matricula = ""
    @State private var clave = ""
    @State private var savePassword = true

    var body: some View {
        GScreen(id: "screen-login") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    HStack(spacing: 10) {
                        Circle()
                            .fill(p.primary)
                            .frame(width: 36, height: 36)
                            .overlay {
                                Image(systemName: "flag.fill")
                                    .font(.system(size: 14, weight: .semibold))
                                    .foregroundStyle(p.accent)
                            }
                        Text("Golflet")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                    }
                    .padding(.top, 12)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Tu golf,")
                            .font(GType.largeTitle)
                            .foregroundStyle(p.ink2)
                        Text("ordenado")
                            .font(GType.largeTitle)
                            .foregroundStyle(p.accent)
                    }

                    Text("Entrá con tu matrícula y tu clave de Golfistics.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    GField(label: "Matrícula") {
                        TextField("Tu número de matrícula", text: $matricula)
                            .keyboardType(.numberPad)
                            .textContentType(RuntimeFlags.isUITesting ? nil : .username)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .tabular()
                            .accessibilityIdentifier("auth-matricula")
                    }
                    GField(label: "Clave de Golfistics") {
                        SecureField("La misma que usás en Golfistics", text: $clave)
                            .textContentType(RuntimeFlags.isUITesting ? nil : .password)
                            .accessibilityIdentifier("auth-clave")
                    }

                    Toggle(isOn: $savePassword) {
                        Text("Guardar mi clave (cifrada) para traer mis tarjetas nuevas todos los días")
                            .font(GType.body)
                            .foregroundStyle(p.ink)
                    }
                    .tint(p.primary)
                    .accessibilityIdentifier("auth-save-password")

                    if let failure = model.authFailure {
                        failureCard(failure)
                    } else if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                            .accessibilityIdentifier("auth-error")
                    }

                    Button {
                        Task {
                            await model.signInGolfistics(
                                matricula: matricula,
                                clave: clave,
                                savePassword: savePassword
                            )
                        }
                    } label: {
                        Text(model.isBusy ? "Un segundo…" : "Entrar")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .disabled(RuntimeFlags.isUITesting ? model.isBusy : (matricula.isEmpty || clave.isEmpty || model.isBusy))
                    .accessibilityIdentifier("auth-submit")

                    Button {
                        openGolfistics(AuthCopy.golfisticsURL)
                    } label: {
                        Text("¿No tenés clave o te la olvidaste? Configurala en Golfistics (se recupera desde el sitio de tu club) y volvé.")
                            .font(GType.body)
                            .foregroundStyle(p.ink)
                            .multilineTextAlignment(.leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("auth-forgot")

                    Text("Golflet verifica tu matrícula y clave directamente con Golfistics y solo lee tus datos: no cambia nada en Golfistics.")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-login")
    }

    @ViewBuilder
    private func failureCard(_ failure: AuthFailure) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(failure.message)
                .font(GType.body)
                .foregroundStyle(p.negative)
                .accessibilityIdentifier(failure.bannerID)
            if let hint = failure.hint, !hint.isEmpty {
                Text(hint)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("auth-rejected-hint")
            }
            if failure.showsGolfisticsButton {
                Button {
                    openGolfistics(failure.golfisticsURL ?? AuthCopy.golfisticsURL)
                } label: {
                    Text("Ir a Golfistics a configurar mi clave")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(p.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("auth-golfistics-open")
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.negative.opacity(0.10))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier(failure.cardID)
    }

    private func openGolfistics(_ url: URL) {
        openURL(url)
    }
}
