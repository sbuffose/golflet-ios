import XCTest
@testable import Golflet

final class HoleResultTests: XCTestCase {
    func testToParClassifiesEagleAndBirdie() {
        XCTAssertEqual(HoleResult(className: nil, toPar: -2), .eagleOrBetter)
        XCTAssertEqual(HoleResult(className: nil, toPar: -3), .eagleOrBetter)
        XCTAssertEqual(HoleResult(className: nil, toPar: -1), .birdie)
        XCTAssertEqual(HoleResult(className: nil, toPar: 0), .par)
        XCTAssertEqual(HoleResult(className: nil, toPar: 1), .bogey)
    }

    func testSpanishClassNames() {
        XCTAssertEqual(HoleResult(className: "aguila", toPar: nil), .eagleOrBetter)
        XCTAssertEqual(HoleResult(className: "águila", toPar: nil), .eagleOrBetter)
        XCTAssertEqual(HoleResult(className: "aguila-o-mejor", toPar: 0), .eagleOrBetter)
        XCTAssertEqual(HoleResult(className: "pare", toPar: nil), .par)
        XCTAssertEqual(HoleResult(className: "par", toPar: -1), .par)
        XCTAssertEqual(HoleResult(className: "bogey", toPar: -2), .bogey)
        XCTAssertEqual(HoleResult(className: "birdie", toPar: 1), .birdie)
    }

    func testUnknownClassNamePrefersToPar() {
        XCTAssertEqual(HoleResult(className: "sin-dato", toPar: -2), .eagleOrBetter)
        XCTAssertEqual(HoleResult(className: "sin-dato", toPar: -1), .birdie)
        XCTAssertEqual(HoleResult(className: "", toPar: 0), .par)
        XCTAssertEqual(HoleResult(className: "otro", toPar: nil), .unknown)
    }

    func testLegendPutsTheRoundCountInEachCategoryAndKeepsZeroEagles() {
        let holes = [
            HoleScore(number: 1, par: 3, handicap: 1, yards: nil, strokes: 1, toPar: -2, result: .eagleOrBetter),
            HoleScore(number: 2, par: 4, handicap: 2, yards: nil, strokes: 4, toPar: 0, result: .par),
            HoleScore(number: 3, par: 5, handicap: 3, yards: nil, strokes: 4, toPar: -1, result: .birdie),
        ]
        let unused = ScoreCounts(birdies: 9, pars: 9, bogeys: 9, doubles: 9, triples: 9, worse: 9, eagles: 9)
        let items = ScoreLegend.items(holes: holes, counts: unused)
        XCTAssertEqual(items.map(\.label), ["Águilas", "Birdies", "Pares", "Bogeys", "Doble +"])
        XCTAssertEqual(items.map(\.spoken), ["águilas", "birdies", "pares", "bogeys", "doble o peor"])
        XCTAssertEqual(items.map(\.count), [1, 1, 1, 0, 0])
        XCTAssertFalse(items.contains { $0.label.contains("−") || $0.label.contains("+1") || $0.label.contains("+2") })

        let unknown = [HoleScore(number: 1, par: 4, handicap: 1, yards: nil, strokes: nil, toPar: nil, result: .unknown)]
        let reported = ScoreCounts(birdies: 3, pars: 8, bogeys: 5, doubles: 1, triples: 1, worse: 0, eagles: 0)
        XCTAssertEqual(ScoreLegend.items(holes: unknown, counts: reported).map(\.count), [0, 3, 8, 5, 2])
    }

    func testSummaryOmitsEaglesUntilOneExists() {
        let pellegrini = ScorecardSummary.line(
            eagles: 0,
            birdies: 3,
            pars: 8,
            bogeys: 5,
            doubles: 2,
            differentialNote: "Diferencial estimado por Golflet: 6,4."
        )
        XCTAssertEqual(pellegrini, "3 birdies · 8 pares · 5 bogeys · 2 dobles. Diferencial estimado por Golflet: 6,4.")
        XCTAssertFalse(pellegrini.contains("águila"))

        let withEagle = ScorecardSummary.line(eagles: 1, birdies: 1, pars: 11, bogeys: 4, doubles: 1, differentialNote: "")
        XCTAssertTrue(withEagle.hasPrefix("1 águila · "))
        let two = ScorecardSummary.line(eagles: 2, birdies: 0, pars: 0, bogeys: 0, doubles: 0, differentialNote: "")
        XCTAssertTrue(two.hasPrefix("2 águilas · "))
    }

    func testMapperFillsEaglesFromHolesWhenTheCountIsMissing() {
        let json: [String: Any] = [
            "rounds": [[
                "round_id": "118:eagle",
                "date": "2026-05-16",
                "summary_counts": ["birdies": 1, "pars": 1, "bogeys": 0, "double_bogeys": 0],
                "holes": [
                    ["hole": 4, "par": 5, "strokes": 3, "to_par": -2, "result_class": "águila"],
                    ["hole": 1, "par": 4, "strokes": 3, "to_par": -1, "result_class": "birdie"],
                    ["hole": 12, "par": 3, "strokes": 2, "to_par": -1]
                ]
            ]]
        ]
        let round = LivePayloadMapper.snapshot(from: json).rounds.first
        XCTAssertEqual(round?.holes.map(\.result), [.eagleOrBetter, .birdie, .birdie])
        XCTAssertEqual(round?.counts.eagles, 1)
        XCTAssertEqual(round?.counts.birdies, 1)
    }

    func testMapperKeepsAReportedEagleAndDerivesWhenTheApiSendsZero() {
        let reported = LivePayloadMapper.snapshot(from: [
            "rounds": [[
                "round_id": "r-reported",
                "date": "2026-01-01",
                "summary_counts": ["eagles": 2, "birdies": 0, "pars": 0, "bogeys": 0, "double_bogeys": 0],
                "holes": [["hole": 1, "par": 4, "strokes": 4, "to_par": 0, "result_class": "par"]]
            ]]
        ]).rounds.first
        XCTAssertEqual(reported?.counts.eagles, 2)

        let zero = LivePayloadMapper.snapshot(from: [
            "rounds": [[
                "round_id": "r-zero",
                "date": "2026-01-02",
                "summary_counts": ["eagles": 0, "birdies": 3, "pars": 8, "bogeys": 5, "double_bogeys": 2],
                "holes": [
                    ["hole": 1, "par": 4, "strokes": 3, "to_par": -1, "result_class": "birdie"],
                    ["hole": 5, "par": 4, "strokes": 3, "to_par": -1, "result_class": "birdie"],
                    ["hole": 7, "par": 4, "strokes": 2, "to_par": -2, "result_class": "pare"]
                ]
            ]]
        ]).rounds.first
        XCTAssertEqual(zero?.holes[0].result, .birdie)
        XCTAssertEqual(zero?.holes[2].result, .par)
        XCTAssertEqual(zero?.counts.eagles, 0)

        let hidden = LivePayloadMapper.snapshot(from: [
            "rounds": [[
                "round_id": "r-hidden",
                "date": "2026-01-03",
                "summary_counts": ["eagles": 0, "birdies": 0, "pars": 0, "bogeys": 0, "double_bogeys": 0],
                "holes": [["hole": 4, "par": 5, "strokes": 3, "to_par": -2, "result_class": "sin-dato"]]
            ]]
        ]).rounds.first
        XCTAssertEqual(hidden?.holes.first?.result, .eagleOrBetter)
        XCTAssertEqual(hidden?.counts.eagles, 1)
    }
}
