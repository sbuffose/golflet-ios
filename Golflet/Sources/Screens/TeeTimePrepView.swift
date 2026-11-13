import SwiftUI

struct TeeCourseMatch: Equatable, Identifiable, Sendable {
    var id: String { key }
    var name: String
    var key: String
    var courseId: String
}

struct TeePlace: Equatable, Sendable {
    var canchaTitle: String
    var strategyCourses: [TeeCourseMatch]

    var hasCourse: Bool { !strategyCourses.isEmpty }
}

/// La cancha sale solo si la reserva la nombra. Una tarjeta anterior o las dos canchas del club no la completan.
enum TeeCourseResolve {
    static func place(booking: TeeTime, rounds: [Round], courses: [Course]) -> TeePlace {
        _ = rounds
        _ = courses
        let explicit = trim(booking.course)
        if !explicit.isEmpty, fold(explicit) != fold(booking.clubName) {
            return TeePlace(canchaTitle: explicit, strategyCourses: [match(name: explicit)])
        }
        return TeePlace(canchaTitle: "La reserva no especifica la cancha.", strategyCourses: [])
    }

    private static func match(name: String, key: String? = nil, courseId: String? = nil) -> TeeCourseMatch {
        TeeCourseMatch(
            name: name,
            key: key ?? CourseIdentity.key(for: name),
            courseId: courseId ?? CourseIdentity.id(for: name)
        )
    }

    private static func trim(_ value: String) -> String {
        value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func fold(_ value: String) -> String {
        trim(value).folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
    }
}

enum TeeTimePrep {
    static func canchaLine(course: String) -> String {
        let name = course.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "La reserva no trae el nombre de la cancha." }
        return name
    }

    static func forecastLine(_ forecast: String?) -> String {
        let text = forecast?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if text.isEmpty { return "Este horario no trae pronóstico." }
        return text
    }

    /// Numbers only when the tee time sent them. A text forecast is shown as-is.
    static func forecastText(booking: TeeTime, rounds: [Round], bag: [BagClub], holes: [GPSHole] = []) -> String {
        let report = WeatherPlay.report(booking: booking, rounds: rounds, bag: bag, holes: holes)
        if report.hasNumbers {
            let lines = report.lines.filter { !$0.hasPrefix("Horario:") }
            if !lines.isEmpty { return lines.joined(separator: "\n") }
        }
        return forecastLine(booking.forecast)
    }

    static func strategyLine(course: String, strategy: CourseStrategy?) -> String {
        let name = course.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "Sin el nombre de la cancha no hay estrategia para preparar." }
        return strategyBody(strategy) ?? "Todavía no hay estrategia cargada para esta cancha."
    }

    static func strategySummary(place: TeePlace, strategy: CourseStrategy?) -> String {
        if place.strategyCourses.isEmpty {
            return "Sin el nombre de la cancha no hay estrategia para preparar."
        }
        if place.strategyCourses.count > 1 {
            let names = place.strategyCourses.map(\.name).joined(separator: " o ")
            return "El club tiene \(names). Elegí cuál vas a jugar."
        }
        return strategyLine(course: place.strategyCourses[0].name, strategy: strategy)
    }

    private static func strategyBody(_ strategy: CourseStrategy?) -> String? {
        let overview = strategy?.overview?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if !overview.isEmpty { return overview }
        let plans = (strategy?.holes ?? []).compactMap { hole -> String? in
            let title = hole.planTitle?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !title.isEmpty else { return nil }
            return "Hoyo \(hole.hole) · \(title)"
        }
        if plans.isEmpty { return nil }
        return plans.prefix(3).joined(separator: "\n")
    }
}

struct TeeTimePrepView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let booking: TeeTime
    @State private var strategy: CourseStrategy?
    @State private var liveForecast: String?
    @State private var gpsHoles: [GPSHole] = []

    private var shown: TeeTime {
        model.teeTimes.first { $0.id == booking.id } ?? booking
    }

    private var place: TeePlace {
        TeeCourseResolve.place(booking: shown, rounds: model.rounds, courses: model.courses)
    }

    var body: some View {
        GScreen(id: "screen-tee-prep") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    GCard(fill: p.primary, radius: 24, padding: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(relativeDay.uppercased())
                                .font(GType.overline)
                                .foregroundStyle(p.onPrimary.opacity(0.6))
                            Text(teeClock)
                                .font(GType.largeTitle)
                                .tabular()
                                .foregroundStyle(p.onPrimary)
                            Text(teeDateLine)
                                .font(GType.body)
                                .foregroundStyle(p.onPrimary.opacity(0.75))
                            Text(shown.clubName)
                                .font(GType.headline)
                                .foregroundStyle(p.onPrimary)
                            Text(place.hasCourse ? "Cancha \(place.canchaTitle)" : place.canchaTitle)
                                .font(GType.label)
                                .foregroundStyle(p.onPrimary.opacity(0.7))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    companionsBlock
                    playingHandicap
                    VStack(alignment: .leading, spacing: 6) {
                        Text(shown.chipWhen)
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                            .accessibilityHidden(true)
                        Button {
                            Task { await model.refreshReservation(id: booking.id) }
                        } label: {
                            Text("Actualizar reserva")
                                .font(GType.headline)
                        }
                        .disabled(model.bookingBusy)
                        .accessibilityIdentifier("refresh-booking")
                        if !model.bookingNote.isEmpty {
                            Text(model.bookingNote)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                                .accessibilityIdentifier("tee-prep-booking-note")
                        }
                    }
                    if let job = model.scorecardFetches.first(where: { $0.teeTimeId == booking.id }) {
                        block("Tarjeta del club", job.label, "tee-prep-scorecard")
                    }
                    block("Cancha", place.canchaTitle, "tee-prep-cancha")
                    block(
                        "Pronóstico",
                        liveForecast ?? TeeTimePrep.forecastText(booking: booking, rounds: model.rounds, bag: model.bag, holes: gpsHoles),
                        "tee-prep-forecast"
                    )
                    strategyBlock
                }
                .padding(20)
                .padding(.bottom, 108)
            }
        }
        .accessibilityIdentifier("screen-tee-prep")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task(id: place.strategyCourses.map(\.key).joined(separator: "|")) {
            await loadStrategy()
        }
        .task(id: booking.id) {
            await model.refreshTeeTimes()
            await loadWindHoles()
            await loadForecast()
        }
    }

    private var relativeDay: String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        if calendar.isDateInToday(shown.startsAt) { return "Hoy" }
        if calendar.isDateInTomorrow(shown.startsAt) { return "Mañana" }
        if calendar.isDateInYesterday(shown.startsAt) { return "Ayer" }
        return "Salida"
    }

    private var teeClock: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.timeZone = .current
        f.dateFormat = "HH:mm"
        return f.string(from: shown.startsAt)
    }

    private var teeDateLine: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.timeZone = .current
        f.dateFormat = "EEEE d 'de' MMMM"
        return f.string(from: shown.startsAt).capitalized
    }

    private var companionsBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Jugás con")
                .font(GType.section)
                .foregroundStyle(p.ink)
            if shown.companions.isEmpty {
                Text("Sin otros jugadores en la línea por ahora.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("tee-prep-players")
            } else {
                GCard(radius: 18, padding: 8) {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(shown.companions.enumerated()), id: \.offset) { _, name in
                            HStack(spacing: 10) {
                                AvatarCircle(initials: String(name.prefix(1)).uppercased())
                                    .frame(width: 32, height: 32)
                                Text(name)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Spacer()
                            }
                            .padding(.vertical, 8)
                            .padding(.horizontal, 8)
                        }
                    }
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("tee-prep-players")
                .accessibilityLabel(shown.companions.joined(separator: ", "))
            }
        }
    }

    private var playingHandicap: some View {
        let rows = playingRows
        return VStack(alignment: .leading, spacing: 8) {
            Text("Tu hándicap de juego")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 14) {
                if rows.isEmpty {
                    Text("La reserva no trae un tee con rating para calcularlo.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(rows, id: \.name) { row in
                            HStack {
                                Text(row.name)
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Spacer()
                                Text("\(row.value)")
                                    .font(GType.statM)
                                    .tabular()
                                    .foregroundStyle(p.ink)
                            }
                        }
                    }
                }
            }
            .accessibilityIdentifier("tee-prep-playing")
        }
    }

    private var playingRows: [(name: String, value: Int)] {
        let courseName = shown.course
        let par = model.courses.first { $0.name.caseInsensitiveCompare(courseName) == .orderedSame }?.par ?? 72
        let index = model.profile.currentHandicap
        return model.tees
            .filter { $0.course.caseInsensitiveCompare(courseName) == .orderedSame }
            .map { tee in
                let value = HandicapMath.courseHandicap(
                    index: index,
                    slope: Double(tee.slope),
                    rating: tee.courseRating,
                    par: par
                )
                return (tee.tee, value)
            }
    }

    private var strategyBlock: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Estrategia")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 14) {
                VStack(alignment: .leading, spacing: 12) {
                    Text(TeeTimePrep.strategySummary(place: place, strategy: strategy))
                        .font(GType.body)
                        .foregroundStyle(p.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("tee-prep-strategy")
                    ForEach(place.strategyCourses) { course in
                        NavigationLink(value: MetricRoute.strategy(courseKey: course.key, courseName: course.name)) {
                            HStack {
                                Text(place.strategyCourses.count == 1 ? "Cómo jugar la cancha" : course.name)
                                    .font(GType.headline)
                                    .foregroundStyle(Color(hex: BrandHex.navy))
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Color(hex: BrandHex.red))
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("tee-prep-strategy-open")
                    }
                }
            }
        }
    }

    private func block(_ title: String, _ body: String, _ id: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 14) {
                Text(body)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier(id)
            }
        }
    }

    private func loadStrategy() async {
        guard place.strategyCourses.count == 1, let course = place.strategyCourses.first else {
            strategy = nil
            return
        }
        strategy = try? await model.api.courseStrategy(courseKey: course.key, courseId: course.courseId)
    }

    private func loadWindHoles() async {
        gpsHoles = []
        guard place.strategyCourses.count == 1, let course = place.strategyCourses.first else { return }
        if let cached = CourseCache.load(courseId: course.courseId) {
            gpsHoles = cached.detail.holes
            return
        }
        if let remote = try? await model.api.gpsCourse(id: course.courseId, lat: nil, lng: nil) {
            gpsHoles = remote.holes
        }
    }

    private func loadForecast() async {
        liveForecast = nil
        guard !RuntimeFlags.isUITesting else { return }
        guard booking.windKmh == nil, booking.tempC == nil, booking.rainMm == nil else { return }
        guard let window = await TeeForecast.load(booking: booking), !window.hours.isEmpty else { return }
        liveForecast = TeeForecast.playText(window: window, booking: booking, rounds: model.rounds, bag: model.bag, holes: gpsHoles)
    }
}
