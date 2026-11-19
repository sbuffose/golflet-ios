import SwiftUI

enum ClubShotUndo: Equatable {
    case restore(ShotRestore)
    case include(String)
}

struct ClubStatsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let code: String
    @State private var detail: ClubStatsDetail?
    @State private var message: String?
    @State private var pendingShot: ClubRecentShot?
    @State private var undo: ClubShotUndo?

    var body: some View {
        let club = detail?.club
        let bag = model.bag.first { ClubCode.code(for: $0.name) == code }
        GScreen(id: "screen-club-stats") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    header(club)
                    if let tendency = club?.tendency, !tendency.isEmpty {
                        GCard(fill: p.primary, radius: 22, padding: 16) {
                            Text(tendency)
                                .font(GType.body)
                                .foregroundStyle(p.onPrimary)
                        }
                    }
                    if let distance = club?.distance, distance.n > 0 {
                        distanceRow(distance)
                    } else {
                        manual(bag)
                    }
                    if let direction = club?.direction, direction.n > 0 {
                        directionCard(direction)
                    }
                    if let length = club?.lengthOnApproach, length.n > 0 {
                        lengthCard(length)
                    }
                    rates(club)
                    recent
                    if undo != nil {
                        Button("Deshacer") { Task { await undoLast() } }
                            .font(GType.headline)
                            .foregroundStyle(p.accent)
                            .accessibilityIdentifier("club-shot-undo")
                    }
                    if let message {
                        Text(message)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-club-stats")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task { await load() }
    }

    private func header(_ club: ClubStats?) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "Distancias por palo")
            GTitle(text: club?.label ?? ClubCode.label(for: code), size: 34)
            Text(club.map { "\($0.shots) golpes con GPS" } ?? "Sin golpes con GPS todavía")
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier("club-shots")
        }
    }

    private func distanceRow(_ block: ClubDistanceBlock) -> some View {
        AdaptiveTileGrid {
            stat("Mediana", block.medianYd)
            stat("Promedio", block.avgYd)
            stat("Máx.", block.maxYd)
            VStack(alignment: .leading, spacing: 4) {
                Text("Rango")
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                if block.rangeYd.count == 2 {
                    Text("\(block.rangeYd[0])–\(block.rangeYd[1])")
                        .font(GType.statM)
                        .tabular()
                        .foregroundStyle(p.ink)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)
                } else {
                    Text("—")
                        .font(GType.statM)
                        .foregroundStyle(p.ink3)
                }
                if let spread = block.spreadYd {
                    Text("±\(spread) yd")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(p.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .accessibilityIdentifier("club-distance")
    }

    private func stat(_ label: String, _ value: Int?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
            Text(value.map(String.init) ?? "—")
                .font(GType.statM)
                .tabular()
                .foregroundStyle(p.ink)
            Text("yd")
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func manual(_ bag: BagClub?) -> some View {
        GCard(radius: 18, padding: 16) {
            VStack(alignment: .leading, spacing: 8) {
                Text("Referencia de tu bolsa")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("Todavía no hay golpes con GPS para este palo. Usamos el carry y el total que cargaste a mano.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Carry")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                        Text(bag?.carry.map(String.init) ?? "—")
                            .font(GType.statM)
                            .tabular()
                            .foregroundStyle(p.ink)
                    }
                    Spacer()
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Total")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                        Text(bag?.total.map(String.init) ?? "—")
                            .font(GType.statM)
                            .tabular()
                            .foregroundStyle(p.ink)
                    }
                    Spacer()
                }
            }
        }
        .accessibilityIdentifier("club-manual")
    }

    private func directionCard(_ split: ClubSplit) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Dirección")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Text("\(split.n) marcados")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
            GeometryReader { geo in
                HStack(spacing: 0) {
                    bar(split.left, p.negative, geo.size.width)
                    bar(split.center, p.primary, geo.size.width)
                    bar(split.right, p.accent, geo.size.width)
                }
                .clipShape(Capsule())
            }
            .frame(height: 14)
            HStack {
                Text("\(split.left)% izquierda")
                Spacer()
                Text("\(split.center)% centro")
                Spacer()
                Text("\(split.right)% derecha")
            }
            .font(GType.label)
            .foregroundStyle(p.ink2)
        }
        .accessibilityIdentifier("club-direction")
    }

    private func bar(_ pct: Int, _ color: Color, _ width: CGFloat) -> some View {
        color.frame(width: max(width * CGFloat(pct) / 100, pct > 0 ? 6 : 0), height: 14)
    }

    private func lengthCard(_ split: ClubLengthSplit) -> some View {
        HStack(spacing: 8) {
            lengthCell("Corto", split.short)
            lengthCell("Justo", split.on)
            lengthCell("Largo", split.long)
        }
        .accessibilityIdentifier("club-length")
    }

    private func lengthCell(_ label: String, _ pct: Int) -> some View {
        GCard(radius: 16, padding: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .lineLimit(1)
                Text("\(pct)%")
                    .font(GType.statM)
                    .tabular()
                    .lineLimit(1)
                    .foregroundStyle(p.ink)
            }
        }
    }

    private func rates(_ club: ClubStats?) -> some View {
        HStack(spacing: 8) {
            rate("Greens", club?.greensHit)
            rate("Fairways", club?.fairwaysHit)
            rate("Rough", club?.mishit)
        }
        .accessibilityIdentifier("club-rates")
    }

    private func rate(_ label: String, _ value: ClubRate?) -> some View {
        GCard(radius: 16, padding: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .lineLimit(1)
                Text(value.map { "\($0.pct)%" } ?? "—")
                    .font(GType.statM)
                    .tabular()
                    .lineLimit(1)
                    .foregroundStyle(p.ink)
                Text(value.map { "\($0.hit) de \($0.of)" } ?? "Sin datos")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .lineLimit(1)
            }
        }
    }

    private var recent: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Últimos golpes")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if detail?.recent.isEmpty != false {
                Text("Todavía no hay golpes guardados con este palo.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            } else {
                VStack(spacing: 0) {
                    ForEach(Array((detail?.recent ?? []).enumerated()), id: \.element.id) { index, shot in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("\(shot.hole.map(String.init) ?? "—") · \(shotDay(shot.date))")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                if let result = shot.result, !result.isEmpty {
                                    Text(RecapCopy.result(result))
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                }
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { openRound(shot) }
                            .accessibilityElement(children: .combine)
                            .accessibilityIdentifier("club-shot-\(index)")
                            Spacer()
                            Text(shot.distanceYd.map { "\($0) yd" } ?? "—")
                                .font(GType.headline)
                                .tabular()
                                .foregroundStyle(p.ink)
                            Button("Borrar") { pendingShot = shot }
                                .font(GType.label)
                                .buttonStyle(.plain)
                                .foregroundStyle(p.accent)
                                .accessibilityIdentifier("club-shot-delete-\(index)")
                        }
                        .padding(.vertical, 8)
                    }
                }
                .confirmationDialog("Este golpe", isPresented: Binding(get: { pendingShot != nil }, set: { if !$0 { pendingShot = nil } }), titleVisibility: .visible) {
                    Button("Borrar", role: .destructive) { Task { await commit(delete: true) } }
                    Button("Excluir de las distancias") { Task { await commit(delete: false) } }
                    Button("Cancelar") { pendingShot = nil }
                        .accessibilityIdentifier("shot-delete-cancel")
                } message: {
                    Text(confirmCopy)
                }
            }
        }
    }

    private func shotDay(_ raw: String?) -> String {
        guard let raw else { return "—" }
        let parts = raw.prefix(10).split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, parts[1] >= 1, parts[1] <= 12 else { return raw }
        return "\(parts[2]) \(FormatAR.webMonths[parts[1] - 1])"
    }

    private var confirmCopy: String {
        guard let shot = pendingShot else { return "" }
        return ShotEditCopy.deleteLine(shotsOnHole: shot.shotsOnHole, postedStrokes: shot.postedStrokes) + "\n" + ShotEditCopy.excludeLine
    }

    private func openRound(_ shot: ClubRecentShot) {
        guard let id = shot.roundId, let round = model.rounds.first(where: { $0.roundId == id }) else { return }
        model.presentedRound = round
    }

    private func commit(delete: Bool) async {
        guard let shot = pendingShot else { return }
        pendingShot = nil
        do {
            if delete {
                if let restored = try await model.api.deleteShot(id: shot.id) {
                    undo = .restore(restored)
                }
            } else {
                try await model.api.excludeShot(id: shot.id, kind: "excluded")
                undo = .include(shot.id)
            }
            await load()
        } catch {
            message = error.localizedDescription
        }
    }

    private func undoLast() async {
        let action = undo
        undo = nil
        switch action {
        case .restore(let shot): try? await model.api.restoreShot(shot)
        case .include(let id): try? await model.api.excludeShot(id: id, kind: nil)
        case nil: break
        }
        await load()
    }

    private func load() async {
        do {
            detail = try await model.api.clubStats(code: code)
        } catch {
            message = error.localizedDescription
        }
    }
}
