import XCTest
@testable import Golflet

final class StrokesGainedTests: XCTestCase {
    func testGreenPuttsMatchBroadieFeetTable() {
        XCTAssertEqual(StrokesGained.expected(lie: .hoyo, meters: 0), 0, accuracy: 0.0001)
        let twoMeters = StrokesGained.expected(lie: .green, meters: 2)
        // 2 m = 6.5616 ft → between 6 ft (1.34) and 7 ft (1.43)
        XCTAssertEqual(twoMeters, 1.34 + (1.43 - 1.34) * (6.5616 - 6) / 1, accuracy: 0.01)
    }

    func testFairway150mInterpolatesTable9() {
        // 150 m = 164.04 yd → between 160 (2.98) and 180 (3.08)
        let value = StrokesGained.expected(lie: .fairway, meters: 150)
        let y = 150 * 1.0936
        let expect = 2.98 + (3.08 - 2.98) * (y - 160) / 20
        XCTAssertEqual(value, expect, accuracy: 0.0001)
    }

    func testTeeUnder100YardsUsesFairway() {
        let tee = StrokesGained.expected(lie: .salida, meters: 70)
        let fairway = StrokesGained.expected(lie: .fairway, meters: 70)
        XCTAssertEqual(tee, fairway, accuracy: 0.0001)
    }

    func testShotSGSubtractsEndAndStrokeAndPenalty() {
        let shot = StrokesGained.shot(
            hole: 4, index: 0, startLie: .salida, startM: 300,
            endLie: .fairway, endM: 140, holed: false, penalty: false, par: 4
        )
        let start = StrokesGained.expected(lie: .salida, meters: 300)
        let end = StrokesGained.expected(lie: .fairway, meters: 140)
        XCTAssertEqual(shot.sg, start - end - 1, accuracy: 0.0001)
        XCTAssertEqual(shot.category, .tee)

        let water = StrokesGained.shot(
            hole: 4, index: 0, startLie: .salida, startM: 300,
            endLie: .agua, endM: 180, holed: false, penalty: true, par: 4
        )
        XCTAssertEqual(water.sg, start - StrokesGained.expected(lie: .agua, meters: 180) - 2, accuracy: 0.0001)
    }

    func testCategoriesFromLieAndDistance() {
        XCTAssertEqual(StrokesGained.category(startLie: .salida, startM: 380, par: 5), .tee)
        XCTAssertEqual(StrokesGained.category(startLie: .salida, startM: 140, par: 3), .app)
        XCTAssertEqual(StrokesGained.category(startLie: .rough, startM: 30, par: 4), .corto)
        XCTAssertEqual(StrokesGained.category(startLie: .green, startM: 8, par: 4), .putt)
    }

    func testFormatUsesCommaAndSign() {
        XCTAssertEqual(StrokesGained.format(1.2), "+1,20")
        XCTAssertEqual(StrokesGained.format(-0.4), "−0,40")
        XCTAssertEqual(StrokesGained.format(0), "0,00")
    }

    func testExampleRoundsAreEighteenHolesAndLabeled() {
        let rounds = ExampleRounds.all()
        XCTAssertEqual(rounds.count, 6)
        XCTAssertEqual(LessonsCatalog.all.count, 10)
        let shots = rounds[0].shots
        XCTAssertFalse(shots.isEmpty)
        let holes = Set(shots.map(\.hole))
        XCTAssertEqual(holes.count, 18)
        let avg = rounds.map { StrokesGained.totals($0.shots).tot }.reduce(0, +) / Double(rounds.count)
        XCTAssertLessThan(avg, 0, "Un scratch de ejemplo ~12 HI tiene que perder golpes vs el Tour")
    }

    func testAzulCourseLoadsEighteenHolesFromOSM() {
        let h1 = AzulCourse.hole(1)
        XCTAssertEqual(h1.number, 1)
        XCTAssertGreaterThan(h1.line.count, 1)
        XCTAssertGreaterThan(h1.meters, 100)
        XCTAssertEqual(AzulCourse.all().count, 18)
        XCTAssertTrue(AzulCourse.credit.contains("OpenStreetMap"))
    }
}
