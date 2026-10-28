import SwiftUI

struct SyncLivePanel: View {
    let progress: SyncAPIProgress
    let reduceMotion: Bool

    var body: some View {
        if let stats = progress.stats, stats.hasRounds {
            VStack(spacing: 0) {
                SyncLiveCounters(stats: stats, reduceMotion: reduceMotion)
                    .padding(.top, 16)
                    .padding(.bottom, 12)
                if let card = stats.lastCard {
                    SyncLastCardView(card: card)
                }
                SyncLiveFooter(stats: stats, reduceMotion: reduceMotion)
                    .padding(.top, 12)
            }
            .accessibilityIdentifier("sync-live-panel")
        }
    }
}

struct ClubCrestView: View {
    let club: String?
    let logo: String?
    let initials: String?
    let reduceMotion: Bool

    @State private var spin = false

    private var detecting: Bool { SyncClubIdentity.isDetecting(club) }
    private var url: URL? { SyncClubIdentity.logoURL(logo) }

    var body: some View {
        ZStack {
            if detecting {
                scan
            } else if let url {
                AsyncImage(url: url) { phase in
                    switch phase {
                    case .success(let image):
                        image.resizable().scaledToFit().padding(6)
                    default:
                        monogram
                    }
                }
            } else {
                monogram
            }
        }
        .frame(width: 56, height: 56)
        .background(detecting ? Color(hex: 0xF7F5F0) : (url == nil ? Color(hex: 0x0F3D2E) : Color.white))
        .clipShape(Circle())
        .shadow(color: Color(hex: 0xC8A86A, alpha: 0.55), radius: 0)
        .overlay {
            Circle().stroke(Color(hex: 0xC8A86A, alpha: 0.55), lineWidth: 1)
        }
        .shadow(color: Color(hex: 0x0F3D2E, alpha: 0.12), radius: 9, y: 4)
        .accessibilityLabel(detecting ? "Buscando clubes" : (club ?? "Club"))
    }

    private var monogram: some View {
        Text(SyncClubIdentity.initials(name: club, provided: initials))
            .font(GFont.ui(19, weight: .semibold))
            .tracking(1.1)
            .foregroundStyle(Color(hex: 0xF7F5F0))
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(hex: 0x0F3D2E))
            .overlay {
                Circle().stroke(Color(hex: 0xC8A86A, alpha: 0.9), lineWidth: 1.6).padding(3)
            }
    }

    private var scan: some View {
        ZStack {
            Circle()
                .stroke(Color(hex: 0xC8A86A, alpha: 0.9), style: StrokeStyle(lineWidth: 1.5, dash: [3, 3]))
            SyncFlagMark()
                .stroke(Color(hex: 0x0F3D2E), style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
                .frame(width: 22, height: 22)
                .rotationEffect(.degrees(reduceMotion ? 0 : (spin ? -360 : 0)))
        }
        .rotationEffect(.degrees(reduceMotion ? 0 : (spin ? 360 : 0)))
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 6).repeatForever(autoreverses: false)) {
                spin = true
            }
        }
    }
}

private struct SyncFlagMark: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        var path = Path()
        path.move(to: CGPoint(x: 10 * s, y: 19 * s))
        path.addLine(to: CGPoint(x: 10 * s, y: 5 * s))
        path.addLine(to: CGPoint(x: 17 * s, y: 7.8 * s))
        path.addLine(to: CGPoint(x: 10 * s, y: 10.6 * s))
        path.move(to: CGPoint(x: 6.5 * s, y: 19.5 * s))
        path.addLine(to: CGPoint(x: 15.5 * s, y: 19.5 * s))
        return path.offsetBy(dx: rect.minX, dy: rect.minY)
    }
}

struct SyncCompactStages: View {
    let session: SyncSession?
    let progress: SyncAPIProgress

    var body: some View {
        let club = session?.clubName ?? progress.club ?? "tu club"
        let outcome = session?.outcome ?? .running
        let active = SyncStage.visible.first {
            SyncStepCopy.state(for: $0, progress: progress, outcome: outcome) == .active
                || SyncStepCopy.state(for: $0, progress: progress, outcome: outcome) == .error
        } ?? (outcome == .succeeded ? .save : .connect)
        let state = SyncStepCopy.state(for: active, progress: progress, outcome: outcome)
        let label: String = {
            if outcome == .failed {
                return session?.errorMessage ?? progress.error ?? "No se pudo actualizar"
            }
            if outcome == .succeeded || progress.stage == .done {
                return "Rondas guardadas"
            }
            return SyncStepCopy.label(stage: active, state: state, club: club, progress: progress)
        }()
        let count: String? = {
            if outcome == .succeeded || progress.stage == .done {
                if let n = progress.stats?.rounds ?? progress.listTotal { return "\(n) tarjetas" }
                return nil
            }
            return SyncStepCopy.counter(stage: active, state: state, progress: progress)
        }()

        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(GFont.ui(11, weight: .semibold))
                    .tracking(1.4)
                    .textCase(.uppercase)
                    .foregroundStyle(state == .error || outcome == .failed ? Color(hex: 0xC46A4E) : Color(hex: 0x5E6560))
                    .lineLimit(1)
                Spacer(minLength: 8)
                if let count {
                    Text(count)
                        .font(GFont.ui(11, weight: .semibold))
                        .foregroundStyle(Color(hex: 0xA88A50))
                        .tabular()
                        .accessibilityIdentifier("sync-progress-count")
                }
            }
            HStack(spacing: 4) {
                ForEach(SyncStage.visible, id: \.self) { stage in
                    let step = SyncStepCopy.state(for: stage, progress: progress, outcome: outcome)
                    Capsule()
                        .fill(segmentColor(step))
                        .frame(height: 3)
                        .accessibilityIdentifier("sync-step-\(stage.rawValue)")
                }
            }
        }
    }

    private func segmentColor(_ state: SyncStepState) -> Color {
        switch state {
        case .done: return Color(hex: 0xC8A86A)
        case .active: return Color(hex: 0xC8A86A, alpha: 0.28)
        case .error: return Color(hex: 0xC46A4E)
        case .todo: return Color(hex: 0xE6E2D8)
        }
    }
}

private struct SyncLiveCounters: View {
    let stats: SyncLiveStats
    let reduceMotion: Bool

    private var items: [(key: String, label: String, value: Int, kind: SyncMarkKind)] {
        [
            ("eagles", "Águilas", stats.eagles ?? 0, .eagle),
            ("birdies", "Birdies", stats.birdies ?? 0, .birdie),
            ("pars", "Pares", stats.pars ?? 0, .par),
            ("bogeys", "Bogeys", stats.bogeys ?? 0, .bogey),
            ("doubles", "Dobles+", stats.doublesPlus ?? 0, .double)
        ]
    }

    var body: some View {
        HStack(spacing: 6) {
            ForEach(items, id: \.key) { item in
                VStack(spacing: 3) {
                    SyncMarkGlyph(kind: item.kind)
                        .frame(width: 14, height: 14)
                    TickingInt(target: item.value, reduceMotion: reduceMotion)
                        .font(GFont.ui(22, weight: .semibold))
                        .tracking(-0.6)
                        .tabular()
                        .foregroundStyle(item.kind == .birdie ? Color(hex: 0xF7F5F0) : (item.kind == .eagle && item.value == 0 ? Color(hex: 0x9AA09B) : Color(hex: 0x121614)))
                    Text(item.label)
                        .font(GFont.ui(9.5, weight: .semibold))
                        .tracking(1)
                        .textCase(.uppercase)
                        .foregroundStyle(item.kind == .birdie ? Color(hex: 0xF7F5F0).opacity(0.62) : Color(hex: 0x9AA09B))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .background(item.kind == .birdie ? Color(hex: 0x0F3D2E) : Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .overlay {
                    if item.kind != .birdie {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(Color(hex: 0xE6E2D8), lineWidth: 1)
                    }
                }
                .accessibilityIdentifier("sync-stat-\(item.key)")
            }
        }
    }
}

private enum SyncMarkKind { case eagle, birdie, par, bogey, double }

private struct SyncMarkGlyph: View {
    let kind: SyncMarkKind

    var body: some View {
        Canvas { context, size in
            let mid = CGPoint(x: size.width / 2, y: size.height / 2)
            switch kind {
            case .eagle:
                strokeCircle(context, mid: mid, r: 6, color: Color(hex: 0xC8A86A))
                strokeCircle(context, mid: mid, r: 3.6, color: Color(hex: 0xC8A86A))
            case .birdie:
                strokeCircle(context, mid: mid, r: 6, color: Color(hex: 0xC8A86A))
            case .par:
                var path = Path()
                path.move(to: CGPoint(x: 3, y: mid.y))
                path.addLine(to: CGPoint(x: size.width - 3, y: mid.y))
                context.stroke(path, with: .color(Color(hex: 0x0F3D2E)), style: StrokeStyle(lineWidth: 1.4, lineCap: .round))
            case .bogey:
                let rect = CGRect(x: 1.5, y: 1.5, width: size.width - 3, height: size.height - 3)
                context.stroke(Path(roundedRect: rect, cornerRadius: 1), with: .color(Color(hex: 0x0F3D2E, alpha: 0.55)), lineWidth: 1.4)
            case .double:
                let outer = CGRect(x: 1, y: 1, width: size.width - 2, height: size.height - 2)
                let inner = CGRect(x: 3.6, y: 3.6, width: size.width - 7.2, height: size.height - 7.2)
                context.stroke(Path(roundedRect: outer, cornerRadius: 1), with: .color(Color(hex: 0x0F3D2E, alpha: 0.55)), lineWidth: 1.4)
                context.stroke(Path(roundedRect: inner, cornerRadius: 0.6), with: .color(Color(hex: 0x0F3D2E, alpha: 0.55)), lineWidth: 1.4)
            }
        }
    }

    private func strokeCircle(_ context: GraphicsContext, mid: CGPoint, r: CGFloat, color: Color) {
        var ctx = context
        ctx.stroke(Path(ellipseIn: CGRect(x: mid.x - r, y: mid.y - r, width: r * 2, height: r * 2)), with: .color(color), lineWidth: 1.4)
    }
}

private struct SyncLastCardView: View {
    let card: SyncLastCard

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Última tarjeta leída")
                        .font(GFont.ui(9.5, weight: .semibold))
                        .tracking(1.6)
                        .textCase(.uppercase)
                        .foregroundStyle(Color(hex: 0xA88A50))
                    Text(meta)
                        .font(GFont.ui(13, weight: .medium))
                        .foregroundStyle(Color(hex: 0x121614))
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    if let gross = card.gross {
                        Text("\(gross)")
                            .font(GFont.ui(26, weight: .semibold))
                            .tracking(-1)
                            .tabular()
                            .foregroundStyle(Color(hex: 0x0F3D2E))
                    }
                    if let toPar = card.toPar {
                        Text(FormatAR.signedInt(toPar))
                            .font(GFont.ui(12, weight: .semibold))
                            .tabular()
                            .foregroundStyle(Color(hex: 0x9AA09B))
                    }
                }
            }
            if card.otherCourse || card.holes.isEmpty {
                otherCourse
            } else {
                SyncMiniScorecard(holes: card.holes)
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .padding(.bottom, 10)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(alignment: .top) {
            LinearGradient(
                colors: [Color(hex: 0xA88A50), Color(hex: 0xE9CF95), Color(hex: 0xA88A50)],
                startPoint: .leading,
                endPoint: .trailing
            )
            .frame(height: 2)
        }
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(Color(hex: 0xE6E2D8), lineWidth: 1)
        }
        .accessibilityIdentifier("sync-last-card")
    }

    private var meta: String {
        var parts: [String] = []
        if let date = card.date { parts.append(FormatAR.syncDay(date)) }
        if let course = card.course, !course.isEmpty { parts.append(course) }
        if card.otherCourse, let club = card.club, !club.isEmpty { parts.append(club) }
        return parts.joined(separator: " · ")
    }

    private var otherCourse: some View {
        HStack(alignment: .top, spacing: 8) {
            Text("Otra cancha")
                .font(GFont.ui(9.5, weight: .semibold))
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Color(hex: 0x0F3D2E))
                .padding(.horizontal, 6)
                .padding(.vertical, 3)
                .background(Color(hex: 0xC8A86A, alpha: 0.22))
                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            Text("Sin detalle hoyo por hoyo · cuenta en rondas, días y mejor gross")
                .font(GFont.ui(12.5))
                .foregroundStyle(Color(hex: 0x5E6560))
        }
        .padding(.vertical, 4)
        .accessibilityIdentifier("sync-other-course")
    }
}

private struct SyncMiniScorecard: View {
    let holes: [SyncLastHole]

    var body: some View {
        let blocks = holes.count > 9 ? [Array(holes.prefix(9)), Array(holes.dropFirst(9).prefix(9))] : [holes]
        VStack(spacing: 10) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { index, block in
                nine(block, totalLabel: blocks.count > 1 ? (index == 0 ? "IDA" : "VUELTA") : "TOTAL")
            }
        }
    }

    private func nine(_ holes: [SyncLastHole], totalLabel: String) -> some View {
        let par = holes.compactMap(\.par).reduce(0, +)
        return VStack(spacing: 2) {
            row(label: "HOYO", values: holes.map { "\($0.number)" }, total: totalLabel, style: .caption)
            holeScores(holes)
            row(label: "PAR", values: holes.map { $0.par.map(String.init) ?? "" }, total: par > 0 ? "\(par)" : "", style: .par)
        }
        .overlay(alignment: .top) { rule.offset(y: 12) }
        .overlay { rule }
    }

    private enum RowStyle { case caption, par }

    private func row(label: String, values: [String], total: String, style: RowStyle) -> some View {
        HStack(spacing: 0) {
            Text(label)
                .font(GFont.ui(7.5, weight: .semibold))
                .tracking(1.2)
                .foregroundStyle(Color(hex: 0x9AA09B))
                .frame(width: 34, alignment: .leading)
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                Text(value)
                    .font(GFont.ui(style == .caption ? 8.5 : 9, weight: .medium))
                    .tabular()
                    .foregroundStyle(Color(hex: 0x9AA09B))
                    .frame(maxWidth: .infinity)
            }
            Text(total)
                .font(GFont.ui(style == .caption ? 7.5 : 9, weight: .semibold))
                .tracking(style == .caption ? 1.2 : 0)
                .tabular()
                .foregroundStyle(Color(hex: 0x9AA09B))
                .frame(width: 34)
        }
    }

    private func holeScores(_ holes: [SyncLastHole]) -> some View {
        let strokes = holes.compactMap(\.strokes).reduce(0, +)
        return HStack(spacing: 0) {
            Color.clear.frame(width: 34, height: 22)
            ForEach(holes) { hole in
                ZStack {
                    if let toPar = hole.toPar {
                        SyncHoleMark(toPar: toPar)
                    }
                    Text(hole.strokes.map(String.init) ?? "·")
                        .font(GFont.ui(12.5, weight: .semibold))
                        .tabular()
                        .foregroundStyle(Color(hex: 0x0F3D2E))
                }
                .frame(maxWidth: .infinity, minHeight: 22)
            }
            Text(strokes > 0 ? "\(strokes)" : "")
                .font(GFont.ui(15, weight: .semibold))
                .tabular()
                .foregroundStyle(Color(hex: 0x0F3D2E))
                .frame(width: 34)
        }
    }

    private var rule: some View {
        Color(hex: 0xE6E2D8).frame(height: 0.8)
    }
}

private struct SyncHoleMark: View {
    let toPar: Int

    var body: some View {
        Canvas { context, size in
            let mid = CGPoint(x: size.width / 2, y: size.height / 2)
            if toPar <= -2 {
                strokeCircle(context, mid: mid, r: 9.2, color: Color(hex: 0xC8A86A), width: 1.5)
                strokeCircle(context, mid: mid, r: 6.2, color: Color(hex: 0xC8A86A), width: 1.5)
            } else if toPar == -1 {
                strokeCircle(context, mid: mid, r: 9.2, color: Color(hex: 0xC8A86A), width: 1.5)
            } else if toPar == 1 {
                let rect = CGRect(x: mid.x - 8.5, y: mid.y - 8.5, width: 17, height: 17)
                context.stroke(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(Color(hex: 0x0F3D2E, alpha: 0.5)), lineWidth: 1.25)
            } else if toPar >= 2 {
                let outer = CGRect(x: mid.x - 9.5, y: mid.y - 9.5, width: 19, height: 19)
                let inner = CGRect(x: mid.x - 6.5, y: mid.y - 6.5, width: 13, height: 13)
                context.stroke(Path(roundedRect: outer, cornerRadius: 1.5), with: .color(Color(hex: 0x0F3D2E, alpha: 0.5)), lineWidth: 1.25)
                context.stroke(Path(roundedRect: inner, cornerRadius: 1), with: .color(Color(hex: 0x0F3D2E, alpha: 0.5)), lineWidth: 1.25)
            }
        }
        .frame(width: 22, height: 22)
    }

    private func strokeCircle(_ context: GraphicsContext, mid: CGPoint, r: CGFloat, color: Color, width: CGFloat) {
        context.stroke(Path(ellipseIn: CGRect(x: mid.x - r, y: mid.y - r, width: r * 2, height: r * 2)), with: .color(color), lineWidth: width)
    }
}

private struct SyncLiveFooter: View {
    let stats: SyncLiveStats
    let reduceMotion: Bool

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            kpi(stats.rounds ?? 0, "Rondas")
            kpi(stats.days ?? 0, "Días de juego")
            VStack(alignment: .leading, spacing: 2) {
                TickingInt(target: stats.bestGross ?? 0, reduceMotion: reduceMotion, placeholder: stats.bestGross == nil ? "–" : nil)
                    .font(GFont.ui(18, weight: .semibold))
                    .tabular()
                    .foregroundStyle(Color(hex: 0x121614))
                Text("Mejor gross")
                    .font(GFont.ui(8.5, weight: .semibold))
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(Color(hex: 0x9AA09B))
                if let date = stats.bestGrossDate {
                    Text([FormatAR.syncDay(date), stats.bestGrossCourse].compactMap { $0 }.joined(separator: " · "))
                        .font(GFont.ui(8.5, weight: .medium))
                        .foregroundStyle(Color(hex: 0x9AA09B))
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            SyncMonthStrip(months: stats.months)
        }
        .padding(.horizontal, 2)
    }

    private func kpi(_ value: Int, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            TickingInt(target: value, reduceMotion: reduceMotion)
                .font(GFont.ui(18, weight: .semibold))
                .tabular()
                .foregroundStyle(Color(hex: 0x121614))
            Text(label)
                .font(GFont.ui(8.5, weight: .semibold))
                .tracking(1.2)
                .textCase(.uppercase)
                .foregroundStyle(Color(hex: 0x9AA09B))
                .lineLimit(1)
        }
    }
}

private struct SyncMonthStrip: View {
    let months: [SyncMonthPoint]

    private let initials = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]

    var body: some View {
        let maxRounds = max(1, months.map(\.rounds).max() ?? 1)
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(months.prefix(12).enumerated()), id: \.offset) { _, point in
                let height: CGFloat = point.rounds > 0 ? 4 + 22 * CGFloat(point.rounds) / CGFloat(maxRounds) : 2
                VStack(spacing: 3) {
                    Spacer(minLength: 0)
                    Capsule()
                        .fill(point.rounds > 0 ? Color(hex: 0xC8A86A) : Color(hex: 0xE6E2D8))
                        .frame(width: 4, height: height)
                    Text(initial(for: point.month))
                        .font(GFont.ui(7.5, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x9AA09B))
                }
                .frame(width: 7, height: 38)
            }
        }
        .accessibilityLabel("Días de juego por mes")
    }

    private func initial(for month: String) -> String {
        let parts = month.split(separator: "-")
        if let last = parts.last, let value = Int(last), (1...12).contains(value) {
            return initials[value - 1]
        }
        return "·"
    }
}

struct TickingInt: View {
    let target: Int
    let reduceMotion: Bool
    var placeholder: String? = nil

    @State private var shown = 0

    var body: some View {
        Text(placeholder ?? "\(shown)")
            .task(id: target) { await tick() }
            .onAppear {
                shown = reduceMotion || RuntimeFlags.isUITesting ? target : shown
            }
    }

    private func tick() async {
        if reduceMotion || RuntimeFlags.isUITesting {
            shown = target
            return
        }
        while !Task.isCancelled, shown != target {
            let delta = target - shown
            let step = max(1, abs(delta) / 6)
            shown += delta > 0 ? min(step, delta) : max(-step, delta)
            try? await Task.sleep(for: .milliseconds(32))
        }
    }
}
