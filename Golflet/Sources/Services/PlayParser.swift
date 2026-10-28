import Foundation

enum PlayParser {
    static func courses(_ json: [String: Any]) -> GPSCourseList {
        GPSCourseList(
            courses: (json["courses"] as? [[String: Any]] ?? []).compactMap { parseCourse($0, nearby: false) },
            nearby: (json["nearby"] as? [[String: Any]] ?? []).compactMap { parseCourse($0, nearby: true) }
        )
    }

    static func courseDetail(_ json: [String: Any]) -> GPSCourseDetail? {
        let blob = (json["course"] as? [String: Any]) ?? json
        guard let id = blob["course_id"] as? String else { return nil }
        let holes = (blob["holes"] as? [[String: Any]] ?? []).compactMap(parseHole)
        return GPSCourseDetail(
            courseId: id,
            clubCode: blob["club_code"] as? String ?? "",
            clubName: blob["club_name"] as? String ?? "",
            course: blob["course"] as? String ?? blob["label"] as? String ?? "",
            courseKey: blob["course_key"] as? String ?? CourseIdentity.key(for: blob["course"] as? String ?? ""),
            par: JSONFlex.int(from: blob["par"]) ?? 72,
            holeCount: JSONFlex.int(from: blob["hole_count"]) ?? holes.count,
            holes: holes,
            warnings: blob["warnings"] as? [String] ?? [],
            attribution: (blob["sources"] as? [String: Any])?["attribution"] as? String
        )
    }

    static func liveRound(_ raw: Any?) -> LiveRound? {
        guard let blob = raw as? [String: Any], let id = blob["id"] as? String else { return nil }
        return LiveRound(
            id: id,
            courseId: blob["course_id"] as? String,
            clubCode: blob["club_code"] as? String,
            course: blob["course"] as? String,
            date: blob["date"] as? String ?? "",
            tee: blob["tee"] as? String,
            currentHole: JSONFlex.int(from: blob["current_hole"]) ?? 1,
            startedAt: parseDate(blob["started_at"]),
            endedAt: parseDate(blob["ended_at"]),
            roundId: blob["round_id"] as? String,
            recapId: blob["recap_id"] as? String,
            shots: JSONFlex.int(from: blob["shots"]) ?? 0
        )
    }

    static func shot(_ raw: Any?) -> Shot? {
        guard let blob = raw as? [String: Any], let id = blob["id"] as? String else { return nil }
        return Shot(
            id: id,
            clientId: blob["client_id"] as? String,
            hole: JSONFlex.int(from: blob["hole"]) ?? 1,
            shotNumber: JSONFlex.int(from: blob["shot_number"]) ?? 1,
            lat: JSONFlex.double(from: blob["lat"]),
            lng: JSONFlex.double(from: blob["lng"]),
            accuracyM: JSONFlex.double(from: blob["accuracy_m"]),
            takenAt: parseDate(blob["taken_at"]),
            club: blob["club"] as? String,
            lie: blob["lie"] as? String,
            result: blob["result"] as? String,
            direction: blob["direction"] as? String,
            length: blob["length"] as? String,
            mishit: JSONFlex.bool(from: blob["mishit"]) ?? false,
            distanceM: JSONFlex.int(from: blob["distance_m"]),
            distanceYd: JSONFlex.int(from: blob["distance_yd"]),
            toGreenYd: JSONFlex.int(from: blob["to_green_yd"])
        )
    }

    static func recap(_ raw: Any?) -> Recap? {
        guard let blob = raw as? [String: Any], let id = blob["id"] as? String else { return nil }
        let audio = blob["audio"] as? [String: Any]
        return Recap(
            id: id,
            roundId: blob["round_id"] as? String,
            liveRoundId: blob["live_round_id"] as? String,
            status: blob["status"] as? String ?? "ready",
            error: blob["error"] as? String,
            hasAudio: blob["has_audio"] as? Bool ?? (audio != nil),
            transcript: blob["transcript"] as? String,
            summary: blob["summary"] as? String,
            mistakes: (blob["mistakes"] as? [[String: Any]] ?? []).compactMap { item in
                guard let text = item["text"] as? String else { return nil }
                return RecapMistake(category: item["category"] as? String ?? "otro", hole: JSONFlex.int(from: item["hole"]), text: text)
            },
            positives: (blob["positives"] as? [[String: Any]] ?? []).compactMap { item in
                guard let text = item["text"] as? String else { return nil }
                return RecapPositive(hole: JSONFlex.int(from: item["hole"]), text: text)
            },
            source: blob["source"] as? String,
            durationS: JSONFlex.double(from: blob["duration_s"]) ?? JSONFlex.double(from: audio?["duration_s"])
        )
    }

    static func strategy(_ json: [String: Any]) -> CourseStrategy {
        let holes = (json["holes"] as? [[String: Any]] ?? []).compactMap(holeStrategy)
        let published = (json["published_holes"] as? [Any])?.compactMap { JSONFlex.int(from: $0) } ?? holes.map(\.hole)
        return CourseStrategy(
            courseId: json["course_id"] as? String ?? "",
            courseKey: json["course_key"] as? String ?? "",
            overview: json["overview"] as? String,
            overviewPublishedAt: json["overview_published_at"] as? String,
            publishedHoles: published,
            holes: holes
        )
    }

    static func holeStrategy(_ blob: [String: Any]) -> HoleStrategy? {
        guard let hole = JSONFlex.int(from: blob["hole"]) else { return nil }
        let variants = blob["variants"] as? [String: Any] ?? [:]
        return HoleStrategy(
            hole: hole,
            planTitle: blob["plan_title"] as? String,
            planText: blob["plan_text"] as? String,
            teeClub: blob["tee_club"] as? String,
            teeTarget: blob["tee_target"] as? String,
            target: coord(blob["target"]),
            hazards: (blob["hazards"] as? [[String: Any]] ?? []).compactMap(hazard),
            why: blob["why"] as? String,
            missSide: blob["miss_side"] as? String,
            missNote: blob["miss_note"] as? String,
            greenSlope: blob["green_slope"] as? String,
            greenLeave: blob["green_leave"] as? String,
            greenNotes: blob["green_notes"] as? String,
            variants: [
                .scratch: variant(variants["scratch"]),
                .medio: variant(variants["medio"]),
                .alto: variant(variants["alto"])
            ].compactMapValues { $0 },
            publishedAt: blob["published_at"] as? String
        )
    }

    private static func hazard(_ blob: [String: Any]) -> StrategyHazard? {
        let type = blob["type"] as? String ?? "otro"
        return StrategyHazard(
            id: blob["id"] as? String ?? UUID().uuidString,
            type: type,
            typeLabel: blob["type_label"] as? String ?? type.capitalized,
            side: blob["side"] as? String,
            sideLabel: blob["side_label"] as? String,
            fromYd: JSONFlex.int(from: blob["from_yd"]),
            carryYd: JSONFlex.int(from: blob["carry_yd"]),
            fromM: JSONFlex.int(from: blob["from_m"]),
            carryM: JSONFlex.int(from: blob["carry_m"]),
            note: blob["note"] as? String,
            at: coord(blob["at"])
        )
    }

    private static func variant(_ raw: Any?) -> StrategyVariant? {
        guard let blob = raw as? [String: Any] else { return nil }
        let club = blob["tee_club"] as? String
        let plan = blob["plan"] as? String
        if (club ?? "").isEmpty, (plan ?? "").isEmpty { return nil }
        return StrategyVariant(teeClub: club, plan: plan)
    }

    static func recurring(_ json: [String: Any]) -> RecurringReport {
        let items = (json["items"] as? [[String: Any]] ?? []).compactMap { item -> RecurringItem? in
            guard let category = item["category"] as? String else { return nil }
            return RecurringItem(
                category: category,
                label: item["label"] as? String ?? RecapCopy.category(category),
                rounds: JSONFlex.int(from: item["rounds"]) ?? 0,
                of: JSONFlex.int(from: item["of"]) ?? 0,
                share: JSONFlex.double(from: item["share"]) ?? 0,
                mentions: JSONFlex.int(from: item["mentions"]) ?? 0,
                holes: (item["holes"] as? [[String: Any]] ?? []).compactMap { hole in
                    guard let n = JSONFlex.int(from: hole["hole"]) else { return nil }
                    return RecurringHole(hole: n, mentions: JSONFlex.int(from: hole["mentions"]) ?? 0)
                },
                text: item["text"] as? String ?? "",
                examples: (item["examples"] as? [[String: Any]] ?? []).compactMap { ex in
                    guard let text = ex["text"] as? String else { return nil }
                    return RecurringExample(date: ex["date"] as? String ?? "", hole: JSONFlex.int(from: ex["hole"]), text: text)
                }
            )
        }
        return RecurringReport(
            roundsConsidered: JSONFlex.int(from: json["rounds_considered"]) ?? 0,
            lastN: JSONFlex.int(from: json["last_n"]) ?? 10,
            items: items
        )
    }

    static func clubStats(_ raw: Any?) -> ClubStats? {
        guard let blob = raw as? [String: Any], let club = blob["club"] as? String else { return nil }
        let distance = blob["distance"] as? [String: Any]
        let direction = blob["direction"] as? [String: Any]
        let length = blob["length_on_approach"] as? [String: Any]
        return ClubStats(
            club: club,
            label: blob["label"] as? String ?? ClubCode.label(for: club),
            shots: JSONFlex.int(from: blob["shots"]) ?? 0,
            distance: distance.map {
                ClubDistanceBlock(
                    n: JSONFlex.int(from: $0["n"]) ?? 0,
                    avgM: JSONFlex.int(from: $0["avg_m"]),
                    medianM: JSONFlex.int(from: $0["median_m"]),
                    maxM: JSONFlex.int(from: $0["max_m"]),
                    avgYd: JSONFlex.int(from: $0["avg_yd"]),
                    medianYd: JSONFlex.int(from: $0["median_yd"]),
                    maxYd: JSONFlex.int(from: $0["max_yd"]),
                    rangeYd: ($0["range_yd"] as? [Any])?.compactMap { JSONFlex.int(from: $0) } ?? [],
                    spreadYd: JSONFlex.int(from: $0["spread_yd"])
                )
            },
            direction: direction.map {
                ClubSplit(
                    left: JSONFlex.int(from: $0["left"]) ?? 0,
                    center: JSONFlex.int(from: $0["center"]) ?? 0,
                    right: JSONFlex.int(from: $0["right"]) ?? 0,
                    n: JSONFlex.int(from: $0["n"]) ?? 0
                )
            },
            lengthOnApproach: length.map {
                ClubLengthSplit(
                    short: JSONFlex.int(from: $0["short"]) ?? 0,
                    on: JSONFlex.int(from: $0["on"]) ?? 0,
                    long: JSONFlex.int(from: $0["long"]) ?? 0,
                    n: JSONFlex.int(from: $0["n"]) ?? 0
                )
            },
            greensHit: rate(blob["greens_hit"]),
            fairwaysHit: rate(blob["fairways_hit"]),
            mishit: rate(blob["mishit"]),
            tendency: blob["tendency"] as? String
        )
    }

    static func clubDetail(_ json: [String: Any]) -> ClubStatsDetail? {
        guard let club = clubStats(json["club"]) else { return nil }
        let recent = (json["recent_shots"] as? [[String: Any]] ?? []).compactMap { item -> ClubRecentShot? in
            guard let id = item["id"] as? String else { return nil }
            return ClubRecentShot(
                id: id,
                date: item["date"] as? String,
                hole: JSONFlex.int(from: item["hole"]),
                distanceYd: JSONFlex.int(from: item["distance_yd"]),
                result: item["result"] as? String,
                direction: item["direction"] as? String,
                mishit: JSONFlex.bool(from: item["mishit"]) ?? false
            )
        }
        return ClubStatsDetail(club: club, recent: recent)
    }

    static func metric(_ json: [String: Any]) -> MetricDrilldown {
        MetricDrilldown(
            metric: json["metric"] as? String ?? "",
            total: JSONFlex.int(from: json["total"]),
            current: JSONFlex.double(from: json["current"]),
            change: JSONFlex.double(from: json["change"]),
            rounds: (json["rounds"] as? [[String: Any]] ?? []).compactMap { item in
                guard let id = item["round_id"] as? String else { return nil }
                return MetricAPIRound(
                    roundId: id,
                    date: (item["date"] as? String).flatMap(DayStamp.parse),
                    tournament: item["tournament"] as? String,
                    clubName: item["club_name"] as? String,
                    course: item["course"] as? String,
                    courseKey: item["course_key"] as? String,
                    courseLabel: item["course_label"] as? String,
                    tee: item["tee"] as? String,
                    gross: JSONFlex.int(from: item["gross"]),
                    net: JSONFlex.int(from: item["net"]),
                    valid: JSONFlex.bool(from: item["valid"]) ?? true,
                    isNineHoles: JSONFlex.bool(from: item["is_9_holes"]) ?? false,
                    otherCourse: JSONFlex.bool(from: item["other_course"]) ?? false,
                    count: JSONFlex.int(from: item["count"]),
                    holes: (item["holes"] as? [Any])?.compactMap { JSONFlex.int(from: $0) } ?? [],
                    holesKnown: JSONFlex.bool(from: item["holes_known"]) ?? true
                )
            },
            perHole: (json["per_hole"] as? [[String: Any]] ?? []).compactMap { item in
                guard let hole = JSONFlex.int(from: item["hole"]) else { return nil }
                return MetricAPIHole(
                    courseKey: item["course_key"] as? String,
                    courseLabel: item["course_label"] as? String ?? "",
                    hole: hole,
                    par: JSONFlex.int(from: item["par"]),
                    count: JSONFlex.int(from: item["count"]) ?? 0
                )
            },
            history: (json["history"] as? [[String: Any]] ?? []).compactMap { item in
                guard let hi = JSONFlex.double(from: item["hi"]) else { return nil }
                return MetricAPIHistory(date: (item["date"] as? String).flatMap(DayStamp.parse), hi: hi, club: item["club"] as? String)
            },
            summaryRounds: JSONFlex.int(from: (json["summary"] as? [String: Any])?["rounds"]),
            averageGross: JSONFlex.double(from: (json["summary"] as? [String: Any])?["average_gross"]),
            bestGross: JSONFlex.int(from: (json["summary"] as? [String: Any])?["best_gross"])
        )
    }

    private static func parseCourse(_ blob: [String: Any], nearby: Bool) -> GPSCourseSummary? {
        guard let id = blob["course_id"] as? String else { return nil }
        return GPSCourseSummary(
            courseId: id,
            clubCode: blob["club_code"] as? String ?? "",
            clubName: blob["club_name"] as? String ?? "",
            course: blob["course"] as? String ?? blob["label"] as? String ?? "",
            label: blob["label"] as? String ?? blob["course"] as? String ?? id,
            courseKey: blob["course_key"] as? String ?? "",
            holesCached: JSONFlex.int(from: blob["holes_cached"]) ?? 0,
            mine: blob["mine"] as? Bool ?? !nearby,
            distanceKm: JSONFlex.double(from: blob["distance_km"])
        )
    }

    private static func parseHole(_ blob: [String: Any]) -> GPSHole? {
        guard let number = JSONFlex.int(from: blob["hole"]) else { return nil }
        let green = blob["green"] as? [String: Any] ?? [:]
        let tee = blob["tee"] as? [String: Any]
        var yards: [String: Int] = [:]
        if let map = blob["yards"] as? [String: Any] {
            for (key, value) in map {
                if let y = JSONFlex.int(from: value) { yards[key] = y }
            }
        }
        return GPSHole(
            number: number,
            par: JSONFlex.int(from: blob["par"]) ?? 4,
            hcp: JSONFlex.int(from: blob["hcp"]),
            yards: yards,
            green: GPSGreen(front: coord(green["front"]), center: coord(green["center"]), back: coord(green["back"])),
            tee: coord(tee)
        )
    }

    private static func coord(_ raw: Any?) -> GPSCoord? {
        guard let blob = raw as? [String: Any],
              let lat = JSONFlex.double(from: blob["lat"]),
              let lng = JSONFlex.double(from: blob["lng"])
        else { return nil }
        return GPSCoord(lat: lat, lng: lng)
    }

    private static func rate(_ raw: Any?) -> ClubRate? {
        guard let blob = raw as? [String: Any] else { return nil }
        return ClubRate(
            pct: JSONFlex.int(from: blob["pct"]) ?? 0,
            hit: JSONFlex.int(from: blob["hit"] ?? blob["count"]) ?? 0,
            of: JSONFlex.int(from: blob["of"]) ?? 0
        )
    }

    private static func parseDate(_ raw: Any?) -> Date? {
        guard let text = raw as? String else { return nil }
        if let day = DayStamp.parse(text), text.count <= 10 { return day }
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = iso.date(from: text) { return date }
        iso.formatOptions = [.withInternetDateTime]
        return iso.date(from: text)
    }
}