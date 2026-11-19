import XCTest
@testable import Golflet

final class OnboardingPlanTests: XCTestCase {
    func testSyncWithoutASnapshotStaysOnMatricula() {
        XCTAssertEqual(
            OnboardingPlan.routeAfterSync(signedIn: true, hasSnapshot: false, needsClub: false, authFailed: false),
            .matricula
        )
        XCTAssertEqual(
            OnboardingPlan.routeAfterSync(signedIn: true, hasSnapshot: true, needsClub: true, authFailed: false),
            .matricula
        )
        XCTAssertEqual(
            OnboardingPlan.routeAfterSync(signedIn: false, hasSnapshot: false, needsClub: false, authFailed: true),
            .matricula
        )
        XCTAssertEqual(
            OnboardingPlan.routeAfterSync(signedIn: true, hasSnapshot: true, needsClub: false, authFailed: false),
            .reveal
        )
    }

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
        XCTAssertEqual(
            OnboardingPlan.revealLines(for: facts),
            [
                "Hola, Ana. Soy Roberto.",
                "Te veo en Jockey Club Buenos Aires.",
                "Tu index es \(FormatAR.one(3.1)).",
                "La primera tarjeta es de \(FormatAR.monthYear(facts.firstRound!)).",
                "Salís algunas veces por mes.",
                "Solo me faltan unos datos más"
            ]
        )
        XCTAssertTrue(spoken.contains("Ana"))
        XCTAssertFalse(spoken.contains("Eso no te lo vuelvo a preguntar"))
        XCTAssertFalse(spoken.contains("leí tu ficha"))
        XCTAssertFalse(spoken.contains("matrícula"))
        XCTAssertFalse(spoken.contains("Te pregunto solo lo que la matrícula no sabe."))
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

    func testSyncWaitCopyDoesNotInventFacts() {
        let early = OnboardingSyncCopy.frame(progress: nil)
        XCTAssertEqual(early.phrase, "Estoy entrando a tu club.")
        XCTAssertTrue(early.done.isEmpty)
        XCTAssertFalse(early.phrase.contains(where: \.isNumber))
        XCTAssertLessThan(early.fraction, 0.2)

        let cards = OnboardingSyncCopy.frame(progress: SyncAPIProgress(stage: .cards, done: 4, total: 12))
        XCTAssertEqual(cards.phrase, "Leí 4 de 12.")
        XCTAssertEqual(cards.done, [.login])
        XCTAssertFalse(cards.done.contains(.cards))
        XCTAssertFalse(cards.phrase.localizedCaseInsensitiveContains("hándicap index"))
        XCTAssertGreaterThan(cards.fraction, 0.48)
        XCTAssertLessThan(cards.fraction, 0.78)

        let listing = OnboardingSyncCopy.frame(progress: SyncAPIProgress(stage: .list))
        XCTAssertEqual(listing.phrase, "Busco el listado de tarjetas.")
        XCTAssertEqual(listing.done, [.login])
        XCTAssertFalse(listing.phrase.contains(where: \.isNumber))

        let named = OnboardingSyncCopy.frame(progress: SyncAPIProgress(club: "Jockey", stage: .connect))
        XCTAssertEqual(named.phrase, "Conectando con Jockey.")
        XCTAssertTrue(named.done.isEmpty)

        let placeholder = OnboardingSyncCopy.frame(progress: SyncAPIProgress(club: "Golfistics App", stage: .connect))
        XCTAssertEqual(placeholder.phrase, "Conectando con tu club.")
        XCTAssertFalse(placeholder.phrase.localizedCaseInsensitiveContains("golfistics"))

        let several = OnboardingSyncCopy.frame(progress: SyncAPIProgress(club: "Golfistics App", clubCount: 3, stage: .connect))
        XCTAssertEqual(several.phrase, "Conectando con tus clubes.")

        let handicap = OnboardingSyncCopy.frame(progress: SyncAPIProgress(stage: .handicap, cardsTotal: 12, stats: SyncLiveStats(rounds: 12)))
        XCTAssertEqual(handicap.phrase, "Miro el historial de hándicap.")
        XCTAssertEqual(handicap.done, [.login, .cards])
        XCTAssertFalse(handicap.done.contains(.handicap))

        let done = OnboardingSyncCopy.frame(progress: SyncAPIProgress(stage: .done, cardsTotal: 12))
        XCTAssertEqual(done.phrase, "Listo. Te muestro la ficha.")
        XCTAssertEqual(done.done, [.login, .cards, .handicap])
        XCTAssertEqual(done.fraction, 1)

        let failed = OnboardingSyncCopy.frame(progress: SyncAPIProgress(stage: .cards, done: 1, total: 4), failed: true, message: "El club no respondió.")
        XCTAssertEqual(failed.error, "El club no respondió.")
        XCTAssertEqual(failed.phrase, "Leí 1 de 4.")

        let emptyPlan = OnboardingPlanCards.items(facts: nil, groupCount: 0)
        XCTAssertEqual(emptyPlan.map(\.figure), ["–", "–", "–"])
        XCTAssertEqual(emptyPlan[0].detail, "Cuando llegue el índice, vemos dónde se te escapan los golpes.")
        XCTAssertEqual(emptyPlan[1].detail, "Cuando tengamos el club, miramos lo que más te cuesta.")
        XCTAssertEqual(emptyPlan[2].detail, "Cuando haya un grupo, salís juntos.")
        let filled = OnboardingPlanCards.items(facts: sampleFull(), groupCount: 2)
        XCTAssertEqual(filled[0].figure, "3,1")
        XCTAssertEqual(filled[0].detail, "Desde este número vemos dónde se te escapan los golpes.")
        XCTAssertEqual(filled[1].figure, "Jockey Club Buenos Aires")
        XCTAssertEqual(filled[1].detail, "Ahí miramos lo que más te cuesta esta semana.")
        XCTAssertEqual(filled[2].figure, "2")
        XCTAssertEqual(filled[2].detail, "2 grupos para salir juntos.")

        XCTAssertEqual(
            OnboardingPlan.routeAfterSync(signedIn: true, hasSnapshot: true, needsClub: false, authFailed: false),
            .reveal
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
