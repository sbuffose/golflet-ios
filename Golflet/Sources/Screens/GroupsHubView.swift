import SwiftUI
import UIKit

struct GroupsHubView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var toast: String?

    var body: some View {
        GScreen(id: "screen-grupos") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        GOverline(text: "Grupos")
                        Spacer()
                        Button { model.showsClubs = true } label: {
                            AvatarCircle(initials: model.profile.initials)
                        }
                        .accessibilityIdentifier("grupos-avatar")
                    }
                    Text("Grupos")
                        .font(GType.largeTitle)
                        .foregroundStyle(p.ink)
                    ExampleNote(text: "Tus grupos de juego y tus clubes. No es un muro: solo la gente con la que jugás.")

                    Text("Tus grupos").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            NavigationLink {
                                GroupDetailHub(group: ProtoGroup(id: "sabado", name: "Los del sábado", kind: "Amigos", members: DemoPeople.rivals.map(\.name) + ["Nico Paz"], example: true))
                            } label: {
                                ProtoRow(title: "Los del sábado", subtitle: "6 jugadores · próxima salida sáb 9:20", trailing: "2º")
                                    .accessibilityIdentifier("group-sabado")
                            }
                            NavigationLink {
                                GroupDetailHub(group: ProtoGroup(id: "mie", name: "Miércoles 9 hoyos", kind: "Amigos", members: ["Tomi Lagos", "Juan Ferro", "Santi Ocampo"], example: true))
                            } label: {
                                ProtoRow(title: "Miércoles 9 hoyos", subtitle: "4 jugadores · ejemplo")
                            }
                            ForEach(model.protoGroups) { group in
                                NavigationLink { GroupDetailHub(group: group) } label: {
                                    ProtoRow(title: group.name, subtitle: "\(group.members.count + 1) jugadores · \(group.kind)")
                                }
                            }
                        }
                    }
                    NavigationLink { CreateGroupHub() } label: {
                        Text("+ Crear grupo")
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .overlay(Capsule().stroke(p.primary, lineWidth: 1.5))
                    }
                    .accessibilityIdentifier("group-create")

                    Text("Quién juega cuándo").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ProtoRow(title: "Sáb 7-nov", subtitle: "9:20 · Vos, Fede, Lucas, Tomi")
                            ProtoRow(title: "Sáb 7-nov", subtitle: "10:10 · Santi Ocampo y 3 más")
                            Button {
                                toast = "Sumarme es solo de ejemplo: Golflet no le escribe a nadie."
                            } label: {
                                ProtoRow(title: "Mié 11-nov", subtitle: "17:30 · Tomi Lagos (9 hoyos)", trailing: "Sumarme")
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("group-sumarme")
                        }
                    }

                    Text("Amigos").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(DemoPeople.rivals) { r in
                                NavigationLink { RivalView(rival: r) } label: {
                                    ProtoRow(title: r.name, subtitle: "HI \(r.hi) · \(r.w)G \(r.e)E \(r.l)P con vos")
                                }
                            }
                        }
                    }
                    ExampleNote(text: "Nombres y números de ejemplo. No hay apuestas.")
                }
                .padding(20)
                .padding(.bottom, 96)
            }
        }
        .accessibilityIdentifier("screen-grupos")
        .overlay(alignment: .bottom) {
            if let toast {
                Text(toast)
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .padding(14)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                    .padding(.bottom, 90)
                    .task(id: toast) {
                        try? await Task.sleep(for: .seconds(2.2))
                        self.toast = nil
                    }
            }
        }
    }
}

struct DemoPerson: Identifiable, Hashable {
    var id: String
    var name: String
    var hi: String
    var w: Int
    var l: Int
    var e: Int
    var form: String
}

enum DemoPeople {
    static let rivals: [DemoPerson] = [
        .init(id: "fede", name: "Fede Ibarra", hi: "10,8", w: 7, l: 4, e: 1, form: "GGPEGPGG"),
        .init(id: "lucas", name: "Lucas Brandsen", hi: "14,1", w: 3, l: 5, e: 0, form: "PPGPGPPG"),
        .init(id: "santi", name: "Santi Ocampo", hi: "8,2", w: 2, l: 6, e: 2, form: "PEPPGPEP"),
        .init(id: "tomi", name: "Tomi Lagos", hi: "16,5", w: 5, l: 1, e: 1, form: "GGEGGPG")
    ]
}

struct CreateGroupHub: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var name = ""
    @State private var kind = "Amigos"
    @State private var member = ""
    @State private var members: [String] = []

    var body: some View {
        GScreen(id: "screen-crear-grupo") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Crear grupo").font(GType.largeTitle).foregroundStyle(p.ink)
                    TextField("Ej.: Los del jueves", text: $name)
                        .padding(14)
                        .background(p.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.hairline, lineWidth: 1))
                        .accessibilityIdentifier("gname")
                    HStack {
                        ForEach(["Amigos", "Club", "Torneo interno"], id: \.self) { k in
                            Button(k) { kind = k }
                                .font(GType.label)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(kind == k ? p.primary : p.surface)
                                .foregroundStyle(kind == k ? p.onPrimary : p.ink2)
                                .clipShape(Capsule())
                        }
                    }
                    ProtoCard {
                        if members.isEmpty {
                            ExampleNote(text: "Todavía nadie. Vos ya estás adentro.")
                        } else {
                            ForEach(members, id: \.self) { n in
                                ProtoRow(title: n)
                            }
                        }
                    }
                    HStack {
                        TextField("Nombre", text: $member)
                            .padding(12)
                            .background(p.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                        Button("Agregar") {
                            let t = member.trimmingCharacters(in: .whitespaces)
                            if !t.isEmpty { members.append(t); member = "" }
                        }
                        .font(GType.headline)
                    }
                    Button {
                        guard !name.trimmingCharacters(in: .whitespaces).isEmpty else { return }
                        model.addProtoGroup(ProtoGroup(id: "g\(Int(Date().timeIntervalSince1970))", name: name, kind: kind, members: members, example: false))
                        dismiss()
                    } label: {
                        Text("Crear grupo")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(p.primary)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("gcrear")
                    ExampleNote(text: "Golflet no le escribe a nadie. El link lo mandás vos.")
                }
                .padding(20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct GroupDetailHub: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var group: ProtoGroup
    @State private var sort = "neto"
    @State private var period = "Este mes"
    @State private var copied = false

    var body: some View {
        GScreen(id: "screen-grupo-detalle") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(group.name).font(GType.largeTitle).foregroundStyle(p.ink)
                    HStack {
                        ExampleNote(text: "\(group.kind) · \(group.members.count + 1) jugadores")
                        if group.example { DemoPill() }
                    }
                    Text("Ranking").font(GType.section).foregroundStyle(p.ink)
                    HStack {
                        ForEach(["neto", "sg", "vueltas"], id: \.self) { k in
                            Button(k == "sg" ? "Strokes gained" : k.capitalized) { sort = k }
                                .font(GType.label)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 7)
                                .background(sort == k ? p.primary : p.surface)
                                .foregroundStyle(sort == k ? p.onPrimary : p.ink2)
                                .clipShape(Capsule())
                        }
                    }
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(Array(rows.enumerated()), id: \.offset) { i, row in
                                HStack {
                                    Text(row.1 == nil ? "—" : "\(i + 1)º")
                                        .font(GType.label)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 4)
                                        .background(row.2 ? p.primary : p.surface2)
                                        .foregroundStyle(row.2 ? p.onPrimary : p.ink)
                                        .clipShape(Capsule())
                                    Text(row.0).font(GType.headline).foregroundStyle(p.ink)
                                    Spacer()
                                    Text(row.1.map { sort == "sg" ? StrokesGained.format($0) : FormatAR.one($0) } ?? "—")
                                        .font(GType.headline).tabular()
                                }
                                .padding(.vertical, 8)
                            }
                        }
                    }
                    .accessibilityIdentifier("group-ranking")

                    Text("Desafíos").font(GType.section).foregroundStyle(p.ink)
                    NavigationLink {
                        NewChallengeView(group: group)
                    } label: {
                        Text("+ Nuevo desafío")
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                    }
                    .accessibilityIdentifier("group-desafio")
                    let ds = model.challenges[group.id] ?? []
                    ProtoCard {
                        if ds.isEmpty {
                            ExampleNote(text: "Ningún desafío todavía. Sin plata ni apuestas: es para ver quién juega mejor.")
                        } else {
                            ForEach(ds) { d in
                                NavigationLink { ChallengeDetailView(group: group, challenge: d) } label: {
                                    ProtoRow(title: challengeTitle(d.tipo), subtitle: d.period)
                                }
                            }
                        }
                    }

                    ProtoCard {
                        HStack {
                            VStack(alignment: .leading) {
                                Text("Link del grupo").font(GType.headline)
                                Text("golflet.app/g/\(group.id)").font(GType.label).foregroundStyle(p.ink3)
                            }
                            Spacer()
                            Button(copied ? "Copiado" : "Copiar") {
                                UIPasteboard.general.string = "https://golflet-prototipo.vercel.app/app.html#/grupos/\(group.id)"
                                copied = true
                            }
                            .font(GType.label)
                            .accessibilityIdentifier("gcopy")
                        }
                    }
                    ExampleNote(text: "Prototipo: copiás el link y lo mandás vos. Golflet no le escribe a nadie.")
                }
                .padding(20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }

    private var rows: [(String, Double?, Bool)] {
        var list: [(String, Double?, Bool)] = [("Vos", sort == "neto" ? 72.8 : sort == "sg" ? -5.0 : 4, true)]
        let sample: [String: Double] = [
            "Fede Ibarra": sort == "neto" ? 72.1 : sort == "sg" ? -3.1 : 4,
            "Tomi Lagos": sort == "neto" ? 74.0 : sort == "sg" ? -6.2 : 3,
            "Lucas Brandsen": sort == "neto" ? 75.3 : sort == "sg" ? -7.8 : 4,
            "Santi Ocampo": sort == "neto" ? 73.4 : sort == "sg" ? -4.9 : 2,
            "Nico Paz": sort == "neto" ? 76.9 : sort == "sg" ? -9.4 : 3,
            "Juan Ferro": sort == "neto" ? 74.8 : sort == "sg" ? -6.0 : 2
        ]
        for n in group.members {
            list.append((n, group.example ? sample[n] : nil, false))
        }
        return list.sorted {
            switch ( $0.1, $1.1 ) {
            case (nil, _): return false
            case (_, nil): return true
            case let (a?, b?): return sort == "neto" ? a < b : a > b
            }
        }
    }

    private func challengeTitle(_ tipo: String) -> String {
        switch tipo {
        case "putts": return "Menos putts por vuelta"
        case "prac": return "Desafío de práctica"
        default: return "Mejor neto del período"
        }
    }
}

struct NewChallengeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @Environment(\.palette) private var p
    var group: ProtoGroup
    @State private var tipo = "neto"
    @State private var period = "Este mes"

    var body: some View {
        GScreen(id: "screen-desafio-nuevo") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Nuevo desafío").font(GType.largeTitle).foregroundStyle(p.ink)
                ExampleNote(text: "Sin plata ni apuestas: es para ver quién juega mejor.")
                ForEach([("neto", "Mejor neto del período"), ("putts", "Menos putts por vuelta"), ("prac", "50 putts embocados de 1 m")], id: \.0) { item in
                    Button { tipo = item.0 } label: {
                        HStack {
                            Circle().stroke(tipo == item.0 ? p.primary : p.ink3, lineWidth: tipo == item.0 ? 6 : 2).frame(width: 18, height: 18)
                            Text(item.1).font(GType.headline).foregroundStyle(p.ink)
                            Spacer()
                        }
                        .padding(12)
                    }
                    .buttonStyle(.plain)
                }
                HStack {
                    ForEach(["Esta semana", "Este mes", "3 meses"], id: \.self) { per in
                        Button(per) { period = per }
                            .font(GType.label)
                            .padding(8)
                            .background(period == per ? p.primary : p.surface)
                            .foregroundStyle(period == per ? p.onPrimary : p.ink2)
                            .clipShape(Capsule())
                    }
                }
                Button {
                    model.addChallenge(groupID: group.id, ProtoChallenge(id: "d\(Int(Date().timeIntervalSince1970))", tipo: tipo, period: period, progress: 0))
                    dismiss()
                } label: {
                    Text("Crear desafío")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(p.primary)
                        .clipShape(Capsule())
                }
                .accessibilityIdentifier("dcrear")
                Spacer()
            }
            .padding(20)
        }
    }
}

struct ChallengeDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var group: ProtoGroup
    var challenge: ProtoChallenge

    var body: some View {
        GScreen(id: "screen-desafio") {
            VStack(alignment: .leading, spacing: 14) {
                Text(challenge.tipo == "prac" ? "Desafío de práctica" : challenge.tipo == "putts" ? "Menos putts" : "Mejor neto")
                    .font(GType.largeTitle)
                ExampleNote(text: "\(challenge.period) · datos de ejemplo para los demás")
                if challenge.tipo == "prac" {
                    ProtoCard {
                        Text("Tu progreso \(challenge.progress) de 50").font(GType.headline)
                        ProgressView(value: Double(challenge.progress), total: 50)
                        HStack {
                            Button("+5 embocados") { model.bumpChallenge(groupID: group.id, id: challenge.id, delta: 5) }
                            Button("−5") { model.bumpChallenge(groupID: group.id, id: challenge.id, delta: -5) }
                        }
                    }
                }
                Spacer()
            }
            .padding(20)
        }
    }
}

struct RivalView: View {
    @Environment(\.palette) private var p
    var rival: DemoPerson
    var body: some View {
        GScreen(id: "screen-rival") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Vos vs. \(rival.name)").font(GType.largeTitle).foregroundStyle(p.ink)
                    HStack {
                        metric("Ganados", "\(rival.w)", up: true)
                        metric("Empates", "\(rival.e)", up: false)
                        metric("Perdidos", "\(rival.l)", up: false)
                    }
                    DemoPill()
                    ExampleNote(text: "Promedios de ejemplo. Solo con jugadores que aceptaron compartir.")
                }
                .padding(20)
            }
        }
    }

    private func metric(_ k: String, _ v: String, up: Bool) -> some View {
        VStack(alignment: .leading) {
            Text(k).font(GType.label).foregroundStyle(p.ink3)
            Text(v).font(GType.statM).foregroundStyle(up ? p.positive : p.ink).tabular()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
