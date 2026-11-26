import XCTest
@testable import Golflet

final class MatchStrokeTests: XCTestCase {
    /// Stroke index of the Azul fixture card (courses.json). Not a person's round.
    private let azul = [5, 1, 9, 3, 15, 17, 13, 7, 11, 4, 14, 16, 8, 18, 12, 10, 2, 6].map { Optional($0) }

    func testThreeStrokesLandOnTheLowestIndexes() {
        let dots = MatchStrokes.holeStrokes(received: 3, si: azul)
        let holes = dots.enumerated().compactMap { $0.element > 0 ? $0.offset + 1 : nil }
        XCTAssertEqual(holes, [2, 4, 17])
    }

    func testSevenAndASecondRound() {
        let seven = MatchStrokes.holeStrokes(received: 7, si: azul)
        XCTAssertEqual(seven.enumerated().compactMap { $0.element > 0 ? $0.offset + 1 : nil }, [1, 2, 4, 8, 10, 17, 18])
        let twenty = MatchStrokes.holeStrokes(received: 20, si: azul)
        XCTAssertEqual(twenty[1], 2)
        XCTAssertEqual(twenty[16], 2)
        XCTAssertTrue(twenty.allSatisfy { $0 >= 1 })
    }

    func testNineHolesUseOnlyThoseIndexes() {
        let nine = azul.enumerated().map { $0.offset < 9 ? $0.element : nil }
        XCTAssertTrue(MatchStrokes.placed(nine))
        let two = MatchStrokes.holeStrokes(received: 2, si: nine)
        XCTAssertEqual(two.enumerated().compactMap { $0.element > 0 ? $0.offset + 1 : nil }, [2, 4])
        let eleven = MatchStrokes.holeStrokes(received: 11, si: nine)
        XCTAssertEqual(eleven.filter { $0 == 2 }.count, 2)
        XCTAssertTrue(eleven.dropFirst(9).allSatisfy { $0 == 0 })
    }

    func testMissingIndexDoesNotUseHoleOrder() {
        let empty = Array<Int?>(repeating: nil, count: 18)
        XCTAssertFalse(MatchStrokes.placed(empty))
        XCTAssertEqual(MatchStrokes.holeStrokes(received: 7, si: empty), Array(repeating: 0, count: 18))
        var broken = azul
        broken[3] = nil
        XCTAssertEqual(MatchStrokes.holeStrokes(received: 4, si: broken), Array(repeating: 0, count: 18))
    }

    func testAdvantagesThreeFourSeven() {
        let got = MatchStrokes.strokesReceived([10, 13, 14, 17], allowance: 100)
        XCTAssertEqual(got, [0, 3, 4, 7])
    }

    func testSharedSurnameUsesGivenName() {
        let surnameFirst = ["Lavalle Joaquín", "Lavalle Augusto", "Mateo Ruiz"]
        XCTAssertEqual(MatchStrokes.shortName("Lavalle Joaquín", peers: surnameFirst), "Joaquín L.")
        XCTAssertEqual(MatchStrokes.shortName("Lavalle Augusto", peers: surnameFirst), "Augusto L.")
        let givenFirst = ["Joaquín Lavalle", "Augusto Lavalle"]
        XCTAssertEqual(MatchStrokes.shortName("Joaquín Lavalle", peers: givenFirst), "Joaquín L.")
        XCTAssertEqual(MatchStrokes.shortName("Augusto Lavalle", peers: givenFirst), "Augusto L.")
        XCTAssertEqual(MatchStrokes.shortName("Mateo Ruiz", peers: surnameFirst, me: true), "Vos")
        XCTAssertEqual(
            MatchStrokes.companionsLine(from: surnameFirst),
            "con Joaquín L. y Augusto L. +1"
        )
        XCTAssertEqual(MatchStrokes.companionsLine(from: ["Juan", "Pedro"]), "con Juan y Pedro")
        XCTAssertEqual(MatchStrokes.companionsLine(from: givenFirst), "con Joaquín y Augusto")
    }

    func testFourballStrokesFollowTheChosenCourseTee() {
        let indexes = [3.1, 6.1, 7.1, 10.1]
        let azul = indexes.map { MatchStrokes.courseHandicap(index: $0, slope: 123, rating: 70.2, par: 72)! }
        let colorada = indexes.map { MatchStrokes.courseHandicap(index: $0, slope: 122, rating: 71.1, par: 72)! }
        XCTAssertEqual(azul, [2, 5, 6, 9])
        XCTAssertEqual(colorada, [2, 6, 7, 10])
        XCTAssertEqual(MatchStrokes.strokesReceived(azul.map(Double.init), allowance: 85), [0, 3, 3, 6])
        XCTAssertEqual(MatchStrokes.strokesReceived(colorada.map(Double.init), allowance: 85), [0, 3, 4, 7])
        XCTAssertNotEqual(
            MatchStrokes.strokesReceived(azul.map(Double.init), allowance: 85),
            MatchStrokes.strokesReceived(colorada.map(Double.init), allowance: 85)
        )
        XCTAssertEqual(MatchStrokes.teeName(forCourse: "Azul"), "azul")
        XCTAssertEqual(MatchStrokes.teeName(forCourse: "Colorada"), "rojo")
        XCTAssertEqual(MatchStrokes.defaultAllowance(players: 4), 85)
    }

    func testBlueSquareNamesAzulWhenTheBookingHasNoCourse() {
        XCTAssertEqual(MatchStrokes.courseFromMarker("Copa del club 18hmp Dom 🟦", courses: ["Azul", "Colorada"]), "Azul")
        XCTAssertEqual(MatchStrokes.courseFromMarker("Programa COLO 🟥", courses: ["Azul", "Colorada"]), "Colorada")
        XCTAssertNil(MatchStrokes.courseFromMarker("Copa 🟥🟦", courses: ["Azul", "Colorada"]))
        XCTAssertNil(MatchStrokes.courseFromMarker("Copa sin marca", courses: ["Azul", "Colorada"]))
    }

    func testCardKeepsOfficialValuesAndLeavesGapsEmpty() {
        let built = MatchStrokes.card(from: [(hole: 2, par: 5, si: 1), (hole: 1, par: 4, si: nil)])
        XCTAssertEqual(built.pars[0], 4)
        XCTAssertEqual(built.si[1], 1)
        XCTAssertNil(built.si[0])
        XCTAssertFalse(MatchStrokes.placed(built.si))
    }

    func testBoardSaysWhoIsUpAndAFinishedMatch() {
        var me = Array<Int?>(repeating: nil, count: 18)
        var joaquin = me
        var augusto = me
        me[0] = 4; joaquin[0] = 5; me[1] = 4; joaquin[1] = 5; joaquin[2] = 4; augusto[2] = 5
        let mine = MatchStrokes.standing(aId: "me", bId: "joaquin", aName: "Joaquín L.", bName: "Joaquín L.", state: MatchStrokes.match(a: me, b: joaquin))
        let even = MatchStrokes.standing(aId: "me", bId: "augusto", aName: "Augusto L.", bName: "Augusto L.", state: MatchStrokes.match(a: me, b: augusto))
        let theirs = MatchStrokes.standing(aId: "joaquin", bId: "augusto", aName: "Joaquín L.", bName: "Augusto L.", state: MatchStrokes.match(a: joaquin, b: augusto))
        XCTAssertEqual(mine.text, "Vos 2 arriba")
        XCTAssertEqual(mine.tone, "me")
        XCTAssertEqual(even.text, "All square")
        XCTAssertEqual(theirs.text, "Joaquín L. 1 arriba")
        XCTAssertEqual(theirs.tone, "them")

        for hole in 0..<3 { me[hole] = 4; joaquin[hole] = 5; augusto[hole] = 6 }
        for hole in 3..<16 { me[hole] = 4; joaquin[hole] = 4; augusto[hole] = 4 }
        let closed = MatchStrokes.standing(aId: "me", bId: "joaquin", aName: "Joaquín L.", bName: "Joaquín L.", state: MatchStrokes.match(a: me, b: joaquin))
        XCTAssertEqual(closed.text, "Ganó Vos 3&2")
        XCTAssertFalse(closed.text.contains("partidos terminados"))
    }

    func testAStrokeTurnsALostHoleIntoAHalf() {
        let five = [Optional(5)] + Array(repeating: Optional<Int>.none, count: 17)
        let four = [Optional(4)] + Array(repeating: Optional<Int>.none, count: 17)
        XCTAssertEqual(MatchStrokes.match(a: five, b: four).up, -1)
        XCTAssertEqual(MatchStrokes.match(a: five, b: four, aDots: [1]).up, 0)
        XCTAssertEqual(MatchStrokes.match(a: five, b: four, aDots: [2]).text, "1 arriba")
    }

    func testTrackTotalReplacesTheHole() {
        let start: [Int?] = [4] + Array(repeating: nil, count: 17)
        let next = MatchStrokes.applyHoleScore(start, hole: 1, strokes: 5)
        XCTAssertEqual(next[0], 5)
        XCTAssertEqual(MatchStrokes.applyHoleScore(next, hole: 1, strokes: 5)[0], 5)
        XCTAssertEqual(MatchStrokes.applyHoleScore(start, hole: 1, strokes: 0)[0], 4)
    }
}
