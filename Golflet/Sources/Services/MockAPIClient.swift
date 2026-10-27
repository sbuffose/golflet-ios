import Foundation

struct MockAPIClient: GolfletAPI {
    private let demoCode = "118"
    private let demoName = "Jockey Club Buenos Aires"
    private let demoURL = URL(string: "https://golf.e-jockeyclub.org.ar/golf")!

    func login(clubURL: URL, matricula: String, clave: String) async throws -> LinkedClub {
        let recognized = recognizedClub(from: clubURL)
        let credential = ClubCredential(
            clubCode: recognized.code,
            clubName: recognized.name,
            baseURL: recognized.url.absoluteString,
            matricula: matricula,
            clave: clave
        )
        try KeychainStore.save(credential)
        return LinkedClub(
            code: recognized.code,
            name: recognized.name,
            baseURL: recognized.url,
            matricula: matricula,
            isDemo: recognized.code == demoCode
        )
    }

    func linkedClubs() async throws -> [LinkedClub] {
        var stored = KeychainStore.loadAll().map {
            LinkedClub(
                code: $0.clubCode,
                name: $0.clubName,
                baseURL: URL(string: $0.baseURL) ?? demoURL,
                matricula: $0.matricula,
                isDemo: $0.clubCode == demoCode
            )
        }
        if stored.isEmpty {
            let demo = ClubCredential(
                clubCode: demoCode,
                clubName: demoName,
                baseURL: demoURL.absoluteString,
                matricula: "94506",
                clave: "demo"
            )
            try? KeychainStore.save(demo)
            stored = [
                LinkedClub(code: demoCode, name: demoName, baseURL: demoURL, matricula: "94506", isDemo: true)
            ]
        }
        return stored
    }

    func unlink(clubCode: String) async throws {
        KeychainStore.delete(clubCode: clubCode)
    }

    func profile() async throws -> PlayerProfile {
        let rounds = try await self.rounds(filter: RoundFilter())
        let hi = rounds.sorted { $0.date > $1.date }.first?.handicapIndex ?? 3.1
        return PlayerProfile(displayName: "Jugador Demo", initials: "JD", currentHandicap: hi)
    }

    func rounds(filter: RoundFilter) async throws -> [Round] {
        let raw: [[String: Any]] = try FixtureLoader.array("rounds")
        let parsed = raw.compactMap(Self.parseRound)
        return parsed.filter { round in
            if let course = filter.course, round.course.caseInsensitiveCompare(course) != .orderedSame {
                return false
            }
            if let club = filter.clubCode, round.clubCode != club { return false }
            return true
        }
    }

    func courses() async throws -> [Course] {
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

    func tees() async throws -> [TeeRating] {
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

    func holeStats() async throws -> [CourseHoleStats] {
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

    func bag() async throws -> [BagClub] {
        DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) }
    }

    func saveBag(_ items: [BagClub]) async throws {}

    private func recognizedClub(from url: URL) -> (code: String, name: String, url: URL) {
        let host = url.host?.lowercased() ?? ""
        if host.contains("jockey") || host.contains("e-jockeyclub") || url.absoluteString.isEmpty {
            return (demoCode, demoName, demoURL)
        }
        let slug = host.split(separator: ".").first.map(String.init) ?? "club"
        return (slug, url.host ?? "Club Golfistics", url)
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
            hcpAllowancePct: JSONFlex.int(from: item["hcp_allowance_pct"])
        )
    }
}

enum FixtureLoader {
    static func array(_ name: String) throws -> [[String: Any]] {
        guard let url = url(for: name) else { throw GolfletError.fixtureMissing(name) }
        let data = try Data(contentsOf: url)
        let object = try JSONSerialization.jsonObject(with: data)
        guard let array = object as? [[String: Any]] else { throw GolfletError.decoding(name) }
        return array
    }

    private static func url(for name: String) -> URL? {
        let bundles = [Bundle.main, Bundle(for: FixtureBundleToken.self)] + Bundle.allBundles
        var seen = Set<ObjectIdentifier>()
        for bundle in bundles {
            let token = ObjectIdentifier(bundle)
            guard seen.insert(token).inserted else { continue }
            if let url = bundle.url(forResource: name, withExtension: "json")
                ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
                ?? bundle.url(forResource: name, withExtension: "json", subdirectory: "Golflet/Resources/Fixtures") {
                return url
            }
        }
        return nil
    }
}

private final class FixtureBundleToken {}
