import SwiftUI

struct SharePrefsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var draft = SharePrefs.allShared

    var body: some View {
        GScreen(id: "screen-que-comparto") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Privacidad")
                        GTitle(text: "Qué comparto", size: 30)
                    }
                    Text("Esto vale para todos tus grupos. Si apagás una categoría, tus compañeros ven “No compartido” y no entras en ese ranking.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    ForEach(ShareCategory.allCases) { category in
                        Toggle(isOn: binding(category)) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(category.title)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(category.footnote)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                        }
                        .tint(p.primary)
                        .accessibilityIdentifier("share-\(category.rawValue)")
                    }

                    GCard(fill: p.surface2, radius: 16, padding: 14) {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Siempre privado")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("Las notas de voz, las notas escritas y la estrategia de cancha no se comparten ni aparecen acá.")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                    }
                    .accessibilityIdentifier("share-always-private")

                    Button {
                        Task {
                            await model.saveSharePrefs(draft)
                            dismiss()
                        }
                    } label: {
                        Text(model.isBusy ? "Guardando…" : "Guardar")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                    .disabled(model.isBusy)
                    .accessibilityIdentifier("share-save")
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-que-comparto")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-que-comparto") }
        .onAppear { draft = model.sharePrefs }
        .task {
            if let prefs = try? await model.api.sharePrefs() {
                model.sharePrefs = prefs
                draft = prefs
            }
        }
    }

    private func binding(_ category: ShareCategory) -> Binding<Bool> {
        Binding(
            get: { draft.isShared(category) },
            set: { draft.set(category, shared: $0) }
        )
    }
}
