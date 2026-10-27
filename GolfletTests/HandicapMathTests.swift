import XCTest
@testable import Golflet

final class HandicapMathTests: XCTestCase {
    func testDifferentialMatchesKnownCard() {
        // Latest Azul card: AG 76, CR 70.2, slope 123 → 5.3
        let diff = HandicapMath.differential(adjustedGross: 76, courseRating: 70.2, slope: 123)
        XCTAssertEqual(diff, 5.3, accuracy: 0.001)
    }

    func testDifferentialBestRoundJuanBSegura() {
        // 72 gross on Azul 70.2 / 123 → 1.7
        let diff = HandicapMath.differential(adjustedGross: 72, courseRating: 70.2, slope: 123)
        XCTAssertEqual(diff, 1.7, accuracy: 0.001)
    }

    func testNetDoubleBogeyNoStroke() {
        // Course handicap 2, hole SI 5 → no extra stroke → par 4 + 2 = 6
        XCTAssertEqual(HandicapMath.netDoubleBogey(par: 4, courseHandicap: 2, holeStrokeIndex: 5), 6)
    }

    func testNetDoubleBogeyReceivesStroke() {
        // Course handicap 2, hole SI 1 → one extra stroke → par 4 + 2 + 1 = 7
        XCTAssertEqual(HandicapMath.netDoubleBogey(par: 4, courseHandicap: 2, holeStrokeIndex: 1), 7)
    }

    func testNetDoubleBogeyPlusHandicap() {
        // Plus 2: strokes given on SI 17 and 18. Par 3 SI 18 → NDB = 3 + 2 - 1 = 4
        XCTAssertEqual(HandicapMath.netDoubleBogey(par: 3, courseHandicap: -2, holeStrokeIndex: 18), 4)
        XCTAssertEqual(HandicapMath.netDoubleBogey(par: 4, courseHandicap: -2, holeStrokeIndex: 1), 6)
    }

    func testAdjustedGrossCapsBlowUp() {
        let holes: [(par: Int, strokeIndex: Int, strokes: Int)] = [
            (4, 1, 9), // NDB 7 with CH 2
            (5, 5, 5),
            (3, 15, 8) // NDB 5
        ]
        let ag = HandicapMath.adjustedGross(holes: holes, courseHandicap: 2)
        XCTAssertEqual(ag, 7 + 5 + 5)
    }

    func testBestEightOfTwenty() {
        // 20 differentials, newest last. Best 8 = 1...8, average 4.5
        let diffs = (20...1).map { Double($0) } // 20,19,...1 newest last so recent 20 is all
        let index = HandicapMath.handicapIndex(differentialsNewestLast: diffs)
        XCTAssertEqual(index, 4.5)
    }

    func testShortRecordUsesOneDifferentialAndAdjustment() {
        // 3 cards: use lowest 1, then −2.0
        let index = HandicapMath.handicapIndex(differentialsNewestLast: [12.4, 8.2, 9.1])
        XCTAssertEqual(index, 6.2)
    }

    func testUsageTableTwentyIsEight() {
        let rule = HandicapMath.usage(forCount: 20)
        XCTAssertEqual(rule.count, 8)
        XCTAssertEqual(rule.adjustment, 0)
    }

    func testCourseHandicapRounding() {
        // 3.1 × 123 / 113 + (70.2 − 72) ≈ 3.37 − 1.8 = 1.57 → 2
        let ch = HandicapMath.courseHandicap(index: 3.1, slope: 123, rating: 70.2, par: 72)
        XCTAssertEqual(ch, 2)
    }
}
