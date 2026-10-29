import XCTest
@testable import Golflet

final class LivePayloadMapperTests: XCTestCase {
    func testMapsCompactLivePayload() throws {
        let json: [String: Any] = [
            "user": ["id": "u1", "email": "vos@ejemplo.com", "name": "Jugador Demo"],
            "player": ["name": "Jugador Demo", "handicap_index": 3.1],
            "hi_history": [["date": "2026-04-04", "hi": 4.1], ["date": "2026-06-06", "hi": 3.1]],
            "clubs": [[
                "id": 9,
                "club_name": "Jockey Club Buenos Aires",
                "matricula": "94506",
                "password_saved": true,
                "rounds": 2,
                "source": "app",
                "club_code": "118",
                "rounds_stored": 3,
                "rounds_with_holes": 2,
                "last_sync_status": "ok"
            ]],
            "rounds": [[
                "round_id": "118:94506:15300",
                "date": "2026-10-04",
                "tournament": "F Programa Dom AZUL",
                "club_name": "Jockey Club Buenos Aires",
                "course": "Azul",
                "course_key": "118:Azul",
                "tee": "Azul",
                "course_rating": 70.2,
                "slope": 123,
                "gross": 76,
                "net": 74,
                "valid_card": true,
                "is_9_holes": false,
                "differential_computed": 5.3,
                "position": 8,
                "field_size": 88,
                "holes": [[1, 5, 5], [2, 5, 4], [3, 4, 6]],
                "putts": 30,
                "gir": 10,
                "fir": 8,
                "notes": "Arranqué flojo"
            ]],
            "courses": [[
                "key": "118:Azul",
                "label": "Azul",
                "course": "Azul",
                "club_name": "Jockey Club Buenos Aires",
                "club_code": "118",
                "par": 72,
                "tees": ["AZUL": ["course_rating": 70.2, "slope": 123]],
                "holes": [[
                    "hole": 1,
                    "par": 5,
                    "hcp": 5,
                    "yards": ["AZUL": 485],
                    "stats": [
                        "n": 44,
                        "avg": 5.2,
                        "avg_to_par": 0.2,
                        "dist": ["birdie": 9, "par": 20, "bogey": 9, "double": 4, "triple_plus": 1, "eagle_or_better": 1]
                    ]
                ]]
            ]],
            "bag": [["club": "Driver", "carry": 250, "total": 265]]
        ]

        let snap = LivePayloadMapper.snapshot(from: json)
        XCTAssertEqual(snap.user?.email, "vos@ejemplo.com")
        XCTAssertEqual(snap.profile.displayName, "Jugador Demo")
        XCTAssertEqual(snap.clubs.first?.accountId, "9")
        XCTAssertEqual(snap.clubs.first?.source, "app")
        XCTAssertEqual(snap.clubs.first?.code, "118")
        XCTAssertEqual(snap.clubs.first?.roundsStored, 3)
        XCTAssertEqual(snap.clubs.first?.roundsWithHoles, 2)
        XCTAssertTrue(snap.clubs.first?.passwordSaved ?? false)
        XCTAssertEqual(snap.rounds.count, 1)
        XCTAssertEqual(snap.rounds.first?.gross, 76)
        XCTAssertEqual(snap.rounds.first?.holes.count, 3)
        XCTAssertEqual(snap.rounds.first?.holes[1].strokes, 4)
        XCTAssertEqual(snap.rounds.first?.holes[1].result, .birdie)
        XCTAssertEqual(snap.rounds.first?.putts, 30)
        XCTAssertEqual(try XCTUnwrap(snap.rounds.first?.handicapIndex), 3.1, accuracy: 0.001)
        XCTAssertEqual(snap.courses.first?.name, "Azul")
        XCTAssertEqual(snap.tees.first?.slope, 123)
        XCTAssertEqual(try XCTUnwrap(snap.holeStats.first?.holes.first?.averageToPar), 0.2, accuracy: 0.001)
        XCTAssertEqual(snap.bag.first?.carry, 250)
    }

    func testMapsOtherCourseRoundAndAppAccounts() {
        let json: [String: Any] = [
            "clubs": [
                [
                    "id": "118",
                    "club_name": "Jockey Club Buenos Aires",
                    "club_code": "118",
                    "source": "app",
                    "matricula": "94506",
                    "rounds": 97,
                    "rounds_stored": 97,
                    "rounds_with_holes": 97
                ],
                [
                    "id": "209",
                    "club_name": "Mar del Plata Golf Club",
                    "club_code": "209",
                    "source": "app",
                    "matricula": "94506",
                    "rounds": 1,
                    "rounds_stored": 1,
                    "rounds_with_holes": 0
                ]
            ],
            "rounds": [[
                "round_id": "209:94506:x-links",
                "date": "2024-05-12",
                "club_name": "Links Pinamar",
                "club_played": "Links Pinamar",
                "source_club_name": "Mar del Plata Golf Club",
                "course_label": "Links Pinamar",
                "other_course": true,
                "course_key": "x:links-pinamar",
                "gross": 80,
                "net": 78,
                "valid_card": true,
                "is_9_holes": false,
                "holes": []
            ]],
            "sync": [
                "ok": true,
                "new_rounds": 12,
                "message": "Listo",
                "clubs": [
                    ["account_id": "118", "club_name": "Jockey Club Buenos Aires", "ok": true, "new_rounds": 11, "list_total": 97],
                    ["account_id": "209", "club_name": "Mar del Plata Golf Club", "ok": true, "new_rounds": 1, "list_total": 1]
                ]
            ]
        ]
        let snap = LivePayloadMapper.snapshot(from: json)
        XCTAssertEqual(snap.clubs.map(\.accountId), ["118", "209"])
        XCTAssertEqual(snap.clubs.map(\.cardCount).reduce(0, +), 98)
        let round = snap.rounds.first
        XCTAssertEqual(round?.clubName, "Links Pinamar")
        XCTAssertEqual(round?.clubPlayed, "Links Pinamar")
        XCTAssertEqual(round?.sourceClubName, "Mar del Plata Golf Club")
        XCTAssertEqual(round?.courseLabel, "Links Pinamar")
        XCTAssertEqual(round?.courseKey, "x:links-pinamar")
        XCTAssertTrue(round?.isOtherCourse ?? false)
        XCTAssertTrue(round?.holes.isEmpty ?? false)
        XCTAssertNil(round?.differential)
        XCTAssertEqual(round?.slope ?? -1, 0, accuracy: 0.001)
        let sync = LivePayloadMapper.parseSync(json)
        XCTAssertEqual(sync.clubs.count, 2)
        XCTAssertEqual(sync.newCards, 12)
        XCTAssertEqual(sync.cardCount, 98)
    }

    func testAccountErrorCodes() {
        XCTAssertEqual(LivePayloadMapper.accountError(status: 422), .wrongGolfisticsCredentials)
        XCTAssertEqual(LivePayloadMapper.accountError(status: 502), .golfisticsAppDown)
        XCTAssertNil(LivePayloadMapper.accountError(status: 400))
        XCTAssertEqual(GolfletError.wrongGolfisticsCredentials.errorDescription, "Matrícula o clave incorrecta.")
        XCTAssertEqual(GolfletError.golfisticsAppDown.errorDescription, "La App de Golfistics no responde.")
    }

    func testUsesFirstNameWithoutSplittingPlayerName() {
        let json: [String: Any] = [
            "user": ["id": "u1", "email": "vos@ejemplo.com", "name": "Sebastián Buffo Sempé", "first_name": "Sebastián"],
            "player": ["name": "Buffo Sempé", "first_name": "Sebastián", "handicap_index": 3.1]
        ]
        let snap = LivePayloadMapper.snapshot(from: json)
        XCTAssertEqual(snap.profile.firstName, "Sebastián")
        XCTAssertEqual(snap.profile.greetingName, "Sebastián")
        XCTAssertEqual(snap.profile.displayName, "Buffo Sempé")
        XCTAssertFalse(snap.profile.greetingName.contains("Buffo"))
    }

    func testParsesCourseGroups() {
        let groups = LivePayloadMapper.parseCourseGroups([
            ["id": "jockey", "name": "Jockey Club", "courses": ["Azul", "Colorada"]],
            ["name": "Mar del Plata", "courses": [["name": "Cancha Vieja"], ["label": "Cancha Nueva"]]]
        ])
        XCTAssertEqual(groups.count, 2)
        XCTAssertEqual(groups[0].title, "Jockey Club")
        XCTAssertEqual(groups[0].courseNames, ["Azul", "Colorada"])
        XCTAssertEqual(groups[1].title, "Mar del Plata")
        XCTAssertEqual(groups[1].courseNames, ["Cancha Vieja", "Cancha Nueva"])
    }

    func testParsesPerRoundAndHcpImpact() {
        let summary = PlayParser.metricsSummary([
            "range": "3m",
            "eagles": 1,
            "birdies": 12,
            "pars": 40,
            "bogeys": 20,
            "per_round": [
                "eagles": ["mean": 0.1, "median": 0, "n": 10],
                "birdies": ["mean": 2.1, "median": 2, "rounds": 10],
                "pars": ["avg": 8.2, "median": 8],
                "bogeys": ["mean": 5.0, "median": 5],
                "doubles": ["mean": 1.2, "median": 1]
            ],
            "hcp_impact": [
                "delta": -0.3,
                "start": 3.4,
                "now": 3.1,
                "estimated": true,
                "best_8": [["round_id": "r1", "differential": 1.2, "course": "Azul"]],
                "dropped": [["id": "r2", "differential": 8.8]]
            ],
            "course_groups": [
                ["name": "Jockey Club", "courses": ["Azul", "Colorada"]]
            ]
        ])
        XCTAssertEqual(summary.perRound.birdies.mean ?? 0, 2.1, accuracy: 0.01)
        XCTAssertEqual(summary.perRound.birdies.median ?? 0, 2, accuracy: 0.01)
        XCTAssertEqual(summary.hcpImpact?.delta ?? 0, -0.3, accuracy: 0.01)
        XCTAssertEqual(summary.hcpImpact?.start ?? 0, 3.4, accuracy: 0.01)
        XCTAssertEqual(summary.hcpImpact?.counting.count, 1)
        XCTAssertEqual(summary.hcpImpact?.dropped.count, 1)
        XCTAssertEqual(summary.courseGroups.first?.title, "Jockey Club")
    }

    func testAuthErrorCopy() {
        XCTAssertEqual(
            LivePayloadMapper.authMessage(from: ["code": "INVALID_EMAIL_OR_PASSWORD"], fallback: "x"),
            "Email o contraseña incorrectos."
        )
        XCTAssertEqual(
            LivePayloadMapper.authMessage(from: ["error": "No autenticado"], fallback: "x"),
            "No autenticado"
        )
    }
}
