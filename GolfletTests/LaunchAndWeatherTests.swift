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
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 10, bogeys: 4, doubles: 3, triples: 1, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            gross: 86
        )
        let marks = ScoreSpike.marks(in: [round], courseName: "Colorada")
        XCTAssertEqual(marks.count, 1)
        XCTAssertTrue(marks[0].reason.contains("dobles"))
    }
}

private extension WeatherPlay.Report {
    var plain: String { lines.joined(separator: " ") }
}
