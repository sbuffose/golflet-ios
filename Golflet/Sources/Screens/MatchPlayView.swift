import SwiftUI

/// Live metralleta. The navy board says who is up, and «Trackear golpes» opens the existing track for this hole.
struct MatchPlayView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var course: String
    var scoringLabel: String
    var players: [MatchSetupPlayer]
    var bases: [Double]
    var si: [Int?]
    var allowance: Double
    var onHoleScore: ((Int, Int) -> Void)?

    @State private var hole = 0
    @State private var scores: [[Int?]]
    @State private var showsTrack = false
    @State private var trackShots: [ReconstructionShot] = []

    init(course: String, players: [MatchSetupPlayer], scores: [[Int?]]? = nil, bases: [Double] = [], si: [Int?] = [], allowance: Double = 100, scoringLabel: String = "Gross", onHoleScore: ((Int, Int) -> Void)? = nil) {
        self.course = course
        self.scoringLabel = scoringLabel
        self.players = players
        self.bases = bases
        self.si = si
        self.allowance = allowance
        self.onHoleScore = onHoleScore
        _scores = State(initialValue: scores ?? players.map { _ in Array(repeating: nil, count: 18) })
    }

    var body: some View {
        GScreen(id: "screen-partido-vivo") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    head
                    board
                    holeCard
                }
                .padding(.bottom, 16)
            }
            .buttonStyle(.plain)
        }
        .sheet(isPresented: $showsTrack) {
            NavigationStack {
                ReconstructView(
                    context: RoundTrackContext(roundId: "", date: Date(), courseName: course, clubCode: "", hole: hole + 1),
                    storedShots: trackShots,
                    onShots: { trackShots = $0 }
                ) { played, strokes in
                    setScore(0, hole: played, strokes: strokes)
                }
            }
            .environment(model)
            .golfletChrome()
        }
    }

    private var head: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Button("Cerrar") { dismiss() }
                    .font(GType.headline)
                    .foregroundStyle(p.primary)
                Spacer()
            }
            Text("Metralleta")
                .font(GType.sheetTitle)
                .foregroundStyle(p.ink)
            Text("\(scoringLabel) · \(course)")
                .font(GType.label)
                .foregroundStyle(p.ink2)
            Text("No cuenta para tus tarjetas")
                .font(GType.label)
                .foregroundStyle(p.ink2)
        }
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }

    private var board: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(standings.enumerated()), id: \.offset) { _, line in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(line.text)
                        .font(GType.headline)
                        .foregroundStyle(tone(line.tone))
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                    Spacer(minLength: 8)
                    Text(caption(line))
                        .font(GType.label)
                        .foregroundStyle(Color.white.opacity(0.72))
                        .lineLimit(1)
                }
                .frame(minHeight: 28)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.primary)
        .overlay {
            if closed {
                RoundedRectangle(cornerRadius: 0)
                    .stroke(p.accent, lineWidth: 2)
            }
        }
        .accessibilityIdentifier("match-board")
        .padding(.top, 10)
    }

    private var holeCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(0..<18, id: \.self) { index in
                        Button("\(index + 1)") { hole = index }
                            .font(GType.label)
                            .foregroundStyle(index == hole ? Color(hex: 0xF6F7F9) : Color(hex: 0x0B2545))
                            .frame(width: 38, height: 38)
                            .background(index == hole ? Color(hex: 0x0B2545) : Color(hex: 0xF6F7F9), in: Circle())
                            .overlay(Circle().stroke(index == hole ? Color(hex: 0x0B2545) : Color(hex: 0x0B2545).opacity(0.22), lineWidth: 1))
                    }
                }
            }
            Text("Hoyo \(hole + 1)")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if !closed, players.contains(where: \.isMe) {
                Button(trackTitle) { showsTrack = true }
                    .font(GType.headline)
                    .foregroundStyle(Color.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(p.primary, in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("match-track")
            }
            ForEach(Array(players.enumerated()), id: \.element.id) { index, player in
                scoreRow(index, player)
            }
        }
        .padding(12)
    }

    private func scoreRow(_ index: Int, _ player: MatchSetupPlayer) -> some View {
        let value = scores[index][hole]
        return VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label(player))
                    .font(GType.headline)
                    .foregroundStyle(player.isMe ? Color(hex: 0x86672F) : p.ink)
                Spacer()
                Text(value == nil ? "–" : value == 0 ? "X" : String(value!))
                    .font(GType.section)
                    .foregroundStyle(p.ink)
            }
            if !closed {
                HStack(spacing: 4) {
                    ForEach([3, 4, 5, 6, 7, 8, 2], id: \.self) { key in
                        Button(key == 8 ? "8+" : "\(key)") { tap(index, key) }
                            .font(GType.label)
                            .foregroundStyle(p.primary)
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background(p.surface, in: RoundedRectangle(cornerRadius: 8))
                            .accessibilityIdentifier("match-score-\(index)-\(key)")
                    }
                    Button("X") { scores[index][hole] = 0 }
                        .font(GType.label)
                        .foregroundStyle(p.accent)
                        .frame(width: 32, height: 36)
                }
            }
        }
    }

    private var trackTitle: String {
        let mine = trackShots.filter { $0.hole == hole + 1 }
        let open = !mine.contains { $0.result == "holed" }
        let count = open ? mine.reduce(0) { $0 + ($1.penaltyStrokes > 0 ? $1.penaltyStrokes : 1) } : 0
        if count == 0 { return "Trackear golpes" }
        return "Seguir track · \(count) \(count == 1 ? "golpe" : "golpes")"
    }

    private var names: [String] { players.map(\.name) }

    private func label(_ player: MatchSetupPlayer) -> String {
        MatchStrokes.shortName(player.name, peers: names, me: player.isMe)
    }

    private var closed: Bool {
        !standings.isEmpty && standings.allSatisfy { $0.text == "Empate" || $0.text.hasPrefix("Ganó ") }
    }

    private var standings: [MatchStrokes.Standing] {
        var lines: [MatchStrokes.Standing] = []
        for left in players.indices {
            for right in players.indices where right > left {
                let dots = pairDots(left, right)
                let state = MatchStrokes.match(a: scores[left], b: scores[right], aDots: dots.0, bDots: dots.1)
                lines.append(MatchStrokes.standing(
                    aId: players[left].isMe ? "me" : players[left].id,
                    bId: players[right].isMe ? "me" : players[right].id,
                    aName: label(players[left]),
                    bName: label(players[right]),
                    state: state
                ))
            }
        }
        return lines
    }

    private func pairDots(_ left: Int, _ right: Int) -> ([Int], [Int]) {
        let a = left < bases.count ? bases[left] : 0
        let b = right < bases.count ? bases[right] : 0
        let received = MatchStrokes.strokesReceived([a, b], allowance: allowance)
        guard received.count == 2 else { return ([], []) }
        return (MatchStrokes.holeStrokes(received: received[0], si: si), MatchStrokes.holeStrokes(received: received[1], si: si))
    }

    private func tone(_ tone: String) -> Color {
        if tone == "me" { return Color(hex: 0xE2C27A) }
        if tone == "them" { return Color(hex: 0xF3A3A8) }
        return .white
    }

    private func caption(_ line: MatchStrokes.Standing) -> String {
        if line.versus.hasPrefix("Vos vs") || line.tone == "even" { return line.versus }
        return "vs \(line.versus)"
    }

    private func tap(_ index: Int, _ key: Int) {
        let current = scores[index][hole] ?? 0
        let strokes = key == 8 ? (current > 7 ? current + 1 : 8) : key
        setScore(index, hole: hole + 1, strokes: strokes)
    }

    private func setScore(_ index: Int, hole played: Int, strokes: Int) {
        guard scores.indices.contains(index) else { return }
        scores[index] = MatchStrokes.applyHoleScore(scores[index], hole: played, strokes: strokes)
        if players.indices.contains(index), players[index].isMe { onHoleScore?(played, strokes) }
    }
}

enum MatchPlayPreview: String, Identifiable {
    case up, square, done
    var id: String { rawValue }
    var scores: [[Int?]] {
        switch self {
        case .up: return MatchPlayFixture.up()
        case .square: return MatchPlayFixture.square()
        case .done: return MatchPlayFixture.done()
        }
    }
}

enum MatchPlayFixture {
    static func players() -> [MatchSetupPlayer] {
        [
            MatchSetupPlayer(id: "me", name: "Fixture Vos", handicap: 0, isMe: true),
            MatchSetupPlayer(id: "joaquin", name: "Joaquín Lavalle", handicap: 0, isMe: false),
            MatchSetupPlayer(id: "augusto", name: "Augusto Lavalle", handicap: 0, isMe: false),
        ]
    }

    static func up() -> [[Int?]] {
        var rows = players().map { _ in Array(repeating: Optional<Int>.none, count: 18) }
        rows[0][0] = 4; rows[1][0] = 5
        rows[0][1] = 4; rows[1][1] = 5
        rows[1][2] = 4; rows[2][2] = 5
        return rows
    }

    static func square() -> [[Int?]] {
        var rows = players().map { _ in Array(repeating: Optional<Int>.none, count: 18) }
        rows[0][0] = 4; rows[1][0] = 4; rows[2][0] = 4
        return rows
    }

    static func done() -> [[Int?]] {
        var rows = players().map { _ in Array(repeating: Optional<Int>.none, count: 18) }
        for hole in 0..<3 {
            rows[0][hole] = 4
            rows[1][hole] = 5
            rows[2][hole] = 6
        }
        for hole in 3..<16 {
            rows[0][hole] = 4
            rows[1][hole] = 4
            rows[2][hole] = 4
        }
        return rows
    }
}
