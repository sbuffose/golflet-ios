import XCTest
@testable import Golflet

final class StatsEngineTests: XCTestCase {
    func testBundledFixturesLoad() throws {
        XCTAssertEqual(try FixtureLoader.array("rounds").count, 97)
        XCTAssertEqual(try FixtureLoader.array("courses").count, 2)
        XCTAssertEqual(try FixtureLoader.array("tees").count, 14)
        XCTAssertEqual(try FixtureLoader.array("per_hole_stats").count, 2)
    }

    func testEighteenHoleAveragesMatchSeed() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        XCTAssertEqual(rounds.count, 97)

        let valid = StatsEngine.eighteenHoleValid(rounds)
        XCTAssertEqual(valid.count, 86)
        XCTAssertEqual(StatsEngine.average(valid.compactMap(\.gross)) ?? 0, 79.9, accuracy: 0.05)

        let home = StatsEngine.home(rounds: rounds, now: date("2026-10-27"))
        XCTAssertEqual(home.cards, 97)
        XCTAssertEqual(home.bestGross, 72)
        XCTAssertEqual(home.yearRoundCount, 19)
        XCTAssertEqual(home.yearBestGross, 73)
        XCTAssertEqual(home.yearBirdies, 42)
        XCTAssertEqual(home.yearAverage ?? 0, 78.7, accuracy: 0.05)
        XCTAssertEqual(home.handicapIndex, 3.1, accuracy: 0.001)
        XCTAssertEqual(home.lastRound?.roundId, "118:94506:15300")

        let summary = StatsEngine.summary(rounds: rounds, filter: .all)
        XCTAssertEqual(summary.validRoundCount, 86)
        XCTAssertEqual(summary.best?.gross, 72)
        XCTAssertEqual(summary.best?.date, date("2025-03-30"))
        XCTAssertEqual(summary.worstSince2021?.gross, 92)
        XCTAssertEqual(summary.since2025Count, 42)
        XCTAssertEqual(summary.since2025Average ?? 0, 78.7, accuracy: 0.05)

        let snap = try await MockAPIClient().bootstrap()
        let colorada = StatsEngine.course(
            named: "Colorada",
            rounds: rounds,
            courses: snap.courses,
            tees: snap.tees
        )
        XCTAssertEqual(colorada.validCount, 48)
        XCTAssertEqual(colorada.averageGross ?? 0, 80.3, accuracy: 0.05)
        XCTAssertEqual(colorada.bestGross, 73)
        XCTAssertEqual(colorada.averageNet ?? 0, 74.9, accuracy: 0.05)
        XCTAssertEqual(colorada.since2025Average ?? 0, 79.1, accuracy: 0.05)
    }

    func testHardestHolesColorada() async throws {
        let stats = try await MockAPIClient().bootstrap().holeStats
        let hardest = StatsEngine.hardestHoles(from: stats, filter: .all)
        XCTAssertEqual(hardest.first?.1.number, 1)
        XCTAssertEqual(hardest.first?.0.course, "Colorada")
        XCTAssertEqual(hardest.first?.1.averageToPar ?? 0, 0.98, accuracy: 0.001)
    }

    func testCourseFilterAzul() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        let summary = StatsEngine.summary(rounds: rounds, filter: .azul)
        XCTAssertTrue(summary.validRoundCount < 86)
        XCTAssertEqual(summary.best?.course, "Azul")
    }

    func testAnonymizedPlayerName() async throws {
        let profile = try await MockAPIClient().bootstrap().profile
        XCTAssertEqual(profile.displayName, "Jugador Demo")
        XCTAssertFalse(profile.displayName.localizedCaseInsensitiveContains("Sebastian"))
        XCTAssertFalse(profile.displayName.localizedCaseInsensitiveContains("Sebastián"))
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
