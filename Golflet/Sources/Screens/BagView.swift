import SwiftUI

struct BagView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var ironBrand = ""
    @State private var ironModel = ""
    private let ironCatalog = [
        "Titleist": ["T100", "T150", "T200", "T250", "T350"],
        "Callaway": ["Apex", "Apex Pro", "Paradym"],
        "TaylorMade": ["P770", "P790", "P7MC"],
        "Ping": ["i530", "G430", "Blueprint"],
        "Mizuno": ["JPX 923", "Pro 243", "Pro 225"],
    ]
    var body: some View {
        GScreen(id: "screen-bolsa") {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    GOverline(text: "Mis distancias")
                    GTitle(text: "Mi bolsa")
                }
                hint
                ironSet
                headerRow
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        ForEach(model.bag) { club in
                            NavigationLink(value: MetricRoute.clubStats(ClubCode.code(for: club.name))) {
                                HStack {
                                    Text(club.name)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Spacer()
                                    cell(club.carry)
                                    cell(club.total)
                                    MetricChevron(color: p.ink3)
                                }
                                .padding(.vertical, 16)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("bag-\(club.name)")
                            Hairline()
                        }
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .accessibilityIdentifier("screen-bolsa")
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }

    private var filled: Int {
        model.bag.filter { $0.carry != nil || $0.total != nil }.count
    }

    private var hint: some View {
        GCard(radius: 22, padding: 16) {
            HStack(alignment: .top, spacing: 12) {
                Text("\(filled)/\(model.bag.count)")
                    .font(GFont.ui(16, weight: .semibold))
                    .tabular()
                    .foregroundStyle(p.onPrimary)
                    .frame(width: 44, height: 44)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                Text("Todavía sin distancias. Cargá carry y total en yardas para que Golflet te sugiera el tiro en cada hoyo.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
            }
        }
    }

    private var ironSet: some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 10) {
                Text("Juego de hierros")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Menu {
                    ForEach(ironCatalog.keys.sorted(), id: \.self) { brand in
                        Button(brand) { ironBrand = brand; ironModel = "" }
                    }
                } label: {
                    Text(ironBrand.isEmpty ? "Marca" : ironBrand)
                        .font(GType.body)
                        .foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("iron-brand")
                Menu {
                    ForEach(ironCatalog[ironBrand] ?? [], id: \.self) { modelName in
                        Button(modelName) { ironModel = modelName }
                    }
                } label: {
                    Text(ironModel.isEmpty ? "Modelo" : ironModel)
                        .font(GType.body)
                        .foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("iron-model")
                Text(ironNote)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .accessibilityIdentifier("iron-note")
            }
        }
    }

    private var ironNote: String {
        if ironBrand.isEmpty || ironModel.isEmpty { return "Elegí marca y modelo. No invento un juego." }
        if ironCatalog[ironBrand]?.contains(ironModel) == true {
            return "\(ironBrand) \(ironModel). No lo guardé: esta pantalla todavía no manda el juego."
        }
        return "No lo creamos"
    }

    private var headerRow: some View {
        HStack {
            Text("Palo")
                .font(GType.label)
                .foregroundStyle(p.ink3)
            Spacer()
            Text("Carry")
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .frame(width: 64)
            Text("Total")
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .frame(width: 64)
        }
        .padding(.horizontal, 4)
    }

    private func cell(_ value: Int?) -> some View {
        Text(value.map(String.init) ?? "—")
            .font(GType.headline)
            .tabular()
            .foregroundStyle(value == nil ? p.ink3 : p.ink)
            .frame(width: 64, height: 36)
            .background(p.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}

struct BagEditSheet: View {
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let club: BagClub
    var onSave: (Int?, Int?) -> Void
    @State private var carry = ""
    @State private var total = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            GTitle(text: club.name, size: 30)
            GField(label: "Carry (yardas)") {
                TextField("—", text: $carry)
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("bag-carry")
            }
            GField(label: "Total (yardas)") {
                TextField("—", text: $total)
                    .keyboardType(.numberPad)
                    .accessibilityIdentifier("bag-total")
            }
            Button {
                onSave(Int(carry), Int(total))
                dismiss()
            } label: {
                Text("Guardar")
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            }
            .accessibilityIdentifier("bag-save")
            Spacer()
        }
        .padding(24)
        .background(p.bg.ignoresSafeArea())
        .onAppear {
            carry = club.carry.map(String.init) ?? ""
            total = club.total.map(String.init) ?? ""
        }
    }
}
