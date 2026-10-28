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

    func testParsesLiveStatsPayload() {
        let json: [String: Any] = [
            "progress": [
                "club": "Jockey Club Argentino",
                "club_index": 1,
                "club_count": 2,
                "stage": "cards",
                "done": 54,
                "total": 97,
                "list_total": 97,
                "finished": false,
                "error": NSNull(),
                "updated_at": "2026-10-28T10:00:00Z",
                "club_code": "118",
                "club_logo": "/clubs/118@2x.png",
                "club_initials": "JC",
                "stats": [
                    "rounds": 75,
                    "rounds_with_holes": 74,
                    "holes": 1332,
                    "eagles": 3,
                    "birdies": 16,
                    "pars": 40,
                    "bogeys": 28,
                    "doubles_plus": 8,
                    "days": 69,
                    "best_gross": 71,
                    "best_gross_date": "2025-03-30",
                    "best_gross_course": "Colorada",
                    "months": (1...12).map { ["month": String(format: "2025-%02d", $0), "rounds": $0] },
                    "last_card": [
                        "date": "2025-11-01",
                        "course": "Colorada",
                        "club": "Jockey Club Buenos Aires",
                        "gross": 79,
                        "par": 72,
                        "other_course": false,
                        "holes": [
                            ["hole": 1, "par": 4, "strokes": 5],
                            ["hole": 2, "par": 4, "strokes": 4],
                            ["hole": 3, "par": 3, "strokes": 3]
                        ]
                    ]
                ]
            ]
        ]
        let progress = SyncProgressParser.parse(json)
        XCTAssertEqual(progress?.clubCode, "118")
        XCTAssertEqual(progress?.clubLogo, "/clubs/118@2x.png")
        XCTAssertEqual(progress?.clubInitials, "JC")
        XCTAssertEqual(progress?.stats?.rounds, 75)
        XCTAssertEqual(progress?.stats?.eagles, 3)
        XCTAssertEqual(progress?.stats?.doublesPlus, 8)
        XCTAssertEqual(progress?.stats?.bestGross, 71)
        XCTAssertEqual(progress?.stats?.bestGrossCourse, "Colorada")
        XCTAssertEqual(progress?.stats?.months.count, 12)
        XCTAssertEqual(progress?.stats?.months.first?.month, "2025-01")
        XCTAssertEqual(progress?.stats?.lastCard?.gross, 79)
        XCTAssertEqual(progress?.stats?.lastCard?.toPar, 7)
        XCTAssertEqual(progress?.stats?.lastCard?.holes.count, 3)
        XCTAssertEqual(progress?.stats?.lastCard?.holes.first?.strokes, 5)
        XCTAssertEqual(
            SyncClubIdentity.logoURL("/clubs/118@2x.png")?.absoluteString,
            "https://golflet.vercel.app/clubs/118@2x.png"
        )
        XCTAssertNil(SyncClubIdentity.logoURL(nil))
        XCTAssertEqual(SyncClubIdentity.initials(name: "San Andrés Golf Club", provided: "SA"), "SA")
        XCTAssertEqual(SyncClubIdentity.initials(name: "San Andrés Golf Club"), "SA")
        XCTAssertTrue(SyncClubIdentity.isDetecting("Golfistics App"))
        XCTAssertNil(SyncClubIdentity.logoURL(""))
    }

    func testDoesNotInventLogoFromClubCode() {
        let json: [String: Any] = [
            "progress": [
                "club": "San Andrés Golf Club",
                "club_code": "118",
                "club_logo": NSNull(),
                "club_initials": "SA",
                "stage": "list"
            ]
        ]
        let progress = SyncProgressParser.parse(json)
        XCTAssertEqual(progress?.clubCode, "118")
        XCTAssertNil(progress?.clubLogo)
        XCTAssertNil(SyncClubIdentity.logoURL(progress?.clubLogo))
        XCTAssertEqual(SyncClubIdentity.initials(name: progress?.club, provided: progress?.clubInitials), "SA")
    }

    func testMergesOptionalFieldsWithoutCarryingLogoToNextClub() {
        let jockey = SyncAPIProgress(
            club: "Jockey Club Buenos Aires",
            clubIndex: 1,
            clubCount: 2,
            clubCode: "118",
            clubLogo: "/clubs/118@2x.png",
            clubInitials: "JC",
            stage: .cards,
            stats: SyncLiveStats(rounds: 75, lastCard: SyncLastCard(course: "Colorada", gross: 79))
        )
        let omitted = SyncAPIProgress(club: "Jockey Club Buenos Aires", clubCode: "118", stage: .handicap)
        let kept = omitted.merging(onto: jockey)
        XCTAssertEqual(kept.clubLogo, "/clubs/118@2x.png")
        XCTAssertEqual(kept.clubInitials, "JC")
        XCTAssertEqual(kept.stats?.rounds, 75)
        XCTAssertEqual(kept.stats?.lastCard?.course, "Colorada")

        let nextClub = SyncAPIProgress(
            club: "San Andrés Golf Club",
            clubIndex: 2,
            clubCount: 2,
            clubCode: "312",
            clubLogo: nil,
            clubInitials: "SA",
            stage: .connect,
            stats: SyncLiveStats(rounds: 80)
        )
        let switched = nextClub.merging(onto: jockey)
        XCTAssertNil(switched.clubLogo)
        XCTAssertEqual(switched.clubInitials, "SA")
        XCTAssertEqual(switched.clubCode, "312")
        XCTAssertEqual(switched.stats?.rounds, 80)
        XCTAssertEqual(switched.stats?.lastCard?.course, "Colorada")
    }

    func testParsesOtherCourseLastCardAndNullStats() {
        let other: [String: Any] = [
            "progress": [
                "club": "Mar del Plata Golf Club",
                "club_index": 2,
                "club_count": 2,
                "stage": "cards",
                "club_code": "209",
                "club_logo": "/clubs/209@2x.png",
                "club_initials": "MD",
                "stats": [
                    "rounds": 98,
                    "eagles": 5,
                    "birdies": 29,
                    "pars": 83,
                    "bogeys": 63,
                    "doubles_plus": 16,
                    "days": 90,
                    "best_gross": NSNull(),
                    "best_gross_date": NSNull(),
                    "best_gross_course": NSNull(),
                    "months": [],
                    "last_card": [
                        "date": "2025-02-16",
                        "course": "Cancha Vieja",
                        "club": "Mar del Plata Golf Club",
                        "gross": 84,
                        "par": NSNull(),
                        "other_course": true,
                        "holes": []
                    ]
                ]
            ]
        ]
        let progress = SyncProgressParser.parse(other)
        XCTAssertEqual(progress?.stats?.lastCard?.otherCourse, true)
        XCTAssertTrue(progress?.stats?.lastCard?.holes.isEmpty ?? false)
        XCTAssertEqual(progress?.stats?.lastCard?.gross, 84)
        XCTAssertNil(progress?.stats?.bestGross)

        let connecting = SyncProgressParser.parse([
            "progress": [
                "club": NSNull(),
                "club_code": NSNull(),
                "club_logo": NSNull(),
                "club_initials": NSNull(),
                "stage": "connect",
                "stats": NSNull()
            ]
        ])
        XCTAssertEqual(connecting?.stage, .connect)
        XCTAssertNil(connecting?.clubLogo)
        XCTAssertNil(connecting?.stats)
    }

    func testIgnoresBareSyncResult() {
        XCTAssertNil(SyncProgressParser.parse(["sync": ["ok": true, "message": "Listo"]]))
    }
}
