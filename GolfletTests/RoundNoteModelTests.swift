import SwiftData
import XCTest
@testable import Golflet

@MainActor
final class RoundNoteModelTests: XCTestCase {
    private let newerStamp = "2026-11-08T04:21:33.166Z"
    private let olderStamp = "2026-11-08T04:21:33.165Z"
    private let laterStamp = "2026-11-08T04:21:33.167Z"

    override func tearDown() {
        MockAPIClient.scriptedRoundNotes = []
        MockAPIClient.scriptedSnapshots = []
        MockAPIClient.scriptedScorecardFetches = []
        MockAPIClient.scriptedNewRounds = nil
        MockAPIClient.onBootstrap = nil
        MockAPIClient.onSaveRoundNotes = nil
        MockAPIClient.onSaveHoleMark = nil
        MockAPIClient.onHoleMarks = nil
        MockAPIClient.noteEntries = 0
        MockAPIClient.holeMarkEntries = 0
        MockAPIClient.holeReadEntries = 0
        MockAPIClient.failNextRoundNote = false
        super.tearDown()
    }

    func testANewerTotalSurvivesAnOlderResponseAndAReenter() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 32, gir: 10, fir: 8), sample("r2", putts: 50, gir: 12, fir: 9)]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 7, gir: 1, fir: 1, updatedAt: newerStamp)]
        let accepted = await model.saveRoundNotes(roundId: "r1", putts: 7, gir: 1, fir: 1, text: "nota", session: model.sessionEpoch)
        XCTAssertEqual(accepted?.putts, 7)

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 4, gir: 1, fir: 1, updatedAt: olderStamp)]
        let rejected = await model.saveRoundNotes(roundId: "r1", putts: 4, gir: 1, fir: 1, text: "nota", session: model.sessionEpoch)
        XCTAssertNil(rejected)
        XCTAssertFalse(model.applyStatFields(roundId: "r1", fields: ["putts": 3, "gir": 1, "fir": 1], notesAt: QuickStats.noteDate(olderStamp), session: model.sessionEpoch))

        XCTAssertEqual(model.presentedRound?.putts, 7)
        XCTAssertEqual(model.presentedRound?.gir, 1)
        XCTAssertEqual(model.presentedRound?.fir, 1)
        model.presentedRound = nil
        model.presentedRound = model.rounds.first { $0.roundId == "r1" }
        XCTAssertEqual(model.presentedRound?.putts, 7)
        XCTAssertEqual(model.presentedRound?.gir, 1)
        XCTAssertEqual(model.presentedRound?.fir, 1)
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(newerStamp))
        XCTAssertEqual(model.rounds.first { $0.roundId == "r2" }?.putts, 50)
    }

    func testAnotherRoundDoesNotTakeThisRoundsNote() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notes: "nota"), sample("r2", putts: 50, gir: 12, fir: 9, notes: "otra")]
        model.rounds[0].notesAt = QuickStats.noteDate(newerStamp)
        model.presentedRound = model.rounds[1]

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 9, gir: 2, fir: 2, updatedAt: laterStamp)]
        let accepted = await model.saveRoundNotes(roundId: "r2", putts: 9, gir: 2, fir: 2, text: "otra", session: model.sessionEpoch)
        XCTAssertEqual(accepted?.putts, 9)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.putts, 7)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.notes, "nota")
        XCTAssertEqual(model.presentedRound?.putts, 9)

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 1, gir: 0, fir: 0, updatedAt: olderStamp)]
        let rejected = await model.saveRoundNotes(roundId: "r2", putts: 1, gir: 0, fir: 0, text: "otra", session: model.sessionEpoch)
        XCTAssertNil(rejected)
        XCTAssertEqual(model.presentedRound?.putts, 9)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.putts, 7)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.notesAt, QuickStats.noteDate(newerStamp))
        model.presentedRound = nil
        model.presentedRound = model.rounds.first { $0.roundId == "r2" }
        XCTAssertEqual(model.presentedRound?.putts, 9)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.putts, 7)
    }

    func testATextOnlyResponseDoesNotMoveTotalsAndAnOlderOneDoesNotMoveTheStamp() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notes: "nota")]
        model.rounds[0].notesAt = QuickStats.noteDate(newerStamp)
        model.presentedRound = model.rounds[0]

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: nil, gir: nil, fir: nil, updatedAt: laterStamp)]
        let text = await model.saveRoundNotes(roundId: "r1", putts: nil, gir: nil, fir: nil, text: "solo texto", session: model.sessionEpoch)
        XCTAssertNotNil(text)
        XCTAssertEqual(model.rounds[0].putts, 7)
        XCTAssertEqual(model.rounds[0].gir, 1)
        XCTAssertEqual(model.rounds[0].fir, 1)
        XCTAssertEqual(model.rounds[0].notes, "solo texto")
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(laterStamp))

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 4, gir: 1, fir: 1, updatedAt: newerStamp)]
        let rejected = await model.saveRoundNotes(roundId: "r1", putts: 4, gir: 1, fir: 1, text: "solo texto", session: model.sessionEpoch)
        XCTAssertNil(rejected)
        XCTAssertEqual(model.rounds[0].putts, 7)
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(laterStamp))

        let zeroAt = QuickStats.noteDate("2026-11-08T04:21:33.168Z")
        XCTAssertTrue(model.applyStatFields(roundId: "r1", fields: ["putts": 0], notesAt: zeroAt, session: model.sessionEpoch))
        XCTAssertEqual(model.rounds[0].putts, 0)
        XCTAssertEqual(model.rounds[0].gir, 1)
        model.presentedRound = nil
        model.presentedRound = model.rounds[0]
        XCTAssertEqual(model.presentedRound?.putts, 0)
        XCTAssertEqual(model.presentedRound?.notesAt, zeroAt)
    }

    func testADelayedLoadKeepsTheNewerNoteAndDropsARemovedRound() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.rounds = [
            sample("r1", putts: 32, gir: 10, fir: 8, notes: "nota"),
            sample("r2", putts: 50, gir: 12, fir: 9, notesAt: olderStamp),
            sample("r-gone", putts: 3, gir: 1, fir: 1, notesAt: newerStamp)
        ]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 7, gir: 1, fir: 1, updatedAt: newerStamp)]
        let accepted = await model.saveRoundNotes(roundId: "r1", putts: 7, gir: 1, fir: 1, text: "nota", session: model.sessionEpoch)
        XCTAssertEqual(accepted?.putts, 7)

        MockAPIClient.scriptedSnapshots = [snapshot([
            sample("r1", putts: 4, gir: 1, fir: 1, notes: "vieja", notesAt: olderStamp, gross: 71, course: "Nueva"),
            sample("r2", putts: 9, gir: 2, fir: 2, notes: "nueva", notesAt: newerStamp, gross: 80, course: "Nueva")
        ], userID: "demo")]
        await model.load()

        let kept = model.rounds.first { $0.roundId == "r1" }
        XCTAssertEqual(kept?.putts, 7)
        XCTAssertEqual(kept?.gir, 1)
        XCTAssertEqual(kept?.fir, 1)
        XCTAssertEqual(kept?.notes, "nota")
        XCTAssertEqual(kept?.notesAt, QuickStats.noteDate(newerStamp))
        XCTAssertEqual(kept?.gross, 71)
        XCTAssertEqual(kept?.course, "Nueva")
        XCTAssertEqual(model.presentedRound?.putts, 7)
        XCTAssertEqual(model.presentedRound?.gross, 71)
        let updated = model.rounds.first { $0.roundId == "r2" }
        XCTAssertEqual(updated?.putts, 9)
        XCTAssertEqual(updated?.notes, "nueva")
        XCTAssertEqual(updated?.gross, 80)
        XCTAssertNil(model.rounds.first { $0.roundId == "r-gone" })
        model.presentedRound = nil
        model.presentedRound = model.rounds.first { $0.roundId == "r1" }
        XCTAssertEqual(model.presentedRound?.putts, 7)
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(newerStamp))
        XCTAssertEqual(model.presentedRound?.course, "Nueva")
    }

    func testAScorecardRefreshAcceptsZeroMissingAndTextOnly() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.rounds = [
            sample("r-zero", putts: 7, gir: 1, fir: 1, notes: "nota", notesAt: newerStamp),
            sample("r-miss", putts: 7, gir: 1, fir: 1, notes: "nota", notesAt: newerStamp),
            sample("r-text", putts: 7, gir: 1, fir: 1, notes: "nota", notesAt: newerStamp)
        ]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedScorecardFetches = [[
            ScorecardFetchJob(
                id: "job-1",
                teeTimeId: nil,
                date: "2026-11-08",
                time: "08:00",
                clubName: "Fixture",
                course: "Nueva",
                status: "complete",
                label: "Lista",
                lastError: nil,
                roundId: "r-arrived",
                attemptCount: 1
            )
        ]]
        MockAPIClient.scriptedSnapshots = [snapshot([
            sample("r-zero", putts: 0, notesAt: laterStamp, gross: 70),
            sample("r-miss", gir: 4, notesAt: laterStamp),
            sample("r-text", notes: "solo texto", notesAt: laterStamp),
            sample("r-arrived", putts: 5, gir: 2, fir: 2, notesAt: laterStamp)
        ], userID: "demo")]
        await model.refreshScorecardFetches()

        let zero = model.rounds.first { $0.roundId == "r-zero" }
        XCTAssertEqual(zero?.putts, 0)
        XCTAssertEqual(zero?.gir, 1)
        XCTAssertEqual(zero?.fir, 1)
        XCTAssertEqual(zero?.notes, "nota")
        XCTAssertEqual(zero?.notesAt, QuickStats.noteDate(laterStamp))
        XCTAssertEqual(zero?.gross, 70)
        let missing = model.rounds.first { $0.roundId == "r-miss" }
        XCTAssertEqual(missing?.putts, 7)
        XCTAssertEqual(missing?.gir, 4)
        XCTAssertEqual(missing?.fir, 1)
        XCTAssertEqual(missing?.notes, "nota")
        let text = model.rounds.first { $0.roundId == "r-text" }
        XCTAssertEqual(text?.putts, 7)
        XCTAssertEqual(text?.gir, 1)
        XCTAssertEqual(text?.fir, 1)
        XCTAssertEqual(text?.notes, "solo texto")
        XCTAssertEqual(text?.notesAt, QuickStats.noteDate(laterStamp))
        XCTAssertEqual(model.rounds.first { $0.roundId == "r-arrived" }?.putts, 5)
        XCTAssertEqual(model.presentedRound?.putts, 0)
        model.presentedRound = nil
        model.presentedRound = model.rounds.first { $0.roundId == "r-zero" }
        XCTAssertEqual(model.presentedRound?.putts, 0)
        XCTAssertEqual(model.presentedRound?.gir, 1)
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(laterStamp))
    }

    func testACardRefreshKeepsTheNewerNote() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.clubs = [LinkedClub(
            accountId: "acc-1",
            code: "118",
            name: "Club",
            baseURL: URL(string: "https://127.0.0.1/golf")!,
            matricula: "1",
            isDemo: false,
            passwordSaved: true
        )]
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notes: "nota", notesAt: newerStamp)]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedNewRounds = 1
        MockAPIClient.scriptedSnapshots = [snapshot([
            sample("r1", putts: 4, gir: 0, fir: 0, notes: "vieja", notesAt: olderStamp, gross: 80, course: "Nueva")
        ], userID: "demo")]
        await model.bringLatestCard()

        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.putts, 7)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.gir, 1)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.notes, "nota")
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.notesAt, QuickStats.noteDate(newerStamp))
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.gross, 80)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.course, "Nueva")
        XCTAssertEqual(model.presentedRound?.putts, 7)
        XCTAssertEqual(model.presentedRound?.gross, 80)
        model.presentedRound = nil
        model.presentedRound = model.rounds.first { $0.roundId == "r1" }
        XCTAssertEqual(model.presentedRound?.putts, 7)
        XCTAssertEqual(model.presentedRound?.course, "Nueva")
    }

    func testAnotherAccountReplacesTheList() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.rounds = [
            sample("r1", putts: 7, gir: 1, fir: 1, notes: "nota", notesAt: newerStamp),
            sample("r-local", putts: 3, gir: 1, fir: 1, notesAt: newerStamp)
        ]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedSnapshots = [snapshot([
            sample("r1", putts: 1, gir: 0, fir: 0, notes: "otra", notesAt: olderStamp, gross: 99)
        ], userID: "otra")]
        await model.load()

        XCTAssertEqual(model.user?.id, "otra")
        XCTAssertEqual(model.rounds.map(\.roundId), ["r1"])
        XCTAssertEqual(model.rounds[0].putts, 1)
        XCTAssertEqual(model.rounds[0].notes, "otra")
        XCTAssertEqual(model.rounds[0].gross, 99)
        XCTAssertNil(model.presentedRound)
        model.presentedRound = model.rounds[0]
        XCTAssertEqual(model.presentedRound?.putts, 1)
        XCTAssertEqual(model.presentedRound?.notes, "otra")
    }

    func testASignOutDuringBootstrapDoesNotRestoreTheRound() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notes: "nota", notesAt: newerStamp)]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedSnapshots = [snapshot([
            sample("r1", putts: 4, gir: 1, fir: 1, notesAt: olderStamp)
        ], userID: "demo")]
        MockAPIClient.onBootstrap = { await model.signOut() }
        await model.load()

        XCTAssertNil(model.user)
        XCTAssertTrue(model.rounds.isEmpty)
        XCTAssertNil(model.presentedRound)
        XCTAssertFalse(model.isSignedIn)
    }

    func testALeftVisitOrLogoutDoesNotDispatchTheNote() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notesAt: newerStamp)]
        let visit = RoundVisit()
        visit.enter()
        let saver = QuickNoteSaver()
        saver.schedule(
            model: model, roundId: "r1", text: "borrador", putts: 7, gir: 1, fir: 1,
            session: model.sessionEpoch, visit: visit, generation: visit.generation,
            delayNanoseconds: 400_000_000
        )
        visit.leave()
        try await Task.sleep(nanoseconds: 700_000_000)
        XCTAssertEqual(MockAPIClient.noteEntries, 0)
        XCTAssertEqual(model.rounds[0].putts, 7)

        let again = RoundVisit()
        again.enter()
        let held = QuickNoteSaver()
        held.schedule(
            model: model, roundId: "r1", text: "otro", putts: 7, gir: 1, fir: 1,
            session: model.sessionEpoch, visit: again, generation: again.generation,
            delayNanoseconds: 400_000_000
        )
        held.cancel()
        try await Task.sleep(nanoseconds: 700_000_000)
        XCTAssertEqual(MockAPIClient.noteEntries, 0)

        let live = RoundVisit()
        live.enter()
        let pending = QuickNoteSaver()
        pending.schedule(
            model: model, roundId: "r1", text: "sale", putts: 7, gir: 1, fir: 1,
            session: model.sessionEpoch, visit: live, generation: live.generation,
            delayNanoseconds: 400_000_000
        )
        await model.signOut()
        try await Task.sleep(nanoseconds: 700_000_000)
        XCTAssertEqual(MockAPIClient.noteEntries, 0)
        XCTAssertNil(model.notes.note(for: "r1"))
        XCTAssertTrue(model.rounds.isEmpty)
    }

    func testAVisitThatEndsWhileTheNoteIsInFlightDoesNotPaint() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 32, gir: 10, fir: 8, notesAt: olderStamp)]
        let visit = RoundVisit()
        visit.enter()
        var painted = false
        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 7, gir: 1, fir: 1, updatedAt: newerStamp)]
        MockAPIClient.onSaveRoundNotes = { visit.leave() }
        let saver = QuickNoteSaver()
        saver.schedule(
            model: model, roundId: "r1", text: "en viaje", putts: 7, gir: 1, fir: 1,
            session: model.sessionEpoch, visit: visit, generation: visit.generation,
            delayNanoseconds: 30_000_000
        ) { _ in painted = true }
        try await Task.sleep(nanoseconds: 400_000_000)
        XCTAssertEqual(MockAPIClient.noteEntries, 1)
        XCTAssertFalse(painted)
        XCTAssertEqual(model.rounds[0].putts, 7)
    }

    func testAParkedNoteDoesNotRepaintTheDraftThatReplacedIt() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 32, gir: 10, fir: 8, notes: "vieja", notesAt: olderStamp)]
        let visit = RoundVisit()
        visit.enter()
        let park = Park()
        MockAPIClient.onSaveRoundNotes = { await park.park() }
        MockAPIClient.scriptedRoundNotes = [
            QuickTotals(putts: 7, gir: 1, fir: 1, updatedAt: newerStamp),
            QuickTotals(putts: 8, gir: 1, fir: 1, updatedAt: laterStamp)
        ]
        let screen = NoteScreen(model: model, visit: visit, roundId: "r1")
        screen.fields = QuickNoteFields(text: "alfa", putts: "7", gir: "1", fir: "1", noteAt: "", focus: nil)
        screen.push(delay: 0)
        await until("la nota A no llegó a salir") { park.parked == 1 }
        screen.fields.text = "beta"
        screen.fields.putts = "8"
        screen.push(delay: 400_000_000)
        park.release()
        await until("el total de A no se guardó") { model.rounds[0].putts == 7 }
        XCTAssertEqual(MockAPIClient.noteEntries, 1)
        XCTAssertEqual(screen.paints, 0)
        XCTAssertEqual(screen.retriggers, 0)
        XCTAssertEqual(screen.fields.text, "beta")
        XCTAssertEqual(screen.fields.putts, "8")
        XCTAssertEqual(model.notes.note(for: "r1")?.text, "beta")
        XCTAssertEqual(model.rounds[0].notes, "beta")
        await until("la nota B no se aceptó") { screen.paints == 1 }
        XCTAssertEqual(MockAPIClient.noteEntries, 2)
        XCTAssertEqual(screen.retriggers, 0)
        XCTAssertEqual(screen.fields.text, "beta")
        XCTAssertEqual(screen.fields.putts, "8")
        XCTAssertEqual(model.rounds[0].putts, 8)
        XCTAssertEqual(model.rounds[0].notes, "beta")
        XCTAssertNil(model.errorMessage)
    }

    func testAnOlderNoteDoesNotRepaintWhileTheNextNoteIsInFlight() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 32, gir: 10, fir: 8, notes: "vieja", notesAt: olderStamp)]
        let visit = RoundVisit()
        visit.enter()
        let first = Park()
        let second = Park()
        MockAPIClient.onSaveRoundNotes = {
            MockAPIClient.onSaveRoundNotes = { await second.park() }
            await first.park()
        }
        MockAPIClient.scriptedRoundNotes = [
            QuickTotals(putts: 7, gir: 1, fir: 1, updatedAt: newerStamp),
            QuickTotals(putts: 8, gir: 1, fir: 1, updatedAt: laterStamp)
        ]
        let screen = NoteScreen(model: model, visit: visit, roundId: "r1")
        screen.fields = QuickNoteFields(text: "alfa", putts: "7", gir: "1", fir: "1", noteAt: "", focus: nil)
        screen.push(delay: 0)
        await until("la nota A no llegó a salir") { first.parked == 1 }
        screen.fields.text = "beta"
        screen.fields.putts = "8"
        screen.push(delay: 0)
        await until("la nota B no llegó a salir") { second.parked == 1 }
        XCTAssertEqual(MockAPIClient.noteEntries, 2)
        first.release()
        await until("el total de A no se guardó") { model.rounds[0].putts == 7 }
        XCTAssertEqual(screen.paints, 0)
        XCTAssertEqual(screen.retriggers, 0)
        XCTAssertEqual(screen.fields.text, "beta")
        XCTAssertEqual(screen.fields.putts, "8")
        XCTAssertEqual(model.notes.note(for: "r1")?.text, "beta")
        XCTAssertEqual(model.rounds[0].notes, "beta")
        second.release()
        await until("la nota B no se aceptó") { screen.paints == 1 }
        XCTAssertEqual(MockAPIClient.noteEntries, 2)
        XCTAssertEqual(screen.retriggers, 0)
        XCTAssertEqual(screen.fields.text, "beta")
        XCTAssertEqual(screen.fields.putts, "8")
        XCTAssertEqual(model.rounds[0].putts, 8)
        XCTAssertEqual(model.rounds[0].notes, "beta")
    }

    func testAFailedNoteDoesNotClearTheNewerDraft() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 32, gir: 10, fir: 8, notes: "vieja", notesAt: olderStamp)]
        let visit = RoundVisit()
        visit.enter()
        let park = Park()
        MockAPIClient.onSaveRoundNotes = { await park.park() }
        MockAPIClient.scriptedRoundNotes = [
            QuickTotals(putts: 8, gir: 1, fir: 1, updatedAt: laterStamp)
        ]
        let screen = NoteScreen(model: model, visit: visit, roundId: "r1")
        screen.fields = QuickNoteFields(text: "alfa", putts: "7", gir: "1", fir: "1", noteAt: "", focus: nil)
        screen.push(delay: 0)
        await until("la nota A no llegó a salir") { park.parked == 1 }
        MockAPIClient.failNextRoundNote = true
        screen.fields.text = "beta"
        screen.fields.putts = "8"
        screen.push(delay: 250_000_000)
        park.release()
        try await Task.sleep(nanoseconds: 40_000_000)
        XCTAssertEqual(MockAPIClient.noteEntries, 1)
        XCTAssertEqual(screen.paints, 0)
        XCTAssertEqual(screen.retriggers, 0)
        XCTAssertNil(model.errorMessage)
        XCTAssertEqual(model.rounds[0].putts, 32)
        XCTAssertEqual(screen.fields.text, "beta")
        XCTAssertEqual(screen.fields.putts, "8")
        XCTAssertEqual(model.notes.note(for: "r1")?.text, "beta")
        XCTAssertEqual(model.rounds[0].notes, "beta")
        await until("la nota B no se aceptó") { screen.paints == 1 }
        XCTAssertEqual(MockAPIClient.noteEntries, 2)
        XCTAssertEqual(screen.retriggers, 0)
        XCTAssertEqual(screen.fields.text, "beta")
        XCTAssertEqual(model.rounds[0].putts, 8)
        XCTAssertEqual(model.notes.note(for: "r1")?.text, "beta")
        XCTAssertNil(model.errorMessage)
    }

    func testAPriorAccountCompletionIsIgnoredAndAStaleSessionIsNotSent() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notes: "mia", notesAt: newerStamp)]
        let epoch = model.sessionEpoch
        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 4242, gir: 9, fir: 9, updatedAt: laterStamp)]
        MockAPIClient.onSaveRoundNotes = {
            await model.signOut()
            await model.signInGolfistics(matricula: "124", clave: "ok", savePassword: false)
        }
        let ignored = await model.saveRoundNotes(roundId: "r1", putts: 4242, gir: 9, fir: 9, text: "cuenta vieja", session: epoch)
        XCTAssertNil(ignored)
        XCTAssertEqual(MockAPIClient.noteEntries, 1)
        XCTAssertTrue(MockAPIClient.scriptedRoundNotes.isEmpty)
        XCTAssertEqual(model.user?.id, "demo")
        XCTAssertNotEqual(model.sessionEpoch, epoch)
        XCTAssertFalse(model.rounds.contains { $0.putts == 4242 })
        XCTAssertFalse(model.rounds.contains { $0.notes == "cuenta vieja" })
        XCTAssertNil(model.notes.note(for: "r1"))

        let mark = HoleMark(hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6)
        MockAPIClient.onSaveHoleMark = {
            await model.signOut()
            await model.signInGolfistics(matricula: "124", clave: "ok", savePassword: false)
        }
        let sent = await model.sendHoleMark(roundId: "r1", session: model.sessionEpoch, mark: mark)
        if case .ignored = sent {} else { XCTFail("la marca ya enviada tenía que ignorarse") }
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 1)
        XCTAssertFalse(model.rounds.contains { $0.putts == 4242 })

        let readEpoch = model.sessionEpoch
        MockAPIClient.onHoleMarks = {
            await model.signOut()
            await model.signInGolfistics(matricula: "124", clave: "ok", savePassword: false)
        }
        let read = await model.readHoleMarks(roundId: "r1", session: readEpoch)
        if case .ignored = read {} else { XCTFail("la lectura ya pedida tenía que ignorarse") }
        XCTAssertEqual(MockAPIClient.holeReadEntries, 1)

        let current = model.sessionEpoch
        model.writeHoleCache(
            roundId: "r-nueva",
            session: current,
            present: [HoleExtra(roundId: "r-nueva", hole: 1, putts: 2, gir: true, fairway: "hit")],
            clear: []
        )
        model.writeHoleCache(roundId: "r-nueva", session: epoch, present: [], clear: [1])
        XCTAssertEqual(model.notes.extras(for: "r-nueva").first?.putts, 2)
        XCTAssertFalse(model.applyStatFields(roundId: "r1", fields: ["putts": 4], notesAt: QuickStats.noteDate(laterStamp), session: epoch))

        let blocked = await model.saveRoundNotes(roundId: "r1", putts: 1, gir: 0, fir: 0, text: "no", session: epoch)
        XCTAssertNil(blocked)
        XCTAssertEqual(MockAPIClient.noteEntries, 1)
        let unread = await model.readHoleMarks(roundId: "r1", session: epoch)
        if case .notSent = unread {} else { XCTFail("la lectura vieja no tenía que salir") }
        XCTAssertEqual(MockAPIClient.holeReadEntries, 1)
        let unsent = await model.sendHoleMark(roundId: "r1", session: epoch, mark: mark)
        if case .notSent = unsent {} else { XCTFail("la marca vieja no tenía que salir") }
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 1)
    }

    func testACurrentQueueStillSendsTheFollowingMark() async throws {
        let model = try makeModel()
        let visit = RoundVisit()
        visit.enter()
        let queue = QuickWorkQueue()
        let park = Park()
        MockAPIClient.onSaveHoleMark = { await park.park() }
        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: 1)
        let first = HoleMark(hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6)
        let secondMark = HoleMark(hole: 2, putts: 4, gir: false, drive: "left", rev: 6)
        var painted = 0
        _ = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: first, wait: {}) { painted += 1 }
        await until("la primera marca no llegó a salir") { park.parked == 1 }
        let second = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: secondMark, wait: {}) { painted += 1 }
        park.release()
        await second.value
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 2)
        XCTAssertEqual(painted, 2)
    }

    func testAQueuedMarkDoesNotAdoptTheNextVisit() async throws {
        let model = try makeModel()
        let visit = RoundVisit()
        visit.enter()
        let queue = QuickWorkQueue()
        let park = Park()
        MockAPIClient.onSaveHoleMark = { await park.park() }
        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: 1)
        let mark = HoleMark(hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6)
        model.writeHoleCache(
            roundId: "r-cola",
            session: identity.session,
            present: [HoleExtra(roundId: "r-cola", hole: 1, putts: 2, gir: true, fairway: "hit")],
            clear: []
        )
        var painted = false
        let paintStale = {
            painted = true
            model.writeHoleCache(
                roundId: "r-cola",
                session: identity.session,
                present: [HoleExtra(roundId: "r-cola", hole: 1, putts: 9, gir: false, fairway: "left")],
                clear: []
            )
        }
        _ = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: mark, wait: {}, onScreen: paintStale)
        await until("la marca en viaje no llegó a salir") { park.parked == 1 }
        var waited = false
        let queued = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: mark, wait: { waited = true }, onScreen: paintStale)
        visit.leave()
        visit.enter()
        park.release()
        await queued.value
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 1)
        XCTAssertFalse(waited)
        XCTAssertFalse(painted)
        XCTAssertEqual(model.notes.extras(for: "r-cola").first?.putts, 2)

        let current = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: 1)
        let freshMark = HoleMark(hole: 2, putts: 4, gir: false, drive: "left", rev: 6)
        let again = scheduleMark(queue: queue, model: model, visit: visit, identity: current, mark: freshMark, wait: {}) { painted = true }
        await again.value
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 2)
        XCTAssertTrue(painted)
    }

    func testAQueuedMarkDoesNotAdoptTheNextSession() async throws {
        let model = try makeModel()
        model.user = player("demo")
        model.rounds = [sample("r1", putts: 7, gir: 1, fir: 1, notesAt: newerStamp)]
        let visit = RoundVisit()
        visit.enter()
        let queue = QuickWorkQueue()
        let park = Park()
        MockAPIClient.onSaveHoleMark = { await park.park() }
        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: 1)
        let mark = HoleMark(hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6)
        var touchedModel = false
        var painted = false
        _ = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: mark, wait: {}, onModel: { touchedModel = true }) { painted = true }
        await until("la marca en viaje no llegó a salir") { park.parked == 1 }
        let queued = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: mark, wait: {}) { painted = true }
        await model.signOut()
        await model.signInGolfistics(matricula: "124", clave: "ok", savePassword: false)
        let current = model.sessionEpoch
        model.writeHoleCache(
            roundId: "r-nueva",
            session: current,
            present: [HoleExtra(roundId: "r-nueva", hole: 1, putts: 2, gir: true, fairway: "hit")],
            clear: []
        )
        park.release()
        await queued.value
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 1)
        XCTAssertFalse(touchedModel)
        XCTAssertFalse(painted)
        XCTAssertEqual(model.user?.id, "demo")
        XCTAssertNotEqual(model.sessionEpoch, identity.session)
        XCTAssertFalse(model.rounds.contains { $0.putts == 4242 })
        XCTAssertEqual(model.notes.extras(for: "r-nueva").first?.putts, 2)

        visit.enter()
        let fresh = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: 1)
        let freshMark = HoleMark(hole: 2, putts: 4, gir: false, drive: "left", rev: 6)
        let again = scheduleMark(queue: queue, model: model, visit: visit, identity: fresh, mark: freshMark, wait: {}) { painted = true }
        await again.value
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 2)
        XCTAssertTrue(painted)
    }

    func testAScheduledLoadDoesNotFetchForTheNextVisit() async throws {
        let model = try makeModel()
        let visit = RoundVisit()
        visit.enter()
        let queue = QuickWorkQueue()
        var loadGen = 1
        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
        var applied = false
        let job = queue.enqueueLoad(
            identity: identity,
            replace: true,
            model: model,
            visit: visit,
            load: { loadGen },
            read: { await model.readHoleMarks(roundId: "r-carga", session: identity.session) },
            apply: { _ in applied = true }
        )
        visit.leave()
        visit.enter()
        loadGen = 2
        queue.dropLoad()
        await job.value
        XCTAssertEqual(MockAPIClient.holeReadEntries, 0)
        XCTAssertFalse(applied)

        let current = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
        let fresh = queue.enqueueLoad(
            identity: current,
            replace: true,
            model: model,
            visit: visit,
            load: { loadGen },
            read: { await model.readHoleMarks(roundId: "r-carga", session: current.session) },
            apply: { _ in applied = true }
        )
        await fresh.value
        XCTAssertEqual(MockAPIClient.holeReadEntries, 1)
        XCTAssertTrue(applied)
    }

    func testAMarkWaitingOnALoadDoesNotPostAfterLeave() async throws {
        let model = try makeModel()
        let visit = RoundVisit()
        visit.enter()
        let queue = QuickWorkQueue()
        let park = Park()
        MockAPIClient.onHoleMarks = { await park.park() }
        var loadGen = 1
        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
        var applied = false
        let load = queue.enqueueLoad(
            identity: identity,
            replace: true,
            model: model,
            visit: visit,
            load: { loadGen },
            read: { await model.readHoleMarks(roundId: "r-espera", session: identity.session) },
            apply: { _ in
                applied = true
                model.writeHoleCache(
                    roundId: "r-espera",
                    session: identity.session,
                    present: [HoleExtra(roundId: "r-espera", hole: 1, putts: 9, gir: true, fairway: "hit")],
                    clear: []
                )
            }
        )
        await until("la lectura no llegó a salir") { park.parked == 1 }
        let mark = HoleMark(hole: 1, putts: 3, gir: true, drive: "fairway", rev: 6)
        var painted = false
        var reachedLoad = false
        let queued = scheduleMark(queue: queue, model: model, visit: visit, identity: identity, mark: mark, wait: {
            reachedLoad = true
            await load.value
        }) { painted = true }
        await until("la marca no llegó a esperar la lectura") { reachedLoad }
        visit.leave()
        visit.enter()
        loadGen = 2
        queue.dropLoad()
        park.release()
        await queued.value
        XCTAssertEqual(MockAPIClient.holeReadEntries, 1)
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 0)
        XCTAssertFalse(applied)
        XCTAssertFalse(painted)
        XCTAssertNil(model.notes.extras(for: "r-espera").first)

        let current = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
        let freshMark = HoleMark(hole: 2, putts: 4, gir: false, drive: "left", rev: 6)
        let again = scheduleMark(queue: queue, model: model, visit: visit, identity: current, mark: freshMark, wait: {}) { painted = true }
        await again.value
        XCTAssertEqual(MockAPIClient.holeMarkEntries, 1)
        XCTAssertTrue(painted)
    }

    private func scheduleMark(
        queue: QuickWorkQueue,
        model: AppModel,
        visit: RoundVisit,
        identity: QuickWorkIdentity,
        mark: HoleMark,
        wait: @escaping @MainActor () async -> Void,
        onModel: @escaping @MainActor () -> Void = {},
        onScreen: @escaping @MainActor () -> Void
    ) -> Task<Void, Never> {
        queue.enqueueMark(identity: identity, model: model, visit: visit, waitForAccount: wait) {
            await QuickDispatch.runMark(
                identity: identity,
                model: model,
                visit: visit,
                send: { await model.sendHoleMark(roundId: "r-cola", session: identity.session, mark: mark) },
                onModel: { _ in onModel() },
                onScreen: { _ in onScreen() },
                onFailure: { _ in }
            )
        }
    }

    private func until(_ label: String, _ ready: () -> Bool) async {
        for _ in 0..<80 {
            if ready() { return }
            try? await Task.sleep(nanoseconds: 15_000_000)
        }
        XCTFail(label)
    }

    private func makeModel() throws -> AppModel {
        MockAPIClient.scriptedRoundNotes = []
        MockAPIClient.scriptedSnapshots = []
        MockAPIClient.scriptedScorecardFetches = []
        MockAPIClient.scriptedNewRounds = nil
        MockAPIClient.onBootstrap = nil
        MockAPIClient.onSaveRoundNotes = nil
        MockAPIClient.onSaveHoleMark = nil
        MockAPIClient.onHoleMarks = nil
        MockAPIClient.noteEntries = 0
        MockAPIClient.holeMarkEntries = 0
        MockAPIClient.holeReadEntries = 0
        MockAPIClient.failNextRoundNote = false
        let container = try ModelContainer(
            for: RoundNote.self, HoleExtra.self, BagClubRecord.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return AppModel(api: MockAPIClient(autoSession: true), notes: NotesStore(container: container))
    }

    private func sample(
        _ id: String,
        putts: Int? = nil,
        gir: Int? = nil,
        fir: Int? = nil,
        notes: String? = nil,
        notesAt: String? = nil,
        gross: Int? = nil,
        course: String = "Fixture"
    ) -> Round {
        var round = Round(
            roundId: id,
            date: Date(timeIntervalSince1970: 1_700_000_000),
            weekday: "",
            tournament: "",
            clubName: "",
            clubCode: "118",
            course: course,
            tee: "",
            courseRating: 72,
            slope: 130,
            handicapIndex: 12,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true
        )
        round.putts = putts
        round.gir = gir
        round.fir = fir
        round.notes = notes
        round.notesAt = notesAt.flatMap(QuickStats.noteDate)
        round.gross = gross
        return round
    }

    private func player(_ id: String) -> GolfletUser {
        GolfletUser(id: id, email: "\(id)@golflet.app", name: "Jugador", firstName: "Jugador")
    }

    private func snapshot(_ rounds: [Round], userID: String) -> AppSnapshot {
        let user = player(userID)
        return AppSnapshot(
            user: user,
            profile: PlayerProfile(displayName: user.name, initials: "JU", currentHandicap: 12, firstName: user.firstName),
            clubs: [],
            rounds: rounds,
            courses: [],
            tees: [],
            holeStats: [],
            bag: [],
            hiHistory: []
        )
    }
}

@MainActor
private final class NoteScreen {
    let model: AppModel
    let visit: RoundVisit
    let roundId: String
    let saver = QuickNoteSaver()
    var fields = QuickNoteFields(text: "", putts: "", gir: "", fir: "", noteAt: "", focus: nil)
    var paints = 0
    var retriggers = 0

    init(model: AppModel, visit: RoundVisit, roundId: String) {
        self.model = model
        self.visit = visit
        self.roundId = roundId
    }

    /// Same callback as the round screen: paint the accepted totals, and if a field
    /// changed, save again. That second save is what `onChange` does.
    func push(delay: UInt64) {
        let session = model.sessionEpoch
        let generation = visit.generation
        saver.schedule(
            model: model,
            roundId: roundId,
            text: fields.text,
            putts: Int(fields.putts),
            gir: Int(fields.gir),
            fir: Int(fields.fir),
            session: session,
            visit: visit,
            generation: generation,
            delayNanoseconds: delay
        ) { note in
            self.paints += 1
            let typed = self.fields.text
            if QuickNoteSurface.absorb(note, into: &self.fields) {
                self.fields.text = typed
                self.retriggers += 1
                self.push(delay: delay)
            } else {
                self.fields.text = typed
            }
        }
    }
}

@MainActor
private final class Park {
    private var waiters: [CheckedContinuation<Void, Never>] = []
    private var open = false
    private(set) var parked = 0

    func park() async {
        if open { return }
        await withCheckedContinuation { (cont: CheckedContinuation<Void, Never>) in
            if self.open {
                cont.resume()
                return
            }
            self.waiters.append(cont)
            self.parked += 1
        }
    }

    func release() {
        open = true
        let held = waiters
        waiters.removeAll()
        held.forEach { $0.resume() }
    }
}
