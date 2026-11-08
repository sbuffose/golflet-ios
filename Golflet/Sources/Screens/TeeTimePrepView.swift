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

/// La reserva a veces trae el club y deja la cancha vacía.
/// Si él ya jugó ahí, usa esa cancha. Si el club tiene una sola, esa.
/// Si tiene dos, las ofrece para elegir. No inventa pronóstico.
enum TeeCourseResolve {
    static func place(booking: TeeTime, rounds: [Round], courses: [Course]) -> TeePlace {
        let explicit = trim(booking.course)
        if !explicit.isEmpty, fold(explicit) != fold(booking.clubName) {
            return TeePlace(canchaTitle: explicit, strategyCourses: [match(name: explicit)])
        }
        if let played = latestPlayed(booking: booking, rounds: rounds) {
            return TeePlace(canchaTitle: played.name, strategyCourses: [played])
        }
        let listed = unique(courses.filter { sameClub($0.clubCode, $0.clubName, booking) && !trim($0.name).isEmpty }.map { match(name: $0.name) })
        if listed.count == 1, let only = listed.first {
            return TeePlace(canchaTitle: only.name, strategyCourses: [only])
        }
        let known = knownCourses(booking)
        if known.count == 1, let only = known.first {
            return TeePlace(canchaTitle: only.name, strategyCourses: [only])
        }
        if !known.isEmpty {
            return TeePlace(canchaTitle: clubTitle(booking), strategyCourses: known)
        }
        if listed.count > 1 {
            return TeePlace(canchaTitle: clubTitle(booking), strategyCourses: listed)
        }
        let club = clubTitle(booking)
        if !club.isEmpty {
            return TeePlace(canchaTitle: club, strategyCourses: [])
        }
        return TeePlace(canchaTitle: "La reserva no trae el nombre de la cancha.", strategyCourses: [])
    }

    static func knownCourses(_ booking: TeeTime) -> [TeeCourseMatch] {
        let club = fold(booking.clubName)
        if booking.clubCode == "209" || club.contains("mar del plata") {
            return [
                match(name: "Cancha Vieja", key: "7:Cancha Vieja", courseId: "209-mdp-vieja"),
                match(name: "Cancha Nueva", key: "7:Cancha Nueva", courseId: "209-mdp-nueva")
            ]
        }
        if booking.clubCode == "118" || club.contains("jockey") {
            return [
                match(name: "Azul", key: "1:Azul", courseId: "118-jockey-azul"),
                match(name: "Colorada", key: "1:Colorada", courseId: "118-jockey-colorada")
            ]
        }
        return []
    }

    private static func latestPlayed(booking: TeeTime, rounds: [Round]) -> TeeCourseMatch? {
        let hits = rounds
            .filter { sameClub($0.clubCode, $0.clubName, booking) || sameClub($0.clubCode, $0.clubPlayed ?? "", booking) }
            .filter { !trim($0.course).isEmpty && fold($0.course) != fold(booking.clubName) }
            .sorted { $0.date > $1.date }
        guard let course = hits.first?.course else { return nil }
        return match(name: trim(course))
    }

    private static func sameClub(_ code: String, _ name: String, _ booking: TeeTime) -> Bool {
        if !booking.clubCode.isEmpty, code == booking.clubCode { return true }
        let club = fold(booking.clubName)
        guard !club.isEmpty, club != "club" else { return false }
        let other = fold(name)
        guard other.count >= 4 else { return false }
        return other == club || other.contains(club) || club.contains(other)
    }

    private static func clubTitle(_ booking: TeeTime) -> String {
        let name = trim(booking.clubName)
        return name == "Club" ? "" : name
    }

    private static func match(name: String, key: String? = nil, courseId: String? = nil) -> TeeCourseMatch {
        TeeCourseMatch(
            name: name,
            key: key ?? CourseIdentity.key(for: name),
            courseId: courseId ?? CourseIdentity.id(for: name)
        )
    }

    private static func unique(_ matches: [TeeCourseMatch]) -> [TeeCourseMatch] {
        var seen = Set<String>()
        return matches.filter { seen.insert(fold($0.name)).inserted }
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

    private var place: TeePlace {
        TeeCourseResolve.place(booking: booking, rounds: model.rounds, courses: model.courses)
    }

    var body: some View {
        GScreen(id: "screen-tee-prep") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(booking.chipWhen)
                            .font(GType.largeTitle)
                            .foregroundStyle(p.ink)
                        Text(booking.clubName)
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        if let partners = booking.companionsLine {
                            Text(partners)
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
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
            }
        }
        .accessibilityIdentifier("screen-tee-prep")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task(id: place.strategyCourses.map(\.key).joined(separator: "|")) {
            await loadStrategy()
            await loadWindHoles()
        }
        .task(id: booking.id) { await loadForecast() }
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
        liveForecast = TeeForecast.playText(window: window, booking: booking, rounds: model.rounds, bag: model.bag)
    }
}
