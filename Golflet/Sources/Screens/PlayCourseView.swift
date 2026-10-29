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
                Text("Elegí la cancha. Después caminás, ves la distancia y tocás Ya pegué.")
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
            ForEach(CourseGroups.make(courses)) { group in
                clubBlock(group)
            }
        }
    }

    @ViewBuilder
    private func clubBlock(_ group: ClubCourseGroup) -> some View {
        if group.isSingle, let course = group.courses.first {
            Button {
                Task { await start(course) }
            } label: {
                clubCard(group, showsChevron: true)
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("course-\(course.courseId)")
            .accessibilityLabel(group.clubName)
        } else {
            VStack(alignment: .leading, spacing: 8) {
                clubCard(group, showsChevron: false)
                    .accessibilityIdentifier("club-\(group.clubCode.isEmpty ? group.groupingKey : group.clubCode)")
                ForEach(group.courses) { course in
                    Button {
                        Task { await start(course) }
                    } label: {
                        GCard(radius: 16, padding: 12) {
                            HStack {
                                Text(CourseDisplay.courseTitle(course))
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                    .accessibilityIdentifier("course-\(course.courseId)")
                                Spacer()
                                MetricChevron(color: p.ink3)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("course-\(course.courseId)")
                    .accessibilityLabel(CourseDisplay.fullName(course))
                }
            }
        }
    }

    private func clubCard(_ group: ClubCourseGroup, showsChevron: Bool) -> some View {
        GCard(radius: 18, padding: 14) {
            clubHeader(group, showsChevron: showsChevron)
        }
    }

    private func clubHeader(_ group: ClubCourseGroup, showsChevron: Bool) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(group.clubName)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .lineLimit(2)
                if group.courseCount > 1 {
                    Text(group.courseCount == 2 ? "2 canchas" : "\(group.courseCount) canchas")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
            }
            Spacer()
            if let km = group.distanceKm {
                Text(km < 10 ? "\(FormatAR.one(km)) km" : "\(Int(km.rounded())) km")
                    .font(GType.label)
                    .tabular()
                    .foregroundStyle(p.ink3)
            }
            if showsChevron {
                MetricChevron(color: p.ink3)
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
        if let match = pool.first(where: { $0.courseId == hint })
            ?? pool.first(where: {
                ClubPhrase.matchesCourse(hint, name: CourseDisplay.courseTitle($0), club: CourseDisplay.clubTitle($0), courseId: $0.courseId)
                    || ClubPhrase.matchesCourse(hint, name: $0.course, club: $0.clubName, courseId: $0.courseId)
                    || ClubPhrase.matchesCourse(hint, name: $0.label, club: $0.clubName, courseId: $0.courseId)
                    || ClubPhrase.matchesCourse(hint, name: $0.displayName ?? "", club: $0.clubCode, courseId: $0.courseId)
            }) {
            await start(match)
        }
    }

    private func teeName(_ summary: GPSCourseSummary) -> String {
        CourseDisplay.human(summary.course, courseId: summary.courseId)
            ?? CourseDisplay.human(summary.courseLabel, courseId: summary.courseId)
            ?? summary.course
    }

    private func start(_ summary: GPSCourseSummary) async {
        do {
            let detail = try await model.api.gpsCourse(id: summary.courseId, lat: location.coordinate?.lat, lng: location.coordinate?.lng)
            CourseCache.save(detail: detail, strategy: try? await model.api.courseStrategy(courseKey: detail.courseKey, courseId: detail.courseId))
            let round = try await model.api.createLiveRound(courseId: summary.courseId, tee: teeName(summary))
            model.rememberPlay(course: detail, round: round)
            live = round
            selected = detail
        } catch {
            if let cached = CourseCache.load(courseId: summary.courseId) {
                let round = OfflinePlay.begin(course: cached.detail, tee: teeName(summary))
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
