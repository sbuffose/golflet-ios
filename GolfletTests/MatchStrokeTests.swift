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
    }

    func testCardKeepsOfficialValuesAndLeavesGapsEmpty() {
        let built = MatchStrokes.card(from: [(hole: 2, par: 5, si: 1), (hole: 1, par: 4, si: nil)])
        XCTAssertEqual(built.pars[0], 4)
        XCTAssertEqual(built.si[1], 1)
        XCTAssertNil(built.si[0])
        XCTAssertFalse(MatchStrokes.placed(built.si))
    }
}
