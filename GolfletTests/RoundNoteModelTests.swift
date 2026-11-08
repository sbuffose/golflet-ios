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
        super.tearDown()
    }

    func testANewerTotalSurvivesAnOlderResponseAndAReenter() async throws {
        let model = try makeModel()
        model.rounds = [sample("r1", putts: 32, gir: 10, fir: 8), sample("r2", putts: 50, gir: 12, fir: 9)]
        model.presentedRound = model.rounds[0]
        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 7, gir: 1, fir: 1, updatedAt: newerStamp)]
        let accepted = await model.saveRoundNotes(roundId: "r1", putts: 7, gir: 1, fir: 1, text: "nota")
        XCTAssertEqual(accepted?.putts, 7)

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 4, gir: 1, fir: 1, updatedAt: olderStamp)]
        let rejected = await model.saveRoundNotes(roundId: "r1", putts: 4, gir: 1, fir: 1, text: "nota")
        XCTAssertNil(rejected)
        XCTAssertFalse(model.applyStatFields(roundId: "r1", fields: ["putts": 3, "gir": 1, "fir": 1], notesAt: QuickStats.noteDate(olderStamp)))

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
        let accepted = await model.saveRoundNotes(roundId: "r2", putts: 9, gir: 2, fir: 2, text: "otra")
        XCTAssertEqual(accepted?.putts, 9)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.putts, 7)
        XCTAssertEqual(model.rounds.first { $0.roundId == "r1" }?.notes, "nota")
        XCTAssertEqual(model.presentedRound?.putts, 9)

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 1, gir: 0, fir: 0, updatedAt: olderStamp)]
        let rejected = await model.saveRoundNotes(roundId: "r2", putts: 1, gir: 0, fir: 0, text: "otra")
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
        let text = await model.saveRoundNotes(roundId: "r1", putts: nil, gir: nil, fir: nil, text: "solo texto")
        XCTAssertNotNil(text)
        XCTAssertEqual(model.rounds[0].putts, 7)
        XCTAssertEqual(model.rounds[0].gir, 1)
        XCTAssertEqual(model.rounds[0].fir, 1)
        XCTAssertEqual(model.rounds[0].notes, "solo texto")
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(laterStamp))

        MockAPIClient.scriptedRoundNotes = [QuickTotals(putts: 4, gir: 1, fir: 1, updatedAt: newerStamp)]
        let rejected = await model.saveRoundNotes(roundId: "r1", putts: 4, gir: 1, fir: 1, text: "solo texto")
        XCTAssertNil(rejected)
        XCTAssertEqual(model.rounds[0].putts, 7)
        XCTAssertEqual(model.presentedRound?.notesAt, QuickStats.noteDate(laterStamp))

        let zeroAt = QuickStats.noteDate("2026-11-08T04:21:33.168Z")
        XCTAssertTrue(model.applyStatFields(roundId: "r1", fields: ["putts": 0], notesAt: zeroAt))
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
        let accepted = await model.saveRoundNotes(roundId: "r1", putts: 7, gir: 1, fir: 1, text: "nota")
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

    private func makeModel() throws -> AppModel {
        MockAPIClient.scriptedRoundNotes = []
        MockAPIClient.scriptedSnapshots = []
        MockAPIClient.scriptedScorecardFetches = []
        MockAPIClient.scriptedNewRounds = nil
        MockAPIClient.onBootstrap = nil
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
