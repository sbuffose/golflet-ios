import XCTest
@testable import Golflet

final class OfficialSpanTests: XCTestCase {
    func testFullHistoryMatchesTheHomeSpan() {
        let early = date("2023-10-05")
        let late = date("2026-11-05")
        let impact = OfficialSpan.impact(history: [
            HIPoint(date: early, handicap: 15.3),
            HIPoint(date: late, handicap: 8.4)
        ], rounds: [])
        XCTAssertEqual(impact?.start ?? 0, 15.3, accuracy: 0.01)
        XCTAssertEqual(impact?.now ?? 0, 8.4, accuracy: 0.01)
        XCTAssertEqual(impact?.delta ?? 0, -6.9, accuracy: 0.01)
        XCTAssertEqual(impact?.series.count, 2)
        XCTAssertTrue(impact?.movers.isEmpty == true)
        XCTAssertTrue(impact?.showsDelta == true)
    }

    func testDeleteCopySaysWhenTheScoreChanges() {
        XCTAssertEqual(
            ShotEditCopy.deleteLine(shotsOnHole: 5, postedStrokes: nil),
            "El hoyo pasa de 5 a 4 golpes. Las distancias de este palo se recalculan."
        )
        XCTAssertTrue(ShotEditCopy.deleteLine(shotsOnHole: 5, postedStrokes: 5).contains("sigue en 5"))
        XCTAssertTrue(ShotEditCopy.excludeLine.contains("sigue en el hoyo"))
    }

    private func date(_ stamp: String) -> Date {
        let parts = stamp.split(separator: "-").compactMap { Int($0) }
        return DateComponents(calendar: Calendar.gregorian, year: parts[0], month: parts[1], day: parts[2]).date!
    }
}
