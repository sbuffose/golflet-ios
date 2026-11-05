import SwiftUI

struct AcademiaView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-academia") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        GOverline(text: "Academia")
                        Spacer()
                        Button { model.showsClubs = true } label: { AvatarCircle(initials: model.profile.initials) }
                    }
                    Text("Academia").font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: "Qué practicar según tus golpes, lecciones cortas y los profes de tu club.")

                    NavigationLink { PracticePlanView() } label: {
                        planCard
                    }
                    .accessibilityIdentifier("academia-plan")

                    Text("Lecciones").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(LessonsCatalog.categories, id: \.0) { cat in
                                NavigationLink { LessonListView(category: cat.0) } label: {
                                    ProtoRow(
                                        title: cat.1,
                                        subtitle: LessonsCatalog.all.filter { $0.category == cat.0 }.map(\.title).joined(separator: " · ")
                                    )
                                }
                                .accessibilityIdentifier("academia-cat-\(cat.0)")
                            }
                        }
                    }

                    Text("Errores que se repiten").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            NavigationLink { SGCategoryView(category: .putt) } label: {
                                ProtoRow(title: "3 putts", subtitle: "2,1 por vuelta · 2,4 golpes")
                            }
                            NavigationLink { SGCategoryView(category: .app) } label: {
                                ProtoRow(title: "Doble en par 3", subtitle: "1 de cada 3")
                            }
                            NavigationLink { SGCategoryView(category: .tee) } label: {
                                ProtoRow(title: "Salida a la derecha", subtitle: "42% de los fallados")
                            }
                        }
                    }
                    DemoPill()

                    Text("Objetivos").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Text("Bajar a 10,9 antes de marzo").font(GType.headline)
                                Spacer()
                                Text("63%").font(GType.label).foregroundStyle(p.ink3)
                            }
                            ProgressView(value: 0.63)
                        }
                    }

                    Text("Profesores").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            ProtoRow(title: "Profesor del club A", subtitle: "Swing y hierros · ejemplo")
                            ProtoRow(title: "Profesora del club B", subtitle: "Juego corto y putt · ejemplo")
                        }
                    }
                    ExampleNote(text: "Profes de ejemplo.")
                }
                .padding(20)
                .padding(.bottom, 96)
            }
        }
        .accessibilityIdentifier("screen-academia")
    }

    private var planCard: some View {
        let weak = LessonsCatalog.weakCategories(from: ExampleRounds.all().map { StrokesGained.totals($0.shots) })
        let done = model.academiaPlanDone.count
        return ProtoCard {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text("Plan de práctica · esta semana").font(GType.overline).foregroundStyle(p.ink3)
                    Spacer()
                    Text("\(min(done, 9)) de 9").font(GType.label).foregroundStyle(p.ink3)
                }
                Text("Foco: \(weak[0].title) y \(weak[1].title)")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                ProgressView(value: Double(min(done, 9)), total: 9)
            }
        }
    }
}

struct LessonListView: View {
    @Environment(\.palette) private var p
    var category: String?
    var body: some View {
        GScreen(id: "screen-lecciones") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Lecciones").font(GType.largeTitle).foregroundStyle(p.ink)
                    ForEach(LessonsCatalog.categories.filter { category == nil || $0.0 == category }, id: \.0) { cat in
                        Text(cat.1).font(GType.section).foregroundStyle(p.ink)
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(LessonsCatalog.all.filter { $0.category == cat.0 }) { lesson in
                                    NavigationLink { LessonDetailView(lesson: lesson) } label: {
                                        ProtoRow(title: lesson.title, subtitle: "\(lesson.minutes) min · \(lesson.steps.count) pasos · \(lesson.drills.count) ejercicios")
                                    }
                                    .accessibilityIdentifier("lesson-\(lesson.id)")
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

struct LessonDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var lesson: GolfLesson
    var body: some View {
        GScreen(id: "screen-leccion") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text(lesson.title).font(GType.largeTitle).foregroundStyle(p.ink)
                    Text(lesson.why).font(GType.body).foregroundStyle(p.ink2)
                    Text("Paso a paso").font(GType.section)
                    ProtoCard {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(Array(lesson.steps.enumerated()), id: \.offset) { i, step in
                                HStack(alignment: .top, spacing: 10) {
                                    Text("\(i + 1)").font(GType.label).padding(6).background(p.surface2).clipShape(Circle())
                                    Text(step).font(GType.body).foregroundStyle(p.ink)
                                }
                            }
                        }
                    }
                    Text("Ejercicios").font(GType.section)
                    ProtoCard {
                        VStack(alignment: .leading, spacing: 10) {
                            ForEach(lesson.drills, id: \.id) { drill in
                                Button {
                                    model.togglePlanItem(drill.id)
                                } label: {
                                    HStack(alignment: .top, spacing: 10) {
                                        Image(systemName: model.academiaPlanDone.contains(drill.id) ? "checkmark.square.fill" : "square")
                                            .foregroundStyle(p.primary)
                                        VStack(alignment: .leading) {
                                            Text(drill.title).font(GType.headline).foregroundStyle(p.ink)
                                            Text(drill.detail).font(GType.label).foregroundStyle(p.ink3)
                                        }
                                        Spacer()
                                    }
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("drill-\(drill.id)")
                            }
                        }
                    }
                    ExampleNote(text: "Texto propio de Golflet. Lo que tildás queda en este dispositivo.")
                }
                .padding(20)
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct PracticePlanView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        let weak = LessonsCatalog.weakCategories(from: ExampleRounds.all().map { StrokesGained.totals($0.shots) })
        GScreen(id: "screen-plan-practica") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Plan de práctica").font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: "Esta semana. Armado con las dos categorías donde más golpes perdés.")
                    DemoPill()
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(weak) { cat in
                                NavigationLink { SGCategoryView(category: cat) } label: {
                                    ProtoRow(title: cat.title, subtitle: "Strokes gained por vuelta")
                                }
                            }
                        }
                    }
                    session("Sesión 1 · \(weak[0].title)", LessonsCatalog.all.filter { $0.category == weak[0].rawValue }.first)
                    session("Sesión 2 · \(weak[1].title)", LessonsCatalog.all.filter { $0.category == weak[1].rawValue }.first)
                    session("Sesión 3 · En la cancha", LessonsCatalog.lesson("est-1"))
                }
                .padding(20)
            }
        }
        .accessibilityIdentifier("screen-plan-practica")
        .safeAreaInset(edge: .top) { MetricBackBar() }
    }

    private func session(_ title: String, _ lesson: GolfLesson?) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(GType.section).foregroundStyle(p.ink)
            if let lesson {
                ProtoCard {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(lesson.drills, id: \.id) { drill in
                            Button { model.togglePlanItem(drill.id) } label: {
                                HStack {
                                    Image(systemName: model.academiaPlanDone.contains(drill.id) ? "checkmark.square.fill" : "square")
                                    VStack(alignment: .leading) {
                                        Text(drill.title).font(GType.headline)
                                        Text(drill.detail).font(GType.label).foregroundStyle(p.ink3)
                                    }
                                    Spacer()
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
        }
    }
}
