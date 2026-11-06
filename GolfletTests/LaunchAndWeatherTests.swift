import XCTest
@testable import Golflet

final class LaunchAndWeatherTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(_ year: Int, _ month: Int, _ day: Int) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: 15))!
    }

    func testNoMajorOutsideTheTournamentWeek() {
        XCTAssertNil(ProMajor.current(on: date(2026, 11, 6), calendar: calendar))
    }

    func testMastersUsesItsOwnColors() {
        let major = ProMajor.current(on: date(2026, 4, 10), calendar: calendar)
        XCTAssertEqual(major?.short, "Masters")
        XCTAssertEqual(major?.background, 0x006747)
        XCTAssertEqual(major?.foreground, 0xFDE021)
        XCTAssertEqual(major?.url.host, "www.masters.com")
    }

    func testRyderCupIsNotShownInANonCupYear() {
        XCTAssertNil(ProMajor.current(on: date(2026, 9, 18), calendar: calendar))
        XCTAssertEqual(ProMajor.current(on: date(2027, 9, 18), calendar: calendar)?.short, "Ryder")
    }

    func testSplashHoldIsShortWhenMotionIsReduced() {
        if RuntimeFlags.isUITesting {
            XCTAssertEqual(LaunchSplash.hold(firstLaunch: true, reduceMotion: true), 0.05)
            return
        }
        XCTAssertEqual(LaunchSplash.hold(firstLaunch: true, reduceMotion: true), 0.45)
        XCTAssertEqual(LaunchSplash.hold(firstLaunch: true, reduceMotion: false), 1.5)
        XCTAssertEqual(LaunchSplash.hold(firstLaunch: false, reduceMotion: false), 1.1)
    }

    func testWeatherDoesNotInventNumbers() {
        let empty = WeatherPlay.report(booking: nil, rounds: [], bag: [])
        XCTAssertFalse(empty.plain.contains("14"))
        XCTAssertFalse(empty.plain.contains("19"))
        XCTAssertFalse(empty.hasNumbers)

        let quiet = TeeTime(
            id: "tt",
            startsAt: date(2026, 11, 7),
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            companions: []
        )
        let report = WeatherPlay.report(booking: quiet, rounds: [], bag: [])
        XCTAssertFalse(report.hasNumbers)
        XCTAssertFalse(report.plain.contains("km/h"))

        var windy = quiet
        windy.windKmh = 22
        windy.windFrom = "SO"
        windy.tempC = 11
        let real = WeatherPlay.report(
            booking: windy,
            rounds: [],
            bag: [BagClub(name: "Driver", carry: 230, total: 245)]
        )
        XCTAssertTrue(real.hasNumbers)
        XCTAssertTrue(real.plain.contains("22 km/h"))
        XCTAssertTrue(real.plain.contains("230 m"))
        XCTAssertTrue(real.plain.contains("11°"))
        XCTAssertFalse(real.plain.contains("14 km/h"))
    }

    func testCoursePinAndWindShiftStayHonest() {
        let mdp = CoursePin.coordinate(club: "Mar del Plata Golf Club", course: "")
        XCTAssertEqual(mdp?.lat ?? 0, -38.02999, accuracy: 0.0001)
        XCTAssertEqual(mdp?.lng ?? 0, -57.53624, accuracy: 0.0001)
        XCTAssertNil(CoursePin.coordinate(club: "Club inventado", course: ""))
        XCTAssertEqual(TeeForecast.cardinal(0), "norte")
        XCTAssertEqual(TeeForecast.cardinal(90), "este")
        let steady = TeeForecast.shiftLine(hours: [
            ForecastHour(date: date(2026, 11, 7), tempC: 19, rainMm: 0, windKmh: 14, windFromDeg: 180),
            ForecastHour(date: date(2026, 11, 7), tempC: 20, rainMm: 0, windKmh: 15, windFromDeg: 190)
        ])
        XCTAssertEqual(steady, "El viento se mantiene en estas horas.")
        let turn = TeeForecast.shiftLine(hours: [
            ForecastHour(date: date(2026, 11, 7), tempC: 18, rainMm: 0, windKmh: 12, windFromDeg: 0),
            ForecastHour(date: date(2026, 11, 7), tempC: 18, rainMm: 1.2, windKmh: 22, windFromDeg: 90)
        ])
        XCTAssertTrue(turn?.contains("12 a 22") == true)
        XCTAssertTrue(turn?.contains("norte") == true)
        XCTAssertTrue(turn?.contains("este") == true)

        let hourly: [String: Any] = [
            "time": ["2026-11-07T12:00", "2026-11-07T13:00", "2026-11-07T14:00", "2026-11-07T15:00", "2026-11-07T16:00", "2026-11-07T17:00", "2026-11-07T18:00"],
            "temperature_2m": [19.2, 20, 21, 21, 20, 18, 17],
            "precipitation": [0, 0, 0, 0.4, 0, 0, 0],
            "wind_speed_10m": [14.2, 16, 18, 18, 12, 10, 9],
            "wind_direction_10m": [180, 200, 220, 220, 180, 160, 140]
        ]
        let hours = TeeForecast.slice(hourly: hourly, around: date(2026, 11, 7))
        XCTAssertEqual(hours.count, 6)
        XCTAssertEqual(hours.first?.windKmh, 14)
        XCTAssertEqual(hours.first?.tempC, 19)
        XCTAssertEqual(hours.first?.windFromES, "sur")
        XCTAssertTrue(hours.first?.line.contains("sin lluvia") == true)
    }

    func testHandbookWithoutWindOmitsTheWindChapter() {
        let booking = TeeTime(
            id: "tt",
            startsAt: date(2026, 11, 7),
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            companions: [],
            windKmh: 18
        )
        let plain = CourseHandbook.make(courseName: "Azul", strategy: nil, booking: booking, includeWind: false, level: .medio)
        let wind = CourseHandbook.make(courseName: "Azul", strategy: nil, booking: booking, includeWind: true, level: .medio)
        XCTAssertFalse(plain.plainText.contains("18 km/h"))
        XCTAssertTrue(wind.plainText.contains("18 km/h"))
        XCTAssertTrue(wind.plainText.contains("no cambiamos el palo"))
    }

    func testBlowupRoundIsMarked() {
        let round = Round(
            roundId: "r",
            date: date(2026, 10, 4),
            weekday: "",
            tournament: "",
            clubName: "",
            clubCode: "118",
            course: "Colorada",
            tee: "",
            courseRating: 72,
            slope: 130,
            handicapIndex: 3,
            gross: 86,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 10, bogeys: 4, doubles: 3, triples: 1, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true
        )
        let marks = ScoreSpike.marks(in: [round], courseName: "Colorada")
        XCTAssertEqual(marks.count, 1)
        XCTAssertTrue(marks[0].reason.contains("dobles"))
    }
}

private extension WeatherPlay.Report {
    var plain: String { lines.joined(separator: " ") }
}
