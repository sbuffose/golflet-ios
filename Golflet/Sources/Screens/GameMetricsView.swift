import SwiftUI

struct GameMetricsView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var tab: GameMetricsTab = .tee

    var body: some View {
        GScreen(id: "screen-metricas") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    tabs
                    period
                    gpsLine
                    content
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-metricas")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task { await model.refreshGameMetrics() }
    }

    private var metrics: GameMetrics {
        model.gameMetrics ?? .empty(range: model.statsRange.query)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "Tu juego")
            GTitle(text: "Métricas")
        }
    }

    private var tabs: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(GameMetricsTab.allCases) { item in
                    Button { tab = item } label: {
                        Text(item.title)
                            .font(GType.headline)
                            .foregroundStyle(tab == item ? p.onPrimary : p.ink)
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(tab == item ? p.primary : p.surface)
                            .clipShape(Capsule())
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("met-tab-\(item.rawValue)")
                    .accessibilityAddTraits(tab == item ? .isSelected : [])
                }
            }
        }
        .accessibilityIdentifier("met-tabs")
    }

    private var period: some View {
        HStack {
            RangeMenuButton(
                range: Binding(
                    get: { model.statsRange },
                    set: { model.setStatsRange($0) }
                ),
                count: model.gpsCoverage.n
            )
            Spacer(minLength: 8)
        }
    }

    private var gpsLine: some View {
        Text(model.gpsCoverageLine)
            .font(GType.label)
            .foregroundStyle(p.ink2)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("met-gps-count")
    }

    @ViewBuilder
    private var content: some View {
        switch tab {
        case .tee: teeBody
        case .hierros: ironBody
        case .gir: girBody
        case .putting: puttingBody
        }
    }

    @ViewBuilder
    private var teeBody: some View {
        if metrics.empty.tee {
            GameMetricsEmptyCard(tab: .tee)
        } else {
            let tee = metrics.tee
            metricPills([
                (GameMetricsCopy.percent(tee.fairwayPct), "Fairways"),
                (tee.avgCarryYd.map { "\($0)" } ?? "—", "yd promedio"),
                ("\(tee.drives)", "Drives")
            ])
            HStack {
                split("Izq.", tee.leftPct)
                split("Fairway", tee.fairwayPct)
                split("Der.", tee.rightPct)
            }
            .accessibilityIdentifier("met-tee-split")
            if tee.measured > 0 {
                GCard(radius: 18, padding: 12) {
                    VStack(alignment: .leading, spacing: 10) {
                        DriveDispersionMap(tee: tee)
                        if let mean = tee.avgLateralYd {
                            Text("Vista desde arriba. La línea dorada es tu promedio: \(Int(abs(mean).rounded())) yd a la \(mean >= 0 ? "derecha" : "izquierda"). La franja verde es una referencia de ±\(tee.bandYd) yd.")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
            if let note = teeTendency(tee) {
                Text(note)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            sectionTitle("Tus drives", count: tee.drives)
            shotList(Array(tee.shots.reversed())) { shot in
                ("\(shortDate(shot.date)) · Hoyo \(shot.hole)", "\(shot.course)\(shot.par.map { " · par \($0)" } ?? "")\(shot.carryYd.map { " · \($0) yd" } ?? "")", GameMetricsCopy.outcome(shot.outcome), shot.lateralYd.map { "\(Int(abs($0).rounded())) yd \($0 >= 0 ? "der." : "izq.")" })
            }
            startPlay
        }
    }

    @ViewBuilder
    private var ironBody: some View {
        if metrics.empty.approach {
            GameMetricsEmptyCard(tab: .hierros)
        } else {
            let bands = metrics.approach
            let known = bands.reduce(0) { $0 + $1.known }
            let on = bands.reduce(0) { total, band in
                guard let pct = band.greenPct else { return total }
                return total + Int((Double(pct) * Double(band.known) / 100).rounded())
            }
            let proxN = bands.reduce(0) { $0 + $1.proxN }
            let prox = proxN == 0 ? nil : Int((bands.reduce(0.0) { $0 + Double(( $1.avgProxYd ?? 0) * $1.proxN) } / Double(proxN)).rounded())
            metricPills([
                (GameMetricsCopy.percent(known == 0 ? nil : Int((Double(on) / Double(known) * 100).rounded())), "Al green"),
                (prox.map { "\($0) yd" } ?? "—", "A la bandera"),
                ("\(bands.reduce(0) { $0 + $1.shots })", "Golpes")
            ])
            VStack(spacing: 10) {
                ForEach(GameApproachBandID.allCases) { id in
                    let band = metrics.band(id: id.rawValue)
                    NavigationLink(value: MetricRoute.ironBand(id.rawValue)) {
                        GCard(radius: 18, padding: 14) {
                            HStack(spacing: 12) {
                                ApproachMissMap(shots: band.list, compact: true)
                                    .frame(width: 72, height: 72)
                                VStack(alignment: .leading, spacing: 4) {
                                    Text("\(id.label) yd")
                                        .font(GType.headline)
                                        .foregroundStyle(p.ink)
                                    Text(band.shots == 0 ? "Sin golpes todavía" : "\(GameMetricsCopy.percent(band.greenPct)) green · \(GameMetricsCopy.yards(band.avgProxYd))")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                Spacer(minLength: 4)
                                MetricChevron(color: p.ink3)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("met-iron-\(id.rawValue)")
                }
            }
            Text(GameMetricsCopy.flagHowApproach)
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .fixedSize(horizontal: false, vertical: true)
            startPlay
        }
    }

    @ViewBuilder
    private var girBody: some View {
        if metrics.empty.gir {
            GameMetricsEmptyCard(tab: .gir)
        } else {
            let gir = metrics.gir
            metricPills([
                (GameMetricsCopy.percent(gir.girPct), "GIR"),
                ("\(gir.holes)", "Hoyos"),
                ("\(gir.rounds.count)", gir.rounds.count == 1 ? "Ronda" : "Rondas")
            ])
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    ForEach([3, 4, 5], id: \.self) { par in
                        girParCard(par, gir.par(par))
                    }
                }
                VStack(spacing: 10) {
                    ForEach([3, 4, 5], id: \.self) { par in
                        girParCard(par, gir.par(par))
                    }
                }
            }
            Text("Tendencia")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if !gir.rounds.isEmpty {
                shotList(Array(gir.rounds.reversed())) { row in
                    (shortDate(row.date), "\(row.holes) hoyos", row.girPct.map { "\($0)%" } ?? "—", nil)
                }
            }
            if let trend = gir.trend {
                Text(trendNote(trend))
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text("La tendencia aparece con 4 rondas con GPS (tenés \(gir.rounds.count)).")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            sectionTitle("Dónde errás el green", count: gir.missed)
            if gir.missKnown > 0 {
                GCard(radius: 18, padding: 16) {
                    GameMissBars(counts: gir.miss, known: gir.missKnown)
                }
            } else {
                Text("Todavía no hay greens errados con el golpe siguiente marcado.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            startPlay
        }
    }

    @ViewBuilder
    private var puttingBody: some View {
        if metrics.empty.putts {
            GameMetricsEmptyCard(tab: .putting)
        } else {
            let pu = metrics.putts
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    puttTile("Putts por ronda", number(pu.perRound ?? pu.perRoundEst), pu.perRound != nil ? "\(pu.rounds.count) \(pu.rounds.count == 1 ? "ronda" : "rondas")" : (pu.perRoundEst != nil ? "estimado con \(pu.holes) hoyos" : ""))
                    puttTile("Putts por hoyo", number(pu.perHole, decimals: 2), "\(pu.holes) \(pu.holes == 1 ? "hoyo" : "hoyos")")
                }
                VStack(spacing: 10) {
                    puttTile("Putts por ronda", number(pu.perRound ?? pu.perRoundEst), pu.perRound != nil ? "\(pu.rounds.count) \(pu.rounds.count == 1 ? "ronda" : "rondas")" : "")
                    puttTile("Putts por hoyo", number(pu.perHole, decimals: 2), "\(pu.holes) \(pu.holes == 1 ? "hoyo" : "hoyos")")
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    puttTile("1 putt", GameMetricsCopy.percent(pu.onePuttPct), "de los hoyos")
                    puttTile("3 putts", GameMetricsCopy.percent(pu.threePuttPct), "de los hoyos")
                }
                VStack(spacing: 10) {
                    puttTile("1 putt", GameMetricsCopy.percent(pu.onePuttPct), "de los hoyos")
                    puttTile("3 putts", GameMetricsCopy.percent(pu.threePuttPct), "de los hoyos")
                }
            }
            Text("Primer putt")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if pu.firstPutt.holes > 0 {
                GCard(radius: 18, padding: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Distancia promedio a la bandera")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                        Text(GameMetricsCopy.yards(pu.firstPutt.avgYd))
                            .font(GType.statM)
                            .tabular()
                            .foregroundStyle(p.ink)
                            .minimumScaleFactor(0.6)
                            .lineLimit(1)
                            .accessibilityIdentifier("met-first-putt")
                        Text("\(pu.firstPutt.holes) \(pu.firstPutt.holes == 1 ? "hoyo" : "hoyos") con el primer putt marcado")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                        Text(GameMetricsCopy.flagHowPutting + (pu.firstPutt.atCenter > 0 ? " En \(pu.firstPutt.atCenter) \(pu.firstPutt.atCenter == 1 ? "hoyo" : "hoyos") se midió al centro del green." : ""))
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                shotList(pu.firstPutt.bins) { bin in
                    (bin.label, "\(bin.holes) \(bin.holes == 1 ? "hoyo" : "hoyos")", bin.avgPutts.map { number($0, decimals: 2) } ?? "—", "putts promedio")
                }
            } else {
                Text("Marcá el primer putt o contá los putts en el green para ver desde qué distancia putteás.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            startPlay
        }
    }

    private func girParCard(_ par: Int, _ value: GameGIRPar) -> some View {
        NavigationLink(value: MetricRoute.girPar(par)) {
            GCard(radius: 16, padding: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Par \(par)")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                    Text(GameMetricsCopy.percent(value.girPct))
                        .font(GType.statM)
                        .tabular()
                        .foregroundStyle(p.ink)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text("\(value.holes) \(value.holes == 1 ? "hoyo" : "hoyos")")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("met-gir-par-\(par)")
    }

    private func puttTile(_ title: String, _ value: String, _ footnote: String) -> some View {
        GCard(radius: 16, padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text(title)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(value)
                    .font(GType.statM)
                    .tabular()
                    .foregroundStyle(p.ink)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                if !footnote.isEmpty {
                    Text(footnote)
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func metricPills(_ items: [(String, String)]) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    pill(item.0, item.1, hero: items.first.map { $0.0 == item.0 } ?? false)
                }
            }
            VStack(alignment: .leading, spacing: 8) {
                ForEach(Array(items.enumerated()), id: \.offset) { _, item in
                    pill(item.0, item.1, hero: false)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private func pill(_ value: String, _ label: String, hero: Bool) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(GType.headline)
                .tabular()
                .foregroundStyle(hero ? p.onPrimary : p.ink)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(label)
                .font(GType.label)
                .foregroundStyle(hero ? p.onPrimary.opacity(0.7) : p.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(hero ? p.primary : p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func split(_ title: String, _ pct: Int?) -> some View {
        VStack(spacing: 4) {
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            Text(GameMetricsCopy.percent(pct))
                .font(GType.headline)
                .tabular()
                .foregroundStyle(p.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
        }
        .frame(maxWidth: .infinity)
    }

    private func sectionTitle(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
                .font(GType.section)
                .foregroundStyle(p.ink)
                .minimumScaleFactor(0.7)
                .lineLimit(2)
            Spacer(minLength: 8)
            Text("\(count)")
                .font(GType.label)
                .tabular()
                .foregroundStyle(p.ink2)
        }
    }

    private func shotList<T: Identifiable>(_ rows: [T], _ fields: (T) -> (String, String, String, String?)) -> some View {
        let items = rows.enumerated().map { index, row -> GameMetricsShotRow in
            let item = fields(row)
            return GameMetricsShotRow(
                id: "\(index)-\(String(describing: row.id))",
                title: item.0,
                subtitle: item.1,
                value: item.2,
                extra: item.3
            )
        }
        return GCard(radius: 18, padding: 14) {
            VStack(spacing: 10) {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    HStack(alignment: .top, spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item.title)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(item.subtitle)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 6)
                        VStack(alignment: .trailing, spacing: 2) {
                            Text(item.value)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .lineLimit(1)
                                .minimumScaleFactor(0.6)
                            if let extra = item.extra {
                                Text(extra)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.7)
                            }
                        }
                    }
                    if index < items.count - 1 { Hairline() }
                }
            }
        }
    }

    private var startPlay: some View {
        Button { model.showsPlay = true } label: {
            Text(GameMetricsCopy.startGPS)
                .font(GType.headline)
                .foregroundStyle(p.ink)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("met-start-gps")
    }

    private func teeTendency(_ tee: GameTeeMetrics) -> String? {
        switch tee.tendency {
        case "left":
            return "Errás más a la izquierda (\(GameMetricsCopy.percent(tee.leftPct)) de los drives) que a la derecha (\(GameMetricsCopy.percent(tee.rightPct)))."
        case "right":
            return "Errás más a la derecha (\(GameMetricsCopy.percent(tee.rightPct)) de los drives) que a la izquierda (\(GameMetricsCopy.percent(tee.leftPct)))."
        case "balanced":
            return "Tus errores se reparten parejo entre izquierda y derecha."
        default:
            return tee.known > 0 ? "Con \(tee.known) \(tee.known == 1 ? "drive" : "drives") todavía no hay una tendencia clara (hacen falta 5)." : nil
        }
    }

    private func trendNote(_ trend: GameGIRTrend) -> String {
        let word: String
        if abs(trend.delta) < 3 {
            word = "Venís parejo"
        } else if trend.delta > 0 {
            word = "Venís mejorando"
        } else {
            word = "Venís tomando menos greens"
        }
        return "\(word): \(trend.firstHalf)% en tus primeras rondas del período y \(trend.secondHalf)% en las últimas."
    }

    private func shortDate(_ raw: String) -> String {
        guard let date = DayStamp.parse(String(raw.prefix(10))) else { return raw }
        return FormatAR.syncDay(date)
    }

    private func number(_ value: Double?, decimals: Int = 1) -> String {
        guard let value else { return "—" }
        if decimals == 2 {
            return String(format: "%.\(decimals)f", value).replacingOccurrences(of: ".", with: ",")
        }
        return FormatAR.one(value)
    }
}

private struct GameMetricsShotRow: Identifiable {
    var id: String
    var title: String
    var subtitle: String
    var value: String
    var extra: String?
}

struct GameMetricsEmptyCard: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var tab: GameMetricsTab
    var title: String?
    var bodyText: String?

    var body: some View {
        GCard(radius: 22, padding: 18) {
            VStack(alignment: .leading, spacing: 10) {
                Text(title ?? GameMetricsCopy.emptyTitle(for: tab))
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(bodyText ?? GameMetricsCopy.emptyBody(for: tab))
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                Text(GameMetricsCopy.howToPlay)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("met-empty-how")
                Button { model.showsPlay = true } label: {
                    Text(GameMetricsCopy.startGPS)
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("met-empty-start")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("met-empty-\(tab.rawValue)")
        .overlay(alignment: .topLeading) {
            GProbe(id: "met-empty-\(tab.rawValue)", label: title ?? GameMetricsCopy.emptyTitle(for: tab))
                .allowsHitTesting(false)
        }
        .overlay {
            GProbe(id: "met-empty-how", label: GameMetricsCopy.howToPlay)
                .allowsHitTesting(false)
        }
    }
}

struct GameMetricsIronDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let bandID: String

    var body: some View {
        let id = GameApproachBandID(rawValue: bandID) ?? .y150
        let metrics = model.gameMetrics ?? .empty(range: model.statsRange.query)
        let band = metrics.band(id: id.rawValue)
        GScreen(id: "screen-metricas-hierros") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    GOverline(text: "Métricas · Hierros")
                    Text("Approach \(id.label) yd")
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                        .minimumScaleFactor(0.7)
                        .lineLimit(2)
                    bandTabs(current: id)
                    if band.shots == 0 {
                        GameMetricsEmptyCard(
                            tab: .hierros,
                            title: "Approach desde \(id.label) yd",
                            bodyText: "Cuántas veces llegás al green desde esta distancia, a cuántas yardas de la bandera quedás y para dónde errás."
                        )
                    } else {
                        HStack(spacing: 8) {
                            pill(GameMetricsCopy.percent(band.greenPct), "Al green")
                            pill(GameMetricsCopy.yards(band.avgProxYd), "A la bandera")
                            pill("\(band.shots)", "Golpes")
                        }
                        if band.list.contains(where: { $0.longYd != nil }) {
                            GCard(radius: 18, padding: 12) {
                                VStack(alignment: .leading, spacing: 10) {
                                    ApproachMissMap(shots: band.list, compact: false)
                                    Text("La bandera está en el centro; arriba es largo, abajo corto; anillos cada 10 yd. \(GameMetricsCopy.flagHow)")
                                        .font(GType.label)
                                        .foregroundStyle(p.ink3)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        Text("Golpes")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        GCard(radius: 18, padding: 14) {
                            VStack(spacing: 10) {
                                ForEach(Array(band.list.reversed().enumerated()), id: \.element.id) { index, shot in
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("\(shortDate(shot.date)) · Hoyo \(shot.hole)")
                                                .font(GType.headline)
                                                .foregroundStyle(p.ink)
                                            Text("\(shot.course) · desde \(shot.fromYd) yd")
                                                .font(GType.label)
                                                .foregroundStyle(p.ink2)
                                        }
                                        Spacer(minLength: 6)
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(shot.onGreen == true ? "Green" : shot.onGreen == false ? "Errado" : "—")
                                                .font(GType.headline)
                                                .foregroundStyle(p.ink)
                                            if let miss = shot.miss, shot.onGreen == false {
                                                Text(GameMetricsCopy.miss(miss))
                                                    .font(GType.label)
                                                    .foregroundStyle(p.ink2)
                                            }
                                            if let prox = shot.proxYd {
                                                Text("\(prox) yd")
                                                    .font(GType.label)
                                                    .tabular()
                                                    .foregroundStyle(p.ink2)
                                            }
                                            if !GameMetricsCopy.flagSource(shot.flagSource).isEmpty {
                                                Text(GameMetricsCopy.flagSource(shot.flagSource))
                                                    .font(GType.label)
                                                    .foregroundStyle(p.ink3)
                                            }
                                        }
                                    }
                                    if index < band.list.count - 1 { Hairline() }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-metricas-hierros")
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }

    private func bandTabs(current: GameApproachBandID) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(GameApproachBandID.allCases) { item in
                    NavigationLink(value: MetricRoute.ironBand(item.rawValue)) {
                        Text(item.label)
                            .font(GType.headline)
                            .foregroundStyle(item == current ? p.onPrimary : p.ink)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(item == current ? p.primary : p.surface)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("met-band-\(item.rawValue)")
                }
            }
        }
    }

    private func pill(_ value: String, _ label: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(value)
                .font(GType.headline)
                .tabular()
                .foregroundStyle(p.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.6)
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func shortDate(_ raw: String) -> String {
        guard let date = DayStamp.parse(String(raw.prefix(10))) else { return raw }
        return FormatAR.syncDay(date)
    }
}

struct GameMetricsGIRParView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let par: Int

    var body: some View {
        let metrics = model.gameMetrics ?? .empty(range: model.statsRange.query)
        let holes = metrics.gir.holesList.filter { $0.par == par }
        let missed = holes.filter { $0.gir == false }
        let known = missed.filter { $0.miss != nil }
        let miss = GameMissCounts(
            short: known.filter { $0.miss == "short" }.count,
            long: known.filter { $0.miss == "long" }.count,
            left: known.filter { $0.miss == "left" }.count,
            right: known.filter { $0.miss == "right" }.count
        )
        GScreen(id: "screen-metricas-gir") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 14) {
                    GOverline(text: "Métricas · GIR")
                    Text("GIR en par \(par)")
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                    HStack(spacing: 8) {
                        ForEach([3, 4, 5], id: \.self) { value in
                            NavigationLink(value: MetricRoute.girPar(value)) {
                                Text("Par \(value)")
                                    .font(GType.headline)
                                    .foregroundStyle(value == par ? p.onPrimary : p.ink)
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(value == par ? p.primary : p.surface)
                                    .clipShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("met-gir-filter-\(value)")
                        }
                    }
                    if holes.isEmpty {
                        GameMetricsEmptyCard(
                            tab: .gir,
                            title: "Greens en regulación en par \(par)",
                            bodyText: "Qué porcentaje de greens tomás en regulación en los par \(par), para dónde errás y hoyo por hoyo."
                        )
                    } else {
                        GCard(radius: 18, padding: 16) {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("GIR par \(par)")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                Text(GameMetricsCopy.percent(metrics.gir.par(par).girPct))
                                    .font(GType.statM)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                                Text("\(holes.count) hoyos · \(missed.count) errados")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        Text("Dónde errás el green")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        if known.isEmpty {
                            Text(missed.isEmpty ? "No erraste ningún green en regulación en estos hoyos." : "Todavía no hay greens errados con el golpe siguiente marcado.")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                                .fixedSize(horizontal: false, vertical: true)
                        } else {
                            GCard(radius: 18, padding: 16) {
                                GameMissBars(counts: miss, known: known.count)
                            }
                        }
                        Text("Hoyos")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        GCard(radius: 18, padding: 14) {
                            VStack(spacing: 10) {
                                ForEach(Array(holes.reversed().enumerated()), id: \.element.id) { index, hole in
                                    HStack(alignment: .top) {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text("\(shortDate(hole.date)) · Hoyo \(hole.hole)")
                                                .font(GType.headline)
                                                .foregroundStyle(p.ink)
                                            Text(hole.course + (hole.putts.map { " · \($0) \($0 == 1 ? "putt" : "putts")" } ?? ""))
                                                .font(GType.label)
                                                .foregroundStyle(p.ink2)
                                        }
                                        Spacer()
                                        VStack(alignment: .trailing, spacing: 2) {
                                            Text(hole.gir == true ? "En regulación" : "Errado")
                                                .font(GType.headline)
                                                .foregroundStyle(p.ink)
                                            if hole.gir == false, let miss = hole.miss {
                                                Text(GameMetricsCopy.miss(miss))
                                                    .font(GType.label)
                                                    .foregroundStyle(p.ink2)
                                            }
                                        }
                                    }
                                    if index < holes.count - 1 { Hairline() }
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-metricas-gir")
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }

    private func shortDate(_ raw: String) -> String {
        guard let date = DayStamp.parse(String(raw.prefix(10))) else { return raw }
        return FormatAR.syncDay(date)
    }
}
