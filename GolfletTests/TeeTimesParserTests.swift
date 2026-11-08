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

    func testKeepsAForecastWhenTheBookingSendsOne() {
        let bookings = TeeTimesParser.list(from: [
            "tee_times": [[
                "id": "tt-wx",
                "starts_at": "2026-11-07T12:20:00-03:00",
                "club_name": "Mar del Plata Golf Club",
                "course": "Cancha Vieja",
                "forecast": "Viento 18 km/h del sudeste"
            ]]
        ])
        XCTAssertEqual(bookings.first?.forecast, "Viento 18 km/h del sudeste")
        XCTAssertEqual(TeeTimePrep.forecastLine(bookings.first?.forecast), "Viento 18 km/h del sudeste")
        XCTAssertEqual(TeeTimePrep.forecastLine(nil), "Este horario no trae pronóstico.")
        XCTAssertEqual(TeeTimePrep.canchaLine(course: "Cancha Vieja"), "Cancha Vieja")
        XCTAssertEqual(TeeTimePrep.canchaLine(course: "  "), "La reserva no trae el nombre de la cancha.")
    }

    func testPrepStrategyUsesTheCourseTextAndNothingInvented() {
        let strategy = CourseStrategy(
            courseId: "209-mdp-vieja",
            courseKey: "7:Cancha Vieja",
            overview: "Salí con hierro en los hoyos cortos.",
            overviewPublishedAt: nil,
            publishedHoles: [1],
            holes: []
        )
        XCTAssertEqual(
            TeeTimePrep.strategyLine(course: "Cancha Vieja", strategy: strategy),
            "Salí con hierro en los hoyos cortos."
        )
        XCTAssertEqual(
            TeeTimePrep.strategyLine(course: "Cancha Vieja", strategy: nil),
            "Todavía no hay estrategia cargada para esta cancha."
        )
        XCTAssertEqual(
            TeeTimePrep.strategyLine(course: "", strategy: strategy),
            "Sin el nombre de la cancha no hay estrategia para preparar."
        )
    }

    func testReadsCourseWhenThePayloadNestsIt() {
        let bookings = TeeTimesParser.list(from: [
            "tee_times": [[
                "id": "tt-nested",
                "starts_at": "2026-11-07T12:20:00-03:00",
                "club_name": "Mar del Plata Golf Club",
                "club_code": "209",
                "course": ["name": "Cancha Vieja"]
            ]]
        ])
        XCTAssertEqual(bookings.first?.course, "Cancha Vieja")
    }

    func testMdpWithoutACourseDoesNotGuessBothCanchas() {
        let booking = TeeTime(
            id: "tt-mdp",
            startsAt: Date(timeIntervalSince1970: 1_762_527_600),
            clubName: "Mar del Plata Golf Club",
            clubCode: "209",
            course: "",
            companions: ["Buffo Agustin"]
        )
        let place = TeeCourseResolve.place(booking: booking, rounds: [], courses: [])
        XCTAssertEqual(place.canchaTitle, "La reserva no especifica la cancha.")
        XCTAssertTrue(place.strategyCourses.isEmpty)
        XCTAssertEqual(TeeTimePrep.forecastText(booking: booking, rounds: [], bag: []), "Este horario no trae pronóstico.")
    }

    func testMdpDoesNotTakeTheCourseFromHisCards() {
        let booking = TeeTime(
            id: "tt-mdp",
            startsAt: Date(timeIntervalSince1970: 1_762_527_600),
            clubName: "Mar del Plata Golf Club",
            clubCode: "209",
            course: " ",
            companions: []
        )
        let older = sampleRound(course: "Cancha Vieja", date: Date(timeIntervalSince1970: 1_700_000_000))
        let newer = sampleRound(course: "Cancha Nueva", date: Date(timeIntervalSince1970: 1_750_000_000))
        let place = TeeCourseResolve.place(booking: booking, rounds: [older, newer], courses: [])
        XCTAssertEqual(place.canchaTitle, "La reserva no especifica la cancha.")
        XCTAssertTrue(place.strategyCourses.isEmpty)
    }

    func testForecastUsesRealWindAndDoesNotInventTheRest() {
        var booking = TeeTime(
            id: "tt-wx",
            startsAt: Date(timeIntervalSince1970: 1_762_527_600),
            clubName: "Mar del Plata Golf Club",
            clubCode: "209",
            course: "Cancha Vieja",
            companions: []
        )
        booking.windKmh = 22
        booking.windFrom = "sudeste"
        let text = TeeTimePrep.forecastText(booking: booking, rounds: [], bag: [])
        XCTAssertTrue(text.contains("22 km/h"))
        XCTAssertTrue(text.contains("sudeste"))
        XCTAssertFalse(text.contains("19°"))
        XCTAssertFalse(text.contains("0 mm"))
    }

    private func sampleRound(course: String, date: Date) -> Round {
        Round(
            roundId: course,
            date: date,
            weekday: "Sáb",
            tournament: "Test",
            clubName: "Mar del Plata Golf Club",
            clubCode: "209",
            course: course,
            tee: "Caballeros",
            category: nil,
            weather: nil,
            courseRating: 71,
            slope: 125,
            position: nil,
            fieldSize: nil,
            handicapIndex: 3.1,
            playingHandicap: nil,
            outScore: nil,
            inScore: nil,
            gross: 78,
            net: nil,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            differential: nil,
            adjustedGross: nil,
            courseHandicap: nil,
            hcpAllowancePct: nil
        )
    }
}
