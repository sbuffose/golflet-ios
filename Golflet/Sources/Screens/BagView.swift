import SwiftUI

struct BagView: View {
    var showsBack = true
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var ironBrand = ""
    @State private var ironModel = ""
    @State private var ironStatus = ""
    @State private var savingIron = false
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
                HStack {
                    Text("Mis palos")
                        .font(GType.section)
                        .foregroundStyle(p.ink)
                    Spacer()
                    NavigationLink { AddClubView() } label: {
                        Text("+ Agregar palo")
                            .font(GType.label)
                            .foregroundStyle(p.ink)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(p.surface2)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("bag-add-club")
                }
                NavigationLink { PelotaView() } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Pelota")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text("La pelota con la que jugás")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(p.ink3)
                    }
                    .padding(14)
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("bag-pelota")
                hint
                headerRow
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        ForEach(model.bag) { club in
                            HStack(spacing: 8) {
                                NavigationLink(value: MetricRoute.clubStats(ClubCode.code(for: club.name))) {
                                    HStack {
                                        Text(club.name)
                                            .font(GType.headline)
                                            .foregroundStyle(p.ink)
                                            .lineLimit(1)
                                        Spacer(minLength: 4)
                                        MetricChevron(color: p.ink3)
                                    }
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("bag-\(club.name)")
                                if isPutter(club.name) {
                                    Text("Sin yardas")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                        .frame(width: 128, alignment: .trailing)
                                } else {
                                    yardField(club, carry: true)
                                    yardField(club, carry: false)
                                }
                            }
                            .padding(.vertical, 10)
                            Hairline()
                        }
                        VStack(alignment: .leading, spacing: 6) {
                            HStack {
                                Text("Distancias por palo")
                                    .font(GType.section)
                                    .foregroundStyle(p.ink)
                                Spacer()
                                Text("GPS")
                                    .font(GType.label)
                                    .foregroundStyle(p.primary)
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 4)
                                    .background(Color(hex: 0xC8A86A).opacity(0.35))
                                    .clipShape(Capsule())
                            }
                            .padding(.top, 18)
                            Text("Sin tiros medidos con GPS. Lo que escribas arriba es tu distancia.")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                                .accessibilityIdentifier("bag-gps")
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.bottom, 12)
                        ironSet
                            .padding(.bottom, 24)
                    }
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .accessibilityIdentifier("screen-bolsa")
        .metricDestinations()
        .safeAreaInset(edge: .top) { if showsBack { MetricBackBar() } }
        .onAppear(perform: restoreIron)
    }

    private var yardClubs: [BagClub] {
        model.bag.filter { !isPutter($0.name) }
    }

    private var filled: Int {
        yardClubs.filter { $0.carry != nil || $0.total != nil }.count
    }

    private func isPutter(_ name: String) -> Bool {
        let club = name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return club == "pt" || club == "putter" || club.hasPrefix("putter")
    }

    private var hint: some View {
        GCard(radius: 22, padding: 16) {
            VStack(alignment: .leading, spacing: 6) {
                Text("\(filled) de \(yardClubs.count)")
                    .font(GType.statM)
                    .tabular()
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("bag-count")
                Text(filled == 0
                     ? "Todavía sin distancias. Cargá carry y total en yardas para que Golflet te sugiera el tiro en cada hoyo."
                     : "Palos con una distancia que cargaste vos.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                Text("Lo que escribís y los tiros medidos por GPS se cuentan aparte. Un guion es un dato que no cargaste. El putter no lleva yardas acá.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
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
                Button {
                    Task { await saveIron() }
                } label: {
                    Text(savingIron ? "Guardando…" : "Guardar el juego")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .disabled(ironBrand.isEmpty || ironModel.isEmpty || savingIron)
                .accessibilityIdentifier("iron-save")
                Text(ironNote)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .accessibilityIdentifier("iron-note")
            }
        }
    }

    private func restoreIron() {
        guard ironBrand.isEmpty, ironModel.isEmpty, let saved = IronSetStore.load() else { return }
        ironBrand = saved.brand
        ironModel = saved.model
        ironStatus = "\(saved.brand) \(saved.model). Guardado en el teléfono."
    }

    private func saveIron() async {
        guard ironCatalog[ironBrand]?.contains(ironModel) == true else {
            ironStatus = "No lo creamos"
            return
        }
        savingIron = true
        defer { savingIron = false }
        IronSetStore.save(brand: ironBrand, model: ironModel)
        do {
            ironStatus = try await model.api.saveIronSet(brand: ironBrand, model: ironModel)
        } catch {
            let message = error.localizedDescription
            ironStatus = message.localizedCaseInsensitiveContains("no lo creamos") || message.localizedCaseInsensitiveContains("no está")
                ? "Quedó en el teléfono. En la cuenta: No lo creamos."
                : "Guardado en el teléfono. \(ironBrand) \(ironModel)."
        }
    }

    private var ironNote: String {
        if !ironStatus.isEmpty { return ironStatus }
        if ironBrand.isEmpty || ironModel.isEmpty { return "Elegí marca y modelo. No invento un juego." }
        if ironCatalog[ironBrand]?.contains(ironModel) == true { return "\(ironBrand) \(ironModel)." }
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

    private func yardField(_ club: BagClub, carry: Bool) -> some View {
        TextField("—", text: Binding(
            get: {
                let value = carry ? club.carry : club.total
                return value.map(String.init) ?? ""
            },
            set: { raw in
                let digits = raw.filter(\.isNumber)
                let parsed = digits.isEmpty ? nil : Int(digits)
                model.updateBagClub(
                    name: club.name,
                    carry: carry ? parsed : club.carry,
                    total: carry ? club.total : parsed
                )
            }
        ))
        .keyboardType(.numberPad)
        .multilineTextAlignment(.center)
        .font(GType.headline)
        .foregroundStyle(p.ink)
        .frame(width: 56, height: 36)
        .background(p.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .accessibilityLabel("\(carry ? "Carry" : "Total") de \(club.name)")
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
