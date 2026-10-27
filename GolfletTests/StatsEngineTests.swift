import XCTest
@testable import Golflet

final class StatsEngineTests: XCTestCase {
    func testBundledFixturesLoad() throws {
        XCTAssertEqual(try FixtureLoader.array("rounds").count, 97)
        XCTAssertEqual(try FixtureLoader.array("other_course").count, 1)
        XCTAssertEqual(try FixtureLoader.array("courses").count, 2)
        XCTAssertEqual(try FixtureLoader.array("tees").count, 14)
        XCTAssertEqual(try FixtureLoader.array("per_hole_stats").count, 2)
    }

    func testEighteenHoleAveragesMatchSeed() async throws {
        let snap = try await MockAPIClient().bootstrap()
        XCTAssertEqual(snap.clubs.map(\.accountId), ["118", "209"])
        XCTAssertEqual(snap.clubs.map(\.cardCount).reduce(0, +), 98)
        let rounds = snap.rounds
        XCTAssertEqual(rounds.count, 98)
        XCTAssertEqual(rounds.filter(\.isOtherCourse).count, 1)

        let seed = rounds.filter { !$0.isOtherCourse }
        XCTAssertEqual(seed.count, 97)
        let seedValid = StatsEngine.eighteenHoleValid(seed)
        XCTAssertEqual(seedValid.count, 86)
        XCTAssertEqual(StatsEngine.average(seedValid.compactMap(\.gross)) ?? 0, 79.9, accuracy: 0.05)

        let valid = StatsEngine.eighteenHoleValid(rounds)
        XCTAssertEqual(valid.count, 87)
        XCTAssertTrue(valid.contains(where: \.isOtherCourse))
        XCTAssertEqual(StatsEngine.average(valid.compactMap(\.gross)) ?? 0, 79.9, accuracy: 0.05)

        let home = StatsEngine.home(rounds: rounds, now: date("2026-10-27"))
        XCTAssertEqual(home.cards, 98)
        XCTAssertEqual(home.bestGross, 72)
        XCTAssertEqual(home.yearRoundCount, 19)
        XCTAssertEqual(home.yearBestGross, 73)
        XCTAssertEqual(home.yearBirdies, 42)
        XCTAssertEqual(home.yearAverage ?? 0, 78.7, accuracy: 0.05)
        XCTAssertEqual(home.handicapIndex, 3.1, accuracy: 0.001)
        XCTAssertEqual(home.lastRound?.roundId, "118:94506:15300")

        let summary = StatsEngine.summary(rounds: rounds, filter: .all)
        XCTAssertEqual(summary.validRoundCount, 87)
        XCTAssertEqual(summary.best?.gross, 72)
        XCTAssertEqual(summary.best?.date, date("2025-03-30"))
        XCTAssertEqual(summary.worstSince2021?.gross, 92)
        XCTAssertEqual(summary.since2025Count, 42)
        XCTAssertEqual(summary.since2025Average ?? 0, 78.7, accuracy: 0.05)

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

    func testOtherCourseExcludedFromCourseStats() {
        let home = sampleRound(
            id: "118:home",
            date: "2024-03-01",
            club: "Jockey Club Buenos Aires",
            course: "Azul",
            courseKey: "118:Azul",
            other: false,
            gross: 76
        )
        let away = sampleRound(
            id: "209:away",
            date: "2024-05-12",
            club: "Links Pinamar",
            course: "Links Pinamar",
            courseKey: "x:links-pinamar",
            other: true,
            gross: 80
        )
        XCTAssertEqual(StatsEngine.eighteenHoleValid([home, away]).count, 2)
        XCTAssertEqual(StatsEngine.summary(rounds: [home, away], filter: .all).validRoundCount, 2)
        XCTAssertEqual(StatsEngine.summary(rounds: [home, away], filter: .all).best?.gross, 76)
        XCTAssertEqual(StatsEngine.home(rounds: [home, away]).cards, 2)
        XCTAssertEqual(
            StatsEngine.course(named: "Azul", rounds: [home, away], courses: [], tees: []).validCount,
            1
        )
        XCTAssertEqual(
            StatsEngine.course(named: "Links Pinamar", rounds: [home, away], courses: [], tees: []).validCount,
            0
        )
        XCTAssertEqual(StatsEngine.summary(rounds: [home, away], filter: .azul).validRoundCount, 1)
    }

    func testAnonymizedPlayerName() async throws {
        let profile = try await MockAPIClient().bootstrap().profile
        XCTAssertEqual(profile.displayName, "Jugador Demo")
        XCTAssertFalse(profile.displayName.localizedCaseInsensitiveContains("Sebastian"))
        XCTAssertFalse(profile.displayName.localizedCaseInsensitiveContains("Sebastián"))
    }

    private func sampleRound(
        id: String,
        date iso: String,
        club: String,
        course: String,
        courseKey: String,
        other: Bool,
        gross: Int
    ) -> Round {
        Round(
            roundId: id,
            date: date(iso),
            weekday: "Dom",
            tournament: "Test",
            clubName: club,
            clubCode: other ? "209" : "118",
            course: course,
            tee: other ? "" : "Azul",
            category: nil,
            weather: nil,
            courseRating: other ? 0 : 70.2,
            slope: other ? 0 : 123,
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
            holes: other ? [] : (1...18).map {
                HoleScore(number: $0, par: 4, handicap: $0, yards: nil, strokes: 4, toPar: 0, result: .par)
            },
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            differential: nil,
            adjustedGross: nil,
            courseHandicap: nil,
            hcpAllowancePct: nil,
            courseKey: courseKey,
            otherCourse: other,
            clubPlayed: club,
            courseLabel: course
        )
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
