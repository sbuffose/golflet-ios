import SwiftUI

struct SGHomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        let examples = ExampleRounds.all()
        let mine = model.liveShotList
        GScreen(id: "screen-sg") {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Strokes gained").font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: "Cuántos golpes ganás o perdés contra el promedio del PGA Tour (Mark Broadie, 2011). Sale de los golpes que marcás en el hoyo.")

                    if mine.isEmpty {
                        ProtoCard {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Marcá tus golpes y esto se llena con los tuyos").font(GType.headline)
                                ExampleNote(text: "En el hoyo, «Registrar» (modo Mejorar). Mientras tanto, abajo ves vueltas de ejemplo.")
                            }
                        }
                    } else {
                        let tot = StrokesGained.totals(mine)
                        NavigationLink { SGRoundView(title: "Tu vuelta", shots: mine, example: false) } label: {
                            ProtoHero {
                                VStack(alignment: .leading) {
                                    Text("Tu vuelta").font(GType.overline).opacity(0.75)
                                    Text(StrokesGained.format(tot.tot)).font(GType.statL).tabular()
                                }
                            }
                        }
                    }

                    Text("Tendencia · últimas 6 vueltas").font(GType.section)
                    DemoPill()
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(SGCategory.allCases) { cat in
                                let avg = examples.map { StrokesGained.totals($0.shots)[cat] }.reduce(0, +) / Double(examples.count)
                                NavigationLink { SGCategoryView(category: cat) } label: {
                                    ProtoRow(title: cat.title, trailing: StrokesGained.format(avg))
                                }
                                .accessibilityIdentifier("sg-cat-\(cat.rawValue)")
                            }
                        }
                    }

                    Text("Vueltas").font(GType.section)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(examples.reversed(), id: \.id) { r in
                                let tot = StrokesGained.totals(r.shots)
                                NavigationLink { SGRoundView(title: r.title, shots: r.shots, example: true) } label: {
                                    ProtoRow(title: r.title, trailing: StrokesGained.format(tot.tot))
                                }
                                .accessibilityIdentifier("sg-round-\(r.id)")
                            }
                        }
                    }
                    ExampleNote(text: "Las vueltas de ejemplo son simuladas sobre los largos reales de la Cancha Azul; no son de nadie. Base: Broadie 2011.")
                    ProtoCard {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Contra tu nivel de hándicap").font(GType.headline)
                            ExampleNote(text: "Todavía no: necesitamos una tabla publicada por hándicap para no inventar números.")
                        }
                    }
                }
                .padding(20)
            }
        }
        .accessibilityIdentifier("screen-sg")
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }
}

struct SGRoundView: View {
    @Environment(\.palette) private var p
    var title: String
    var shots: [SGShot]
    var example: Bool
    var body: some View {
        let tot = StrokesGained.totals(shots)
        GScreen(id: "screen-sg-ronda") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(title).font(GType.largeTitle).foregroundStyle(p.ink)
                    if example { DemoPill() }
                    ProtoHero {
                        VStack(alignment: .leading) {
                            Text("Strokes gained total").font(GType.overline).opacity(0.75)
                            Text(StrokesGained.format(tot.tot)).font(GType.statL).tabular()
                        }
                    }
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(SGCategory.allCases) { cat in
                                NavigationLink { SGCategoryView(category: cat) } label: {
                                    ProtoRow(title: cat.title, trailing: StrokesGained.format(tot[cat]))
                                }
                            }
                        }
                    }
                    Text("Hoyo por hoyo").font(GType.section)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(1...18, id: \.self) { n in
                                let xs = shots.filter { $0.hole == n }
                                if !xs.isEmpty {
                                    let s = xs.map(\.sg).reduce(0, +)
                                    NavigationLink { SGHoleView(hole: n, shots: xs, example: example) } label: {
                                        ProtoRow(title: "Hoyo \(n) · Par \(AzulCourse.hole(n).par)", trailing: StrokesGained.format(s))
                                    }
                                }
                            }
                        }
                    }
                    ExampleNote(text: "Base: PGA Tour (Broadie, 2011). Un approach desde 150 m al fairway se interpola en la Tabla 9.")
                }
                .padding(20)
            }
        }
    }
}

struct SGHoleView: View {
    @Environment(\.palette) private var p
    var hole: Int
    var shots: [SGShot]
    var example: Bool
    var body: some View {
        GScreen(id: "screen-sg-hoyo") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Hoyo \(hole)").font(GType.largeTitle)
                    if example { DemoPill() }
                    ProtoCard {
                        VStack(spacing: 10) {
                            ForEach(shots) { x in
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text("\(x.category.title) · \(x.startLie.rawValue) \(Int(x.startM.rounded())) m → \(x.holed ? "adentro" : "\(x.endLie.rawValue) \(Int(x.endM.rounded())) m")")
                                            .font(GType.headline)
                                        Text("Esperado: \(FormatAR.one(StrokesGained.expected(lie: x.startLie, meters: x.startM))) → \(x.holed ? "0" : FormatAR.one(StrokesGained.expected(lie: x.endLie, meters: x.endM))) golpes")
                                            .font(GType.label).foregroundStyle(p.ink3)
                                    }
                                    Spacer()
                                    Text(StrokesGained.format(x.sg)).font(GType.headline).tabular()
                                        .foregroundStyle(x.sg >= 0 ? p.positive : p.negative)
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
        }
    }
}

struct SGCategoryView: View {
    @Environment(\.palette) private var p
    var category: SGCategory
    var body: some View {
        let shots = ExampleRounds.all().flatMap(\.shots).filter { $0.category == category }
        let tot = shots.map(\.sg).reduce(0, +)
        let per = tot / 6
        GScreen(id: "screen-sg-cat") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(category.title).font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: category.detail + ".")
                    DemoPill()
                    ProtoHero {
                        VStack(alignment: .leading) {
                            Text("Strokes gained por vuelta").font(GType.overline).opacity(0.75)
                            Text(StrokesGained.format(per)).font(GType.statL).tabular()
                            Text("\(shots.count) golpes · total \(StrokesGained.format(tot))").font(GType.label).opacity(0.8)
                        }
                    }
                    Text("Para mejorar").font(GType.section)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(LessonsCatalog.all.filter { $0.category == category.rawValue }) { lesson in
                                NavigationLink { LessonDetailView(lesson: lesson) } label: {
                                    ProtoRow(title: "Lección: \(lesson.title)", subtitle: "\(lesson.minutes) min")
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
        }
    }
}

struct SGCard: View {
    @Environment(\.palette) private var p
    var shots: [SGShot]
    var example: Bool
    var body: some View {
        let tot = StrokesGained.totals(shots)
        NavigationLink { SGHomeView() } label: {
            ProtoCard {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        Text("Strokes gained · última vuelta").font(GType.overline).foregroundStyle(p.ink3)
                        Spacer()
                        if example { DemoPill() }
                    }
                    HStack {
                        ForEach(SGCategory.allCases) { cat in
                            VStack(alignment: .leading) {
                                Text(cat.title).font(GType.label).foregroundStyle(p.ink3)
                                Text(StrokesGained.format(tot[cat]))
                                    .font(GType.headline)
                                    .foregroundStyle(tot[cat] >= 0 ? p.positive : p.negative)
                                    .tabular()
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityIdentifier("sg-tile-\(cat.rawValue)")
                        }
                    }
                    Text("Contra el promedio del PGA Tour · tocá para ver el detalle ›")
                        .font(GType.label).foregroundStyle(p.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("sg-card")
    }
}
