import SwiftUI

struct MatchSetupPlayer: Identifiable, Equatable {
    var id: String
    var name: String
    var handicap: Double?
    var isMe: Bool
}

/// «Armar partido» from a booking. Par and S.I. come from the course card already on the phone. Strokes sit on the lowest stroke indexes.
struct MatchSetupView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let booking: TeeTime

    private var course: Course? {
        let name = booking.course.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return nil }
        return model.courses.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    private var card: (pars: [Int?], si: [Int?]) {
        let holes = (course?.holes ?? []).map { hole in
            (hole: hole.number, par: hole.par > 0 ? hole.par : nil, si: hole.handicapKnown ? hole.handicap : nil)
        }
        return MatchStrokes.card(from: holes)
    }

    private var players: [MatchSetupPlayer] {
        var rows = [MatchSetupPlayer(id: "me", name: model.profile.displayName, handicap: model.profile.currentHandicap, isMe: true)]
        for (index, name) in booking.companions.enumerated() {
            rows.append(MatchSetupPlayer(id: "c:\(index)", name: name, handicap: booking.companionHandicaps[name], isMe: false))
        }
        return rows
    }

    private var ready: Bool {
        players.count >= 2 && players.allSatisfy { $0.handicap != nil }
    }

    var body: some View {
        GScreen(id: "screen-armar-partido") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Armar partido")
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                    Text(booking.course.isEmpty ? booking.clubName : "\(booking.clubName) · \(booking.course)")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                    playerList
                    GolpesPorHoyoGrid(
                        pars: card.pars,
                        si: card.si,
                        rows: strokeRows
                    )
                }
                .padding(16)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-armar-partido")
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }

    private var playerList: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(players) { player in
                HStack {
                    Text(player.isMe ? "\(player.name) · vos" : player.name)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Spacer()
                    if let handicap = player.handicap {
                        Text("HI \(FormatAR.one(handicap))")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    } else {
                        Text("Sin HCP")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                }
            }
            if !ready {
                Text("Con hándicap, todos necesitan su HCP.")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
            }
        }
        .accessibilityIdentifier("armar-jugadores")
    }

    private var strokeRows: [GolpesPorHoyoGrid.Row] {
        guard ready else { return [] }
        let names = players.map(\.name)
        let received = MatchStrokes.strokesReceived(players.map { $0.handicap ?? 0 }, allowance: 100)
        let placed = MatchStrokes.placed(card.si)
        return players.enumerated().map { index, player in
            let count = received[index]
            return GolpesPorHoyoGrid.Row(
                id: player.id,
                label: MatchStrokes.shortName(player.name, peers: names, me: player.isMe),
                received: count,
                dots: placed ? MatchStrokes.holeStrokes(received: count, si: card.si) : Array(repeating: 0, count: 18),
                placed: placed
            )
        }
    }
}

struct GolpesPorHoyoGrid: View {
    struct Row: Identifiable {
        var id: String
        var label: String
        var received: Int
        var dots: [Int]
        var placed: Bool
    }

    @Environment(\.palette) private var p
    var pars: [Int?]
    var si: [Int?]
    var rows: [Row]

    private var placed: Bool { MatchStrokes.placed(si) }

    @State private var tableWidth: CGFloat = 0

    /// Same width for every hole, like the web grid (`table-layout: fixed`). Content width must not stretch a column.
    private var columnWidth: CGFloat {
        let inner = max(0, tableWidth - 16)
        guard inner > labelWidth else { return 24 }
        return (inner - labelWidth) / 9
    }

    private let labelWidth: CGFloat = 78

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Golpes por hoyo")
                .font(GType.section)
                .foregroundStyle(p.ink)
            Text(placed ? "● = 1 golpe · por S.I." : "Sin el S.I. de la cancha no se pueden ubicar los golpes por hoyo.")
                .font(GType.label)
                .foregroundStyle(placed ? p.ink3 : Color(hex: 0x86672F))
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(placed ? "golpes-hoyo-ok" : "golpes-hoyo-warn")
            block(from: 0)
            if pars.count > 9 || si.count > 9 { block(from: 9) }
            if !rows.isEmpty {
                Text(rows.map { "\($0.label): \($0.received)" }.joined(separator: " · "))
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("golpes-hoyo-totales")
            }
        }
        .background {
            GeometryReader { geo in
                Color.clear
                    .onAppear { tableWidth = geo.size.width }
                    .onChange(of: geo.size.width) { _, newValue in tableWidth = newValue }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("golpes-hoyo")
    }

    private func block(from start: Int) -> some View {
        let holes = Array(start..<min(start + 9, 18))
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                columnLabel("Hoyo", light: true)
                ForEach(holes, id: \.self) { hole in
                    Text("\(hole + 1)")
                        .font(GType.label)
                        .foregroundStyle(Color.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                        .modifier(HoleColumn(width: columnWidth, identifier: "golpes-col-\(hole + 1)"))
                }
            }
            .background(Color(hex: 0x0B2545))
            valueRow("Par", holes: holes, kind: .holePar) { pars.indices.contains($0) ? pars[$0] : nil }
            valueRow("S.I.", holes: holes, kind: .strokeIndex) { si.indices.contains($0) ? si[$0] : nil }
            ForEach(rows) { row in
                HStack(spacing: 0) {
                    columnLabel("\(row.label) \(row.received)", light: false)
                        .accessibilityIdentifier("golpes-fila-\(row.id)")
                    ForEach(holes, id: \.self) { hole in
                        strokeCell(row: row, hole: hole)
                            .modifier(HoleColumn(width: columnWidth, identifier: "golpes-celda-\(row.id)-\(hole + 1)"))
                    }
                }
            }
        }
        .padding(8)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func columnLabel(_ text: String, light: Bool) -> some View {
        Text(text)
            .font(GType.label)
            .foregroundStyle(light ? Color.white : p.ink)
            .lineLimit(1)
            .minimumScaleFactor(0.65)
            .frame(width: labelWidth, height: 28, alignment: .leading)
    }

    private func valueRow(_ title: String, holes: [Int], kind: MissingKind, value: @escaping (Int) -> Int?) -> some View {
        HStack(spacing: 0) {
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .lineLimit(1)
                .frame(width: labelWidth, height: 28, alignment: .leading)
            ForEach(holes, id: \.self) { hole in
                Group {
                    if let number = value(hole) {
                        Text("\(number)")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                    } else {
                        MissingMark(kind: kind, compact: true)
                    }
                }
                .modifier(HoleColumn(width: columnWidth, identifier: nil))
            }
        }
    }

    @ViewBuilder
    private func strokeCell(row: Row, hole: Int) -> some View {
        let count = hole < row.dots.count ? row.dots[hole] : 0
        if row.placed, count > 0 {
            Text(String(repeating: "●", count: min(count, 3)))
                .font(.system(size: 9))
                .foregroundStyle(Color(hex: 0x0B2545))
                .accessibilityLabel("\(count) \(count == 1 ? "golpe" : "golpes")")
        } else {
            Text(" ")
                .font(GType.label)
                .accessibilityLabel("vacío")
        }
    }
}

/// Fixed hole column. The width is assigned; the cell cannot grow with a two-digit S.I.
private struct HoleColumn: ViewModifier {
    var width: CGFloat
    var identifier: String?

    @ViewBuilder
    func body(content: Content) -> some View {
        if let identifier {
            content
                .lineLimit(1)
                .frame(width: width, height: 28)
                .fixedSize(horizontal: true, vertical: false)
                .accessibilityIdentifier(identifier)
        } else {
            content
                .lineLimit(1)
                .frame(width: width, height: 28)
                .fixedSize(horizontal: true, vertical: false)
        }
    }
}
