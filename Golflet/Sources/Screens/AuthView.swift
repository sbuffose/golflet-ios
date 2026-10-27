import SwiftUI

struct AuthView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var mode = Mode.signIn
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""

    enum Mode { case signIn, signUp }

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

                    HStack(spacing: 0) {
                        modeButton("Entrar", .signIn)
                        modeButton("Crear cuenta", .signUp)
                    }
                    .padding(4)
                    .background(p.surface2)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("auth-mode")

                    if mode == .signUp {
                        GField(label: "Nombre") {
                            TextField("Tu nombre", text: $name)
                                .textContentType(.name)
                                .accessibilityIdentifier("auth-name")
                        }
                    }
                    GField(label: "Email") {
                        TextField("vos@ejemplo.com", text: $email)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.emailAddress)
                            .textContentType(.username)
                            .accessibilityIdentifier("auth-email")
                    }
                    GField(label: "Contraseña de Golflet") {
                        SecureField("Mínimo 8 caracteres", text: $password)
                            .textContentType(mode == .signUp ? .newPassword : .password)
                            .accessibilityIdentifier("auth-password")
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }

                    Button {
                        Task {
                            if mode == .signUp {
                                await model.signUp(name: name, email: email, password: password)
                            } else {
                                await model.signIn(email: email, password: password)
                            }
                        }
                    } label: {
                        Text(model.isBusy ? "Un segundo…" : (mode == .signUp ? "Crear cuenta" : "Entrar"))
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .disabled(email.isEmpty || password.count < 8 || model.isBusy)
                    .accessibilityIdentifier("auth-submit")

                    Text("Tu cuenta de Golflet es independiente de Golfistics. Después de entrar, vinculás tu club con tu matrícula y clave.")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-login")
    }

    private func modeButton(_ title: String, _ value: Mode) -> some View {
        Button {
            mode = value
        } label: {
            Text(title)
                .font(GType.headline)
                .foregroundStyle(mode == value ? p.ink : p.ink2)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 10)
                .background(mode == value ? p.surface : Color.clear)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(value == .signIn ? "auth-tab-in" : "auth-tab-up")
    }
}
