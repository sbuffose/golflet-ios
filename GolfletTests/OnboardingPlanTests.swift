import XCTest
@testable import Golflet

final class OnboardingPlanTests: XCTestCase {
    func testFullFichaOnlyAsksWhatMatriculaCannotKnow() {
        let facts = OnboardingFacts(
            name: "Ana Pérez",
            handicap: 3.1,
            clubName: "Jockey Club Buenos Aires",
            roundCount: 40,
            firstRound: Date(timeIntervalSince1970: 1_704_067_200),
            roundsPerYear: 20,
            averageGross: 82,
            hasBag: true,
            hasDistances: true
        )
        XCTAssertEqual(OnboardingPlan.asks(for: facts), [.meta, .debil, .modo])
        XCTAssertEqual(facts.cadence, "mes")
        XCTAssertEqual(facts.scoreBand, "80")
        let spoken = OnboardingPlan.revealLines(for: facts).joined(separator: " ")
        XCTAssertTrue(spoken.contains("Ana"))
        XCTAssertTrue(spoken.contains("Jockey Club Buenos Aires"))
        XCTAssertTrue(spoken.contains(FormatAR.one(3.1)))
        XCTAssertTrue(spoken.contains("matrícula"))
        XCTAssertFalse(spoken.contains("¿Cuánto"))
        XCTAssertFalse(spoken.contains("¿Cada cuánto"))
        XCTAssertFalse(spoken.contains("años tenés"))
    }

    func testEmptyFichaAsksScoreAndCadence() {
        let facts = OnboardingFacts(
            name: "",
            handicap: nil,
            clubName: nil,
            roundCount: 0,
            firstRound: nil,
            roundsPerYear: nil,
            averageGross: nil,
            hasBag: false,
            hasDistances: false
        )
        XCTAssertEqual(
            OnboardingPlan.asks(for: facts),
            [.score, .frec, .meta, .debil, .modo, .bag, .iron]
        )
        XCTAssertNil(facts.cadence)
        XCTAssertEqual(OnboardingPlan.revealLines(for: facts).first, "Hola, soy Roberto.")
    }

    func testBagWithoutDistancesStillAsksIron() {
        var facts = sampleFull()
        facts.hasDistances = false
        XCTAssertEqual(OnboardingPlan.asks(for: facts), [.meta, .debil, .modo, .iron])
    }

    func testBuilderReadsRoundsClubAndHandicap() {
        let start = Date(timeIntervalSince1970: 1_704_067_200)
        let rounds = (0..<8).map { index in
            sampleRound(
                id: "r\(index)",
                date: start.addingTimeInterval(Double(index) * 20 * 24 * 3600),
                gross: 80 + index
            )
        }
        let profile = PlayerProfile(displayName: "Ana Pérez", initials: "AP", currentHandicap: 8, firstName: "Ana")
        let club = LinkedClub(
            accountId: "118",
            code: "118",
            name: "Jockey Club Buenos Aires",
            baseURL: URL(string: "https://golf.example")!,
            matricula: "94506",
            isDemo: false
        )
        let facts = OnboardingPlan.make(
            profile: profile,
            clubs: [club],
            rounds: rounds,
            bag: [BagClub(name: "Hierro 7", carry: 140, total: nil)],
            now: start.addingTimeInterval(200 * 24 * 3600)
        )
        XCTAssertEqual(facts.name, "Ana")
        XCTAssertEqual(facts.clubName, "Jockey Club Buenos Aires")
        XCTAssertEqual(facts.handicap ?? 0, 3.1, accuracy: 0.001)
        XCTAssertEqual(facts.roundCount, 8)
        XCTAssertNotNil(facts.cadence)
        XCTAssertNotNil(facts.averageGross)
        XCTAssertTrue(facts.hasBag)
        XCTAssertTrue(facts.hasDistances)
        XCTAssertFalse(OnboardingPlan.asks(for: facts).contains(.score))
        XCTAssertFalse(OnboardingPlan.asks(for: facts).contains(.frec))
        XCTAssertFalse(OnboardingPlan.asks(for: facts).contains(.iron))
    }

    func testUntouchedDefaultBagIsNotPlayerData() {
        let facts = OnboardingPlan.make(
            profile: PlayerProfile(displayName: "Ana", initials: "A", currentHandicap: 12, firstName: "Ana"),
            clubs: [],
            rounds: [],
            bag: DefaultBag.clubs.map { BagClub(name: $0, carry: nil, total: nil) }
        )
        XCTAssertFalse(facts.hasBag)
        XCTAssertFalse(facts.hasDistances)
        let asks = OnboardingPlan.asks(for: facts)
        XCTAssertTrue(asks.contains(.bag))
        XCTAssertTrue(asks.contains(.iron))
    }

    private func sampleFull() -> OnboardingFacts {
        OnboardingFacts(
            name: "Ana Pérez",
            handicap: 3.1,
            clubName: "Jockey Club Buenos Aires",
            roundCount: 40,
            firstRound: Date(timeIntervalSince1970: 1_704_067_200),
            roundsPerYear: 20,
            averageGross: 82,
            hasBag: true,
            hasDistances: true
        )
    }

    private func sampleRound(id: String, date: Date, gross: Int) -> Round {
        Round(
            roundId: id,
            date: date,
            weekday: "Dom",
            tournament: "Test",
            clubName: "Jockey Club Buenos Aires",
            clubCode: "118",
            course: "Azul",
            tee: "Azul",
            category: nil,
            weather: nil,
            courseRating: 70.2,
            slope: 123,
            position: nil,
            fieldSize: nil,
            handicapIndex: 3.1,
            playingHandicap: nil,
            outScore: nil,
            inScore: nil,
            gross: gross,
            net: gross - 2,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 0, pars: 0, bogeys: 0, doubles: 0, triples: 0, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true,
            differential: nil,
            adjustedGross: gross,
            courseHandicap: nil,
            hcpAllowancePct: nil
        )
    }
}
