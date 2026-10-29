import XCTest
@testable import Golflet

final class GameMetricsTests: XCTestCase {
    func testParsesLiveGameMetricsPayload() {
        let metrics = GameMetricsParser.metrics(Self.populated)
        XCTAssertFalse(metrics.empty.tee)
        XCTAssertFalse(metrics.empty.approach)
        XCTAssertFalse(metrics.empty.gir)
        XCTAssertFalse(metrics.empty.putts)
        XCTAssertEqual(metrics.tee.fairwayPct, 58)
        XCTAssertEqual(metrics.tee.leftPct, 25)
        XCTAssertEqual(metrics.tee.rightPct, 17)
        XCTAssertEqual(metrics.tee.avgCarryYd, 268)
        XCTAssertEqual(metrics.tee.shots.count, 1)
        XCTAssertEqual(metrics.tee.shots.first?.carryYd, 271)
        XCTAssertEqual(metrics.band(id: "150-125").greenPct, 40)
        XCTAssertEqual(metrics.band(id: "150-125").avgProxYd, 28)
        XCTAssertEqual(metrics.gir.girPct, 44)
        XCTAssertEqual(metrics.gir.par(4).holes, 8)
        XCTAssertEqual(metrics.gir.trend?.firstHalf, 38)
        XCTAssertEqual(metrics.putts.onePuttPct, 22)
        XCTAssertEqual(metrics.putts.firstPutt.avgYd, 8.5)
        XCTAssertEqual(metrics.live.first?.roundId, "118:r1")
    }

    func testEmptyMockHasNoExampleShots() async throws {
        let api = MockAPIClient()
        let metrics = try await api.gameMetrics(range: "3m")
        XCTAssertTrue(metrics.empty.tee)
        XCTAssertTrue(metrics.empty.approach)
        XCTAssertTrue(metrics.empty.gir)
        XCTAssertTrue(metrics.empty.putts)
        XCTAssertTrue(metrics.tee.shots.isEmpty)
        XCTAssertTrue(metrics.approach.allSatisfy { $0.list.isEmpty && $0.shots == 0 })
        XCTAssertTrue(metrics.gir.holesList.isEmpty)
        XCTAssertTrue(metrics.putts.rounds.isEmpty)
        XCTAssertEqual(GameMetricsCopy.howToPlay, "Jugá con “Ya pegué” para ver tus datos")
        XCTAssertEqual(GameMetricsCopy.startGPS, "Empezar ronda con GPS")
        XCTAssertEqual(GameApproachBandID.allCases.map(\.rawValue), ["150-125", "125-100", "100-75", "75-50", "50-30"])
    }

    func testGpsCoverageCountsLinkedLiveOnce() {
        let rounds = [
            Round.preview(id: "a", gps: 4),
            Round.preview(id: "b", gps: 0),
            Round.preview(id: "c", gps: 2)
        ]
        let live = [
            GameMetricsLive(id: "l1", roundId: "a"),
            GameMetricsLive(id: "l2", roundId: nil),
            GameMetricsLive(id: "l3", roundId: "ghost")
        ]
        let count = GameMetricsCoverage.count(rounds: rounds, range: .all, live: live)
        XCTAssertEqual(count.gps, 4)
        XCTAssertEqual(count.n, 5)
        XCTAssertEqual(GameMetricsCoverage.line(gps: 4, n: 5), "Con GPS: 4 de 5 rondas")
        XCTAssertEqual(GameMetricsCopy.percent(58), "58%")
        XCTAssertEqual(GameMetricsCopy.yards(28), "28 yd")
        XCTAssertEqual(GameMetricsCopy.outcome("left"), "Izquierda")
    }

    func testParsesHolePuttsAndPin() {
        let holes = GameMetricsParser.holes([
            "holes": [
                ["hole": 7, "par": 3, "putts": 2, "pin": ["lat": -34.48, "lng": -58.53, "accuracy_m": 4]],
                ["hole": 8, "par": 4],
                [
                    "hole": 9,
                    "par": 5,
                    "pin_action": "report",
                    "day_pin": [
                        "lat": -34.481,
                        "lng": -58.531,
                        "zone": "middle",
                        "zone_label": "Medio",
                        "source": "player",
                        "source_label": "Juan Pérez",
                        "by_me": false
                    ]
                ],
                [
                    "hole": 10,
                    "par": 4,
                    "pin_action": "none",
                    "day_pin": [
                        "lat": -34.482,
                        "lng": -58.532,
                        "zone": "front",
                        "zone_label": "Adelante",
                        "source": "club",
                        "by_me": false
                    ]
                ],
                [
                    "hole": 11,
                    "par": 4,
                    "pin_action": "remark",
                    "day_pin": [
                        "lat": -34.483,
                        "lng": -58.533,
                        "zone": "back",
                        "zone_label": "Fondo",
                        "source": "player",
                        "by_me": true
                    ]
                ]
            ]
        ])
        XCTAssertEqual(holes.count, 5)
        XCTAssertEqual(holes[0].putts, 2)
        XCTAssertEqual(holes[0].pin?.accuracyM, 4)
        XCTAssertEqual(holes[0].pinAction, .mark)
        XCTAssertNil(holes[1].pin)
        XCTAssertNil(holes[1].putts)
        XCTAssertEqual(holes[2].pinAction, .report)
        XCTAssertEqual(holes[2].dayPin?.headline, "Bandera de hoy · Medio · cargada por un jugador")
        XCTAssertFalse(holes[2].dayPin?.headline.contains("Juan") == true)
        XCTAssertEqual(holes[3].pinAction, .none)
        XCTAssertEqual(holes[3].dayPin?.headline, "Bandera de hoy · Adelante · cargada por el club")
        XCTAssertEqual(holes[4].dayPin?.headline, "Bandera de hoy · Fondo · la marcaste vos")
        XCTAssertEqual(GamePinPriority.resolve(club: true, own: true, other: true), "club")
        XCTAssertEqual(GamePinPriority.resolve(club: false, own: true, other: true), "own")
        XCTAssertEqual(GamePinPriority.resolve(club: false, own: false, other: true), "other")
        XCTAssertEqual(GamePinPriority.resolve(club: false, own: false, other: false), "green_center")
        XCTAssertEqual(GameMetricsCopy.flagSource("club"), "bandera del club")
        XCTAssertTrue(GameMetricsCopy.yards(8.5).hasSuffix("yd"))
        XCTAssertTrue(GameMetricsCopy.flagHowPutting.contains("yardas") || GameMetricsCopy.yards(8.5).contains("yd"))
    }

    private static let populated: [String: Any] = [
        "range": "3m",
        "empty": ["tee": false, "approach": false, "gir": false, "putts": false],
        "tee": [
            "fairway_pct": 58,
            "left_pct": 25,
            "right_pct": 17,
            "avg_carry_yd": 268,
            "avg_lateral_yd": 6.2,
            "band_yd": 15,
            "drives": 12,
            "known": 12,
            "measured": 10,
            "tendency": "left",
            "shots": [[
                "date": "2026-10-12",
                "hole": 4,
                "course": "Azul",
                "par": 4,
                "carry_yd": 271,
                "lateral_yd": -8.4,
                "outcome": "left"
            ]]
        ],
        "approach": [[
            "id": "150-125",
            "shots": 5,
            "known": 5,
            "green_pct": 40,
            "avg_prox_yd": 28,
            "prox_n": 5,
            "pin_marked": 3,
            "top_miss": "short",
            "list": [[
                "date": "2026-10-12",
                "hole": 7,
                "course": "Azul",
                "from_yd": 138,
                "on_green": false,
                "miss": "short",
                "prox_yd": 22,
                "long_yd": -12.0,
                "lateral_yd": 3.0,
                "flag_source": "pin"
            ]]
        ]],
        "gir": [
            "gir_pct": 44,
            "holes": 18,
            "missed": 10,
            "miss_known": 6,
            "miss": ["short": 3, "long": 1, "left": 1, "right": 1],
            "by_par": [
                "3": ["gir_pct": 50, "holes": 4],
                "4": ["gir_pct": 38, "holes": 8],
                "5": ["gir_pct": 50, "holes": 6]
            ],
            "rounds": [
                ["date": "2026-10-01", "holes": 18, "gir_pct": 38],
                ["date": "2026-10-12", "holes": 18, "gir_pct": 50]
            ],
            "trend": ["first_half": 38, "second_half": 50, "delta": 12],
            "holes_list": [[
                "date": "2026-10-12",
                "hole": 3,
                "course": "Azul",
                "par": 4,
                "gir": false,
                "miss": "left",
                "putts": 2
            ]]
        ],
        "putts": [
            "per_round": 31.2,
            "per_hole": 1.73,
            "one_putt_pct": 22,
            "three_putt_pct": 8,
            "holes": 18,
            "rounds": [["date": "2026-10-12", "putts": 30]],
            "first_putt": [
                "holes": 10,
                "avg_yd": 8.5,
                "at_center": 2,
                "bins": [["label": "3–6 yd", "holes": 4, "avg_putts": 1.5]]
            ]
        ],
        "live": [["id": "live-1", "round_id": "118:r1"]]
    ]
}

private extension Round {
    static func preview(id: String, gps: Int) -> Round {
        Round(
            roundId: id,
            date: Date(),
            weekday: "Dom",
            tournament: "Demo",
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            tee: "Azul",
            category: nil,
            weather: nil,
            courseRating: 70,
            slope: 120,
            position: nil,
            fieldSize: nil,
            handicapIndex: 3.1,
            playingHandicap: 2,
            outScore: 40,
            inScore: 36,
            gross: 76,
            net: 74,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            gpsShots: gps
        )
    }
}
