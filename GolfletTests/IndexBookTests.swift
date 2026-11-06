import XCTest
@testable import Golflet

final class IndexBookTests: XCTestCase {
    func testBestEightOfLastTwentyUsesStoredDifferentials() throws {
        var rounds: [Round] = (1...20).map { index in
            card(id: "c\(index)", day: index, differential: Double(index), gross: 80)
        }
        let book = IndexBook.composition(from: rounds)
        XCTAssertEqual(book.windowCount, 20)
        XCTAssertEqual(book.counting.map(\.id), (1...8).map { "c\($0)" })
        XCTAssertEqual(book.counting.map(\.differential), (1...8).map(Double.init))

        rounds.append(card(id: "fresh", day: 21, differential: 0.4, gross: 70))
        let next = IndexBook.composition(from: rounds)
        XCTAssertEqual(next.windowCount, 20)
        XCTAssertEqual(next.counting.map(\.id), ["fresh"] + (2...8).map { "c\($0)" })
        let last = try XCTUnwrap(next.revisions.last)
        XCTAssertEqual(last.entered.map(\.id), ["fresh"])
        XCTAssertEqual(last.dropped.map(\.id), ["c1"])
    }

    func testAgingOutACountingCardLetsTheNextBestIn() {
        var rounds: [Round] = (1...8).map { card(id: "low\($0)", day: $0, differential: 2, gross: 74) }
        rounds += (9...20).map { card(id: "high\($0)", day: $0, differential: 15, gross: 90) }
        rounds.append(card(id: "poor", day: 21, differential: 18, gross: 95))
        let book = IndexBook.composition(from: rounds)
        XCTAssertFalse(book.counting.contains { $0.id == "poor" })
        XCTAssertFalse(book.counting.contains { $0.id == "low1" })
        XCTAssertTrue(book.counting.contains { $0.id == "high20" })
        let last = book.revisions.last
        XCTAssertEqual(last?.entered.map(\.id), ["high20"])
        XCTAssertEqual(last?.dropped.map(\.id), ["low1"])
    }

    func testTieForTheLastSpotKeepsTheNewerCard() {
        var rounds = (1...7).map { card(id: "best\($0)", day: $0, differential: 1, gross: 72) }
        rounds.append(card(id: "old", day: 8, differential: 5, gross: 78))
        rounds.append(card(id: "new", day: 9, differential: 5, gross: 78))
        rounds += (10...20).map { card(id: "rest\($0)", day: $0, differential: 10, gross: 90) }
        let counting = IndexBook.composition(from: rounds).counting
        XCTAssertEqual(counting.count, 8)
        XCTAssertTrue(counting.contains { $0.id == "new" })
        XCTAssertFalse(counting.contains { $0.id == "old" })
    }

    func testGrossWithoutDifferentialIsIgnored() {
        let rounds = (1...5).map { card(id: "g\($0)", day: $0, differential: nil, gross: 70 + $0) }
        let book = IndexBook.composition(from: rounds)
        XCTAssertEqual(book.windowCount, 0)
        XCTAssertTrue(book.counting.isEmpty)
        XCTAssertTrue(book.revisions.isEmpty)
    }

    func testAdjustedGrossIsARealDifferential() {
        let round = card(id: "ag", day: 1, differential: nil, gross: 80, adjustedGross: 76, rating: 70.2, slope: 123)
        XCTAssertEqual(IndexBook.recordedDifferential(round) ?? 0, 5.3, accuracy: 0.001)
        XCTAssertEqual(IndexBook.composition(from: [round]).windowCount, 1)
    }

    func testStoredDifferentialWinsOverAdjustedGross() {
        let round = card(id: "both", day: 1, differential: 1.2, gross: 90, adjustedGross: 76, rating: 70.2, slope: 123)
        XCTAssertEqual(IndexBook.recordedDifferential(round) ?? 0, 1.2, accuracy: 0.001)
    }

    func testNineHoleAdjustedGrossIsNotInvented() {
        var round = card(id: "nine", day: 1, differential: nil, gross: 40, adjustedGross: 39, rating: 35, slope: 120)
        round.isNineHoles = true
        round.holesPlayed = 9
        XCTAssertNil(IndexBook.recordedDifferential(round))
        round.differential = 4.4
        XCTAssertEqual(IndexBook.recordedDifferential(round) ?? 0, 4.4, accuracy: 0.001)
    }

    func testInvalidCardIsIgnored() {
        var round = card(id: "bad", day: 1, differential: 2, gross: 76)
        round.isValid = false
        XCTAssertNil(IndexBook.recordedDifferential(round))
        XCTAssertEqual(IndexBook.composition(from: [round]).windowCount, 0)
    }

    func testMovementBetweenIndexDates() {
        let rounds = [
            card(id: "a", day: 1, differential: 2, gross: 74),
            card(id: "b", day: 2, differential: 3, gross: 75),
            card(id: "c", day: 3, differential: 4, gross: 76),
            card(id: "d", day: 10, differential: 1, gross: 72)
        ]
        let revisions = IndexBook.composition(from: rounds).revisions
        let early = IndexBook.counting(asOf: date(3), revisions: revisions)
        let later = IndexBook.counting(asOf: date(10), revisions: revisions)
        XCTAssertEqual(early.map(\.id), ["a"])
        let move = IndexBook.movement(from: early, to: later)
        XCTAssertEqual(move.entered.map(\.id), ["d"])
        XCTAssertEqual(move.dropped.map(\.id), ["a"])
    }

    private func card(
        id: String,
        day: Int,
        differential: Double?,
        gross: Int,
        adjustedGross: Int? = nil,
        rating: Double = 70.2,
        slope: Double = 123
    ) -> Round {
        Round(
            roundId: id,
            date: date(day),
            weekday: "Dom",
            tournament: "Test",
            clubName: "Jockey",
            clubCode: "118",
            course: "Azul",
            tee: "Azul",
            category: nil,
            weather: nil,
            courseRating: rating,
            slope: slope,
            position: nil,
            fieldSize: nil,
            handicapIndex: 3.1,
            playingHandicap: nil,
            outScore: nil,
            inScore: nil,
            gross: gross,
            net: gross - 2,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: (1...18).map {
                HoleScore(number: $0, par: 4, handicap: $0, yards: nil, strokes: 4, toPar: 0, result: .par)
            },
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            differential: differential,
            adjustedGross: adjustedGross,
            courseHandicap: nil,
            hcpAllowancePct: nil,
            courseKey: "118:Azul",
            otherCourse: false,
            clubPlayed: "Jockey",
            courseLabel: "Azul"
        )
    }

    private func date(_ day: Int) -> Date {
        var parts = DateComponents()
        parts.calendar = Calendar(identifier: .gregorian)
        parts.timeZone = TimeZone(secondsFromGMT: 0)
        parts.year = 2026
        parts.month = 1
        parts.day = day
        return parts.date!
    }
}
