import SwiftUI

struct RangeMenuButton: View {
    @Environment(\.palette) private var p
    @Binding var range: StatsRange
    var count: Int

    var body: some View {
        // Este mes stays: it is the current calendar month for Inicio, Resumen and Cancha.
        // Año is the rolling 12 months. The list's Este año is the calendar year, so these are not the same control.
        HStack(spacing: 0) {
            ForEach(StatsRange.allCases) { option in
                let on = option == range
                Button {
                    range = option
                } label: {
                    Text(option.compactTitle)
                        .font(GFont.ui(10, weight: .semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                        .foregroundStyle(on ? p.ink : p.ink2)
                        .frame(maxWidth: .infinity)
                        .frame(height: 32)
                        .background(on ? p.surface : Color.clear)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("range-\(option.rawValue)")
                .accessibilityLabel(option.title)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(3)
        .background(p.surface2)
        .clipShape(Capsule())
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("range-menu")
        .accessibilityLabel("Período \(range.title), \(count) \(count == 1 ? "ronda" : "rondas")")
    }
}

struct RangeEmptyState: View {
    @Environment(\.palette) private var p
    var range: StatsRange

    var body: some View {
        GCard(radius: 22, padding: 18) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Sin rondas en este período")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("No hay tarjetas válidas de 18 hoyos en \(range.title.lowercased()). Probá otro rango.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityIdentifier("range-empty")
    }
}
