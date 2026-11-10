import SwiftUI
import UIKit

/// Live membership and tee times. An empty list stays empty.
struct GroupsHubContent: Equatable {
    var usesLiveGroups: Bool
    var usesLiveTeeTimes: Bool

    var showsExampleGroups: Bool { false }
    var showsExampleTeeTimes: Bool { false }

    static func resolve(groupCount: Int, teeTimeCount: Int) -> GroupsHubContent {
        GroupsHubContent(
            usesLiveGroups: groupCount > 0,
            usesLiveTeeTimes: teeTimeCount > 0
        )
    }
}

struct GroupsHubView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    private var content: GroupsHubContent {
        GroupsHubContent.resolve(
            groupCount: model.groups.count,
            teeTimeCount: model.upcomingTeeTimes.count
        )
    }

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

                    if !model.pendingInvites.isEmpty {
                        Text("Invitaciones").font(GType.section).foregroundStyle(p.ink)
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(model.pendingInvites) { invite in
                                    Button { model.presentInvite(invite) } label: {
                                        ProtoRow(title: invite.name, subtitle: "Te invita \(invite.ownerName)")
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("hub-pending-\(invite.token)")
                                }
                            }
                        }
                    }

                    Text("Tus grupos").font(GType.section).foregroundStyle(p.ink)
                    if content.usesLiveGroups {
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(model.groups) { group in
                                    Button { model.presentGroupDetail(group.id) } label: {
                                        ProtoRow(
                                            title: group.name,
                                            subtitle: "\(group.memberCount) \(group.memberCount == 1 ? "miembro" : "miembros") · \(group.myRole.title)"
                                        )
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityIdentifier("hub-group-\(group.id)")
                                }
                            }
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            CaddieMark(height: 64)
                            Text("Todavía no hay grupos. Creá uno.")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                        .accessibilityIdentifier("hub-groups-empty")
                    }
                    Button { model.presentCreateGroup() } label: {
                        Text("+ Crear grupo")
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 13)
                            .overlay(Capsule().stroke(p.primary, lineWidth: 1.5))
                    }
                    .accessibilityIdentifier("group-create")

                    Text("Quién juega cuándo").font(GType.section).foregroundStyle(p.ink)
                    if content.usesLiveTeeTimes {
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(model.upcomingTeeTimes) { booking in
                                    NavigationLink {
                                        TeeTimePrepView(booking: booking)
                                    } label: {
                                        ProtoRow(title: booking.chipWhen, subtitle: teeSubtitle(booking))
                                    }
                                    .accessibilityIdentifier("hub-tee-\(booking.id)")
                                }
                            }
                        }
                    } else {
                        Text("Todavía no hay tee times.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("hub-tee-empty")
                    }
                }
                .padding(20)
                .padding(.bottom, 96)
            }
        }
        .accessibilityIdentifier("screen-grupos")
        .task {
            await model.refreshGroups()
            await model.refreshTeeTimes()
        }
    }

    private func teeSubtitle(_ booking: TeeTime) -> String {
        var parts = [booking.clubName]
        if !booking.course.isEmpty, booking.course.caseInsensitiveCompare(booking.clubName) != .orderedSame {
            parts.append(booking.course)
        }
        if let line = booking.companionsLine {
            parts.append(line)
        }
        return parts.joined(separator: " · ")
    }
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
                    TextField("Nombre del grupo", text: $name)
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
                            Text("Todavía no sumaste a nadie.")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
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
    @State private var copied = false

    var body: some View {
        GScreen(id: "screen-grupo-detalle") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(group.name).font(GType.largeTitle).foregroundStyle(p.ink)
                    Text("\(group.kind) · \(group.members.count + 1) jugadores")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                    Text("Ranking").font(GType.section).foregroundStyle(p.ink)
                    Text("Todavía no hay resultados. Jugá una vuelta con GPS.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
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
                            Text("Todavía no hay desafíos.")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
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
                                Text(GolfletURL.inviteURL(token: group.id).absoluteString).font(GType.label).foregroundStyle(p.ink3).lineLimit(1)
                            }
                            Spacer()
                            Button(copied ? "Copiado" : "Copiar") {
                                UIPasteboard.general.string = GolfletURL.inviteURL(token: group.id).absoluteString
                                copied = true
                            }
                            .font(GType.label)
                            .accessibilityIdentifier("gcopy")
                        }
                    }
                    Text("Copiá el link y mandalo.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                .padding(20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
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
                Text("Sin plata. Es para ver quién juega mejor.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
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
                Text(challenge.period)
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
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

