import Foundation

struct MockAPIClient: GolfletAPI {
    var autoSession: Bool
    private let demoCode = "118"
    private let demoName = "Jockey Club Buenos Aires"
    private let demoURL = URL(string: "https://golf.e-jockeyclub.org.ar/golf")!

    private static let sessionLock = NSLock()
    private static var mockSignedIn = false
    private static var mockLinked = true
    private static var mockUser = GolfletUser(id: "demo", email: "demo@golflet.app", name: "Jugador Demo")

    init(autoSession: Bool = true) {
        self.autoSession = autoSession
        if autoSession {
            Self.sessionLock.lock()
            Self.mockSignedIn = true
            Self.mockLinked = true
            Self.sessionLock.unlock()
        } else {
            Self.sessionLock.lock()
            Self.mockSignedIn = false
            Self.mockLinked = false
            Self.sessionLock.unlock()
        }
    }

    var isAuthenticated: Bool {
        Self.sessionLock.lock()
        defer { Self.sessionLock.unlock() }
        return Self.mockSignedIn
    }

    var persistsLocally: Bool { true }

    func signUp(name: String, email: String, password: String) async throws {
        _ = password
        Self.sessionLock.lock()
        Self.mockUser = GolfletUser(id: "demo", email: email, name: name.isEmpty ? "Jugador Demo" : name)
        Self.mockSignedIn = true
        Self.mockLinked = false
        Self.sessionLock.unlock()
    }

    func signIn(email: String, password: String) async throws {
        guard password.count >= 8 else { throw GolfletError.server("La contraseña tiene que tener al menos 8 caracteres.") }
        Self.sessionLock.lock()
        Self.mockUser = GolfletUser(id: "demo", email: email, name: "Jugador Demo")
        Self.mockSignedIn = true
        Self.sessionLock.unlock()
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
        let clubs = linked ? [demoClub] : []
        let hi = rounds.sorted { $0.date > $1.date }.first?.handicapIndex ?? 3.1
        return AppSnapshot(
            user: Self.mockUser,
            profile: PlayerProfile(displayName: Self.mockUser.name, initials: initials(Self.mockUser.name), currentHandicap: hi),
            clubs: clubs,
            rounds: rounds,
            courses: courses,
            tees: tees,
            holeStats: stats,
            bag: DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) },
            hiHistory: []
        )
    }

    func clubCatalogue() async throws -> [ClubCatalogEntry] {
        [
            ClubCatalogEntry(id: 1, name: "Jockey Club Argentino", baseURL: demoURL.absoluteString),
            ClubCatalogEntry(id: 2, name: "AAG Scoring (Asociación Argentina de Golf)", baseURL: "https://www.aagscoring.com/golf")
        ]
    }

    func linkClub(clubID: Int?, baseURL: String?, matricula: String, password: String, savePassword: Bool) async throws -> SyncResult {
        _ = clubID
        _ = baseURL
        _ = password
        Self.sessionLock.lock()
        Self.mockLinked = true
        Self.sessionLock.unlock()
        try KeychainStore.save(ClubCredential(
            clubCode: demoCode,
            clubName: demoName,
            baseURL: demoURL.absoluteString,
            matricula: matricula,
            clave: savePassword ? "saved" : ""
        ))
        return SyncResult(ok: true, message: "Club vinculado · datos de demostración")
    }

    func syncAccount(id: String, password: String?, savePassword: Bool) async throws -> SyncResult {
        _ = id
        _ = password
        _ = savePassword
        return SyncResult(ok: true, message: "Datos de demostración al día")
    }

    func forgetPassword(accountId: String) async throws {
        _ = accountId
    }

    func unlink(accountId: String) async throws {
        _ = accountId
        Self.sessionLock.lock()
        Self.mockLinked = false
        Self.sessionLock.unlock()
        KeychainStore.delete(clubCode: demoCode)
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

    private var demoClub: LinkedClub {
        LinkedClub(
            accountId: demoCode,
            code: demoCode,
            name: demoName,
            baseURL: demoURL,
            matricula: "94506",
            isDemo: true,
            passwordSaved: true,
            lastSyncStatus: "ok",
            lastSyncMessage: "Datos de demostración",
            cardCount: 97
        )
    }

    private func loadRounds() async throws -> [Round] {
        let raw: [[String: Any]] = try FixtureLoader.array("rounds")
        return raw.compactMap(Self.parseRound)
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

    private func initials(_ name: String) -> String {
        let parts = name.split(separator: " ")
        let letters = parts.prefix(2).compactMap { $0.first }.map(String.init)
        return letters.joined().uppercased()
    }

    private static let dateParser: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar.gregorian
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    private static func parseRound(_ item: [String: Any]) -> Round? {
        guard let id = item["round_id"] as? String,
              let dateString = item["date"] as? String,
              let date = dateParser.date(from: dateString)
        else { return nil }

        let counts = item["summary_counts"] as? [String: Any] ?? [:]
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
            slope: JSONFlex.double(from: item["slope"]) ?? 113,
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
            isNineHoles: item["is_9_holes"] as? Bool ?? false,
            isValid: item["valid_card"] as? Bool ?? ((item["card_status"] as? String) == "OK"),
            differential: JSONFlex.double(from: item["differential_computed"]),
            adjustedGross: JSONFlex.int(from: item["adjusted_gross"]),
            courseHandicap: JSONFlex.int(from: item["course_handicap"]),
            hcpAllowancePct: JSONFlex.int(from: item["hcp_allowance_pct"]),
            courseKey: item["course"] as? String ?? ""
        )
    }
}

enum FixtureLoader {
    static func array(_ name: String) throws -> [[String: Any]] {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json")
                ?? Bundle.main.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
        else { throw GolfletError.fixtureMissing(name) }
        let data = try Data(contentsOf: url)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let array = object as? [[String: Any]] else { throw GolfletError.decoding(name) }
        return array
    }
}
