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
        XCTAssertEqual(rejected.conflict, "stale")
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

    func testReloadRev5PlansRev6AndARejectedRev1IsAConflict() {
        XCTAssertEqual(QuickStats.nextRev(stored: 5), 6)
        XCTAssertEqual(QuickStats.nextRev(stored: nil), 1)
        let phase = QuickStats.phaseAfter(sent: 1, responseRev: 5, conflict: "stale")
        XCTAssertEqual(phase, "conflict")
        XCTAssertNotEqual(phase, "saving")
        XCTAssertFalse(QuickStats.saveMessage(phase).contains("Guardando"))
        XCTAssertTrue(QuickStats.saveMessage(phase).contains("Reintentá"))
    }

    func testClearKeepsTheRevisionSoAnOlderWriteCannotReturn() {
        let marked = HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 5)
        let cleared = QuickStats.apply(stored: marked, incoming: HoleMark(hole: 1, putts: nil, gir: nil, drive: nil, rev: 6))
        XCTAssertTrue(cleared.applied)
        XCTAssertNil(cleared.mark.gir)
        XCTAssertEqual(cleared.mark.rev, 6)
        let late = QuickStats.apply(stored: cleared.mark, incoming: HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 5))
        XCTAssertEqual(late.conflict, "stale")
        XCTAssertFalse(late.applied)
        XCTAssertNil(late.mark.gir)
        XCTAssertEqual(late.mark.rev, 6)
    }

    func testEqualRevisionDifferentPayloadConflictsAndTheSamePayloadRetries() {
        let base = HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 5)
        let first = QuickStats.apply(stored: base, incoming: HoleMark(hole: 1, putts: nil, gir: false, drive: nil, rev: 6))
        let second = QuickStats.apply(stored: first.mark, incoming: HoleMark(hole: 1, putts: 2, gir: true, drive: nil, rev: 6))
        XCTAssertTrue(first.applied)
        XCTAssertNil(first.conflict)
        XCTAssertEqual(second.conflict, "revision")
        XCTAssertFalse(second.applied)
        XCTAssertEqual(second.mark.gir, false)
        XCTAssertNil(second.mark.putts)
        let retry = QuickStats.apply(stored: first.mark, incoming: HoleMark(hole: 1, putts: nil, gir: false, drive: nil, rev: 6))
        XCTAssertTrue(retry.applied)
        XCTAssertTrue(retry.idempotent)
        XCTAssertEqual(retry.mark.gir, false)
    }

    func testNineHoleCardAndPar3Drive() {
        let nine = (1...9).map { QuickHole(hole: $0, par: $0 == 3 || $0 == 7 ? 3 : 4) }
        XCTAssertFalse(QuickStats.accepts(hole: 10, drive: nil, holes: nine))
        XCTAssertFalse(QuickStats.accepts(hole: 3, drive: "fairway", holes: nine))
        XCTAssertTrue(QuickStats.accepts(hole: 3, drive: nil, holes: nine))
        XCTAssertTrue(QuickStats.accepts(hole: 1, drive: "fairway", holes: nine))
        XCTAssertNil(QuickStats.driveForAccount(par: 3, fairway: "hit"))
        XCTAssertEqual(QuickStats.driveForAccount(par: 4, fairway: "hit"), "fairway")
        let marks = nine.map {
            HoleMark(hole: $0.hole, putts: 2, gir: true, drive: $0.par == 3 ? nil : "fairway", rev: 1)
        }
        let fields = QuickStats.noteFields(marks: marks, holes: nine)
        XCTAssertEqual(fields["putts"], 18)
        XCTAssertEqual(fields["gir"], 9)
        XCTAssertEqual(fields["fir"], 7)
        XCTAssertTrue(QuickStats.noteFields(marks: [marks[0]], holes: nine).isEmpty)
    }

    func testMockKeepsATombstoneAndRejectsTheOtherDevice() async throws {
        let api = MockAPIClient()
        let round = UUID().uuidString
        _ = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 5))
        _ = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: nil, gir: false, drive: nil, rev: 6))
        do {
            _ = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: 2, gir: true, drive: nil, rev: 6))
            XCTFail("La otra edición tenía que chocar")
        } catch let error as GolfletError {
            guard case .http(let status, _) = error else {
                XCTFail("\(error)")
                return
            }
            XCTAssertEqual(status, 409)
        }
        let retry = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: nil, gir: false, drive: nil, rev: 6))
        XCTAssertEqual(retry.mark.gir, false)
        XCTAssertEqual(retry.mark.rev, 6)
        _ = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: nil, gir: nil, drive: nil, rev: 7))
        do {
            _ = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: nil, gir: true, drive: nil, rev: 6))
            XCTFail("La marca borrada no tenía que volver")
        } catch let error as GolfletError {
            guard case .http(let status, _) = error else {
                XCTFail("\(error)")
                return
            }
            XCTAssertEqual(status, 409)
        }
        let marks = try await api.holeMarks(roundId: round)
        XCTAssertEqual(marks.count, 1)
        XCTAssertNil(marks[0].gir)
        XCTAssertNil(marks[0].putts)
        XCTAssertEqual(marks[0].rev, 7)
        XCTAssertEqual(QuickStats.nextRev(stored: marks[0].rev), 8)
    }

    func testTapBeforeTheAccountReadKeepsUntouchedGirAndDrive() {
        let account = HoleMark(hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5)
        let early = HoleMark(hole: 1, putts: 3, gir: nil, drive: nil, rev: 0)
        let touch = QuickStats.FieldTouch(putts: true, gir: false, drive: false)
        let merged = QuickStats.mergeAccount(account: account, local: early, touched: touch)
        XCTAssertEqual(merged.putts, 3)
        XCTAssertEqual(merged.gir, true)
        XCTAssertEqual(merged.drive, "fairway")
        XCTAssertEqual(merged.rev, 6)
        XCTAssertNotEqual(merged, HoleMark(hole: 1, putts: 3, gir: nil, drive: nil, rev: 6))
        let wiped = QuickStats.apply(stored: account, incoming: HoleMark(hole: 1, putts: 3, gir: nil, drive: nil, rev: 6))
        XCTAssertTrue(wiped.applied)
        XCTAssertNil(wiped.mark.gir)
        XCTAssertNil(wiped.mark.drive)
        let kept = QuickStats.apply(stored: account, incoming: merged)
        XCTAssertTrue(kept.applied)
        XCTAssertEqual(kept.mark.putts, 3)
        XCTAssertEqual(kept.mark.gir, true)
        XCTAssertEqual(kept.mark.drive, "fairway")
        XCTAssertEqual(kept.mark.rev, 6)
        XCTAssertTrue(QuickStats.noteFields(marks: [kept.mark], holes: holes).isEmpty)
        let clearGir = QuickStats.mergeAccount(
            account: account,
            local: HoleMark(hole: 1, putts: 2, gir: nil, drive: "fairway", rev: 0),
            touched: QuickStats.FieldTouch(putts: false, gir: true, drive: false)
        )
        XCTAssertEqual(clearGir.putts, 2)
        XCTAssertNil(clearGir.gir)
        XCTAssertEqual(clearGir.drive, "fairway")
        XCTAssertEqual(QuickStats.sendDecision(accountReady: false, stillHere: true), "hold")
        XCTAssertEqual(QuickStats.sendDecision(accountReady: true, stillHere: false), "hold")
        XCTAssertEqual(QuickStats.sendDecision(accountReady: true, stillHere: true), "send")
    }

    func testStaleHoleDoesNotEnterTheTotalAndTheNextEditUsesTheSavedRev() async throws {
        let account = [
            HoleMark(hole: 1, putts: 2, gir: true, drive: "fairway", rev: 5),
            HoleMark(hole: 2, putts: 1, gir: false, drive: "left", rev: 4)
        ]
        let early = QuickStats.HoleEdit(
            hole: 1,
            local: HoleMark(hole: 1, putts: 3, gir: nil, drive: nil, rev: 0),
            touched: QuickStats.FieldTouch(putts: true, gir: false, drive: false)
        )
        let card = [QuickHole(hole: 1, par: 4), QuickHole(hole: 2, par: 4)]
        let board = QuickStats.projectBoard(account: account, edits: [early])
        XCTAssertEqual(board.first { $0.hole == 1 }, HoleMark(hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6))
        XCTAssertEqual(board.first { $0.hole == 2 }, HoleMark(hole: 2, putts: 1, gir: false, drive: "left", rev: 4))
        let fields = QuickStats.noteFields(marks: board, holes: card)
        XCTAssertEqual(fields["putts"], 4)
        XCTAssertEqual(fields["gir"], 1)
        XCTAssertEqual(fields["fir"], 1)
        XCTAssertNotEqual(fields["putts"], 7)
        let api = MockAPIClient()
        let round = UUID().uuidString
        _ = try await api.saveHoleMark(roundId: round, mark: account[0])
        let first = try await api.saveHoleMark(roundId: round, mark: board[0])
        XCTAssertEqual(first.mark.rev, 6)
        let saved = QuickStats.acceptSaved(account: account, saved: first.mark)
        let secondEdit = QuickStats.mergeAccount(
            account: saved.first { $0.hole == 1 },
            local: HoleMark(hole: 1, putts: nil, gir: false, drive: nil, rev: 0),
            touched: QuickStats.FieldTouch(putts: false, gir: true, drive: false)
        )
        XCTAssertEqual(secondEdit.rev, 7)
        XCTAssertEqual(secondEdit.putts, 3)
        XCTAssertEqual(secondEdit.gir, false)
        XCTAssertEqual(secondEdit.drive, "fairway")
        let second = try await api.saveHoleMark(roundId: round, mark: secondEdit)
        XCTAssertEqual(second.mark.rev, 7)
        XCTAssertEqual(second.mark.gir, false)
        do {
            _ = try await api.saveHoleMark(roundId: round, mark: HoleMark(hole: 1, putts: 3, gir: false, drive: "fairway", rev: 6))
            XCTFail("La segunda edición no puede repetir la revisión 6")
        } catch let error as GolfletError {
            guard case .http(let status, _) = error else {
                XCTFail("\(error)")
                return
            }
            XCTAssertEqual(status, 409)
        }
    }

    func testOlderNoteDoesNotReplaceTheVisibleTotalAndAFocusedFieldStays() {
        XCTAssertFalse(QuickStats.noteIsNewer(previous: "2026-11-08T04:00:02.000Z", next: "2026-11-08T04:00:01.000Z"))
        XCTAssertTrue(QuickStats.noteIsNewer(previous: "2026-11-08T04:00:01.000Z", next: "2026-11-08T04:00:02.000Z"))
        XCTAssertFalse(QuickStats.noteIsNewer(previous: "2026-11-08T04:00:02.000Z", next: nil))
        XCTAssertEqual(QuickStats.visibleTotal(current: "32", authoritative: "7", focused: false), "7")
        XCTAssertEqual(QuickStats.visibleTotal(current: "6", authoritative: "7", focused: true), "6")
        XCTAssertEqual(QuickStats.visibleTotal(current: "32", authoritative: "0", focused: false), "0")
    }
}
