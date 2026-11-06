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

                    Text("Tus golpes").font(GType.section).foregroundStyle(p.ink)
                    if model.liveShots.isEmpty {
                        Text("Todavía no hay golpes. Jugá una vuelta con GPS.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("academia-empty")
                    } else {
                        let tot = StrokesGained.totals(model.liveShots)
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(SGCategory.allCases) { cat in
                                    NavigationLink { SGCategoryView(category: cat, shots: model.liveShots.filter { $0.category == cat }) } label: {
                                        ProtoRow(title: cat.title, trailing: StrokesGained.format(tot[cat]))
                                    }
                                }
                            }
                        }
                    }

                    Text("Profesores").font(GType.section).foregroundStyle(p.ink)
                    if model.profesores.isEmpty {
                        Text("Todavía no hay profesores. Sumalos desde Inicio.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    } else {
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(model.profesores) { profesor in
                                    ProtoRow(title: profesor.name, subtitle: profesor.locationsLine)
                                }
                            }
                        }
                    }
                }
                .padding(20)
                .padding(.bottom, 96)
            }
        }
        .accessibilityIdentifier("screen-academia")
    }

    private var planCard: some View {
        let shots = model.liveShots
        let done = model.academiaPlanDone.count
        return ProtoCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Plan de práctica").font(GType.overline).foregroundStyle(p.ink3)
                if shots.isEmpty {
                    Text("Todavía no hay golpes. Jugá una vuelta con GPS.")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                } else {
                    let weak = LessonsCatalog.weakCategories(from: [StrokesGained.totals(shots)])
                    Text("Foco: \(weak[0].title) y \(weak[1].title)")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("\(done) ejercicios hechos")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
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
                    Text("Lo que tildás queda en este teléfono.")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
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
        let shots = model.liveShots
        GScreen(id: "screen-plan-practica") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Plan de práctica").font(GType.largeTitle).foregroundStyle(p.ink)
                    if shots.isEmpty {
                        Text("Todavía no hay golpes. Jugá una vuelta con GPS.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("plan-empty")
                    } else {
                        let weak = LessonsCatalog.weakCategories(from: [StrokesGained.totals(shots)])
                        Text("Donde más golpes perdés: \(weak[0].title) y \(weak[1].title).")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                        session("Sesión 1 · \(weak[0].title)", LessonsCatalog.all.filter { $0.category == weak[0].rawValue }.first)
                        session("Sesión 2 · \(weak[1].title)", LessonsCatalog.all.filter { $0.category == weak[1].rawValue }.first)
                        session("Sesión 3 · En la cancha", LessonsCatalog.lesson("est-1"))
                    }
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
