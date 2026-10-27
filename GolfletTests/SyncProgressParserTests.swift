import XCTest
@testable import Golflet

final class SyncProgressParserTests: XCTestCase {
    func testParsesRealProgressPayload() {
        let json: [String: Any] = [
            "progress": [
                "club": "Jockey Club Argentino",
                "club_index": 2,
                "club_count": 2,
                "stage": "cards",
                "done": 33,
                "total": 97,
                "list_total": 97,
                "finished": false
            ]
        ]
        let progress = SyncProgressParser.parse(json)
        XCTAssertEqual(progress?.stage, .cards)
        XCTAssertEqual(progress?.done, 33)
        XCTAssertEqual(progress?.total, 97)
        XCTAssertEqual(progress?.listTotal, 97)
        XCTAssertEqual(progress?.clubIndex, 2)
        XCTAssertEqual(progress?.clubCount, 2)
        XCTAssertEqual(progress?.clubOrdinal, "2 de 2")
        XCTAssertEqual(
            SyncStepCopy.label(stage: .cards, state: .active, club: "Jockey Club Argentino", progress: progress!),
            "Leyendo tarjetas"
        )
        XCTAssertEqual(
            SyncStepCopy.counter(stage: .cards, state: .active, progress: progress!),
            "33 / 97"
        )
        XCTAssertEqual(
            YardageBookCopy.caption(stage: .cards, outcome: .running),
            "Leyendo tarjetas"
        )
        XCTAssertEqual(YardageBookCopy.count(progress!, outcome: .running), "33 / 97")
    }

    func testStepLabels() {
        let club = "Jockey Club Argentino"
        XCTAssertEqual(
            SyncStepCopy.label(stage: .connect, state: .active, club: club, progress: SyncAPIProgress(stage: .connect)),
            "Conectando con Jockey Club Argentino"
        )
        XCTAssertEqual(
            SyncStepCopy.label(stage: .connect, state: .done, club: club, progress: SyncAPIProgress(stage: .list)),
            "Conectado con Jockey Club Argentino"
        )
        XCTAssertEqual(
            SyncStepCopy.label(stage: .list, state: .done, club: club, progress: SyncAPIProgress(stage: .cards, listTotal: 97)),
            "97 tarjetas en Golfistics"
        )
        XCTAssertEqual(
            SyncStepCopy.label(stage: .cards, state: .done, club: club, progress: SyncAPIProgress(stage: .handicap, cardsTotal: 97)),
            "97 tarjetas nuevas leídas"
        )
        XCTAssertEqual(
            SyncStepCopy.label(stage: .cards, state: .done, club: club, progress: SyncAPIProgress(stage: .handicap, cardsTotal: 0)),
            "Sin tarjetas nuevas"
        )
        XCTAssertEqual(
            SyncStepCopy.label(stage: .handicap, state: .active, club: club, progress: SyncAPIProgress(stage: .handicap)),
            "Leyendo tu historial de hándicap"
        )
        XCTAssertEqual(
            SyncStepCopy.label(stage: .handicap, state: .done, club: club, progress: SyncAPIProgress(stage: .save)),
            "Historial de hándicap al día"
        )
    }

    func testStagesRestartOnNextClub() {
        let progress = SyncAPIProgress(club: "Mar del Plata Golf Club", clubIndex: 2, clubCount: 2, stage: .connect)
        XCTAssertEqual(SyncStepCopy.state(for: .connect, progress: progress, outcome: .running), .active)
        XCTAssertEqual(SyncStepCopy.state(for: .list, progress: progress, outcome: .running), .todo)
        XCTAssertEqual(SyncStepCopy.state(for: .cards, progress: progress, outcome: .running), .todo)
        XCTAssertEqual(SyncStepCopy.state(for: .save, progress: progress, outcome: .running), .todo)
        XCTAssertEqual(
            SyncStepCopy.label(stage: .connect, state: .active, club: "Mar del Plata Golf Club", progress: progress),
            "Conectando con Mar del Plata Golf Club"
        )
    }

    func testIgnoresBareSyncResult() {
        XCTAssertNil(SyncProgressParser.parse(["sync": ["ok": true, "message": "Listo"]]))
    }
}
