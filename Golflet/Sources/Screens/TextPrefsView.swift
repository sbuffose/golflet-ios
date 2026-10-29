import SwiftUI

struct TextPrefsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        GScreen(id: "screen-texto") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Accesibilidad")
                        GTitle(text: "Texto", size: 34)
                    }
                    Text("El tamaño y el grosor se aplican en toda la app. Los números grandes crecen menos para que el layout se mantenga.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Tamaño del texto")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        HStack(spacing: 8) {
                            ForEach(TextSizePref.allCases) { option in
                                prefChip(
                                    title: option.title,
                                    selected: model.textPrefs.size == option,
                                    id: "text-size-\(option.rawValue)"
                                ) {
                                    model.setTextPrefs(TextPrefs(size: option, weight: model.textPrefs.weight))
                                }
                            }
                        }
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Grosor del texto")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        HStack(spacing: 8) {
                            ForEach(TextWeightPref.allCases) { option in
                                prefChip(
                                    title: option.title,
                                    selected: model.textPrefs.weight == option,
                                    id: "text-weight-\(option.rawValue)"
                                ) {
                                    model.setTextPrefs(TextPrefs(size: model.textPrefs.size, weight: option))
                                }
                            }
                        }
                    }

                    preview
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-texto")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-texto") }
    }

    private func prefChip(title: String, selected: Bool, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(GType.headline)
                .foregroundStyle(selected ? p.onPrimary : p.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 12)
                .background(selected ? p.primary : p.surface2)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var preview: some View {
        GCard(radius: 20, padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Vista previa")
                    .font(GType.overline)
                    .foregroundStyle(p.ink3)
                Text("Hola, \(model.profile.displayName)")
                    .font(GType.largeTitle)
                    .foregroundStyle(p.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.7)
                Text("Handicap Index")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                Text(FormatAR.one(model.profile.currentHandicap))
                    .font(GType.statHero)
                    .tracking(-3.2)
                    .tabular()
                    .foregroundStyle(p.primary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.45)
                    .accessibilityIdentifier("text-preview-hero")
                    .overlay { GProbe(id: "text-preview-hero", label: FormatAR.one(model.profile.currentHandicap)) }
                Text("Tus números y textos usan Geist. Así se ve el cuerpo y una etiqueta.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                Text("Promedio · 18 hoyos")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityIdentifier("text-preview")
        .accessibilityElement(children: .contain)
    }
}
