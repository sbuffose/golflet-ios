import SwiftUI

struct RangeMenuButton: View {
    @Environment(\.palette) private var p
    @Binding var range: StatsRange
    var count: Int

    var body: some View {
        Menu {
            ForEach(StatsRange.allCases) { option in
                Button {
                    range = option
                } label: {
                    if option == range {
                        Label(option.title, systemImage: "checkmark")
                    } else {
                        Text(option.title)
                    }
                }
                .accessibilityIdentifier("range-\(option.rawValue)")
            }
        } label: {
            HStack(spacing: 6) {
                Text(range.title)
                    .font(GType.headline)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(p.ink)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(p.surface)
            .clipShape(Capsule())
            .shadow(color: Color.black.opacity(0.05), radius: 6, y: 2)
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
