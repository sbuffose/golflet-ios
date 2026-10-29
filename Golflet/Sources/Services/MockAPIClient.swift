import Foundation

struct MockAPIClient: GolfletAPI {
    var autoSession: Bool
    private let demoCode = "118"
    private let demoName = "Jockey Club Buenos Aires"
    private let demoURL = URL(string: "https://golf.e-jockeyclub.org.ar/golf")!
    private let mdpCode = "209"
    private let mdpName = "Mar del Plata Golf Club"
    private let mdpURL = URL(string: "https://golf.mardelplata.com")!

    private static let sessionLock = NSLock()
    private static var mockSignedIn = false
    private static var mockLinked = true
    private static var mockPasswordSaved = true
    private static var mockUser = GolfletUser(id: "demo", email: "demo@golflet.app", name: "Jugador Demo", firstName: "Jugador")
    private static var progressByID: [String: SyncAPIProgress] = [:]

    init(autoSession: Bool = true) {
        self.autoSession = autoSession
        Self.sessionLock.lock()
        Self.mockUser = GolfletUser(id: "demo", email: "demo@golflet.app", name: "Jugador Demo")
        if autoSession {
            Self.mockSignedIn = true
            Self.mockLinked = true
            Self.mockPasswordSaved = true
        } else {
            Self.mockSignedIn = false
            Self.mockLinked = false
            Self.mockPasswordSaved = true
        }
        Self.sessionLock.unlock()
        Self.resetGroups()
        Self.resetNotifications()
        Self.resetTextPrefs()
    }

    var isAuthenticated: Bool {
        Self.sessionLock.lock()
        defer { Self.sessionLock.unlock() }
        return Self.mockSignedIn
    }

    var persistsLocally: Bool { true }

    func signInGolfistics(matricula: String, clave: String, savePassword: Bool) async throws -> GolfisticsSession {
        _ = savePassword
        let trimmed = matricula.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !clave.isEmpty else {
            throw GolfletError.auth(AuthFailure(
                code: "BAD_INPUT",
                message: "Escribí tu matrícula y tu contraseña.",
                hint: nil,
                golfisticsURL: nil,
                retryAfterS: nil
            ))
        }
        switch trimmed {
        case "0000000", "0":
            throw GolfletError.auth(AuthCopy.rejected)
        case "down", "503":
            throw GolfletError.auth(AuthCopy.unavailable)
        case "429":
            throw GolfletError.auth(AuthCopy.rateLimited())
        default:
            break
        }
        let first = trimmed == "first" || ProcessInfo.processInfo.arguments.contains("-ui-testing-first-sync")
        Self.sessionLock.lock()
        Self.mockUser = GolfletUser(id: "demo", email: "matricula-\(trimmed)@golfistics.invalid", name: "Jugador Demo")
        Self.mockSignedIn = true
        Self.mockLinked = !first
        Self.mockPasswordSaved = savePassword
        Self.sessionLock.unlock()
        return GolfisticsSession(needsFirstSync: first, newAccount: first, userName: "Jugador Demo")
    }

    func startFirstSync(progressID: String) async throws -> SyncResult {
        if RuntimeFlags.isUITesting {
            await emitDemoProgress(progressID: progressID)
        }
        Self.sessionLock.lock()
        Self.mockLinked = true
        Self.sessionLock.unlock()
        return demoSyncResult(message: "Golfistics App vinculada · datos de demostración", newCards: 98)
    }

    func signOut() async throws {
        Self.sessionLock.lock()
        Self.mockSignedIn = false
        Self.sessionLock.unlock()
    }

    func bootstrap() async throws -> AppSnapshot {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        let linked = isLinked
        let rounds = linked ? try await loadRounds() : []
        let courses = linked ? try await loadCourses() : []
        let tees = linked ? try await loadTees() : []
        let stats = linked ? try await loadHoleStats() : []
        let clubs = linked ? demoClubs : []
        let hi = rounds.sorted { $0.date > $1.date }.first?.handicapIndex ?? 3.1
        return AppSnapshot(
            user: Self.mockUser,
            profile: PlayerProfile(displayName: Self.mockUser.name, initials: initials(Self.mockUser.name), currentHandicap: hi, firstName: Self.mockUser.firstName),
            clubs: clubs,
            rounds: rounds,
            courses: courses,
            tees: tees,
            holeStats: stats,
            bag: DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) },
            hiHistory: [],
            teeTimes: linked ? (try? await teeTimes()) ?? [] : []
        )
    }

    func clubCatalogue() async throws -> [ClubCatalogEntry] {
        [
            ClubCatalogEntry(id: 1, name: "Jockey Club Argentino", baseURL: demoURL.absoluteString),
            ClubCatalogEntry(id: 2, name: "AAG Scoring (Asociación Argentina de Golf)", baseURL: "https://www.aagscoring.com/golf")
        ]
    }

    func linkClub(matricula: String, password: String, savePassword: Bool, progressID: String) async throws -> SyncResult {
        _ = password
        await emitDemoProgress(progressID: progressID)
        Self.sessionLock.lock()
        Self.mockLinked = true
        Self.mockPasswordSaved = savePassword
        Self.sessionLock.unlock()
        try KeychainStore.save(ClubCredential(
            clubCode: demoCode,
            clubName: demoName,
            baseURL: demoURL.absoluteString,
            matricula: matricula,
            clave: savePassword ? "saved" : ""
        ))
        return demoSyncResult(message: "Golfistics App vinculada · datos de demostración", newCards: 98)
    }

    func syncAccount(id: String, password: String?, savePassword: Bool, progressID: String) async throws -> SyncResult {
        _ = id
        _ = password
        if savePassword {
            Self.sessionLock.lock()
            Self.mockPasswordSaved = true
            Self.sessionLock.unlock()
        }
        await emitDemoProgress(progressID: progressID)
        return demoSyncResult(message: "Datos de demostración al día", newCards: 0)
    }

    func pollSyncProgress(progressID: String) async -> SyncAPIProgress? {
        Self.sessionLock.lock()
        defer { Self.sessionLock.unlock() }
        return Self.progressByID[progressID]
    }

    func forgetPassword(accountId: String) async throws {
        _ = accountId
        Self.sessionLock.lock()
        Self.mockPasswordSaved = false
        Self.sessionLock.unlock()
    }

    func unlink(accountId: String) async throws {
        _ = accountId
        Self.sessionLock.lock()
        Self.mockLinked = false
        Self.mockPasswordSaved = true
        Self.sessionLock.unlock()
        KeychainStore.delete(clubCode: demoCode)
        KeychainStore.delete(clubCode: mdpCode)
    }

    func saveRoundNotes(roundId: String, putts: Int?, gir: Int?, fir: Int?, notes: String) async throws {
        _ = roundId
        _ = putts
        _ = gir
        _ = fir
        _ = notes
    }

    func saveBag(_ items: [BagClub]) async throws -> [BagClub] { items }

    private var isLinked: Bool {
        Self.sessionLock.lock()
        defer { Self.sessionLock.unlock() }
        return Self.mockLinked
    }

    private var demoClubs: [LinkedClub] {
        let saved: Bool = {
            Self.sessionLock.lock()
            defer { Self.sessionLock.unlock() }
            return Self.mockPasswordSaved
        }()
        return [
            LinkedClub(
                accountId: demoCode,
                code: demoCode,
                name: demoName,
                baseURL: demoURL,
                matricula: "94506",
                isDemo: true,
                passwordSaved: saved,
                lastSyncStatus: "ok",
                lastSyncMessage: "Datos de demostración",
                cardCount: 97,
                source: "app",
                roundsStored: 97,
                roundsWithHoles: 97
            ),
            LinkedClub(
                accountId: mdpCode,
                code: mdpCode,
                name: mdpName,
                baseURL: mdpURL,
                matricula: "94506",
                isDemo: true,
                passwordSaved: saved,
                lastSyncStatus: "ok",
                lastSyncMessage: "Datos de demostración",
                cardCount: 1,
                source: "app",
                roundsStored: 1,
                roundsWithHoles: 0
            )
        ]
    }

    private func demoSyncResult(message: String, newCards: Int) -> SyncResult {
        SyncResult(
            ok: true,
            message: message,
            cardCount: 98,
            newCards: newCards,
            clubs: [
                SyncClubResult(accountId: demoCode, clubName: demoName, ok: true, newRounds: newCards > 0 ? 97 : 0, listTotal: 97),
                SyncClubResult(accountId: mdpCode, clubName: mdpName, ok: true, newRounds: newCards > 0 ? 1 : 0, listTotal: 1)
            ]
        )
    }

    private func loadRounds() async throws -> [Round] {
        let raw: [[String: Any]] = try FixtureLoader.array("rounds")
        let extra: [[String: Any]] = (try? FixtureLoader.array("other_course")) ?? []
        return (raw + extra).compactMap(Self.parseRound)
    }

    private func loadCourses() async throws -> [Course] {
        let raw: [[String: Any]] = try FixtureLoader.array("courses")
        return raw.compactMap { item in
            guard let name = item["course"] as? String else { return nil }
            let holes = (item["holes"] as? [[String: Any]] ?? []).compactMap { hole -> CourseHole? in
                guard let number = JSONFlex.int(from: hole["hole"]) else { return nil }
                var yards: [String: Int] = [:]
                if let map = hole["yards"] as? [String: Any] {
                    for (key, value) in map {
                        if let y = JSONFlex.int(from: value) { yards[key.uppercased()] = y }
                    }
                }
                return CourseHole(
                    number: number,
                    par: JSONFlex.int(from: hole["par"]) ?? 4,
                    handicap: JSONFlex.int(from: hole["hole_hcp"]) ?? number,
                    yards: yards
                )
            }
            return Course(
                clubCode: item["club_code"] as? String ?? demoCode,
                clubName: item["club_name"] as? String ?? demoName,
                name: name,
                holes: holes
            )
        }
    }

    private func loadTees() async throws -> [TeeRating] {
        let raw: [[String: Any]] = try FixtureLoader.array("tees")
        return raw.compactMap { item in
            guard let course = item["course"] as? String, let tee = item["tee"] as? String else { return nil }
            return TeeRating(
                clubCode: item["club_code"] as? String ?? demoCode,
                course: course,
                tee: tee,
                courseRating: JSONFlex.double(from: item["course_rating"]) ?? 0,
                slope: JSONFlex.int(from: item["slope"]) ?? 113,
                gender: item["gender"] as? String
            )
        }
    }

    private func loadHoleStats() async throws -> [CourseHoleStats] {
        let raw: [[String: Any]] = try FixtureLoader.array("per_hole_stats")
        return raw.compactMap { item in
            guard let course = item["course"] as? String else { return nil }
            let holes = (item["holes"] as? [[String: Any]] ?? []).compactMap { hole -> HoleStat? in
                guard let number = JSONFlex.int(from: hole["hole"]) else { return nil }
                let dist = hole["dist"] as? [String: Any] ?? [:]
                let comps = hole["site_comparison"] as? [String: Any] ?? [:]
                let comparisons = comps.compactMap { key, value -> SiteComparison? in
                    guard let map = value as? [String: Any] else { return nil }
                    return SiteComparison(
                        key: key,
                        playerPct: JSONFlex.double(from: map["player_pct"]) ?? 0,
                        groupPct: JSONFlex.double(from: map["group_pct"]) ?? 0
                    )
                }
                return HoleStat(
                    number: number,
                    par: JSONFlex.int(from: hole["par"]) ?? 4,
                    handicap: JSONFlex.int(from: hole["hole_hcp"]) ?? number,
                    samples: JSONFlex.int(from: hole["n"]) ?? 0,
                    average: JSONFlex.double(from: hole["avg"]) ?? 0,
                    averageToPar: JSONFlex.double(from: hole["avg_to_par"]) ?? 0,
                    averageLast16: JSONFlex.double(from: hole["avg_last16"]),
                    best: JSONFlex.int(from: hole["best"]),
                    worst: JSONFlex.int(from: hole["worst"]),
                    distribution: HoleDistribution(
                        eagleOrBetter: JSONFlex.int(from: dist["eagle_or_better"]) ?? 0,
                        birdie: JSONFlex.int(from: dist["birdie"]) ?? 0,
                        par: JSONFlex.int(from: dist["par"]) ?? 0,
                        bogey: JSONFlex.int(from: dist["bogey"]) ?? 0,
                        double: JSONFlex.int(from: dist["double"]) ?? 0,
                        triplePlus: JSONFlex.int(from: dist["triple_plus"]) ?? 0
                    ),
                    comparisons: comparisons
                )
            }
            return CourseHoleStats(
                clubCode: item["club_code"] as? String ?? demoCode,
                clubName: item["club_name"] as? String ?? demoName,
                course: course,
                rounds: JSONFlex.int(from: item["rounds"]) ?? 0,
                holes: holes
            )
        }
    }

    private func emitDemoProgress(progressID: String) async {
        let fast = RuntimeFlags.isUITesting
        let pause: UInt64 = fast ? 80_000_000 : 350_000_000
        let clubs: [(name: String, code: String, logo: String?, initials: String, listed: Int, cards: Int)] = [
            (demoName, demoCode, "/clubs/118@2x.png", "JC", 97, 97),
            (mdpName, mdpCode, "/clubs/209@2x.png", "MD", 1, 1)
        ]
        var steps: [SyncAPIProgress] = [
            SyncAPIProgress(club: "Golfistics App", clubIndex: 1, clubCount: clubs.count, clubInitials: "G", stage: .connect)
        ]
        var stats = Self.seedStats(rounds: 0)
        for (index, club) in clubs.enumerated() {
            let ordinal = index + 1
            steps.append(SyncAPIProgress(
                club: club.name, clubIndex: ordinal, clubCount: clubs.count,
                clubCode: club.code, clubLogo: club.logo, clubInitials: club.initials,
                stage: .connect, stats: stats.hasRounds ? stats : nil
            ))
            stats.rounds = (stats.rounds ?? 0) + max(1, club.listed / 5)
            stats.days = stats.rounds
            steps.append(SyncAPIProgress(
                club: club.name, clubIndex: ordinal, clubCount: clubs.count,
                clubCode: club.code, clubLogo: club.logo, clubInitials: club.initials,
                stage: .list, listTotal: club.listed, stats: stats
            ))
            stats = Self.growStats(stats, toward: index == 0 ? Self.jockeyLive : Self.combinedLive)
            stats.lastCard = index == 0 ? Self.coloradaCard : Self.otherCourseCard
            steps.append(SyncAPIProgress(
                club: club.name, clubIndex: ordinal, clubCount: clubs.count,
                clubCode: club.code, clubLogo: club.logo, clubInitials: club.initials,
                stage: .cards, done: min(33, club.cards), total: club.cards,
                listTotal: club.listed, cardsTotal: club.cards, stats: stats
            ))
            steps.append(SyncAPIProgress(
                club: club.name, clubIndex: ordinal, clubCount: clubs.count,
                clubCode: club.code, clubLogo: club.logo, clubInitials: club.initials,
                stage: .handicap, listTotal: club.listed, cardsTotal: club.cards, stats: stats
            ))
            if index == clubs.count - 1 { stats = Self.combinedLive }
            steps.append(SyncAPIProgress(
                club: club.name, clubIndex: ordinal, clubCount: clubs.count,
                clubCode: club.code, clubLogo: club.logo, clubInitials: club.initials,
                stage: .save, done: club.cards, total: club.cards,
                listTotal: club.listed, cardsTotal: club.cards, stats: stats
            ))
        }
        for step in steps {
            Self.sessionLock.lock()
            Self.progressByID[progressID] = step
            Self.sessionLock.unlock()
            try? await Task.sleep(nanoseconds: pause)
        }
    }

    private static let jockeyLive = seedStats(
        rounds: 75,
        holes: 16, eagles: 3, birdies: 16, pars: 40, bogeys: 28, doubles: 8,
        days: 69, best: 71, bestDate: "2025-03-30", bestCourse: "Colorada",
        last: coloradaCard
    )

    private static let combinedLive = seedStats(
        rounds: 98,
        holes: 16, eagles: 5, birdies: 29, pars: 83, bogeys: 63, doubles: 16,
        days: 90, best: 71, bestDate: "2025-03-30", bestCourse: "Colorada",
        last: otherCourseCard
    )

    private static let coloradaCard = SyncLastCard(
        date: DayStamp.parse("2025-11-01"),
        course: "Colorada",
        club: "Jockey Club Buenos Aires",
        otherCourse: false,
        gross: 79,
        par: 72,
        holes: [
            SyncLastHole(number: 1, par: 4, strokes: 5),
            SyncLastHole(number: 2, par: 4, strokes: 4),
            SyncLastHole(number: 3, par: 3, strokes: 3),
            SyncLastHole(number: 4, par: 4, strokes: 4),
            SyncLastHole(number: 5, par: 4, strokes: 4),
            SyncLastHole(number: 6, par: 4, strokes: 4),
            SyncLastHole(number: 7, par: 4, strokes: 4),
            SyncLastHole(number: 8, par: 4, strokes: 4),
            SyncLastHole(number: 9, par: 4, strokes: 4),
            SyncLastHole(number: 10, par: 5, strokes: 6),
            SyncLastHole(number: 11, par: 5, strokes: 6),
            SyncLastHole(number: 12, par: 3, strokes: 3),
            SyncLastHole(number: 13, par: 4, strokes: 5),
            SyncLastHole(number: 14, par: 4, strokes: 5),
            SyncLastHole(number: 15, par: 4, strokes: 4),
            SyncLastHole(number: 16, par: 4, strokes: 5),
            SyncLastHole(number: 17, par: 4, strokes: 4),
            SyncLastHole(number: 18, par: 4, strokes: 5)
        ]
    )

    private static let otherCourseCard = SyncLastCard(
        date: DayStamp.parse("2025-02-16"),
        course: "Cancha Vieja",
        club: "Mar del Plata Golf Club",
        otherCourse: true,
        gross: 84,
        par: nil,
        holes: []
    )

    private static func seedStats(
        rounds: Int,
        holes: Int = 0,
        eagles: Int = 0,
        birdies: Int = 0,
        pars: Int = 0,
        bogeys: Int = 0,
        doubles: Int = 0,
        days: Int = 0,
        best: Int? = nil,
        bestDate: String? = nil,
        bestCourse: String? = nil,
        last: SyncLastCard? = nil
    ) -> SyncLiveStats {
        SyncLiveStats(
            rounds: rounds,
            roundsWithHoles: max(0, rounds - 1),
            holes: holes,
            eagles: eagles,
            birdies: birdies,
            pars: pars,
            bogeys: bogeys,
            doublesPlus: doubles,
            days: days,
            bestGross: best,
            bestGrossDate: bestDate.flatMap(DayStamp.parse),
            bestGrossCourse: bestCourse,
            months: demoMonths,
            lastCard: last
        )
    }

    private static let demoMonths: [SyncMonthPoint] = {
        let values = [2, 4, 6, 3, 8, 5, 7, 9, 4, 6, 8, 3]
        return values.enumerated().map { index, rounds in
            SyncMonthPoint(month: String(format: "2025-%02d", index + 1), rounds: rounds)
        }
    }()

    private static func growStats(_ current: SyncLiveStats, toward target: SyncLiveStats) -> SyncLiveStats {
        var next = current
        next.rounds = midway(current.rounds, target.rounds)
        next.eagles = midway(current.eagles, target.eagles)
        next.birdies = midway(current.birdies, target.birdies)
        next.pars = midway(current.pars, target.pars)
        next.bogeys = midway(current.bogeys, target.bogeys)
        next.doublesPlus = midway(current.doublesPlus, target.doublesPlus)
        next.days = midway(current.days, target.days)
        next.bestGross = target.bestGross ?? current.bestGross
        next.bestGrossDate = target.bestGrossDate ?? current.bestGrossDate
        next.bestGrossCourse = target.bestGrossCourse ?? current.bestGrossCourse
        next.months = target.months.isEmpty ? current.months : target.months
        next.lastCard = target.lastCard ?? current.lastCard
        return next
    }

    private static func midway(_ current: Int?, _ target: Int?) -> Int {
        let a = current ?? 0
        let b = target ?? a
        return a + max(0, (b - a) / 2)
    }

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }

    private static func parseRound(_ item: [String: Any]) -> Round? {
        guard let id = item["round_id"] as? String,
              let dateString = item["date"] as? String,
              let date = DayStamp.parse(dateString)
        else { return nil }

        let counts = item["summary_counts"] as? [String: Any] ?? [:]
        let otherCourse = JSONFlex.bool(from: item["other_course"]) ?? ((item["course_key"] as? String)?.hasPrefix("x:") ?? false)
        let holes = (item["holes"] as? [[String: Any]] ?? []).compactMap { hole -> HoleScore? in
            guard let number = JSONFlex.int(from: hole["hole"]) else { return nil }
            let strokes = JSONFlex.int(from: hole["strokes"])
            let par = JSONFlex.int(from: hole["par"]) ?? 4
            let toPar = JSONFlex.int(from: hole["to_par"]) ?? (strokes.map { $0 - par })
            return HoleScore(
                number: number,
                par: par,
                handicap: JSONFlex.int(from: hole["hole_hcp"]) ?? number,
                yards: JSONFlex.int(from: hole["yards"]),
                strokes: strokes,
                toPar: toPar,
                result: HoleResult(className: hole["result_class"] as? String, toPar: toPar)
            )
        }

        return Round(
            roundId: id,
            date: date,
            weekday: item["weekday"] as? String ?? "",
            tournament: item["tournament"] as? String ?? "",
            clubName: item["club_name"] as? String ?? "",
            clubCode: item["club_code"] as? String ?? "",
            course: item["course"] as? String ?? "",
            tee: item["tee"] as? String ?? item["course"] as? String ?? "",
            category: item["category"] as? String,
            weather: item["weather"] as? String,
            courseRating: JSONFlex.double(from: item["course_rating"]) ?? 0,
            slope: JSONFlex.double(from: item["slope"]) ?? (otherCourse ? 0 : 113),
            position: JSONFlex.int(from: item["position"]),
            fieldSize: JSONFlex.int(from: item["field_size"]),
            handicapIndex: JSONFlex.double(from: item["handicap_index"]) ?? 0,
            playingHandicap: JSONFlex.int(from: item["playing_handicap"]),
            outScore: JSONFlex.int(from: item["out"]),
            inScore: JSONFlex.int(from: item["in"]),
            gross: JSONFlex.int(from: item["gross"]),
            net: JSONFlex.int(from: item["net"]),
            cardStatus: item["card_status"] as? String ?? "",
            counts: ScoreCounts(
                birdies: JSONFlex.int(from: counts["birdies"]) ?? 0,
                pars: JSONFlex.int(from: counts["pars"]) ?? 0,
                bogeys: JSONFlex.int(from: counts["bogeys"]) ?? 0,
                doubles: JSONFlex.int(from: counts["double_bogeys"]) ?? 0,
                triples: JSONFlex.int(from: counts["triple_bogeys"]) ?? 0,
                worse: JSONFlex.int(from: counts["worse"]) ?? 0
            ),
            holes: holes,
            holesPlayed: JSONFlex.int(from: item["holes_played"]) ?? holes.count,
            isNineHoles: JSONFlex.bool(from: item["is_9_holes"]) ?? false,
            isValid: JSONFlex.bool(from: item["valid_card"]) ?? ((item["card_status"] as? String) == "OK"),
            differential: JSONFlex.double(from: item["differential_computed"]),
            adjustedGross: JSONFlex.int(from: item["adjusted_gross"]),
            courseHandicap: JSONFlex.int(from: item["course_handicap"]),
            hcpAllowancePct: JSONFlex.int(from: item["hcp_allowance_pct"]),
            courseKey: item["course_key"] as? String ?? (item["course"] as? String ?? ""),
            otherCourse: otherCourse,
            clubPlayed: item["club_played"] as? String,
            sourceClubName: item["source_club_name"] as? String,
            courseLabel: item["course_label"] as? String,
            recapId: item["recap_id"] as? String,
            gpsShots: JSONFlex.int(from: item["gps_shots"]) ?? 0
        )
    }
}

enum FixtureLoader {
    static func array(_ name: String) throws -> [[String: Any]] {
        let data = try data(named: name)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let array = JSONFlex.objectArray(from: object) else { throw GolfletError.decoding(name) }
        return array
    }

    static func data(named name: String) throws -> Data {
        if let embedded = EmbeddedFixtures.json(named: name) {
            return Data(embedded.utf8)
        }
        if let url = url(for: name) {
            return try Data(contentsOf: url)
        }
        throw GolfletError.fixtureMissing(name)
    }

    static func url(for name: String) -> URL? {
        let bundles = [Bundle.main, Bundle(for: FixtureBundleToken.self)]
        let subdirectories = [nil, "Fixtures"]
        for bundle in bundles {
            for subdirectory in subdirectories {
                if let url = bundle.url(forResource: name, withExtension: "json", subdirectory: subdirectory) {
                    return url
                }
            }
        }
        return nil
    }
}

enum DayStamp {
    static func parse(_ raw: String) -> Date? {
        let stamp = String(raw.prefix(10))
        let parts = stamp.split(separator: "-")
        guard parts.count == 3,
              let year = Int(parts[0]),
              let month = Int(parts[1]),
              let day = Int(parts[2])
        else { return parseMonth(raw) }
        return Calendar.gregorian.date(from: DateComponents(
            calendar: Calendar.gregorian,
            timeZone: Calendar.gregorian.timeZone,
            year: year,
            month: month,
            day: day
        ))
    }

    static func formatMonth(_ date: Date) -> String {
        let parts = Calendar.gregorian.dateComponents([.year, .month], from: date)
        return String(format: "%04d-%02d", parts.year ?? 0, parts.month ?? 1)
    }

    static func parseMonth(_ raw: String) -> Date? {
        let stamp = String(raw.prefix(7))
        let parts = stamp.split(separator: "-")
        guard parts.count >= 2,
              let year = Int(parts[0]),
              let month = Int(parts[1])
        else { return nil }
        return Calendar.gregorian.date(from: DateComponents(
            calendar: Calendar.gregorian,
            timeZone: Calendar.gregorian.timeZone,
            year: year,
            month: month,
            day: 1
        ))
    }
}

private final class FixtureBundleToken {}
