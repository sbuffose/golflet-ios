import SwiftUI

struct SGHomeView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        let mine = model.liveShotList
        GScreen(id: "screen-sg") {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Strokes gained").font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: "Cuántos golpes ganás o perdés contra el promedio del PGA Tour (Mark Broadie, 2011). Sale de los golpes que marcás en el hoyo.")

                    if mine.isEmpty {
                        ProtoCard {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("Todavía no hay golpes marcados").font(GType.headline)
                                ExampleNote(text: "Marcá la vuelta en el hoyo. Acá no hay números de ejemplo.")
                            }
                        }
                        .accessibilityIdentifier("sg-empty")
                    } else {
                        let tot = StrokesGained.totals(mine)
                        NavigationLink { SGRoundView(title: "Tu vuelta", shots: mine) } label: {
                            ProtoHero {
                                VStack(alignment: .leading) {
                                    Text("Tu vuelta").font(GType.overline).opacity(0.75)
                                    Text(StrokesGained.format(tot.tot)).font(GType.statL).tabular()
                                }
                            }
                        }
                        Text("Por categoría").font(GType.section)
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(SGCategory.allCases) { cat in
                                    let shots = mine.filter { $0.category == cat }
                                    NavigationLink { SGCategoryView(category: cat, shots: shots) } label: {
                                        ProtoRow(title: cat.title, trailing: StrokesGained.format(shots.map(\.sg).reduce(0, +)))
                                    }
                                    .accessibilityIdentifier("sg-cat-\(cat.rawValue)")
                                }
                            }
                        }
                    }
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
    var body: some View {
        let tot = StrokesGained.totals(shots)
        GScreen(id: "screen-sg-ronda") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(title).font(GType.largeTitle).foregroundStyle(p.ink)
                    ProtoHero {
                        VStack(alignment: .leading) {
                            Text("Strokes gained total").font(GType.overline).opacity(0.75)
                            Text(StrokesGained.format(tot.tot)).font(GType.statL).tabular()
                        }
                    }
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(SGCategory.allCases) { cat in
                                NavigationLink { SGCategoryView(category: cat, shots: shots.filter { $0.category == cat }) } label: {
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
                                    NavigationLink { SGHoleView(hole: n, shots: xs) } label: {
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
    var body: some View {
        GScreen(id: "screen-sg-hoyo") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Hoyo \(hole)").font(GType.largeTitle)
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
    var shots: [SGShot] = []
    var body: some View {
        let tot = shots.map(\.sg).reduce(0, +)
        GScreen(id: "screen-sg-cat") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(category.title).font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: category.detail + ".")
                    if shots.isEmpty {
                        ProtoCard {
                            Text("No hay golpes de \(category.title.lowercased()) en tus vueltas marcadas.")
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                        .accessibilityIdentifier("sg-cat-empty")
                    } else {
                        ProtoHero {
                            VStack(alignment: .leading) {
                                Text("Strokes gained").font(GType.overline).opacity(0.75)
                                Text(StrokesGained.format(tot)).font(GType.statL).tabular()
                                Text("\(shots.count) golpes").font(GType.label).opacity(0.8)
                            }
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
    var body: some View {
        let tot = StrokesGained.totals(shots)
        NavigationLink { SGHomeView() } label: {
            ProtoCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Strokes gained · última vuelta").font(GType.overline).foregroundStyle(p.ink3)
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
