import SwiftUI

struct RangeMenuButton: View {
    @Environment(\.palette) private var p
    @Binding var range: StatsRange
    var count: Int

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 0) {
                ForEach(StatsRange.allCases) { option in
                    let on = option == range
                    Button {
                        range = option
                    } label: {
                        Text(option.title)
                            .font(GType.label)
                            .foregroundStyle(on ? p.ink : p.ink2)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(on ? p.surface : Color.clear)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("range-\(option.rawValue)")
                    .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            .padding(4)
            .background(p.surface2)
            .clipShape(Capsule())
        }
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
