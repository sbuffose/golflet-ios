import Foundation

enum LivePayloadMapper {
    static func snapshot(from json: [String: Any]) -> AppSnapshot {
        let userObj = json["user"] as? [String: Any]
        let user = userObj.map {
            GolfletUser(
                id: $0["id"] as? String ?? "",
                email: $0["email"] as? String ?? "",
                name: $0["name"] as? String ?? ""
            )
        }
        let player = json["player"] as? [String: Any]
        let playerName = (player?["name"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let display = (playerName?.isEmpty == false ? playerName : user?.name) ?? "Jugador"
        let playerHI = JSONFlex.double(from: player?["handicap_index"])
        let hiHistory = parseHI(json["hi_history"])
        let clubs = parseClubs(json["clubs"])
        var rounds = parseRounds(json["rounds"])
        rounds = stampHandicap(rounds, history: hiHistory, fallback: playerHI)
        let mappedCourses = parseCourses(json["courses"])
        return AppSnapshot(
            user: user,
            profile: PlayerProfile(
                displayName: display,
                initials: initials(display),
                currentHandicap: playerHI ?? hiHistory.last?.handicap ?? rounds.sorted { $0.date > $1.date }.first?.handicapIndex ?? 0
            ),
            clubs: clubs,
            rounds: rounds,
            courses: mappedCourses.courses,
            tees: mappedCourses.tees,
            holeStats: mappedCourses.stats,
            bag: parseBag(json["bag"]),
            hiHistory: hiHistory
        )
    }

    static func parseClubs(_ raw: Any?) -> [LinkedClub] {
        guard let items = raw as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            let id = item["id"]
            let accountId = (id as? String) ?? (JSONFlex.int(from: id).map(String.init)) ?? ""
            guard !accountId.isEmpty else { return nil }
            let url = URL(string: item["base_url"] as? String ?? "") ?? URL(string: "https://golflet.vercel.app")!
            return LinkedClub(
                accountId: accountId,
                code: item["club_code"] as? String ?? accountId,
                name: item["club_name"] as? String ?? item["name"] as? String ?? "Club",
                baseURL: url,
                matricula: item["matricula"] as? String ?? "",
                isDemo: false,
                passwordSaved: item["password_saved"] as? Bool ?? false,
                lastSyncStatus: item["last_sync_status"] as? String,
                lastSyncMessage: item["last_sync_message"] as? String,
                lastSyncAt: parseDateTime(item["last_sync_at"] as? String),
                cardCount: JSONFlex.int(from: item["rounds"]) ?? 0,
                source: item["source"] as? String ?? "app",
                roundsStored: JSONFlex.int(from: item["rounds_stored"]) ?? JSONFlex.int(from: item["rounds"]) ?? 0,
                roundsWithHoles: JSONFlex.int(from: item["rounds_with_holes"]) ?? 0
            )
        }
    }

    static func parseCatalogue(_ json: [String: Any]) -> [ClubCatalogEntry] {
        let items = json["clubs"] as? [[String: Any]] ?? []
        return items.compactMap { item in
            guard let id = JSONFlex.int(from: item["id"]), let name = item["name"] as? String else { return nil }
            return ClubCatalogEntry(id: id, name: name, baseURL: item["base_url"] as? String ?? "")
        }
    }

    static func parseBag(_ raw: Any?) -> [BagClub] {
        guard let items = raw as? [[String: Any]] else {
            return DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) }
        }
        return items.compactMap { item in
            let name = (item["club"] as? String) ?? (item["name"] as? String)
            guard let name else { return nil }
            return BagClub(name: name, carry: JSONFlex.int(from: item["carry"]), total: JSONFlex.int(from: item["total"]))
        }
    }

    static func parseSync(_ json: [String: Any]) -> SyncResult {
        let sync = json["sync"] as? [String: Any]
        let clubs = parseSyncClubs(sync?["clubs"] ?? json["clubs"])
        let listed = clubs.compactMap(\.listTotal).reduce(0, +)
        let accountRounds = parseClubs(json["accounts"]).map(\.cardCount).reduce(0, +)
        let cards = JSONFlex.int(from: sync?["rounds"] ?? sync?["cards"] ?? json["rounds"] ?? json["count"])
            ?? (listed > 0 ? listed : nil)
            ?? (accountRounds > 0 ? accountRounds : nil)
        let added = JSONFlex.int(from: sync?["new_rounds"] ?? sync?["new"] ?? sync?["added"] ?? json["new"])
            ?? clubs.compactMap(\.newRounds).reduce(0, +)
        return SyncResult(
            ok: (sync?["ok"] as? Bool) ?? true,
            message: (sync?["message"] as? String) ?? (json["message"] as? String) ?? "Listo",
            cardCount: cards,
            newCards: added,
            clubs: clubs
        )
    }

    static func parseSyncClubs(_ raw: Any?) -> [SyncClubResult] {
        guard let items = raw as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            let id = item["account_id"] ?? item["id"]
            let accountId = (id as? String) ?? (JSONFlex.int(from: id).map(String.init)) ?? ""
            guard !accountId.isEmpty else { return nil }
            return SyncClubResult(
                accountId: accountId,
                clubName: item["club_name"] as? String ?? item["name"] as? String ?? "Club",
                ok: JSONFlex.bool(from: item["ok"]) ?? true,
                newRounds: JSONFlex.int(from: item["new_rounds"] ?? item["new"]),
                updated: JSONFlex.int(from: item["updated"]),
                pending: JSONFlex.int(from: item["pending"]),
                listTotal: JSONFlex.int(from: item["list_total"] ?? item["rounds"]),
                message: item["message"] as? String
            )
        }
    }

    static func accountError(status: Int, json: [String: Any] = [:]) -> GolfletError? {
        _ = json
        switch status {
        case 422:
            return .wrongGolfisticsCredentials
        case 502:
            return .golfisticsAppDown
        default:
            return nil
        }
    }

    static func authMessage(from json: [String: Any], fallback: String) -> String {
        let code = (json["code"] as? String) ?? ""
        if code.contains("INVALID_EMAIL_OR_PASSWORD") { return "Email o contraseña incorrectos." }
        if code.contains("USER_ALREADY_EXISTS") { return "Ya existe una cuenta con ese email. Entrá con tu contraseña." }
        if code.contains("PASSWORD_TOO_SHORT") { return "La contraseña tiene que tener al menos 8 caracteres." }
        return (json["message"] as? String) ?? (json["error"] as? String) ?? fallback
    }

    private static func parseHI(_ raw: Any?) -> [HIPoint] {
        guard let items = raw as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            guard let date = parseDay(item["date"] as? String),
                  let hi = JSONFlex.double(from: item["hi"] ?? item["handicap"] ?? item["handicap_index"])
            else { return nil }
            return HIPoint(date: date, handicap: hi)
        }.sorted { $0.date < $1.date }
    }

    private static func parseRounds(_ raw: Any?) -> [Round] {
        guard let items = raw as? [[String: Any]] else { return [] }
        return items.compactMap(parseRound)
    }

    private static func parseRound(_ item: [String: Any]) -> Round? {
        guard let id = item["round_id"] as? String ?? item["id"] as? String,
              let date = parseDay(item["date"] as? String)
        else { return nil }
        let holes = parseHoles(item["holes"])
        let counts = item["summary_counts"] as? [String: Any] ?? [:]
        let course = item["course"] as? String ?? ""
        let otherCourse = JSONFlex.bool(from: item["other_course"]) ?? false
        let courseKey = item["course_key"] as? String ?? course
        let out = holes.filter { $0.number <= 9 }.compactMap(\.strokes).reduce(0, +)
        let inn = holes.filter { $0.number > 9 }.compactMap(\.strokes).reduce(0, +)
        return Round(
            roundId: id,
            date: date,
            weekday: item["weekday"] as? String ?? "",
            tournament: item["tournament"] as? String ?? "",
            clubName: item["club_name"] as? String ?? item["club_played"] as? String ?? "",
            clubCode: item["club_code"] as? String ?? "",
            course: course,
            tee: item["tee"] as? String ?? "",
            category: item["category"] as? String,
            weather: item["weather"] as? String,
            courseRating: JSONFlex.double(from: item["course_rating"]) ?? 0,
            slope: JSONFlex.double(from: item["slope"]) ?? (otherCourse || courseKey.hasPrefix("x:") ? 0 : 113),
            position: JSONFlex.int(from: item["position"]),
            fieldSize: JSONFlex.int(from: item["field_size"]),
            handicapIndex: JSONFlex.double(from: item["handicap_index"]) ?? 0,
            playingHandicap: JSONFlex.int(from: item["playing_handicap"]),
            outScore: JSONFlex.int(from: item["out"]) ?? (holes.isEmpty ? nil : out),
            inScore: JSONFlex.int(from: item["in"]) ?? (holes.count > 9 ? inn : nil),
            gross: JSONFlex.int(from: item["gross"]),
            net: JSONFlex.int(from: item["net"]),
            cardStatus: item["card_status"] as? String ?? ((item["valid_card"] as? Bool) == false ? "DES" : "OK"),
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
            isValid: JSONFlex.bool(from: item["valid_card"]) ?? true,
            differential: JSONFlex.double(from: item["differential_computed"]),
            adjustedGross: JSONFlex.int(from: item["adjusted_gross"]),
            courseHandicap: JSONFlex.int(from: item["course_handicap"]),
            hcpAllowancePct: JSONFlex.int(from: item["hcp_allowance_pct"]),
            courseKey: courseKey,
            putts: JSONFlex.int(from: item["putts"]),
            gir: JSONFlex.int(from: item["gir"]),
            fir: JSONFlex.int(from: item["fir"]),
            notes: item["notes"] as? String,
            notesAt: parseDateTime(item["notes_at"] as? String),
            otherCourse: otherCourse || courseKey.hasPrefix("x:"),
            clubPlayed: item["club_played"] as? String,
            sourceClubName: item["source_club_name"] as? String,
            courseLabel: item["course_label"] as? String,
            recapId: item["recap_id"] as? String,
            gpsShots: JSONFlex.int(from: item["gps_shots"]) ?? 0
        )
    }

    private static func parseHoles(_ raw: Any?) -> [HoleScore] {
        if let objects = raw as? [[String: Any]] {
            return objects.compactMap { hole in
                guard let number = JSONFlex.int(from: hole["hole"] ?? hole["number"]) else { return nil }
                let par = JSONFlex.int(from: hole["par"]) ?? 4
                let strokes = JSONFlex.int(from: hole["strokes"])
                let toPar = JSONFlex.int(from: hole["to_par"]) ?? (strokes.map { $0 - par })
                return HoleScore(
                    number: number,
                    par: par,
                    handicap: JSONFlex.int(from: hole["hole_hcp"] ?? hole["hcp"]) ?? number,
                    yards: JSONFlex.int(from: hole["yards"]),
                    strokes: strokes,
                    toPar: toPar,
                    result: HoleResult(className: hole["result_class"] as? String, toPar: toPar)
                )
            }
        }
        if let tuples = raw as? [[Any]] {
            return tuples.compactMap { row in
                guard let number = JSONFlex.int(from: row[safe: 0]) else { return nil }
                let par = JSONFlex.int(from: row[safe: 1]) ?? 4
                let strokes = JSONFlex.int(from: row[safe: 2])
                let toPar = strokes.map { $0 - par }
                return HoleScore(
                    number: number,
                    par: par,
                    handicap: number,
                    yards: nil,
                    strokes: strokes,
                    toPar: toPar,
                    result: HoleResult(className: nil, toPar: toPar)
                )
            }
        }
        return []
    }

    private static func parseCourses(_ raw: Any?) -> (courses: [Course], tees: [TeeRating], stats: [CourseHoleStats]) {
        guard let items = raw as? [[String: Any]] else { return ([], [], []) }
        var courses: [Course] = []
        var tees: [TeeRating] = []
        var stats: [CourseHoleStats] = []
        for item in items {
            let name = item["course"] as? String ?? item["label"] as? String ?? ""
            let clubName = item["club_name"] as? String ?? ""
            let clubCode = item["club_code"] as? String ?? (item["key"] as? String)?.split(separator: ":").first.map(String.init) ?? ""
            let holesRaw = item["holes"] as? [[String: Any]] ?? []
            let holes: [CourseHole] = holesRaw.compactMap { hole in
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
                    handicap: JSONFlex.int(from: hole["hcp"] ?? hole["hole_hcp"]) ?? number,
                    yards: yards
                )
            }
            courses.append(Course(clubCode: clubCode, clubName: clubName, name: name, holes: holes))

            if let teeMap = item["tees"] as? [String: Any] {
                for (teeName, value) in teeMap {
                    guard let info = value as? [String: Any] else { continue }
                    tees.append(TeeRating(
                        clubCode: clubCode,
                        course: name,
                        tee: teeName.capitalized,
                        courseRating: JSONFlex.double(from: info["course_rating"]) ?? 0,
                        slope: JSONFlex.int(from: info["slope"]) ?? 113,
                        gender: nil
                    ))
                }
            }

            let holeStats: [HoleStat] = holesRaw.compactMap { hole in
                guard let number = JSONFlex.int(from: hole["hole"]) else { return nil }
                let st = hole["stats"] as? [String: Any] ?? hole
                let dist = (st["dist"] as? [String: Any]) ?? [:]
                let comps = hole["compare"] as? [String: Any] ?? hole["site_comparison"] as? [String: Any] ?? [:]
                return HoleStat(
                    number: number,
                    par: JSONFlex.int(from: hole["par"]) ?? 4,
                    handicap: JSONFlex.int(from: hole["hcp"] ?? hole["hole_hcp"]) ?? number,
                    samples: JSONFlex.int(from: st["n"]) ?? 0,
                    average: JSONFlex.double(from: st["avg"]) ?? 0,
                    averageToPar: JSONFlex.double(from: st["avg_to_par"]) ?? 0,
                    averageLast16: JSONFlex.double(from: st["avg_last16"]),
                    best: JSONFlex.int(from: st["best"]),
                    worst: JSONFlex.int(from: st["worst"]),
                    distribution: HoleDistribution(
                        eagleOrBetter: JSONFlex.int(from: dist["eagle_or_better"]) ?? 0,
                        birdie: JSONFlex.int(from: dist["birdie"]) ?? 0,
                        par: JSONFlex.int(from: dist["par"]) ?? 0,
                        bogey: JSONFlex.int(from: dist["bogey"]) ?? 0,
                        double: JSONFlex.int(from: dist["double"]) ?? 0,
                        triplePlus: JSONFlex.int(from: dist["triple_plus"]) ?? 0
                    ),
                    comparisons: comps.compactMap { key, value in
                        guard let map = value as? [String: Any] else { return nil }
                        return SiteComparison(
                            key: key,
                            playerPct: JSONFlex.double(from: map["player_pct"]) ?? 0,
                            groupPct: JSONFlex.double(from: map["group_pct"]) ?? 0
                        )
                    }
                )
            }
            stats.append(CourseHoleStats(
                clubCode: clubCode,
                clubName: clubName,
                course: name,
                rounds: JSONFlex.int(from: item["rounds"]) ?? holeStats.first?.samples ?? 0,
                holes: holeStats
            ))
        }
        return (courses, tees, stats)
    }

    private static func stampHandicap(_ rounds: [Round], history: [HIPoint], fallback: Double?) -> [Round] {
        guard !rounds.isEmpty else { return rounds }
        return rounds.map { round in
            var copy = round
            if let match = history.last(where: { $0.date <= round.date }) {
                copy.handicapIndex = match.handicap
            } else if let fallback {
                copy.handicapIndex = fallback
            }
            return copy
        }
    }

    private static func parseDay(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        if let d = DayStamp.parse(raw) { return d }
        return parseDateTime(raw)
    }

    private static func parseDateTime(_ raw: String?) -> Date? {
        guard let raw else { return nil }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = iso.date(from: raw) { return d }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: raw)
    }

    private static func initials(_ name: String) -> String {
        let parts = name.split(separator: " ").filter { !$0.isEmpty }
        let letters = parts.prefix(2).compactMap { $0.first }.map(String.init)
        return letters.isEmpty ? "JD" : letters.joined().uppercased()
    }
}

private extension Array {
    subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
