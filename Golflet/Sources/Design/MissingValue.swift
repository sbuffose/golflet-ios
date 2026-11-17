import SwiftUI

enum MissingKind: String, Identifiable {
    case putts, greens, fairways, weather, differential, course, club, ball, handicap, worst, gross, net

    var id: String { rawValue }

    var title: String {
        switch self {
        case .putts: return "Putts"
        case .greens: return "Greens"
        case .fairways: return "Fairways"
        case .weather: return "Clima"
        case .differential: return "Diferencial"
        case .course: return "Cancha"
        case .club: return "Palo"
        case .ball: return "Pelota"
        case .handicap: return "Hándicap"
        case .worst: return "Peor ronda"
        case .gross: return "Gross"
        case .net: return "Neto"
        }
    }

    var source: String {
        switch self {
        case .putts, .greens, .fairways:
            return "Salen de Track o del editor de la tarjeta."
        case .weather:
            return "Es el pronóstico de la hora y la cancha."
        case .differential, .gross, .net:
            return "Sale de la tarjeta del club."
        case .course:
            return "Sale de la cancha que elegís."
        case .club:
            return "Sale de tu bolsa."
        case .ball:
            return "La cargás vos en la cuenta."
        case .handicap:
            return "Sale de la matrícula del club."
        case .worst:
            return "Es la tarjeta de mayor gross del período."
        }
    }

    var why: String {
        switch self {
        case .putts: return "Esta vuelta no tiene putts."
        case .greens: return "Esta vuelta no tiene greens."
        case .fairways: return "Esta vuelta no tiene fairways."
        case .weather: return "No hay pronóstico para esta salida."
        case .differential: return "Esta tarjeta no trae diferencial."
        case .gross: return "Esta tarjeta no trae el gross."
        case .net: return "Esta tarjeta no trae el neto."
        case .course: return "Todavía no hay una cancha elegida."
        case .club: return "La bolsa está vacía."
        case .ball: return "No hay una pelota elegida."
        case .handicap: return "No hay una matrícula vinculada."
        case .worst: return "Hay una sola tarjeta, así que no hay una peor distinta."
        }
    }

    var actionTitle: String? {
        switch self {
        case .putts, .greens, .fairways: return "Cargar putts"
        case .course: return "Elegir cancha"
        case .club: return "Agregar palo"
        case .ball: return "Elegir pelota"
        case .handicap: return "Vincular matrícula"
        default: return nil
        }
    }
}

struct MissingMark: View {
    @Environment(\.palette) private var p
    var kind: MissingKind
    var action: (() -> Void)?
    @State private var open = false

    var body: some View {
        Button("–") { open = true }
            .font(GType.headline)
            .foregroundStyle(p.ink)
            .buttonStyle(.plain)
            .accessibilityLabel("Sin dato, \(kind.title)")
            .accessibilityIdentifier("missing-\(kind.rawValue)")
            .sheet(isPresented: $open) {
                MissingSheet(kind: kind, action: action)
                    .presentationDetents([.height(280)])
            }
    }
}

struct MissingSheet: View {
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    var kind: MissingKind
    var action: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(kind.title)
                .font(GType.section)
                .foregroundStyle(Color(hex: 0xC8102E))
            Text(kind.source)
                .font(GType.body)
                .foregroundStyle(p.ink)
            Text(kind.why)
                .font(GType.body)
                .foregroundStyle(p.ink2)
            if let title = kind.actionTitle, let action {
                Button(title) {
                    dismiss()
                    action()
                }
                .font(GType.headline)
                .foregroundStyle(Color.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .accessibilityIdentifier("missing-action-\(kind.rawValue)")
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.white)
        .accessibilityIdentifier("missing-sheet")
    }
}
