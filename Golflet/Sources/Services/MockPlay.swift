import Foundation

extension MockAPIClient {
    private static let playLock = NSLock()
    private static var liveByID: [String: LiveRound] = [:]
    private static var shotsByRound: [String: [Shot]] = [:]
    private static var recapsByKey: [String: Recap] = [:]
    private static var recapsByID: [String: Recap] = [:]

    func gpsCourses(lat: Double?, lng: Double?) async throws -> GPSCourseList {
        let mine = Self.demoCourses
        let nearby = mine.map { course -> GPSCourseSummary in
            var copy = course
            if lat != nil, lng != nil {
                copy.distanceKm = course.courseId.contains("azul") ? 0.1 : (course.courseId.contains("colorada") ? 0.4 : 400)
            }
            return copy
        }
        return GPSCourseList(courses: mine, nearby: nearby)
    }

    func gpsCourse(id: String, lat: Double?, lng: Double?) async throws -> GPSCourseDetail {
        _ = lat
        _ = lng
        guard let summary = Self.demoCourses.first(where: { $0.courseId == id }) ?? Self.demoCourses.first else {
            throw GolfletError.decoding("course")
        }
        return GPSCourseDetail(
            courseId: summary.courseId,
            clubCode: summary.clubCode,
            clubName: summary.clubName,
            course: summary.course,
            par: 72,
            holeCount: 18,
            holes: Self.demoHoles(for: summary.courseId),
            warnings: [],
            attribution: "Greens: Golfistics. Tees y obstáculos: © OpenStreetMap contributors (ODbL)."
        )
    }

    func createLiveRound(courseId: String?, tee: String?) async throws -> LiveRound {
        let summary = Self.demoCourses.first { $0.courseId == courseId }
        let round = LiveRound(
            id: UUID().uuidString,
            courseId: courseId,
            clubCode: summary?.clubCode,
            course: summary?.course,
            date: Self.todayStamp(),
            tee: tee ?? summary?.course,
            currentHole: 1,
            startedAt: Date(),
            endedAt: nil,
            roundId: nil,
            recapId: nil,
            shots: 0
        )
        Self.playLock.lock()
        Self.liveByID[round.id] = round
        Self.shotsByRound[round.id] = []
        Self.playLock.unlock()
        return round
    }

    func liveRound(id: String) async throws -> LiveRoundDetail {
        Self.playLock.lock()
        defer { Self.playLock.unlock() }
        guard var round = Self.liveByID[id] else { throw GolfletError.decoding("live_round") }
        let shots = Self.shotsByRound[id] ?? []
        round.shots = shots.count
        return LiveRoundDetail(liveRound: round, shots: shots, recap: Self.recapsByKey["live:\(id)"])
    }

    func patchLiveRound(id: String, body: [String: Any]) async throws -> LiveRound {
        Self.playLock.lock()
        defer { Self.playLock.unlock() }
        guard var round = Self.liveByID[id] else { throw GolfletError.decoding("live_round") }
        if let hole = JSONFlex.int(from: body["current_hole"]) { round.currentHole = hole }
        if let tee = body["tee"] as? String { round.tee = tee }
        if let ended = JSONFlex.bool(from: body["ended"]) {
            round.endedAt = ended ? Date() : nil
        }
        Self.liveByID[id] = round
        return round
    }

    func postShots(liveRoundId: String, drafts: [ShotDraft]) async throws -> [Shot] {
        Self.playLock.lock()
        defer { Self.playLock.unlock() }
        var existing = Self.shotsByRound[liveRoundId] ?? []
        for draft in drafts.prefix(200) {
            if let found = existing.first(where: { $0.clientId == draft.clientId }) {
                _ = found
                continue
            }
            let holeShots = existing.filter { $0.hole == draft.hole }.count
            existing.append(Shot(
                id: UUID().uuidString,
                clientId: draft.clientId,
                hole: draft.hole,
                shotNumber: holeShots + 1,
                lat: draft.lat,
                lng: draft.lng,
                accuracyM: draft.accuracyM,
                takenAt: draft.takenAt,
                club: draft.club,
                lie: draft.lie,
                result: draft.result,
                direction: draft.direction,
                length: draft.length,
                mishit: draft.mishit,
                distanceM: nil,
                distanceYd: nil,
                toGreenYd: nil
            ))
        }
        Self.recomputeDistances(&existing)
        Self.shotsByRound[liveRoundId] = existing
        if var round = Self.liveByID[liveRoundId] {
            round.shots = existing.count
            if let last = existing.last { round.currentHole = last.hole }
            Self.liveByID[liveRoundId] = round
        }
        return existing
    }

    func patchShot(id: String, body: [String: Any]) async throws -> Shot {
        Self.playLock.lock()
        defer { Self.playLock.unlock() }
        for (roundID, shots) in Self.shotsByRound {
            guard let index = shots.firstIndex(where: { $0.id == id }) else { continue }
            var next = shots
            var shot = next[index]
            if let club = body["club"] as? String { shot.club = club }
            if let lie = body["lie"] as? String { shot.lie = lie }
            if let result = body["result"] as? String { shot.result = result }
            if let direction = body["direction"] as? String { shot.direction = direction }
            if let length = body["length"] as? String { shot.length = length }
            if let mishit = JSONFlex.bool(from: body["mishit"]) { shot.mishit = mishit }
            next[index] = shot
            Self.recomputeDistances(&next)
            Self.shotsByRound[roundID] = next
            return next[index]
        }
        throw GolfletError.decoding("shot")
    }

    func recap(roundId: String?, liveRoundId: String?) async throws -> Recap? {
        Self.playLock.lock()
        defer { Self.playLock.unlock() }
        if let liveRoundId, let found = Self.recapsByKey["live:\(liveRoundId)"] { return found }
        if let roundId, let found = Self.recapsByKey["round:\(roundId)"] { return found }
        if let roundId { return Self.seedRecap(roundId: roundId, liveRoundId: nil) }
        return nil
    }

    func uploadRecap(audio: Data, roundId: String?, liveRoundId: String?) async throws -> Recap {
        _ = audio
        return storeRecap(Self.seedRecap(roundId: roundId, liveRoundId: liveRoundId, status: "ready"))
    }

    func typedRecap(roundId: String?, liveRoundId: String?, transcript: String) async throws -> Recap {
        var recap = Self.seedRecap(roundId: roundId, liveRoundId: liveRoundId, status: "ready")
        recap.transcript = transcript
        recap.source = "manual"
        return storeRecap(recap)
    }

    func patchRecap(id: String, body: [String: Any]) async throws -> Recap {
        Self.playLock.lock()
        var recap = Self.recapsByID[id] ?? Self.seedRecap(roundId: nil, liveRoundId: nil)
        Self.playLock.unlock()
        recap.id = id
        if let transcript = body["transcript"] as? String { recap.transcript = transcript }
        if let summary = body["summary"] as? String { recap.summary = summary }
        if let mistakes = body["mistakes"] as? [[String: Any]] {
            recap.mistakes = mistakes.compactMap { item in
                guard let text = item["text"] as? String else { return nil }
                return RecapMistake(category: item["category"] as? String ?? "otro", hole: JSONFlex.int(from: item["hole"]), text: text)
            }
        }
        if let positives = body["positives"] as? [[String: Any]] {
            recap.positives = positives.compactMap { item in
                guard let text = item["text"] as? String else { return nil }
                return RecapPositive(hole: JSONFlex.int(from: item["hole"]), text: text)
            }
        }
        recap.source = "manual"
        recap.status = "ready"
        return storeRecap(recap)
    }

    func retryRecap(id: String) async throws -> Recap {
        Self.playLock.lock()
        var recap = Self.recapsByID[id] ?? Self.seedRecap(roundId: nil, liveRoundId: nil)
        Self.playLock.unlock()
        recap.id = id
        recap.status = "ready"
        recap.error = nil
        return storeRecap(recap)
    }

    func recurringMistakes() async throws -> RecurringReport {
        RecurringReport(
            roundsConsidered: 6,
            lastN: 10,
            items: [
                RecurringItem(
                    category: "putt",
                    label: "Putt",
                    rounds: 5,
                    of: 6,
                    share: 0.83,
                    mentions: 7,
                    holes: [RecurringHole(hole: 3, mentions: 2), RecurringHole(hole: 12, mentions: 1)],
                    text: "Putt: en 5 de 6 rondas",
                    examples: [RecurringExample(date: "2026-10-25", hole: 3, text: "Tres putts")]
                ),
                RecurringItem(
                    category: "salida",
                    label: "Salida",
                    rounds: 3,
                    of: 6,
                    share: 0.5,
                    mentions: 4,
                    holes: [RecurringHole(hole: 7, mentions: 2)],
                    text: "Salida: en 3 de 6 rondas",
                    examples: [RecurringExample(date: "2026-10-25", hole: 7, text: "Driver OB")]
                )
            ]
        )
    }

    func clubStats(code: String) async throws -> ClubStatsDetail {
        if code == "7i" { return Self.hierro7 }
        if code == "Dr" {
            return ClubStatsDetail(
                club: ClubStats(
                    club: "Dr",
                    label: "Driver",
                    shots: 18,
                    distance: ClubDistanceBlock(n: 18, avgM: 228, medianM: 224, maxM: 261, avgYd: 249, medianYd: 245, maxYd: 285, rangeYd: [232, 268], spreadYd: 22),
                    direction: ClubSplit(left: 28, center: 39, right: 33, n: 18),
                    lengthOnApproach: nil,
                    greensHit: nil,
                    fairwaysHit: ClubRate(pct: 61, hit: 11, of: 18),
                    mishit: ClubRate(pct: 11, hit: 2, of: 18),
                    tendency: "Con el Driver te vas un poco a la izquierda (28%) y al centro (39%)."
                ),
                recent: []
            )
        }
        return ClubStatsDetail(
            club: ClubStats(
                club: code,
                label: ClubCode.label(for: code),
                shots: 0,
                distance: nil,
                direction: nil,
                lengthOnApproach: nil,
                greensHit: nil,
                fairwaysHit: nil,
                mishit: nil,
                tendency: nil
            ),
            recent: []
        )
    }

    func metricDrilldown(metric: String, scope: String, year: Int, course: String, sort: String, order: String) async throws -> MetricDrilldown? {
        let snap = try await bootstrap()
        let bucket: MetricCourseBucket = {
            switch course {
            case "1:Azul": return .azul
            case "1:Colorada": return .colorada
            case "7:Cancha Nueva": return .mdpNueva
            case "7:Cancha Vieja": return .mdpVieja
            case "other": return .other
            default: return .all
            }
        }()
        let period: MetricPeriod = scope == "year" ? .year : .all
        let since = scope == "since" ? year : nil
        let query: RoundListQuery = {
            switch metric {
            case "best-gross": return .bestGross(yearOnly: period == .year)
            case "average": return .average(yearOnly: period == .year)
            default: return .yearRounds
            }
        }()
        var filtered = StatsEngine.filter(snap.rounds, query: query, period: period, course: bucket)
        if let since {
            filtered = filtered.filter { Calendar.gregorian.component(.year, from: $0.date) >= since }
        }
        let field: MetricSortField = sort == "gross" ? .gross : (sort == "net" ? .net : .date)
        let sortOrder: MetricSortOrder = {
            if field == .date { return order == "asc" ? .worstFirst : .bestFirst }
            return order == "asc" ? .bestFirst : .worstFirst
        }()
        let rows = StatsEngine.sorted(filtered, field: field, order: sortOrder)
        if metric == "handicap" {
            let history = StatsEngine.handicapSeries(snap.rounds).reversed().map {
                MetricAPIHistory(date: $0.date, hi: $0.handicap, club: $0.course)
            }
            return MetricDrilldown(
                metric: metric,
                total: nil,
                current: snap.rounds.sorted { $0.date > $1.date }.first?.handicapIndex,
                change: nil,
                rounds: [],
                perHole: [],
                history: Array(history),
                summaryRounds: rows.count,
                averageGross: nil,
                bestGross: nil
            )
        }
        if ["eagles", "birdies", "pars", "bogeys"].contains(metric) {
            let kind: ScoreKind = metric == "eagles" ? .eagle : (metric == "birdies" ? .birdie : (metric == "pars" ? .par : .bogey))
            let snapKind = StatsEngine.scoreKind(kind, rounds: snap.rounds, query: query, period: period, course: bucket)
            return MetricDrilldown(
                metric: metric,
                total: snapKind.total,
                current: nil,
                change: nil,
                rounds: snapKind.rounds.map { item in
                    MetricAPIRound(
                        roundId: item.round.roundId,
                        date: item.round.date,
                        tournament: item.round.tournament,
                        clubName: item.round.clubName,
                        course: item.round.course,
                        courseKey: item.round.courseKey,
                        courseLabel: item.round.displayCourse,
                        tee: item.round.tee,
                        gross: item.round.gross,
                        net: item.round.net,
                        valid: item.round.isValid,
                        isNineHoles: item.round.isNineHoles,
                        otherCourse: item.round.isOtherCourse,
                        count: item.count,
                        holes: item.holes.map(\.number),
                        holesKnown: item.usedHoleDetail
                    )
                },
                perHole: snapKind.tally.map {
                    MetricAPIHole(courseKey: nil, courseLabel: $0.course, hole: $0.hole, par: nil, count: $0.count)
                },
                history: [],
                summaryRounds: snapKind.rounds.count,
                averageGross: nil,
                bestGross: nil
            )
        }
        let valid = rows.filter { $0.isValid && !$0.isNineHoles }
        return MetricDrilldown(
            metric: metric,
            total: rows.count,
            current: nil,
            change: nil,
            rounds: rows.map { $0.asMetricAPI() },
            perHole: [],
            history: [],
            summaryRounds: valid.count,
            averageGross: {
                let values = valid.compactMap(\.gross)
                guard !values.isEmpty else { return nil }
                return Double(values.reduce(0, +)) / Double(values.count)
            }(),
            bestGross: valid.compactMap(\.gross).min()
        )
    }

    private func storeRecap(_ recap: Recap) -> Recap {
        Self.playLock.lock()
        Self.recapsByID[recap.id] = recap
        if let roundId = recap.roundId { Self.recapsByKey["round:\(roundId)"] = recap }
        if let live = recap.liveRoundId { Self.recapsByKey["live:\(live)"] = recap }
        Self.playLock.unlock()
        return recap
    }

    private static let demoCourses: [GPSCourseSummary] = [
        GPSCourseSummary(courseId: "118-jockey-azul", clubCode: "118", clubName: "Jockey Club Argentino", course: "Azul", label: "Azul", courseKey: "1:Azul", holesCached: 18, mine: true, distanceKm: 0.1),
        GPSCourseSummary(courseId: "118-jockey-colorada", clubCode: "118", clubName: "Jockey Club Argentino", course: "Colorada", label: "Colorada", courseKey: "1:Colorada", holesCached: 18, mine: true, distanceKm: 0.4),
        GPSCourseSummary(courseId: "209-mdp-nueva", clubCode: "209", clubName: "Mar del Plata Golf Club", course: "Cancha Nueva", label: "Cancha Nueva", courseKey: "7:Cancha Nueva", holesCached: 18, mine: true, distanceKm: 400),
        GPSCourseSummary(courseId: "209-mdp-vieja", clubCode: "209", clubName: "Mar del Plata Golf Club", course: "Cancha Vieja", label: "Cancha Vieja", courseKey: "7:Cancha Vieja", holesCached: 18, mine: true, distanceKm: 401)
    ]

    private static func demoHoles(for courseId: String) -> [GPSHole] {
        let origin = GPSCoord(lat: -34.485427, lng: -58.532351)
        return (1...18).map { number in
            let step = Double(number - 1)
            let tee = GPSCoord(lat: origin.lat + step * 0.00055, lng: origin.lng + step * 0.00042)
            let center: GPSCoord
            let front: GPSCoord
            let back: GPSCoord
            if number == 1, courseId.contains("azul") {
                front = GPSCoord(lat: -34.48311941, lng: -58.52894679)
                center = GPSCoord(lat: -34.48305197, lng: -58.52881)
                back = GPSCoord(lat: -34.48298896, lng: -58.52870807)
            } else {
                center = GPSCoord(lat: tee.lat + 0.00235, lng: tee.lng + 0.00315)
                front = GPSCoord(lat: center.lat - 0.00007, lng: center.lng - 0.00012)
                back = GPSCoord(lat: center.lat + 0.00006, lng: center.lng + 0.00010)
            }
            return GPSHole(
                number: number,
                par: [5, 4, 3, 4, 4, 4, 4, 4, 4, 5, 5, 3, 4, 4, 4, 4, 4, 4][number - 1],
                hcp: number,
                yards: ["AZUL": 480 - number * 4],
                green: GPSGreen(front: front, center: center, back: back),
                tee: number == 1 ? origin : tee
            )
        }
    }

    private static func seedRecap(roundId: String?, liveRoundId: String?, status: String = "ready") -> Recap {
        Recap(
            id: UUID().uuidString,
            roundId: roundId,
            liveRoundId: liveRoundId,
            status: status,
            error: status == "pending_ai" ? RecapCopy.pendingAI : nil,
            hasAudio: true,
            transcript: "Jugué bastante bien, 79. Hice tres putts en el hoyo 3 y en el 12.",
            summary: "Vuelta sólida, con problemas de putt en el 3 y el 12 y una salida OB en el 7.",
            mistakes: [
                RecapMistake(category: "putt", hole: 3, text: "Hice tres putts en el hoyo 3 y en el 12."),
                RecapMistake(category: "putt", hole: 12, text: "Hice tres putts en el hoyo 3 y en el 12."),
                RecapMistake(category: "salida", hole: 7, text: "En el 7 la salida con driver se fue OB."),
                RecapMistake(category: "bunker", hole: 16, text: "En el bunker del 16 la dejé adentro, mal."),
                RecapMistake(category: "estrategia", hole: nil, text: "Me apuré en los últimos hoyos, error de cabeza.")
            ],
            positives: [
                RecapPositive(hole: nil, text: "Jugué bastante bien, 79."),
                RecapPositive(hole: 11, text: "Embocé un birdie en el hoyo 11.")
            ],
            source: "ai",
            durationS: 74
        )
    }

    private static let hierro7 = ClubStatsDetail(
        club: ClubStats(
            club: "7i",
            label: "Hierro 7",
            shots: 22,
            distance: ClubDistanceBlock(n: 22, avgM: 148, medianM: 145, maxM: 196, avgYd: 162, medianYd: 159, maxYd: 214, rangeYd: [147, 186], spreadYd: 28),
            direction: ClubSplit(left: 14, center: 41, right: 45, n: 22),
            lengthOnApproach: ClubLengthSplit(short: 59, on: 23, long: 18, n: 22),
            greensHit: ClubRate(pct: 41, hit: 9, of: 22),
            fairwaysHit: nil,
            mishit: ClubRate(pct: 0, hit: 0, of: 22),
            tendency: "Con el Hierro 7 te vas 45% a la derecha y quedás corto (59%)."
        ),
        recent: [
            ClubRecentShot(id: "s1", date: "2026-10-25", hole: 1, distanceYd: 168, result: "green", direction: "right", mishit: false),
            ClubRecentShot(id: "s2", date: "2026-10-18", hole: 6, distanceYd: 154, result: "rough", direction: "right", mishit: false)
        ]
    )

    private static func todayStamp() -> String {
        let f = DateFormatter()
        f.calendar = Calendar.gregorian
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }

    private static func recomputeDistances(_ shots: inout [Shot]) {
        for index in shots.indices {
            let same = shots.enumerated().filter { $0.element.hole == shots[index].hole }.sorted { $0.element.shotNumber < $1.element.shotNumber }
            guard let next = same.first(where: { $0.element.shotNumber > shots[index].shotNumber })?.element,
                  let aLat = shots[index].lat, let aLng = shots[index].lng,
                  let bLat = next.lat, let bLng = next.lng
            else { continue }
            let meters = PlayMath.meters(from: GPSCoord(lat: aLat, lng: aLng), to: GPSCoord(lat: bLat, lng: bLng))
            shots[index].distanceM = meters
            shots[index].distanceYd = PlayMath.yards(meters)
        }
    }
}

extension Round {
    func asMetricAPI() -> MetricAPIRound {
        MetricAPIRound(
            roundId: roundId,
            date: date,
            tournament: tournament,
            clubName: clubName,
            course: course,
            courseKey: courseKey,
            courseLabel: displayCourse,
            tee: tee,
            gross: gross,
            net: net,
            valid: isValid,
            isNineHoles: isNineHoles,
            otherCourse: isOtherCourse,
            count: nil,
            holes: [],
            holesKnown: !holes.isEmpty
        )
    }
}

extension MetricAPIRound {
    func asRound() -> Round {
        Round(
            roundId: roundId,
            date: date ?? Date(),
            weekday: "",
            tournament: tournament ?? "",
            clubName: clubName ?? "",
            clubCode: "",
            course: course ?? courseLabel ?? "",
            tee: tee ?? "",
            category: nil,
            weather: nil,
            courseRating: 0,
            slope: 0,
            position: nil,
            fieldSize: nil,
            handicapIndex: 0,
            playingHandicap: nil,
            outScore: nil,
            inScore: nil,
            gross: gross,
            net: net,
            cardStatus: valid ? "OK" : "DES",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: [],
            holesPlayed: isNineHoles ? 9 : 18,
            isNineHoles: isNineHoles,
            isValid: valid,
            courseKey: courseKey ?? "",
            otherCourse: otherCourse,
            courseLabel: courseLabel
        )
    }
}

enum MetricAPIMap {
    static func name(for query: RoundListQuery) -> String {
        if query.title.localizedCaseInsensitiveContains("mejor") { return "best-gross" }
        if query.title.localizedCaseInsensitiveContains("promedio") { return "average" }
        return "rounds"
    }

    static func score(_ kind: ScoreKind) -> String {
        switch kind {
        case .eagle: return "eagles"
        case .birdie: return "birdies"
        case .par: return "pars"
        case .bogey: return "bogeys"
        }
    }

    static func course(_ bucket: MetricCourseBucket) -> String {
        switch bucket {
        case .all: return "all"
        case .azul: return "1:Azul"
        case .colorada: return "1:Colorada"
        case .mdpNueva: return "7:Cancha Nueva"
        case .mdpVieja: return "7:Cancha Vieja"
        case .other: return "other"
        }
    }

    static func scope(_ period: MetricPeriod, sinceYear: Int?) -> (String, Int) {
        let year = Calendar.gregorian.component(.year, from: Date())
        if let sinceYear { return ("since", sinceYear) }
        return period == .year ? ("year", year) : ("all", year)
    }

    static func sortKey(_ field: MetricSortField) -> String {
        switch field {
        case .date: return "date"
        case .gross: return "gross"
        case .net: return "net"
        }
    }

    static func orderKey(_ field: MetricSortField, _ order: MetricSortOrder) -> String {
        switch field {
        case .date:
            return order == .bestFirst ? "desc" : "asc"
        case .gross, .net:
            return order == .bestFirst ? "asc" : "desc"
        }
    }
}
