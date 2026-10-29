import XCTest
@testable import Golflet

final class StatsRangeTests: XCTestCase {
    override func tearDown() {
        UserDefaults.standard.removeObject(forKey: StatsRange.defaultsKey)
        super.tearDown()
    }

    func testQueryValuesMatchWebRangeParam() {
        XCTAssertEqual(StatsRange.month.query, "1m")
        XCTAssertEqual(StatsRange.threeMonths.query, "3m")
        XCTAssertEqual(StatsRange.sixMonths.query, "6m")
        XCTAssertEqual(StatsRange.year.query, "12m")
        XCTAssertEqual(StatsRange.all.query, "all")
        XCTAssertEqual(StatsRange.month.title, "Este mes")
        XCTAssertEqual(StatsRange.year.title, "Año")
        XCTAssertEqual(StatsRange.all.title, "Histórico")
    }

    func testPersistsChoice() {
        StatsRange.threeMonths.persist()
        XCTAssertEqual(StatsRange.persisted(), .threeMonths)
        StatsRange.month.persist()
        XCTAssertEqual(StatsRange.persisted(), .month)
    }

    func testRangedFiltersRollingWindows() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        let now = date("2026-10-27")
        let month = StatsEngine.ranged(rounds, range: .month, now: now)
        let year = StatsEngine.ranged(rounds, range: .year, now: now)
        let all = StatsEngine.ranged(rounds, range: .all, now: now)
        XCTAssertGreaterThan(all.count, year.count)
        XCTAssertGreaterThanOrEqual(year.count, month.count)
        XCTAssertTrue(month.allSatisfy { $0.date >= date("2026-09-27") })
        XCTAssertTrue(year.allSatisfy { $0.date >= date("2025-10-27") })
        XCTAssertEqual(all.count, rounds.count)
    }

    func testSummaryRecalculatesInsideRange() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        let now = date("2026-10-27")
        let all = StatsEngine.summary(rounds: rounds, filter: .all, range: .all, now: now)
        let year = StatsEngine.summary(rounds: rounds, filter: .all, range: .year, now: now)
        XCTAssertGreaterThan(all.validRoundCount, year.validRoundCount)
        XCTAssertGreaterThan(year.validRoundCount, 0)
        let empty = StatsEngine.summary(rounds: rounds, filter: .all, range: .month, now: date("2010-06-01"))
        XCTAssertEqual(empty.validRoundCount, 0)
        XCTAssertNil(empty.averageGross)
    }

    func testHoleAveragesAndSeriesFromRounds() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        let now = date("2026-10-27")
        let yearRounds = StatsEngine.ranged(rounds, range: .year, now: now)
        XCTAssertTrue(StatsEngine.hasCompleteHoleData(yearRounds))
        let holes = StatsEngine.holeAverages(rounds: yearRounds, course: "Colorada")
        XCTAssertFalse(holes.isEmpty)
        XCTAssertEqual(holes.map(\.number).sorted(), holes.map(\.number))
        XCTAssertTrue(holes.allSatisfy { $0.samples > 0 })

        let gross = StatsEngine.series(from: yearRounds, kind: .gross, courseName: "Colorada")
        XCTAssertFalse(gross.isEmpty)
        XCTAssertEqual(gross.map(\.date), gross.map(\.date).sorted())
        let rolling = StatsEngine.rollingAverage(gross, window: 5)
        XCTAssertEqual(rolling.count, gross.count)
        XCTAssertEqual(rolling.first?.value, gross.first?.value)

        let hole = StatsEngine.series(from: yearRounds, kind: .hole(1), courseName: "Colorada")
        XCTAssertFalse(hole.isEmpty)
        XCTAssertTrue(hole.allSatisfy { $0.value >= 2 && $0.value <= 10 })
    }

    func testCourseSnapshotUsesRange() async throws {
        let snap = try await MockAPIClient().bootstrap()
        let now = date("2026-10-27")
        let all = StatsEngine.course(named: "Colorada", rounds: snap.rounds, courses: snap.courses, tees: snap.tees, range: .all, now: now)
        let month = StatsEngine.course(named: "Colorada", rounds: snap.rounds, courses: snap.courses, tees: snap.tees, range: .month, now: now)
        XCTAssertGreaterThan(all.validCount, month.validCount)
    }

    private func date(_ iso: String) -> Date {
        let f = DateFormatter()
        f.calendar = Calendar.gregorian
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(secondsFromGMT: 0)
        f.dateFormat = "yyyy-MM-dd"
        return f.date(from: iso)!
    }
}
