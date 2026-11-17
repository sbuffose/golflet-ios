import SwiftUI

struct RendimientoTiles: View {
    @Environment(\.palette) private var p
    var few: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Tu rendimiento")
                .font(GType.section)
                .foregroundStyle(p.ink)
            NavigationLink { RendimientoDetail(title: "Por horario", line: "Mañana, mediodía o tarde.", few: few) } label: {
                tile("Por horario", "Mañana, mediodía o tarde.")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("rend-horario")
            NavigationLink { ClimaView() } label: {
                tile("Por clima", "El pronóstico de tus salidas.")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("resumen-clima")
            NavigationLink { RendimientoDetail(title: "Con quién jugás", line: "Solo lo ves vos.", few: few) } label: {
                tile("Con quién jugás", "Solo lo ves vos.")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("rend-companeros")
        }
        .accessibilityIdentifier("tu-rendimiento")
    }

    private func tile(_ title: String, _ line: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(GType.headline)
                .foregroundStyle(p.ink)
            Text(line)
                .font(GType.label)
                .foregroundStyle(p.ink2)
            if few {
                Text("Pocas tarjetas")
                    .font(GType.label)
                    .foregroundStyle(Color(hex: 0xC8102E))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct RendimientoDetail: View {
    @Environment(\.palette) private var p
    var title: String
    var line: String
    var few: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(GType.section)
                .foregroundStyle(p.ink)
            Text(line)
                .font(GType.body)
                .foregroundStyle(p.ink2)
            Text(few ? "Pocas tarjetas. Se arma a medida que juegues." : "Sale de tus tarjetas. Solo lo ves vos.")
                .font(GType.body)
                .foregroundStyle(p.ink)
            Spacer()
        }
        .padding(20)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(p.bg)
        .accessibilityIdentifier("rend-detail")
    }
}
