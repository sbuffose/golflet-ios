import SwiftUI

struct ClubsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var url = "https://golf.e-jockeyclub.org.ar/golf"
    @State private var matricula = ""
    @State private var clave = ""
    @State private var isSaving = false

    var body: some View {
        GScreen(id: "screen-clubes") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Golfistics")
                        GTitle(text: "Clubes")
                    }
                    Text("Elegí un club o pegá la URL de Golfistics. Entrá con tu matrícula y clave. Por ahora Golflet usa datos de demostración y guarda las credenciales solo en el Keychain.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    ForEach(model.clubs) { club in
                        GCard(radius: 18, padding: 14) {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(club.name)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Text("Matrícula \(club.matricula)")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                }
                                Spacer()
                                Circle().fill(p.positive).frame(width: 8, height: 8)
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("Sumar club")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        GField(label: "URL de Golfistics") {
                            TextField("https://golf.e-jockeyclub.org.ar/golf", text: $url)
                                .textInputAutocapitalization(.never)
                                .keyboardType(.URL)
                                .accessibilityIdentifier("club-url")
                        }
                        GField(label: "Matrícula") {
                            TextField("94506", text: $matricula)
                                .keyboardType(.numberPad)
                                .accessibilityIdentifier("club-matricula")
                        }
                        GField(label: "Clave") {
                            SecureField("Tu clave de Golfistics", text: $clave)
                                .accessibilityIdentifier("club-clave")
                        }
                        Button {
                            Task {
                                isSaving = true
                                await model.addClub(urlString: url, matricula: matricula, clave: clave)
                                isSaving = false
                                if model.errorMessage == nil {
                                    matricula = ""
                                    clave = ""
                                }
                            }
                        } label: {
                            Text(isSaving ? "Conectando…" : "Conectar club")
                                .font(GType.headline)
                                .foregroundStyle(p.onPrimary)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(p.primary)
                                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                        .disabled(matricula.isEmpty || clave.isEmpty || isSaving)
                        .accessibilityIdentifier("club-connect")
                        if let error = model.errorMessage {
                            Text(error)
                                .font(GType.label)
                                .foregroundStyle(p.negative)
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
}
