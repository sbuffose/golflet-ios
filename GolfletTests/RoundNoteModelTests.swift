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

    private func makeModel() throws -> AppModel {
        let container = try ModelContainer(
            for: RoundNote.self, HoleExtra.self, BagClubRecord.self,
            configurations: ModelConfiguration(isStoredInMemoryOnly: true)
        )
        return AppModel(api: MockAPIClient(autoSession: true), notes: NotesStore(container: container))
    }

    private func sample(_ id: String, putts: Int, gir: Int, fir: Int, notes: String? = nil) -> Round {
        var round = Round(
            roundId: id,
            date: Date(timeIntervalSince1970: 1_700_000_000),
            weekday: "",
            tournament: "",
            clubName: "",
            clubCode: "118",
            course: "Fixture",
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
        return round
    }
}
