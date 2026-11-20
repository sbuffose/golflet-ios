import SwiftUI

enum MissingKind: String, Identifiable {
    case putts, greens, fairways, weather, differential, course, club, ball, handicap, worst, gross, net, geo, strokeIndex, holePar, holeStrokes

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
        case .geo: return "Geometría"
        case .strokeIndex: return "S.I."
        case .holePar: return "Par"
        case .holeStrokes: return "Golpes"
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
        case .geo:
            return "Sale de un trazado verificado del tee al centro del green."
        case .strokeIndex, .holePar:
            return "Sale de la tarjeta oficial de la cancha y la salida."
        case .holeStrokes:
            return "Se ubican en los hoyos de menor S.I. de la tarjeta oficial."
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
        case .geo: return "Este hoyo no tiene geometría verificada. No marco un punto inventado."
        case .strokeIndex: return "Esta cancha no tiene el índice de hoyo (S.I.) cargado. Sin ese número no se puede ubicar el golpe recibido. Cuando el club lo publique en la tarjeta, los golpes se ubican solos: no los inventamos ni los ponemos del hoyo 1 en adelante."
        case .holePar: return "Este hoyo no tiene el par en la tarjeta oficial."
        case .holeStrokes: return "Sin el S.I. de la cancha no se pueden ubicar los golpes por hoyo."
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
    var compact: Bool = false
    @State private var open = false

    var body: some View {
        Button { open = true } label: {
            Text("–")
                .font(compact ? GType.label : GType.headline)
                .foregroundStyle(p.ink)
                .frame(minWidth: compact ? 18 : 44, minHeight: compact ? 28 : 44, alignment: compact ? .center : .leading)
                .contentShape(Rectangle())
        }
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
