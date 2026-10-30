import XCTest
@testable import Golflet

final class TeeTimesParserTests: XCTestCase {
    func testParsesUpcomingBookingsAndCompanions() {
        let json: [String: Any] = [
            "tee_times": [
                [
                    "id": "tt-1",
                    "starts_at": "2026-10-31T12:33:00-03:00",
                    "club_name": "Jockey Club Buenos Aires",
                    "club_code": "118",
                    "course": "Azul",
                    "companions": [
                        ["name": "Juan"],
                        ["first_name": "Pedro"],
                        "Ana"
                    ]
                ],
                [
                    "booking_id": "tt-2",
                    "date": "2026-11-07",
                    "time": "09:10",
                    "club": ["name": "Mar del Plata Golf Club", "code": "209"],
                    "course_label": "Cancha Vieja",
                    "partners": []
                ]
            ]
        ]

        let bookings = TeeTimesParser.list(from: json)
        XCTAssertEqual(bookings.count, 2)
        XCTAssertEqual(bookings[0].id, "tt-1")
        XCTAssertEqual(bookings[0].clubName, "Jockey Club Buenos Aires")
        XCTAssertEqual(bookings[0].course, "Azul")
        XCTAssertEqual(bookings[0].companions, ["Juan", "Pedro", "Ana"])
        XCTAssertEqual(bookings[0].companionsLine, "con Juan, Pedro +1")
        XCTAssertEqual(bookings[1].clubName, "Mar del Plata Golf Club")
        XCTAssertEqual(bookings[1].clubCode, "209")
        XCTAssertEqual(bookings[1].course, "Cancha Vieja")
        XCTAssertNil(bookings[1].companionsLine)
    }

    func testOmitsConWhenThereAreNoCompanions() {
        XCTAssertNil(TeeTime.companionsLine(from: []))
        XCTAssertNil(TeeTime.companionsLine(from: ["", "  "]))
        XCTAssertEqual(TeeTime.companionsLine(from: ["Juan"]), "con Juan")
        XCTAssertEqual(TeeTime.companionsLine(from: ["Juan", "Pedro"]), "con Juan, Pedro")
    }

    func testFormatsChipAsShortWeekdayDayAndTime() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = .current
        let date = calendar.date(from: DateComponents(year: 2026, month: 10, day: 31, hour: 12, minute: 33))
        XCTAssertEqual(FormatAR.teeChip(try XCTUnwrap(date)), "Sáb 31 · 12:33")
    }

    func testUpcomingIncludesCurrentWithinGrace() {
        let now = Date()
        let current = TeeTime(
            id: "now",
            startsAt: now.addingTimeInterval(-30 * 60),
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            companions: []
        )
        let past = TeeTime(
            id: "old",
            startsAt: now.addingTimeInterval(-5 * 3600),
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            companions: []
        )
        XCTAssertTrue(current.isUpcoming(now: now))
        XCTAssertFalse(past.isUpcoming(now: now))
    }

    func testParsesTopLevelItemsArray() {
        let bookings = TeeTimesParser.list(from: [
            "items": [[
                "id": "tt-items",
                "starts_at": "2026-10-31T12:33:00-03:00",
                "club_name": "Jockey Club Buenos Aires",
                "course": "Azul",
                "companions": "Juan, Pedro"
            ]]
        ])
        XCTAssertEqual(bookings.first?.companions, ["Juan", "Pedro"])
        XCTAssertEqual(bookings.first?.companionsLine, "con Juan, Pedro")
    }

    func testParsesTeeTimeCheckAndRespectsThrottle() async throws {
        XCTAssertEqual(TeeTimesAPIPaths.check(limit: 4), "/api/tee-times/check?limit=4")
        let parsed = TeeTimesParser.check(from: [
            "status": "checked",
            "new": ["tt-1"],
            "changed": ["tt-2"],
            "gone": ["tt-old"],
            "next_in_s": 150,
            "tee_times": [[
                "id": "tt-1",
                "starts_at": "2026-10-31T12:33:00-03:00",
                "club_name": "Jockey Club Buenos Aires",
                "course": "Azul",
                "companions": ["Juan"]
            ]]
        ])
        XCTAssertEqual(parsed.status, "checked")
        XCTAssertEqual(parsed.newIDs, ["tt-1"])
        XCTAssertEqual(parsed.changedIDs, ["tt-2"])
        XCTAssertEqual(parsed.goneIDs, ["tt-old"])
        XCTAssertEqual(parsed.nextInSeconds, 150)
        XCTAssertTrue(parsed.hasUpdates)
        XCTAssertEqual(parsed.teeTimes.first?.id, "tt-1")

        let api = MockAPIClient(autoSession: true)
        let first = try await api.checkTeeTimes(limit: 4)
        XCTAssertEqual(first.status, "checked")
        XCTAssertEqual(first.newIDs, ["tt-jockey-1"])
        let second = try await api.checkTeeTimes(limit: 4)
        XCTAssertEqual(second.status, "throttled")
        XCTAssertTrue(second.newIDs.isEmpty)
    }

    func testSnapshotReadsTeeTimesFromDataPayload() {
        let snap = LivePayloadMapper.snapshot(from: [
            "player": ["name": "Jugador Demo", "handicap_index": 3.1],
            "tee_times": [[
                "id": "tt-data",
                "starts_at": "2026-10-31T12:33:00-03:00",
                "club_name": "Jockey Club Buenos Aires",
                "course": "Azul",
                "companions": ["Juan", "Pedro"]
            ]]
        ])
        XCTAssertEqual(snap.teeTimes.count, 1)
        XCTAssertEqual(snap.teeTimes.first?.companionsLine, "con Juan, Pedro")
    }
}
