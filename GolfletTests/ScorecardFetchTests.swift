import XCTest
@testable import Golflet

final class ScorecardFetchTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    private func date(_ text: String) -> Date {
        let formatter = ISO8601DateFormatter()
        return formatter.date(from: text)!
    }

    func testFirstAttemptIsFiveHoursLater() {
        let tee = date("2026-11-07T12:20:00Z")
        let next = ScorecardFetch.nextAttempt(playedAt: tee, lastAttempt: nil, calendar: calendar)
        XCTAssertEqual(next, date("2026-11-07T17:20:00Z"))
        XCTAssertFalse(ScorecardFetch.isDue(playedAt: tee, lastAttempt: nil, now: date("2026-11-07T17:19:00Z"), calendar: calendar))
        XCTAssertTrue(ScorecardFetch.isDue(playedAt: tee, lastAttempt: nil, now: date("2026-11-07T17:20:00Z"), calendar: calendar))
    }

    func testHourlyUntilTheNextCalendarDayThenDaily() {
        let tee = date("2026-11-07T12:20:00Z")
        let first = date("2026-11-07T17:20:00Z")
        let second = ScorecardFetch.nextAttempt(playedAt: tee, lastAttempt: first, calendar: calendar)
        XCTAssertEqual(second, date("2026-11-07T18:20:00Z"))

        let late = date("2026-11-07T23:20:00Z")
        let afterMidnight = ScorecardFetch.nextAttempt(playedAt: tee, lastAttempt: late, calendar: calendar)
        XCTAssertEqual(afterMidnight, date("2026-11-08T23:20:00Z"))

        let nextDay = ScorecardFetch.nextAttempt(playedAt: tee, lastAttempt: afterMidnight, calendar: calendar)
        XCTAssertEqual(nextDay, date("2026-11-09T23:20:00Z"))
    }

    func testPlayedMarkDoesNotDuplicateTheTeeTime() {
        let tee = TeeTime(
            id: "tt-1",
            startsAt: date("2026-11-07T12:20:00Z"),
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            companions: []
        )
        let anchors = ScorecardFetch.mergeTeeTimes([tee], into: [])
        let sameDay = ScorecardFetch.mergePlayed(
            at: date("2026-11-07T15:00:00Z"),
            clubCode: "118",
            course: "Azul",
            into: anchors,
            calendar: calendar
        )
        XCTAssertEqual(sameDay.count, 1)

        let otherDay = ScorecardFetch.mergePlayed(
            at: date("2026-11-08T15:00:00Z"),
            clubCode: "118",
            course: "Azul",
            into: anchors,
            calendar: calendar
        )
        XCTAssertEqual(otherDay.count, 2)
        XCTAssertEqual(otherDay.last?.kind, .played)
    }

    func testCardOnThatDayStopsTheFetch() {
        let played = date("2026-11-07T12:20:00Z")
        var anchor = ScorecardFetch.Anchor(id: "tee:tt-1", kind: .tee, at: played, clubCode: "118", course: "Azul", lastAttempt: nil)
        XCTAssertFalse(ScorecardFetch.cardIsIn([], playedAt: played, clubCode: "118", course: "Azul", calendar: calendar))
        let round = sampleRound(date: played, clubCode: "118", course: "Azul")
        let left = ScorecardFetch.settle([anchor], rounds: [round], calendar: calendar)
        XCTAssertTrue(left.isEmpty)
        anchor.lastAttempt = played
        XCTAssertTrue(ScorecardFetch.cardIsIn([sampleRound(date: played, clubCode: "999", course: "Azul")], playedAt: played, clubCode: "118", course: "Azul", calendar: calendar))
    }

    func testSyncsTheMatchingClub() {
        let due = [ScorecardFetch.Anchor(id: "tee:1", kind: .tee, at: Date(), clubCode: "118", course: "Azul", lastAttempt: nil)]
        let clubs = [
            LinkedClub(accountId: "a", code: "209", name: "MdP", baseURL: URL(string: "https://golf.example")!, matricula: "1", isDemo: false),
            LinkedClub(accountId: "b", code: "118", name: "Jockey", baseURL: URL(string: "https://golf.example")!, matricula: "1", isDemo: false),
            LinkedClub(accountId: "c", code: "000", name: "Demo", baseURL: URL(string: "https://golf.example")!, matricula: "1", isDemo: true)
        ]
        XCTAssertEqual(ScorecardFetch.clubsToSync(due: due, clubs: clubs).map(\.accountId), ["b"])
    }

    private func sampleRound(date: Date, clubCode: String, course: String) -> Round {
        Round(
            roundId: "r",
            date: date,
            weekday: "",
            tournament: "",
            clubName: "",
            clubCode: clubCode,
            course: course,
            tee: "",
            courseRating: 72,
            slope: 130,
            handicapIndex: 3,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true
        )
    }
}
