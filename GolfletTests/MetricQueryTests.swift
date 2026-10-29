import XCTest
@testable import Golflet

final class MetricQueryTests: XCTestCase {
    func testCourseBuckets() {
        let azul = sample(course: "Azul", club: "118", other: false)
        let colorada = sample(course: "Colorada", club: "118", other: false)
        let nueva = sample(course: "Nueva", club: "209", clubName: "Mar del Plata Golf Club", other: false)
        let vieja = sample(course: "Cancha Vieja", club: "209", clubName: "Mar del Plata Golf Club", other: false)
        let other = sample(course: "Links Pinamar", club: "209", clubName: "Links Pinamar", other: true)

        XCTAssertEqual(MetricCourseBucket.bucket(for: azul), .azul)
        XCTAssertEqual(MetricCourseBucket.bucket(for: colorada), .colorada)
        XCTAssertEqual(MetricCourseBucket.bucket(for: nueva), .mdpNueva)
        XCTAssertEqual(MetricCourseBucket.bucket(for: vieja), .mdpVieja)
        XCTAssertEqual(MetricCourseBucket.bucket(for: other), .other)
        XCTAssertTrue(MetricCourseBucket.azul.matches(azul))
        XCTAssertFalse(MetricCourseBucket.azul.matches(colorada))
        XCTAssertTrue(MetricCourseBucket.other.matches(other))
    }

    func testSortGrossAndNet() {
        let a = sample(id: "a", date: "2026-01-01", course: "Azul", gross: 80, net: 76)
        let b = sample(id: "b", date: "2026-02-01", course: "Azul", gross: 72, net: 70)
        let c = sample(id: "c", date: "2026-03-01", course: "Azul", gross: 90, net: 84)
        let rounds = [a, b, c]
        XCTAssertEqual(StatsEngine.sorted(rounds, field: .gross, order: .bestFirst).map(\.gross), [72, 80, 90])
        XCTAssertEqual(StatsEngine.sorted(rounds, field: .gross, order: .worstFirst).map(\.gross), [90, 80, 72])
        XCTAssertEqual(StatsEngine.sorted(rounds, field: .net, order: .bestFirst).map(\.net), [70, 76, 84])
        XCTAssertEqual(StatsEngine.sorted(rounds, field: .date, order: .bestFirst).first?.roundId, "c")
    }

    func testPeriodAndClubFilter() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        let year = StatsEngine.filter(
            rounds,
            query: .yearRounds,
            period: .year,
            course: .all,
            now: date("2026-10-27")
        )
        XCTAssertFalse(year.isEmpty)
        XCTAssertTrue(year.allSatisfy { Calendar.gregorian.component(.year, from: $0.date) == 2026 })
        XCTAssertTrue(year.allSatisfy { $0.isValid && !$0.isNineHoles })

        let jockey = StatsEngine.filter(
            rounds,
            query: .club(LinkedClub(
                accountId: "118",
                code: "118",
                name: "Jockey",
                baseURL: URL(string: "https://example.com")!,
                matricula: "94506",
                isDemo: true
            )),
            period: .all,
            course: .all
        )
        XCTAssertTrue(jockey.allSatisfy { $0.clubCode == "118" })
        XCTAssertGreaterThan(jockey.count, 80)
    }

    func testScoreKindUsesHolesAndFallsBack() async throws {
        let rounds = try await MockAPIClient().bootstrap().rounds
        let birdies = StatsEngine.scoreKind(
            .birdie,
            rounds: rounds,
            query: .yearRounds,
            period: .year,
            course: .all,
            now: date("2026-10-27")
        )
        XCTAssertGreaterThan(birdies.total, 0)
        XCTAssertFalse(birdies.rounds.isEmpty)
        XCTAssertFalse(birdies.tally.isEmpty)
        XCTAssertEqual(birdies.rounds.first?.holes.isEmpty, false)

        let fallback = StatsEngine.count(.birdie, in: sample(
            id: "no-holes",
            date: "2026-01-01",
            course: "Azul",
            gross: 80,
            net: 76,
            birdies: 3,
            holes: []
        ))
        XCTAssertEqual(fallback.count, 3)
        XCTAssertFalse(fallback.fromHoles)
        XCTAssertEqual(StatsEngine.count(.eagle, in: sample(
            id: "no-eagles",
            date: "2026-01-01",
            course: "Azul",
            holes: []
        )).count, 0)
    }

    func testScoreKindTallyGroupsByCourseAndHole() {
        let holesA = [
            HoleScore(number: 2, par: 4, handicap: 1, yards: nil, strokes: 3, toPar: -1, result: .birdie),
            HoleScore(number: 8, par: 4, handicap: 2, yards: nil, strokes: 3, toPar: -1, result: .birdie)
        ]
        let holesB = [
            HoleScore(number: 2, par: 4, handicap: 1, yards: nil, strokes: 3, toPar: -1, result: .birdie)
        ]
        let a = sample(id: "1", date: "2026-01-02", course: "Colorada", holes: holesA)
        let b = sample(id: "2", date: "2026-01-03", course: "Colorada", holes: holesB)
        let snap = StatsEngine.scoreKind(
            .birdie,
            rounds: [a, b],
            query: .yearRounds,
            period: .all,
            course: .all,
            now: date("2026-10-27")
        )
        XCTAssertEqual(snap.total, 3)
        XCTAssertEqual(snap.tally.first?.hole, 2)
        XCTAssertEqual(snap.tally.first?.count, 2)
        XCTAssertEqual(snap.tally.first?.course, "Colorada")
    }

    func testMetricsSummaryAndSeriesUseRange() async throws {
        let api = MockAPIClient(autoSession: true)
        let month = try await api.metricsSummary(range: "1m")
        let all = try await api.metricsSummary(range: "all")
        XCTAssertEqual(month.range, "1m")
        XCTAssertLessThanOrEqual(month.roundsInRange, all.roundsInRange)
        XCTAssertGreaterThan(all.validRounds, 0)

        let drill = try await api.metricDrilldown(
            metric: "gross",
            scope: "all",
            year: 2026,
            course: "all",
            sort: "date",
            order: "desc",
            range: "3m"
        )
        XCTAssertFalse(drill?.series.isEmpty == true)
        XCTAssertFalse(drill?.monthly.isEmpty == true)
        XCTAssertFalse(drill?.chartPoints(preferMonthly: false).isEmpty == true)

        let parsed = PlayParser.metric([
            "metric": "birdies",
            "rounds_in_range": 4,
            "since": "2026-07-29",
            "range_label": "3 meses",
            "series": [
                ["date": "2026-08-01", "value": 2, "course": "Azul"],
                ["date": "2026-09-01", "value": 3, "course": "Colorada"]
            ],
            "monthly": [
                ["month": "2026-08", "value": 4, "rounds": 2],
                ["month": "2026-09", "value": 3, "rounds": 1]
            ]
        ])
        XCTAssertEqual(parsed.roundsInRange, 4)
        XCTAssertEqual(parsed.series.count, 2)
        XCTAssertEqual(parsed.monthly.count, 2)
        XCTAssertEqual(parsed.chartPoints(preferMonthly: true).count, 2)
        XCTAssertEqual(parsed.chartPoints(preferMonthly: true).first?.value, 2)
    }

    private func sample(
        id: String = "r",
        date iso: String = "2026-01-01",
        course: String,
        club: String = "118",
        clubName: String? = nil,
        other: Bool = false,
        gross: Int = 80,
        net: Int = 76,
        birdies: Int = 0,
        holes: [HoleScore]? = nil
    ) -> Round {
        Round(
            roundId: id,
            date: date(iso),
            weekday: "Dom",
            tournament: "Test",
            clubName: clubName ?? (other ? course : "Jockey Club Buenos Aires"),
            clubCode: club,
            course: course,
            tee: other ? "" : course,
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
            net: net,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: birdies, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: holes ?? (other ? [] : [HoleScore(number: 1, par: 4, handicap: 1, yards: nil, strokes: 4, toPar: 0, result: .par)]),
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            differential: nil,
            adjustedGross: nil,
            courseHandicap: nil,
            hcpAllowancePct: nil,
            otherCourse: other,
            clubPlayed: clubName ?? course,
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