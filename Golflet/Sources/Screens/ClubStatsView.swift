import SwiftUI

struct ClubStatsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let code: String
    @State private var detail: ClubStatsDetail?
    @State private var message: String?

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
        HStack(spacing: 8) {
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
            rate("Feo", club?.mishit)
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
                GCard(radius: 18, padding: 14) {
                    VStack(spacing: 10) {
                        ForEach(Array((detail?.recent ?? []).enumerated()), id: \.element.id) { index, shot in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(shot.date ?? "—")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                    Text("Hoyo \(shot.hole.map(String.init) ?? "—") · \(RecapCopy.result(shot.result))")
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                }
                                Spacer()
                                Text(shot.distanceYd.map { "\($0) yd" } ?? "—")
                                    .font(GType.headline)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                            }
                            .accessibilityIdentifier("club-shot-\(index)")
                            if index < (detail?.recent.count ?? 1) - 1 { Hairline() }
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        do {
            detail = try await model.api.clubStats(code: code)
        } catch {
            message = error.localizedDescription
        }
    }
}
