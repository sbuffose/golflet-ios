import SwiftUI
import UIKit

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

    private var clubCourses: [Course] {
        let club = booking.clubName.trimmingCharacters(in: .whitespacesAndNewlines)
        let same = model.courses.filter { $0.clubName.caseInsensitiveCompare(club) == .orderedSame }
        return same.isEmpty ? model.courses : same
    }

    private var resolvedCourseName: String? {
        let named = booking.course.trimmingCharacters(in: .whitespacesAndNewlines)
        if !named.isEmpty, let hit = clubCourses.first(where: { $0.name.caseInsensitiveCompare(named) == .orderedSame }) {
            return hit.name
        }
        return MatchStrokes.courseFromMarker(booking.eventName, courses: clubCourses.map(\.name))
    }

    private var course: Course? {
        guard let name = resolvedCourseName else { return nil }
        return clubCourses.first { $0.name.caseInsensitiveCompare(name) == .orderedSame }
    }

    private var courseTitle: String {
        if let name = resolvedCourseName { return "\(booking.clubName) · \(name)" }
        let named = booking.course.trimmingCharacters(in: .whitespacesAndNewlines)
        return named.isEmpty ? booking.clubName : "\(booking.clubName) · \(named)"
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
                    Text(courseTitle)
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
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("golpes-hoyo")
    }

    private func block(from start: Int) -> some View {
        let holes = Array(start..<min(start + 9, 18))
        return EqualHoleColumns(columns: holes.count, labelWidth: labelWidth) {
            ForEach(cells(holes)) { cell in
                cellView(cell)
            }
        }
        .padding(8)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func cells(_ holes: [Int]) -> [HoleCell] {
        var cells: [HoleCell] = []
        let tag = holes.first ?? 0
        cells.append(HoleCell(id: "\(tag)-h", kind: .title("Hoyo", light: true, identifier: nil)))
        for hole in holes {
            cells.append(HoleCell(id: "\(tag)-n-\(hole)", kind: .header(hole + 1)))
        }
        cells.append(HoleCell(id: "\(tag)-par", kind: .title("Par", light: false, identifier: nil)))
        for hole in holes {
            cells.append(HoleCell(id: "\(tag)-par-\(hole)", kind: value(pars, hole: hole, missing: .holePar)))
        }
        cells.append(HoleCell(id: "\(tag)-si", kind: .title("S.I.", light: false, identifier: nil)))
        for hole in holes {
            cells.append(HoleCell(id: "\(tag)-si-\(hole)", kind: value(si, hole: hole, missing: .strokeIndex)))
        }
        for row in rows {
            cells.append(HoleCell(id: "\(tag)-p-\(row.id)", kind: .title("\(row.label) \(row.received)", light: false, identifier: "golpes-fila-\(row.id)")))
            for hole in holes {
                let count = hole < row.dots.count ? row.dots[hole] : 0
                let mark = row.placed && count > 0 ? String(repeating: "●", count: min(count, 3)) : ""
                let voice = mark.isEmpty ? "vacío" : "\(count) \(count == 1 ? "golpe" : "golpes")"
                cells.append(HoleCell(
                    id: "\(tag)-s-\(row.id)-\(hole)",
                    kind: .stroke(mark, voice: voice, identifier: "golpes-celda-\(row.id)-\(hole + 1)")
                ))
            }
        }
        return cells
    }

    private func value(_ source: [Int?], hole: Int, missing: MissingKind) -> HoleCell.Kind {
        if source.indices.contains(hole), let number = source[hole] {
            return .number(number)
        }
        return .missing(missing)
    }

    @ViewBuilder
    private func cellView(_ cell: HoleCell) -> some View {
        switch cell.kind {
        case .title(let text, let light, let identifier):
            filled(text, color: light ? .white : p.ink, fill: light ? Color(hex: 0x0B2545) : .clear, align: .leading, identifier: identifier, voice: text)
        case .header(let number):
            filled("\(number)", color: .white, fill: Color(hex: 0x0B2545), align: .center, identifier: "golpes-col-\(number)", voice: "\(number)")
        case .number(let number):
            filled("\(number)", color: p.ink2, fill: .clear, align: .center, identifier: nil, voice: "\(number)")
        case .missing(let kind):
            Color.clear
                .overlay { MissingMark(kind: kind, compact: true) }
                .accessibilityElement(children: .contain)
        case .stroke(let mark, let voice, let identifier):
            filled(mark, color: Color(hex: 0x86672F), fill: .clear, align: .center, identifier: identifier, voice: voice, dot: true)
        }
    }

    private func filled(_ text: String, color: Color, fill: Color, align: Alignment, identifier: String?, voice: String, dot: Bool = false) -> some View {
        ColumnSlot(identifier: identifier, label: voice)
            .background(fill)
            .overlay(alignment: align) {
                Text(text.isEmpty ? " " : text)
                    .font(dot ? .system(size: 9) : GType.label)
                    .foregroundStyle(color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                    .padding(.leading, align == .leading ? 2 : 0)
                    .accessibilityHidden(true)
            }
    }
}

private struct HoleCell: Identifiable {
    enum Kind {
        case title(String, light: Bool, identifier: String?)
        case header(Int)
        case number(Int)
        case missing(MissingKind)
        case stroke(String, voice: String, identifier: String)
    }

    var id: String
    var kind: Kind
}

/// Equal hole slots. A two-digit S.I. cannot widen its column.
private struct EqualHoleColumns: Layout {
    var columns: Int
    var labelWidth: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        let width = proposal.width ?? (labelWidth + CGFloat(columns) * 24)
        let height = rowsHeight(width: width, subviews: subviews)
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        let column = columnWidth(total: bounds.width)
        let step = columns + 1
        let rowCount = subviews.count / max(step, 1)
        var y = bounds.minY
        for row in 0..<rowCount {
            let height = rowHeight(row, width: column, subviews: subviews)
            var x = bounds.minX
            for columnIndex in 0..<step {
                let index = row * step + columnIndex
                guard subviews.indices.contains(index) else { continue }
                let width = columnIndex == 0 ? labelWidth : column
                subviews[index].place(
                    at: CGPoint(x: x + width / 2, y: y + height / 2),
                    anchor: .center,
                    proposal: ProposedViewSize(width: width, height: height)
                )
                x += width
            }
            y += height
        }
    }

    private func columnWidth(total: CGFloat) -> CGFloat {
        guard columns > 0 else { return 0 }
        return max(0, (total - labelWidth) / CGFloat(columns))
    }

    private func rowsHeight(width: CGFloat, subviews: Subviews) -> CGFloat {
        let step = columns + 1
        let rowCount = subviews.count / max(step, 1)
        let column = columnWidth(total: width)
        return (0..<rowCount).reduce(0) { $0 + rowHeight($1, width: column, subviews: subviews) }
    }

    private func rowHeight(_ row: Int, width: CGFloat, subviews: Subviews) -> CGFloat {
        let step = columns + 1
        var height: CGFloat = 28
        for columnIndex in 0..<step {
            let index = row * step + columnIndex
            guard subviews.indices.contains(index) else { continue }
            let slot = columnIndex == 0 ? labelWidth : width
            height = max(height, subviews[index].sizeThatFits(.init(width: slot, height: nil)).height)
        }
        return height
    }
}

/// Fills the slot the layout proposes, so the measured column is the slot and not the glyph.
private struct ColumnSlot: UIViewRepresentable {
    var identifier: String?
    var label: String

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isAccessibilityElement = true
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        apply(view)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        apply(view)
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UIView, context: Context) -> CGSize? {
        CGSize(width: proposal.width ?? 28, height: proposal.height ?? 28)
    }

    private func apply(_ view: UIView) {
        view.accessibilityIdentifier = identifier
        view.accessibilityLabel = label
    }
}
