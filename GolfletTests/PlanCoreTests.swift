import XCTest
@testable import Golflet

final class PlanCoreTests: XCTestCase {
    func testWindDistanceFactorMatchesWeb() {
        XCTAssertEqual(PlanCore.distFactor(headMph: 10), 0.9, accuracy: 0.0001)
        XCTAssertEqual(PlanCore.distFactor(headMph: -10), 1.05, accuracy: 0.0001)
        XCTAssertEqual(PlanCore.distFactor(headMph: 80), 0.6, accuracy: 0.0001)
        XCTAssertEqual(PlanCore.distFactor(headMph: -80), 1.3, accuracy: 0.0001)
    }

    func testShotAdjustRoundsTermsThenSumsExactly() {
        let input = PlanAdjInput(headMph: 10, kmh: 16, tempC: 10, precipMm: 1.2, riseM: nil, rollYd: 20, firm: .dura)
        let result = PlanCore.shotAdjust(normal: 250, input: input)
        XCTAssertEqual(result.normal, 250)
        XCTAssertEqual(result.total, result.normal + result.terms.reduce(0) { $0 + $1.yards })
        XCTAssertEqual(result.terms.first { $0.key == "viento" }?.yards, -25)
        XCTAssertEqual(result.terms.first { $0.key == "temp" }?.yards, -5)
        XCTAssertEqual(result.terms.first { $0.key == "lluvia" }?.yards, -8)
        XCTAssertEqual(result.terms.first { $0.key == "cancha" }?.yards, 10)
        XCTAssertNil(result.terms.first { $0.key == "altura" })
        XCTAssertEqual(result.total, 222)
    }

    func testElevationTermStaysOff() {
        let input = PlanAdjInput(headMph: nil, kmh: nil, tempC: nil, precipMm: nil, riseM: 8, rollYd: nil, firm: .normal)
        XCTAssertTrue(PlanCore.adjTerms(yd: 180, input: input).isEmpty)
        XCTAssertFalse(PlanCore.elevationTermEnabled)
    }

    func testAutoSelectNeverPicksAHalfSwing() {
        let driver = PlanClubDist(kind: .point, yards: 260, carry: 240, mean: nil, cov: nil, used: "libreto", note: nil, partial: false)
        let partial = PlanEvalShot(
            code: "Dr",
            dist: PlanCore.fitDD(driver, remain: 90),
            aimYd: 0,
            fwd: 90,
            landing: PlanXY(x: 0, y: 0),
            afterYd: 0,
            risk: [],
            riskPct: 0,
            score: 0,
            partial: true,
            reason: nil,
            alternatives: []
        )
        XCTAssertTrue(partial.dist.partial)
        XCTAssertNil(PlanCore.autoSelect(
            suggestion: partial,
            clubs: [(code: "Dr", dist: PlanCore.fitDD(driver, remain: 90), adjusted: 90)],
            remain: 90
        ))
        let iron = PlanClubDist(kind: .point, yards: 150, carry: 140, mean: nil, cov: nil, used: "libreto", note: nil, partial: false)
        let pick = PlanCore.autoSelect(
            suggestion: nil,
            clubs: [
                (code: "Dr", dist: PlanCore.fitDD(driver, remain: 90), adjusted: 90),
                (code: "7i", dist: iron, adjusted: 150)
            ],
            remain: 148
        )
        XCTAssertEqual(pick?.code, "7i")
        XCTAssertEqual(pick?.suggested, false)
    }

    func testSuggestShotPrefersAFullClubOffTheTee() {
        let tee = PlanXY(x: 0, y: 0)
        let green = PlanXY(x: 0, y: 480 * PlanCore.yardMeters)
        let path = [tee, green]
        let clubs = [
            (code: "Dr", dist: PlanClubDist(kind: .point, yards: 260, carry: 240, mean: nil, cov: nil, used: "libreto", note: nil, partial: false)),
            (code: "7i", dist: PlanClubDist(kind: .point, yards: 150, carry: 140, mean: nil, cov: nil, used: "libreto", note: nil, partial: false))
        ]
        let suggestion = PlanCore.suggestShot(ball: tee, green: green, path: path, clubs: clubs, wind: nil, hazards: [], first: true)
        XCTAssertEqual(suggestion?.code, "Dr")
        XCTAssertEqual(suggestion?.partial, false)
    }

    func testHoleScheduleUsesParWeights() {
        let rows = PlanCore.holeSchedule(teeTime: "09:30", startHole: 1, minPerHole: 14, pars: [5, 4, 3])
        XCTAssertEqual(rows.map(\.hole), [1, 2, 3])
        XCTAssertEqual(rows[0].eta, "09:30")
        XCTAssertGreaterThan(rows[0].minutes, rows[2].minutes)
        XCTAssertEqual(PlanCore.holeSchedule(teeTime: "09:30", startHole: 1, minPerHole: 14, pars: []).count, 18)
    }

    func testAimPointFollowsTheHoleLine() {
        let path = [PlanXY(x: 0, y: 0), PlanXY(x: 0, y: 100), PlanXY(x: 80, y: 180)]
        let landing = PlanCore.aimPoint(path: path, from: path[0], meters: 100)
        XCTAssertEqual(landing.x, 0, accuracy: 0.01)
        XCTAssertEqual(landing.y, 100, accuracy: 0.01)
    }
}

final class PlanParserTests: XCTestCase {
    func testParsesPlanAndCourseMap() throws {
        let plan = PlanParser.detail([
            "plan": [
                "id": "plan-1",
                "club_code": "118",
                "course": "Azul",
                "date": "2026-10-30",
                "tee_time": "09:30",
                "start_hole": 1,
                "min_per_hole": 14,
                "dist_source": "libreto"
            ],
            "course": [
                "club_code": "118",
                "course": "Azul",
                "club_name": "Jockey",
                "usual_tee": "blanco",
                "numbering_unconfirmed": true
            ],
            "holes": [[
                "hole": 1,
                "par": 5,
                "play_length_yd": 521,
                "eta": "09:30",
                "order": 1,
                "minutes": 16,
                "bearing_true": 52,
                "wind": ["kmh": 14, "from_deg": 250, "gust_kmh": 22],
                "wx": ["temp_c": 17.4, "precip_mm": 0],
                "shots": []
            ]]
        ])
        XCTAssertEqual(plan?.plan.id, "plan-1")
        XCTAssertEqual(plan?.course.usualTee, "BLANCO")
        XCTAssertEqual(plan?.hole(1)?.wind?.kmh, 14)
        XCTAssertEqual(plan?.hole(1)?.wxTempC, 17.4)

        let map = PlanParser.courseMap([
            "club_code": "118",
            "course": "Azul",
            "marker_ref": ["to": "centro"],
            "holes": [[
                "hole": 1,
                "line": [[-58.53, -34.48], [-58.52, -34.47]],
                "play_length_yd": 521,
                "tees": [["center": [-58.53, -34.48], "to_green_yd": 521]],
                "green": [
                    "center": [-58.52, -34.47],
                    "front": [-58.521, -34.471],
                    "back": [-58.519, -34.469],
                    "polygon": [[-58.521, -34.471], [-58.519, -34.469], [-58.52, -34.468]]
                ],
                "crosscheck": ["card": ["par": 5, "yards": ["BLANCO": 496, "AZUL": 521]]],
                "bearing": ["tee_to_green_true": 52]
            ]]
        ])
        XCTAssertEqual(map?.holes.first?.cardYards["BLANCO"], 496)
        XCTAssertEqual(map?.holes.first?.green?.center?.lat, -34.47)
        let tees = PlanTeeColors.tees(from: map!.holes[0], planHole: plan!.hole(1)!, course: plan!.course)
        XCTAssertEqual(tees.map(\.key), ["AZUL", "BLANCO"])
        XCTAssertEqual(PlanGeometry.pickTee(from: tees, stored: nil, usual: "BLANCO", mapYd: 521)?.key, "BLANCO")
    }

    func testMockPlanAPIServesHoleOne() async throws {
        let api = MockAPIClient(autoSession: true)
        let detail = try await api.createPlan(clubCode: "118", course: "Azul", date: "2026-10-30", teeTime: "09:30", startHole: 1, teeTimeID: nil)
        XCTAssertEqual(detail.course.usualTee, "BLANCO")
        let map = try await api.courseMap(clubCode: "118", course: "Azul")
        XCTAssertEqual(map.hole(1)?.playLengthYd, 521)
        let clubs = try await api.planClubs()
        XCTAssertTrue(clubs.contains { $0.code == "Dr" && $0.totalYd == 268 })
    }
}
