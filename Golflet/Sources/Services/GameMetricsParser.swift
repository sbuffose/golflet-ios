import Foundation

enum GameMetricsParser {
    static func metrics(_ json: [String: Any]) -> GameMetrics {
        let empty = json["empty"] as? [String: Any] ?? [:]
        let tee = json["tee"] as? [String: Any] ?? [:]
        let gir = json["gir"] as? [String: Any] ?? [:]
        let putts = json["putts"] as? [String: Any] ?? [:]
        let approach = (json["approach"] as? [[String: Any]] ?? []).map(band)
        let bands = GameApproachBandID.allCases.map { id in
            approach.first { $0.id == id.rawValue } ?? GameApproachBand(id: id.rawValue)
        }
        return GameMetrics(
            range: json["range"] as? String ?? "",
            empty: GameMetricsEmpty(
                tee: flag(empty["tee"], fallback: (JSONFlex.int(from: tee["drives"]) ?? 0) == 0),
                approach: flag(empty["approach"], fallback: bands.allSatisfy { $0.shots == 0 }),
                gir: flag(empty["gir"], fallback: (JSONFlex.int(from: gir["holes"]) ?? 0) == 0),
                putts: flag(empty["putts"], fallback: puttingEmpty(putts))
            ),
            tee: parseTee(tee),
            approach: bands,
            gir: parseGIR(gir),
            putts: parsePutting(putts),
            live: (json["live"] as? [[String: Any]] ?? []).compactMap(live)
        )
    }

    static func holes(_ json: [String: Any]) -> [LiveHoleRecord] {
        let items = json["holes"] as? [[String: Any]] ?? []
        return items.compactMap(hole)
    }

    static func hole(_ raw: Any?) -> LiveHoleRecord? {
        guard let blob = raw as? [String: Any], let number = JSONFlex.int(from: blob["hole"] ?? blob["number"]) else {
            return nil
        }
        let day = dayPin(blob["day_pin"])
        let marked = pin(blob["pin"])
        return LiveHoleRecord(
            number: number,
            par: JSONFlex.int(from: blob["par"]),
            putts: JSONFlex.int(from: blob["putts"]),
            pin: marked ?? day.map { LivePin(lat: $0.lat, lng: $0.lng, accuracyM: $0.accuracyM) },
            dayPin: day,
            pinAction: pinAction(blob["pin_action"], hasPin: day != nil)
        )
    }

    static func pin(_ raw: Any?) -> LivePin? {
        guard let blob = raw as? [String: Any],
              let lat = JSONFlex.double(from: blob["lat"]),
              let lng = JSONFlex.double(from: blob["lng"])
        else { return nil }
        return LivePin(lat: lat, lng: lng, accuracyM: JSONFlex.double(from: blob["accuracy_m"]))
    }

    static func dayPin(_ raw: Any?) -> DayPin? {
        guard let blob = raw as? [String: Any],
              let lat = JSONFlex.double(from: blob["lat"]),
              let lng = JSONFlex.double(from: blob["lng"])
        else { return nil }
        let zone = PinZone(rawValue: blob["zone"] as? String ?? "")
        let zoneLabel = blob["zone_label"] as? String ?? zone?.label ?? ""
        let sourceRaw = blob["source"] as? String ?? ""
        let source: PinSource = sourceRaw == "club" ? .club : .player
        return DayPin(
            lat: lat,
            lng: lng,
            accuracyM: JSONFlex.double(from: blob["accuracy_m"]),
            zone: zone,
            zoneLabel: zoneLabel,
            source: source,
            byMe: JSONFlex.bool(from: blob["by_me"]) ?? false
        )
    }

    private static func pinAction(_ raw: Any?, hasPin: Bool) -> PinAction {
        if let value = raw as? String, let action = PinAction(rawValue: value) {
            return action
        }
        return hasPin ? .none : .mark
    }

    private static func parseTee(_ blob: [String: Any]) -> GameTeeMetrics {
        GameTeeMetrics(
            fairwayPct: JSONFlex.int(from: blob["fairway_pct"]),
            leftPct: JSONFlex.int(from: blob["left_pct"]),
            rightPct: JSONFlex.int(from: blob["right_pct"]),
            avgCarryYd: JSONFlex.int(from: blob["avg_carry_yd"]),
            avgLateralYd: JSONFlex.double(from: blob["avg_lateral_yd"]),
            bandYd: JSONFlex.int(from: blob["band_yd"]) ?? 15,
            drives: JSONFlex.int(from: blob["drives"]) ?? 0,
            known: JSONFlex.int(from: blob["known"]) ?? 0,
            measured: JSONFlex.int(from: blob["measured"]) ?? 0,
            tendency: blob["tendency"] as? String,
            shots: (blob["shots"] as? [[String: Any]] ?? []).compactMap(drive)
        )
    }

    private static func drive(_ blob: [String: Any]) -> GameDriveShot? {
        guard let hole = JSONFlex.int(from: blob["hole"]) else { return nil }
        return GameDriveShot(
            date: blob["date"] as? String ?? "",
            hole: hole,
            course: blob["course"] as? String ?? blob["course_label"] as? String ?? "",
            par: JSONFlex.int(from: blob["par"]),
            carryYd: JSONFlex.int(from: blob["carry_yd"]),
            lateralYd: JSONFlex.double(from: blob["lateral_yd"]),
            outcome: blob["outcome"] as? String
        )
    }

    private static func band(_ blob: [String: Any]) -> GameApproachBand {
        GameApproachBand(
            id: blob["id"] as? String ?? "",
            shots: JSONFlex.int(from: blob["shots"]) ?? 0,
            known: JSONFlex.int(from: blob["known"]) ?? 0,
            greenPct: JSONFlex.int(from: blob["green_pct"]),
            avgProxYd: JSONFlex.int(from: blob["avg_prox_yd"]),
            proxN: JSONFlex.int(from: blob["prox_n"]) ?? 0,
            pinMarked: JSONFlex.int(from: blob["pin_marked"]) ?? 0,
            topMiss: blob["top_miss"] as? String,
            list: (blob["list"] as? [[String: Any]] ?? []).compactMap(approach)
        )
    }

    private static func approach(_ blob: [String: Any]) -> GameApproachShot? {
        guard let hole = JSONFlex.int(from: blob["hole"]) else { return nil }
        return GameApproachShot(
            date: blob["date"] as? String ?? "",
            hole: hole,
            course: blob["course"] as? String ?? "",
            fromYd: JSONFlex.int(from: blob["from_yd"]) ?? 0,
            onGreen: JSONFlex.bool(from: blob["on_green"]),
            miss: blob["miss"] as? String,
            proxYd: JSONFlex.int(from: blob["prox_yd"]),
            longYd: JSONFlex.double(from: blob["long_yd"]),
            lateralYd: JSONFlex.double(from: blob["lateral_yd"]),
            flagSource: blob["flag_source"] as? String
        )
    }

    private static func parseGIR(_ blob: [String: Any]) -> GameGIRMetrics {
        let byParRaw = blob["by_par"] as? [String: Any] ?? [:]
        var byPar: [Int: GameGIRPar] = [:]
        for key in [3, 4, 5] {
            let item = byParRaw["\(key)"] as? [String: Any]
            byPar[key] = GameGIRPar(
                girPct: JSONFlex.int(from: item?["gir_pct"]),
                holes: JSONFlex.int(from: item?["holes"]) ?? 0
            )
        }
        let trend = blob["trend"] as? [String: Any]
        let miss = blob["miss"] as? [String: Any] ?? [:]
        return GameGIRMetrics(
            girPct: JSONFlex.int(from: blob["gir_pct"]),
            holes: JSONFlex.int(from: blob["holes"]) ?? 0,
            missed: JSONFlex.int(from: blob["missed"]) ?? 0,
            missKnown: JSONFlex.int(from: blob["miss_known"]) ?? 0,
            miss: GameMissCounts(
                short: JSONFlex.int(from: miss["short"]) ?? 0,
                long: JSONFlex.int(from: miss["long"]) ?? 0,
                left: JSONFlex.int(from: miss["left"]) ?? 0,
                right: JSONFlex.int(from: miss["right"]) ?? 0
            ),
            byPar: byPar,
            rounds: (blob["rounds"] as? [[String: Any]] ?? []).compactMap { item in
                guard let date = item["date"] as? String else { return nil }
                return GameGIRRound(
                    date: date,
                    holes: JSONFlex.int(from: item["holes"]) ?? 0,
                    girPct: JSONFlex.int(from: item["gir_pct"])
                )
            },
            trend: trend.flatMap { item in
                guard let first = JSONFlex.int(from: item["first_half"]),
                      let second = JSONFlex.int(from: item["second_half"])
                else { return nil }
                return GameGIRTrend(
                    firstHalf: first,
                    secondHalf: second,
                    delta: JSONFlex.int(from: item["delta"]) ?? (second - first)
                )
            },
            holesList: (blob["holes_list"] as? [[String: Any]] ?? []).compactMap { item in
                guard let hole = JSONFlex.int(from: item["hole"]) else { return nil }
                return GameGIRHole(
                    date: item["date"] as? String ?? "",
                    hole: hole,
                    course: item["course"] as? String ?? "",
                    par: JSONFlex.int(from: item["par"]) ?? 4,
                    gir: JSONFlex.bool(from: item["gir"]),
                    miss: item["miss"] as? String,
                    putts: JSONFlex.int(from: item["putts"])
                )
            }
        )
    }

    private static func parsePutting(_ blob: [String: Any]) -> GamePuttingMetrics {
        let first = blob["first_putt"] as? [String: Any] ?? [:]
        return GamePuttingMetrics(
            perRound: JSONFlex.double(from: blob["per_round"]),
            perRoundEst: JSONFlex.double(from: blob["per_round_est"]),
            perHole: JSONFlex.double(from: blob["per_hole"]),
            onePuttPct: JSONFlex.int(from: blob["one_putt_pct"]),
            threePuttPct: JSONFlex.int(from: blob["three_putt_pct"]),
            holes: JSONFlex.int(from: blob["holes"]) ?? 0,
            rounds: (blob["rounds"] as? [[String: Any]] ?? []).compactMap { item in
                guard let date = item["date"] as? String else { return nil }
                return GamePuttingRound(date: date, putts: JSONFlex.int(from: item["putts"]))
            },
            firstPutt: GameFirstPutt(
                holes: JSONFlex.int(from: first["holes"]) ?? 0,
                avgYd: JSONFlex.double(from: first["avg_yd"]),
                atCenter: JSONFlex.int(from: first["at_center"]) ?? 0,
                bins: (first["bins"] as? [[String: Any]] ?? []).compactMap { item in
                    guard let label = item["label"] as? String else { return nil }
                    return GameFirstPuttBin(
                        label: label,
                        holes: JSONFlex.int(from: item["holes"]) ?? 0,
                        avgPutts: JSONFlex.double(from: item["avg_putts"])
                    )
                }
            )
        )
    }

    private static func live(_ blob: [String: Any]) -> GameMetricsLive? {
        guard let id = blob["id"] as? String ?? blob["live_round_id"] as? String else { return nil }
        return GameMetricsLive(id: id, roundId: blob["round_id"] as? String)
    }

    private static func flag(_ raw: Any?, fallback: Bool) -> Bool {
        JSONFlex.bool(from: raw) ?? fallback
    }

    private static func puttingEmpty(_ blob: [String: Any]) -> Bool {
        (JSONFlex.int(from: blob["holes"]) ?? 0) == 0
            && blob["per_round"] == nil
            && blob["per_round_est"] == nil
    }
}
