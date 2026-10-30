import Foundation

enum PlanParser {
    static func setup(_ json: [String: Any]) -> PlanSetup {
        let courses = JSONFlex.objectArray(from: json["courses"] ?? [])?.compactMap(course) ?? []
        return PlanSetup(courses: courses, today: string(json["today"]))
    }

    static func detail(_ json: [String: Any]) -> PlanDetail? {
        let planBlob = (json["plan"] as? [String: Any]) ?? json
        guard let plan = record(planBlob) else { return nil }
        let courseBlob = json["course"] as? [String: Any] ?? [:]
        let holes = JSONFlex.objectArray(from: json["holes"] ?? [])?.compactMap(hole) ?? []
        let forecast = json["forecast"] as? [String: Any]
        let wind = json["wind_model"] as? [String: Any]
        return PlanDetail(
            plan: plan,
            course: courseInfo(courseBlob, fallback: plan),
            holes: holes,
            forecastStatus: string(forecast?["status"]),
            windModel: string(wind?["label"]).isEmpty ? PlanCore.windLabel : string(wind?["label"]),
            torneo: torneo(json["torneo"])
        )
    }

    static func clubs(_ json: [String: Any]) -> [PlanBagEntry] {
        JSONFlex.objectArray(from: json["clubs"] ?? [])?.compactMap(club) ?? []
    }

    static func courseMap(_ json: [String: Any]) -> CourseMap? {
        let club = string(json["club_code"])
        let course = string(json["course"])
        guard !club.isEmpty, !course.isEmpty else { return nil }
        let holes = JSONFlex.objectArray(from: json["holes"] ?? [])?.compactMap(mapHole) ?? []
        let ref = (json["marker_ref"] as? [String: Any]).flatMap { string($0["to"]) }
        return CourseMap(clubCode: club, course: course, holes: holes, markerRef: ref)
    }

    static func savedShots(_ raw: Any?) -> [PlanSavedShot] {
        JSONFlex.objectArray(from: raw ?? [])?.compactMap(savedShot) ?? []
    }

    private static func course(_ blob: [String: Any]) -> PlanSetupCourse? {
        let code = string(blob["club_code"])
        let course = string(blob["course"])
        guard !code.isEmpty, !course.isEmpty else { return nil }
        return PlanSetupCourse(
            clubCode: code,
            course: course,
            clubName: string(blob["club_name"]),
            holes: JSONFlex.int(from: blob["holes"]) ?? 18,
            mine: blob["mine"] as? Bool ?? true
        )
    }

    private static func record(_ blob: [String: Any]) -> PlanRecord? {
        let id = string(blob["id"])
        guard !id.isEmpty else { return nil }
        return PlanRecord(
            id: id,
            clubCode: string(blob["club_code"]),
            course: string(blob["course"]),
            date: string(blob["date"]),
            teeTime: string(blob["tee_time"]),
            startHole: JSONFlex.int(from: blob["start_hole"]) ?? 1,
            minPerHole: JSONFlex.double(from: blob["min_per_hole"]) ?? PlanCore.defaultMinPerHole,
            distSource: string(blob["dist_source"]).isEmpty ? "libreto" : string(blob["dist_source"]),
            teeTimeID: optional(blob["tee_time_id"])
        )
    }

    private static func courseInfo(_ blob: [String: Any], fallback: PlanRecord) -> PlanCourseInfo {
        PlanCourseInfo(
            clubCode: string(blob["club_code"]).ifEmpty(fallback.clubCode),
            course: string(blob["course"]).ifEmpty(fallback.course),
            clubName: string(blob["club_name"]),
            numberingUnconfirmed: blob["numbering_unconfirmed"] as? Bool ?? false,
            usualTee: optional(blob["usual_tee"])?.uppercased(),
            hasMap: blob["map"] as? Bool ?? true,
            hasGreenGuide: blob["green_guide"] as? Bool ?? false
        )
    }

    private static func hole(_ blob: [String: Any]) -> PlanHoleRow? {
        guard let number = JSONFlex.int(from: blob["hole"]) else { return nil }
        let windBlob = blob["wind"] as? [String: Any]
        let wx = blob["wx"] as? [String: Any]
        let effect = blob["effect"] as? [String: Any]
        return PlanHoleRow(
            hole: number,
            par: JSONFlex.int(from: blob["par"]),
            playLengthYd: JSONFlex.int(from: blob["play_length_yd"]),
            eta: string(blob["eta"]),
            order: JSONFlex.int(from: blob["order"]) ?? number,
            minutes: JSONFlex.double(from: blob["minutes"]) ?? 0,
            bearingTrue: JSONFlex.double(from: blob["bearing_true"]),
            wind: windBlob.flatMap(wind),
            playsLikeYd: JSONFlex.int(from: effect?["plays_like_yd"]),
            wxTempC: JSONFlex.double(from: wx?["temp_c"]),
            wxPrecipMm: JSONFlex.double(from: wx?["precip_mm"]),
            shots: savedShots(blob["shots"]),
            relevamiento: blob["relevamiento"] as? Bool ?? false
        )
    }

    private static func wind(_ blob: [String: Any]) -> PlanWind? {
        guard let kmh = JSONFlex.double(from: blob["kmh"]),
              let from = JSONFlex.double(from: blob["from_deg"])
        else { return nil }
        return PlanWind(kmh: kmh, fromDeg: from, gustKmh: JSONFlex.double(from: blob["gust_kmh"]))
    }

    private static func club(_ blob: [String: Any]) -> PlanBagEntry? {
        let code = string(blob["code"] ?? blob["club"])
        guard !code.isEmpty else { return nil }
        let lib = blob["libreto"] as? [String: Any]
        let gps = blob["gps"] as? [String: Any]
        let mean = gps?["mean"] as? [String: Any]
        let cov = (gps?["cov"] as? [[Any]])?.map { $0.compactMap { JSONFlex.double(from: $0) } }
        return PlanBagEntry(
            code: code,
            label: string(blob["label"]).ifEmpty(PlanCore.clubName(code)),
            carryYd: JSONFlex.int(from: lib?["carry_yd"]),
            totalYd: JSONFlex.int(from: lib?["total_yd"]),
            gpsOK: gps?["ok"] as? Bool ?? false,
            gpsMean: mean.flatMap {
                guard let fwd = JSONFlex.double(from: $0["fwd"]), let lat = JSONFlex.double(from: $0["lat"]) else { return nil }
                return PlanDispersionMean(fwd: fwd, lat: lat)
            },
            gpsCov: cov
        )
    }

    private static func savedShot(_ blob: [String: Any]) -> PlanSavedShot? {
        let club = string(blob["club"])
        guard !club.isEmpty else { return nil }
        return PlanSavedShot(
            club: club,
            source: string(blob["source"]).ifEmpty("libreto"),
            to: PlanLL.parse(blob["to"]),
            yardsFromTee: JSONFlex.int(from: blob["yd_from_tee"]),
            adjusted: blob["adjusted"] as? Bool ?? false,
            suggested: blob["suggested"] as? Bool ?? false,
            aimYd: JSONFlex.int(from: blob["aim_yd"])
        )
    }

    private static func mapHole(_ blob: [String: Any]) -> CourseMapHole? {
        guard let number = JSONFlex.int(from: blob["hole"]) else { return nil }
        let line = points(blob["line"])
        let greenBlob = blob["green"] as? [String: Any]
        let trees = blob["trees"] as? [String: Any]
        let card = (blob["crosscheck"] as? [String: Any])?["card"] as? [String: Any]
        let yards = (card?["yards"] as? [String: Any]) ?? [:]
        let bearing = blob["bearing"] as? [String: Any]
        return CourseMapHole(
            hole: number,
            line: line,
            playLengthYd: JSONFlex.int(from: blob["play_length_yd"]),
            tees: JSONFlex.objectArray(from: blob["tees"] ?? [])?.compactMap(mapTee) ?? [],
            green: greenBlob.flatMap(mapGreen),
            fairways: JSONFlex.objectArray(from: blob["fairways"] ?? [])?.compactMap { points($0["polygon"]) }.filter { !$0.isEmpty } ?? [],
            bunkers: JSONFlex.objectArray(from: blob["bunkers"] ?? [])?.compactMap(mapBunker) ?? [],
            water: JSONFlex.objectArray(from: blob["water"] ?? [])?.compactMap { points($0["polygon"]) }.filter { !$0.isEmpty } ?? [],
            woods: (trees?["wood_polygons"] as? [Any])?.compactMap { points($0) }.filter { !$0.isEmpty } ?? [],
            markers: JSONFlex.objectArray(from: blob["markers"] ?? [])?.compactMap(mapMarker) ?? [],
            hazards: JSONFlex.objectArray(from: blob["hazards"] ?? [])?.compactMap(mapHazard) ?? [],
            bearingTrue: JSONFlex.double(from: bearing?["tee_to_green_true"]),
            cardYards: yards.reduce(into: [:]) { out, item in
                if let value = JSONFlex.int(from: item.value) { out[item.key] = value }
            },
            par: JSONFlex.int(from: card?["par"]),
            coverageNotes: (blob["coverage_notes"] as? [String]) ?? [],
            markersRef: optional(blob["markers_ref"])
        )
    }

    private static func mapTee(_ blob: [String: Any]) -> CourseMapTee? {
        guard let center = PlanLL.parse(blob["center"]) else { return nil }
        return CourseMapTee(center: center, polygon: points(blob["polygon"]), toGreenYd: JSONFlex.double(from: blob["to_green_yd"]))
    }

    private static func mapGreen(_ blob: [String: Any]) -> CourseMapGreen? {
        CourseMapGreen(
            polygon: points(blob["polygon"]),
            center: PlanLL.parse(blob["center"]),
            front: PlanLL.parse(blob["front"]),
            back: PlanLL.parse(blob["back"])
        )
    }

    private static func mapBunker(_ blob: [String: Any]) -> CourseMapBunker? {
        let poly = points(blob["polygon"])
        guard !poly.isEmpty else { return nil }
        return CourseMapBunker(polygon: poly, center: PlanLL.parse(blob["center"]))
    }

    private static func mapMarker(_ blob: [String: Any]) -> CourseMapMarker? {
        guard let yards = JSONFlex.int(from: blob["yd"] ?? blob["from_green_yd"]),
              let point = PlanLL.parse(blob["point"])
        else { return nil }
        return CourseMapMarker(
            yards: yards,
            fromTeeYd: JSONFlex.int(from: blob["from_tee_yd"]) ?? 0,
            point: point,
            across: points(blob["across"]),
            color: optional(blob["c"])
        )
    }

    private static func mapHazard(_ blob: [String: Any]) -> CourseMapHazard? {
        let kind = string(blob["kind"])
        guard !kind.isEmpty else { return nil }
        return CourseMapHazard(
            kind: kind,
            side: optional(blob["side"]),
            reachYd: JSONFlex.int(from: blob["reach_yd"]),
            carryYd: JSONFlex.int(from: blob["carry_yd"]),
            greenside: blob["greenside"] as? Bool ?? false,
            inPlay: blob["in_play"] as? Bool ?? false,
            text: string(blob["text"]),
            center: PlanLL.parse(blob["center"])
        )
    }

    private static func torneo(_ raw: Any?) -> PlanTorneo {
        guard let blob = raw as? [String: Any] else { return .open }
        let locks = (blob["locks"] as? [String: Any])?.reduce(into: [String: Bool]()) { out, item in
            out[item.key] = item.value as? Bool ?? false
        } ?? [:]
        return PlanTorneo(
            on: blob["on"] as? Bool ?? false,
            active: blob["active"] as? Bool ?? false,
            mode: string(blob["mode"]).ifEmpty("normal"),
            noDistanceRule: blob["no_distance_rule"] as? Bool ?? false,
            locks: locks
        )
    }

    private static func points(_ raw: Any?) -> [PlanLL] {
        guard let items = raw as? [Any] else { return [] }
        return items.compactMap(PlanLL.parse)
    }

    private static func string(_ raw: Any?) -> String {
        if let value = raw as? String { return value }
        if let value = raw as? Int { return String(value) }
        return ""
    }

    private static func optional(_ raw: Any?) -> String? {
        let value = string(raw)
        return value.isEmpty ? nil : value
    }
}

private extension String {
    func ifEmpty(_ fallback: String) -> String {
        isEmpty ? fallback : self
    }
}
