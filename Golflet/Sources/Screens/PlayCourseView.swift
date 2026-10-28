import SwiftUI

struct PlayCourseView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    @State private var location = PlayLocation()
    @State private var list: GPSCourseList?
    @State private var selected: GPSCourseDetail?
    @State private var live: LiveRound?
    @State private var message: String?

    var body: some View {
        GScreen(id: "screen-play-courses") {
            VStack(alignment: .leading, spacing: 16) {
                header
                if location.denied {
                    Text("Golflet necesita tu ubicación mientras jugás para calcular la distancia al green y guardar cada golpe.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                if let message {
                    Text(message)
                        .font(GType.label)
                        .foregroundStyle(p.negative)
                }
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 18) {
                        if let nearby = list?.nearby, !nearby.isEmpty {
                            section("Más cerca", nearby)
                        }
                        if let mine = list?.courses, !mine.isEmpty {
                            section("Tus canchas", mine)
                        }
                    }
                    .padding(.bottom, 28)
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .accessibilityIdentifier("screen-play-courses")
        .navigationDestination(item: $selected) { course in
            if let live {
                PlayHoleView(course: course, liveRound: live)
            }
        }
        .task {
            location.start()
            await loadCourses()
            await startPendingHint()
        }
        .onChange(of: location.coordinate?.lat) { _, _ in
            Task { await loadCourses() }
        }
        .onDisappear { location.stop() }
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 6) {
                GOverline(text: "Ronda con GPS")
                GTitle(text: "Jugar", size: 34)
                Text("Elegí la cancha. Después caminás, ves la distancia y tocás Pegué.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.ink2)
                    .frame(width: 32, height: 32)
                    .background(p.surface)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("play-close")
        }
    }

    private func section(_ title: String, _ courses: [GPSCourseSummary]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(GType.section)
                .foregroundStyle(p.ink)
            ForEach(courses) { course in
                Button {
                    Task { await start(course) }
                } label: {
                    GCard(radius: 18, padding: 14) {
                        HStack {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(course.label)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text(course.clubName)
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                                    .lineLimit(1)
                            }
                            Spacer()
                            if let km = course.distanceKm {
                                Text(km < 10 ? "\(FormatAR.one(km)) km" : "\(Int(km.rounded())) km")
                                    .font(GType.label)
                                    .tabular()
                                    .foregroundStyle(p.ink3)
                            }
                            MetricChevron(color: p.ink3)
                        }
                    }
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("course-\(course.courseId)")
            }
        }
    }

    private func loadCourses() async {
        do {
            let remote = try await model.api.gpsCourses(lat: location.coordinate?.lat, lng: location.coordinate?.lng)
            list = remote
            CourseCache.saveList(remote)
        } catch {
            if let cached = CourseCache.loadList() {
                list = cached
                message = "Sin red. Mostramos las canchas que ya tenías cacheadas."
            } else {
                message = error.localizedDescription
            }
        }
    }

    private func startPendingHint() async {
        guard let hint = model.pendingCourseHint, !hint.isEmpty else { return }
        model.pendingCourseHint = nil
        let pool = (list?.nearby ?? []) + (list?.courses ?? [])
        if let match = pool.first(where: {
            ClubPhrase.matchesCourse(hint, name: $0.course, club: $0.clubName, courseId: $0.courseId)
                || ClubPhrase.matchesCourse(hint, name: $0.label, club: $0.clubName, courseId: $0.courseId)
        }) {
            await start(match)
        }
    }

    private func start(_ summary: GPSCourseSummary) async {
        do {
            let detail = try await model.api.gpsCourse(id: summary.courseId, lat: location.coordinate?.lat, lng: location.coordinate?.lng)
            CourseCache.save(detail: detail, strategy: try? await model.api.courseStrategy(courseKey: detail.courseKey, courseId: detail.courseId))
            let round = try await model.api.createLiveRound(courseId: summary.courseId, tee: summary.course)
            model.rememberPlay(course: detail, round: round)
            live = round
            selected = detail
        } catch {
            if let cached = CourseCache.load(courseId: summary.courseId) {
                let round = OfflinePlay.begin(course: cached.detail, tee: summary.course)
                model.rememberPlay(course: cached.detail, round: round)
                live = round
                selected = cached.detail
                message = "Sin red. Jugás con la cancha cacheada; los golpes se encolan."
            } else {
                message = error.localizedDescription
            }
        }
    }
}
