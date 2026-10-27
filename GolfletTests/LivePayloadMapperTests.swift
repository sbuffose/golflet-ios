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
