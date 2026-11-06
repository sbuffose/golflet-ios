import XCTest
@testable import Golflet

final class RecapTimelineTests: XCTestCase {
    func testTimelineFollowsSpokenHoleOrder() {
        let beats = RecapTimeline.build(
            transcript: "En el hoyo 10 drive al medio. En el 3 tres putts.",
            mistakes: [RecapMistake(category: "putt", hole: 3, text: "Tres putts.")],
            positives: [RecapPositive(hole: 10, text: "Drive al medio.")],
            card: []
        )
        XCTAssertEqual(beats.map(\.hole), [10, 3])
        XCTAssertEqual(beats[0].tone, .good)
        XCTAssertEqual(beats[1].tone, .bad)
        XCTAssertEqual(beats[0].lines.first?.title, "Bien")
        XCTAssertEqual(beats[1].lines.first?.title, "Putt")
    }

    func testStoryBogeyMatchesTheCard() {
        let beats = RecapTimeline.build(
            transcript: "En el hoyo 4 hice bogey.",
            mistakes: [],
            positives: [],
            card: [RecapCardHole(number: 4, par: 4, strokes: 5, toPar: 1, result: .bogey)]
        )
        let hole = beats.first { $0.hole == 4 }
        XCTAssertEqual(hole?.agreement, .coincide)
        XCTAssertEqual(hole?.agreement?.label, "Coincide con la tarjeta")
        XCTAssertEqual(hole?.tone, .bad)
        XCTAssertEqual(hole?.scoreLine, "Par 4 · 5")
        XCTAssertEqual(hole?.toParLine, "+1")
    }

    func testStoryBirdieFlagsAParCard() {
        let beats = RecapTimeline.build(
            transcript: "Embocé un birdie en el hoyo 11.",
            mistakes: [],
            positives: [RecapPositive(hole: 11, text: "Embocé un birdie en el hoyo 11.")],
            card: [RecapCardHole(number: 11, par: 3, strokes: 3, toPar: 0, result: .par)]
        )
        let hole = beats.first { $0.hole == 11 }
        XCTAssertEqual(hole?.agreement, .mismatch(spoken: "birdie", card: "par"))
        XCTAssertEqual(hole?.tone, .bad)
        XCTAssertEqual(hole?.scoreLine, "Par 3 · 3")
        XCTAssertEqual(hole?.toParLine, "E")
    }

    func testUnderParIsTheGoodRail() {
        let beats = RecapTimeline.build(
            transcript: "En el 2 fue birdie.",
            mistakes: [],
            positives: [],
            card: [RecapCardHole(number: 2, par: 5, strokes: 4, toPar: -1, result: .birdie)]
        )
        XCTAssertEqual(beats.first?.tone, .good)
        XCTAssertEqual(beats.first?.toParLine, "−1")
        XCTAssertEqual(beats.first?.agreement, .coincide)
    }

    func testParOfTheHoleIsNotAClaimedResult() {
        XCTAssertNil(RecapTimeline.claimedResult(in: "El hoyo 1 es un par 5 y la dejé corta."))
        XCTAssertEqual(RecapTimeline.claimedResult(in: "En el 1 hice par."), .par)
        XCTAssertEqual(RecapTimeline.claimedResult(in: "Me quedó doble bogey."), .doubleOrWorse)
    }

    func testLatestHoleFollowsTheStory() {
        XCTAssertEqual(RecapTimeline.latestHole(in: "Arranqué por el 10 y después el hoyo 4"), 4)
        XCTAssertEqual(RecapTimeline.latestHole(in: "el hoyo diez"), 10)
        XCTAssertEqual(RecapTimeline.latestHole(in: "a la vuelta arrancó por el 10"), 10)
        XCTAssertNil(RecapTimeline.latestHole(in: "Pegué un 50 a la entrada."))
    }

    @MainActor
    func testLiveCuePublishesTheCurrentHole() {
        let recorder = RecapRecorder()
        recorder.noteSpoken("Voy por el hoyo 10 y después en el 11")
        XCTAssertEqual(recorder.currentHole, 11)
        XCTAssertEqual(recorder.spokenText.contains("hoyo 10"), true)
    }
}
