import XCTest
@testable import Golflet

final class QuickStatsTests: XCTestCase {
    private let pars = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5]
    private var holes: [QuickHole] { pars.enumerated().map { QuickHole(hole: $0.offset + 1, par: $0.element) } }
    private let totals = QuickTotals(putts: 32, gir: 10, fir: 8)

    func testOneGirYesKeepsPutts32Gir10Fir8() {
        let marks = [HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 1)]
        let fields = QuickStats.noteFields(marks: marks, holes: holes)
        XCTAssertEqual(fields, [:])
        XCTAssertNil(fields["putts"])
        XCTAssertNil(fields["gir"])
        XCTAssertNil(fields["fir"])
        let view = QuickStats.accountView(totals: totals, marks: marks, holes: holes)
        XCTAssertEqual(view.totals, totals)
        XCTAssertTrue(view.fields.isEmpty)
    }

    func testStaleRevDoesNotOverwrite() {
        let first = HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 1)
        let second = HoleMark(hole: 1, putts: 2, gir: false, drive: nil, rev: 2)
        let late = HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 1)
        let stored = QuickStats.apply(stored: first, incoming: second)
        XCTAssertTrue(stored.applied)
        let rejected = QuickStats.apply(stored: stored.mark, incoming: late)
        XCTAssertFalse(rejected.applied)
        XCTAssertEqual(rejected.mark.gir, false)
        XCTAssertEqual(rejected.mark.putts, 2)
        XCTAssertEqual(rejected.mark.rev, 2)
        XCTAssertFalse(QuickStats.shouldCommit(sent: 1, latest: 2, response: 1))
        XCTAssertFalse(QuickStats.shouldCommit(sent: 1, latest: 2, response: 2))
        XCTAssertTrue(QuickStats.shouldCommit(sent: 2, latest: 2, response: 2))
        let view = QuickStats.accountView(totals: totals, marks: [rejected.mark], holes: holes)
        XCTAssertEqual(view.totals, totals)
        XCTAssertTrue(view.fields.isEmpty)
    }

    func testReloadKeepsTheAccountTotals() {
        let saved = HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 1)
        let again = QuickStats.accountView(totals: totals, marks: [saved], holes: holes)
        XCTAssertEqual(again.totals.putts, 32)
        XCTAssertEqual(again.totals.gir, 10)
        XCTAssertEqual(again.totals.fir, 8)
        XCTAssertTrue(again.fields.isEmpty)
    }

    func testFinishedGirDoesNotClearPuttsOrFir() {
        let marks = holes.enumerated().map { HoleMark(hole: $0.element.hole, putts: nil, gir: $0.offset < 10, drive: nil, rev: 3) }
        let fields = QuickStats.noteFields(marks: marks, holes: holes)
        XCTAssertEqual(fields, ["gir": 10])
        XCTAssertNil(fields["putts"])
        XCTAssertNil(fields["fir"])
    }

    func testOneFairwayIsNotTheRoundFir() {
        let marks = [HoleMark(hole: 1, putts: nil, gir: nil, drive: "fairway", rev: 1)]
        XCTAssertNil(QuickStats.noteFields(marks: marks, holes: holes)["fir"])
    }

    func testHitDriveIsStoredAsFairway() {
        let incoming = HoleMark(hole: 1, putts: nil, gir: nil, drive: "hit", rev: 4)
        let stored = QuickStats.apply(stored: nil, incoming: incoming)
        XCTAssertEqual(stored.mark.drive, "fairway")
        XCTAssertEqual(QuickStats.localFairway("fairway"), "hit")
    }
}
