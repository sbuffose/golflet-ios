import XCTest
@testable import Golflet

final class YardageBookTests: XCTestCase {
    func testHoleGeometryMatchesWebBooklet() {
        XCTAssertEqual(YardageBook.cx(0), -6, accuracy: 0.01)
        XCTAssertEqual(YardageBook.hw(0), 0, accuracy: 0.0001)
        XCTAssertGreaterThan(YardageBook.hw(200), 10)
        XCTAssertEqual(YardageBook.green.y, 396, accuracy: 0.001)
        XCTAssertEqual(YardageBook.pin.x, YardageBook.green.x + 2.6, accuracy: 0.0001)
        XCTAssertEqual(YardageBook.pin.y, YardageBook.green.y + 4, accuracy: 0.0001)
        XCTAssertEqual(Int(round(YardageBook.green.ry * 2)), 34)
    }

    func testStillFrameShowsBothArcsAndDriverNote() {
        let frame = YardageBook.stillFrame(width: 390, height: 360)
        XCTAssertEqual(frame.arcs.count, 2)
        XCTAssertEqual(frame.notes.count, 1)
        XCTAssertEqual(frame.notes[0].text, "Driver")
        XCTAssertGreaterThan(frame.notes[0].distance, 200)
        XCTAssertEqual(frame.camera.r, 0, accuracy: 0.0001)
        XCTAssertNil(frame.holedAge)
    }

    func testPlayerAdvancesWithoutCrashing() {
        let player = YardageBookPlayer()
        let first = player.tick(dtMs: 16)
        let later = player.tick(dtMs: 800)
        XCTAssertGreaterThan(later.time, first.time)
        XCTAssertFalse(later.arcs.isEmpty)
    }

    func testCaptionAndCountComeFromRealProgress() {
        let cards = SyncAPIProgress(stage: .cards, done: 27, total: 97, listTotal: 97)
        XCTAssertEqual(YardageBookCopy.caption(stage: .cards, outcome: .running), "Leyendo tarjetas")
        XCTAssertEqual(YardageBookCopy.count(cards, outcome: .running), "27 / 97")
        XCTAssertEqual(YardageBookCopy.caption(stage: .done, outcome: .succeeded), "Listo")
        XCTAssertEqual(YardageBookCopy.count(cards, outcome: .succeeded), "97 tarjetas")
        XCTAssertNil(YardageBookCopy.count(SyncAPIProgress(stage: .connect), outcome: .running))
        XCTAssertEqual(
            SyncStepCopy.counter(stage: .cards, state: .active, progress: cards),
            "27 / 97"
        )
        XCTAssertNil(SyncStepCopy.counter(stage: .connect, state: .active, progress: cards))
    }

    func testSeededRngIsDeterministic() {
        var a = SeededRNG(11)
        var b = SeededRNG(11)
        XCTAssertEqual(a.next(), b.next(), accuracy: 1e-12)
        XCTAssertEqual(a.next(), b.next(), accuracy: 1e-12)
    }
}
