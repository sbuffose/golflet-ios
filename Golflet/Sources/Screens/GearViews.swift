import SwiftUI

struct PelotaView: View {
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-pelota") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    CaddieMark(height: 72)
                    Text("Mi pelota")
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                    Text("Todavía no hay una pelota cargada.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }
}

struct SorteosView: View {
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-sorteos") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    CaddieMark(height: 72)
                    Text("Sorteos")
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                    Text("No hay sorteos cargados.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                .padding(20)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }
}

struct AddClubView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""

    var body: some View {
        GScreen(id: "screen-agregar-palo") {
            VStack(alignment: .leading, spacing: 16) {
                Text("Agregar palo")
                    .font(GType.sheetTitle)
                    .foregroundStyle(p.ink)
                TextField("Nombre del palo", text: $name)
                    .font(GType.body)
                    .padding(12)
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityIdentifier("add-club-name")
                Button {
                    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { return }
                    model.updateBagClub(name: trimmed, carry: nil, total: nil)
                    dismiss()
                } label: {
                    Text("Agregar")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("add-club-save")
                Spacer()
            }
            .padding(20)
        }
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }
}
