import SwiftUI

struct BagView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var editing: BagClub?

    var body: some View {
        GScreen {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    GOverline(text: "Mis distancias")
                    GTitle(text: "Mi bolsa")
                }
                hint
                headerRow
                ScrollView(showsIndicators: false) {
                    VStack(spacing: 0) {
                        ForEach(model.bag) { club in
                            Button { editing = club } label: {
                                HStack {
                                    Text(club.name)
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Spacer()
                                    cell(club.carry)
                                    cell(club.total)
                                }
                                .padding(.vertical, 16)
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
        .sheet(item: $editing) { club in
            BagEditSheet(club: club) { carry, total in
                model.updateBagClub(name: club.name, carry: carry, total: total)
                editing = nil
            }
            .golfletChrome()
            .presentationDetents([.medium])
        }
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
