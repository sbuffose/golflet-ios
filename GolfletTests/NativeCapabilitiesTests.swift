import XCTest
@testable import Golflet

final class NativeCapabilitiesTests: XCTestCase {
    override func tearDown() {
        ShotQueue.reset()
        RecapQueue.reset()
        CourseCache.reset()
        OfflinePlay.reset()
        PlaySettingsStore.reset()
        PaceSessionStore.reset()
        UserDefaults.standard.removeObject(forKey: WidgetSnapshotStore.key)
        PendingInviteStore.clear()
        super.tearDown()
    }

    func testLiveRoundStateDistancesAndScore() {
        let tee = GPSCoord(lat: -34.485427, lng: -58.532351)
        let center = GPSCoord(lat: -34.48305197, lng: -58.52881)
        let course = GPSCourseDetail(
            courseId: "118-jockey-azul",
            clubCode: "118",
            clubName: "Jockey Club Argentino",
            course: "Azul",
            courseKey: "1:Azul",
            par: 72,
            holeCount: 1,
            holes: [
                GPSHole(
                    number: 1,
                    par: 5,
                    hcp: 9,
                    yards: [:],
                    green: GPSGreen(front: center, center: center, back: center),
                    tee: tee
                )
            ],
            warnings: [],
            attribution: nil
        )
        let shots = [
            Shot(id: "1", clientId: "c1", hole: 1, shotNumber: 1, lat: tee.lat, lng: tee.lng, accuracyM: 4, takenAt: Date(), club: "Dr", lie: "tee", result: nil, direction: nil, length: nil, mishit: false, distanceM: nil, distanceYd: nil, toGreenYd: nil)
        ]
        let state = LiveRoundState.make(course: course, hole: 1, here: tee, shots: shots)
        XCTAssertEqual(state.hole, 1)
        XCTAssertEqual(state.par, 5)
        XCTAssertEqual(state.strokes, 1)
        XCTAssertEqual(state.toPar, 1 - 5)
        XCTAssertNotNil(state.centerYd)
        XCTAssertEqual(state.holeLine, "Hoyo 1 · Par 5")
        let far = LiveRoundState.make(
            course: course,
            hole: 1,
            here: GPSCoord(lat: -34.6037, lng: -58.3816),
            shots: shots
        )
        XCTAssertNil(far.centerYd)
        XCTAssertNil(far.frontYd)
        XCTAssertNil(far.backYd)
    }

    func testWidgetSnapshotHidesMissingNextRound() {
        let last = Round(
            roundId: "r1",
            date: Date(),
            weekday: "sáb",
            tournament: "",
            clubName: "Jockey",
            clubCode: "118",
            course: "Colorada",
            tee: "Azul",
            category: nil,
            weather: nil,
            courseRating: 72,
            slope: 130,
            position: nil,
            fieldSize: nil,
            handicapIndex: 3.1,
            playingHandicap: 3,
            outScore: 39,
            inScore: 40,
            gross: 79,
            net: 76,
            cardStatus: "OK",
            counts: ScoreCounts(birdies: 1, pars: 10, bogeys: 6, doubles: 1, triples: 0, worse: 0),
            holes: [],
            holesPlayed: 18,
            isNineHoles: false,
            isValid: true
        )
        let home = HomeSnapshot(
            handicapIndex: 3.1,
            trendValues: [],
            trendDelta: 0,
            trendSinceLabel: "",
            cards: 1,
            bestGross: 71,
            yearAverage: 79,
            yearRoundCount: 1,
            yearBestGross: 71,
            yearBirdies: 1,
            lastRound: last
        )
        let snap = WidgetSnapshot.make(home: home)
        XCTAssertEqual(snap.handicapLine, FormatAR.one(3.1))
        XCTAssertEqual(snap.lastGross, 79)
        XCTAssertEqual(snap.lastNet, 76)
        XCTAssertEqual(snap.lastCourse, "Colorada")
        XCTAssertNil(snap.nextCourse)
        XCTAssertEqual(snap.lastRoundURL, URL(string: "golflet://round/r1"))
        WidgetSnapshotStore.save(snap)
        XCTAssertEqual(WidgetSnapshotStore.load()?.lastRoundId, "r1")

        let withNext = WidgetSnapshot.make(
            home: home,
            next: NextRoundHint(course: "Azul", when: "Sábado 8:00", deepLink: "golflet://play?course=Azul")
        )
        XCTAssertEqual(withNext.nextCourse, "Azul")
        XCTAssertEqual(withNext.nextRoundURL?.host, "play")
    }

    func testHoleAdvanceAsksWhenNearNextTee() {
        let tee1 = GPSCoord(lat: -34.485427, lng: -58.532351)
        let tee2 = GPSCoord(lat: -34.485427 + 0.00055, lng: -58.532351 + 0.00042)
        XCTAssertTrue(HoleAdvance.shouldOffer(
            now: Date(),
            lastManual: .distantPast,
            currentHole: 1,
            shotHoles: [1],
            here: tee2,
            nextTee: tee2
        ))
        XCTAssertFalse(HoleAdvance.shouldOffer(
            lastManual: .distantPast,
            currentHole: 1,
            shotHoles: [],
            here: tee2,
            nextTee: tee2
        ))
        XCTAssertFalse(HoleAdvance.shouldOffer(
            lastManual: .distantPast,
            currentHole: 1,
            shotHoles: [1],
            here: tee1,
            nextTee: tee2
        ))
        XCTAssertEqual(HoleAdvance.nextHole(after: 18, holeCount: 18), nil)
        XCTAssertEqual(HoleAdvance.nextHole(after: 1, holeCount: 18), 2)
    }

    func testCourseCacheRoundTripAndOfflineRound() async throws {
        let api = MockAPIClient()
        let detail = try await api.gpsCourse(id: "118-jockey-azul", lat: nil, lng: nil)
        let strategy = try await api.courseStrategy(courseKey: detail.courseKey, courseId: detail.courseId)
        CourseCache.save(detail: detail, strategy: strategy)
        let cached = CourseCache.load(courseId: detail.courseId)
        XCTAssertEqual(cached?.detail.holes.count, 18)
        XCTAssertEqual(cached?.detail.holes.first?.green.center?.lat, detail.holes.first?.green.center?.lat)
        XCTAssertEqual(cached?.strategy?.courseId, strategy.courseId)

        let list = try await api.gpsCourses(lat: nil, lng: nil)
        CourseCache.saveList(list)
        XCTAssertEqual(CourseCache.loadList()?.courses.first?.courseId, "118-jockey-azul")

        let local = OfflinePlay.begin(course: detail, tee: "Azul", players: 2, modality: "match")
        XCTAssertTrue(OfflinePlay.isLocal(local.id))
        XCTAssertEqual(OfflinePlay.lookup(local.id)?.courseId, "118-jockey-azul")
        XCTAssertEqual(OfflinePlay.lookup(local.id)?.players, 2)
        XCTAssertEqual(OfflinePlay.lookup(local.id)?.modality, "match")
        XCTAssertEqual(local.players, 2)
        XCTAssertEqual(local.modality, "match")
        let remapped = OfflinePlay.remap([
            ShotDraft(clientId: "c1", hole: 1, lat: 1, lng: 2, accuracyM: 4, takenAt: Date(), club: "7i", lie: "tee", result: nil, direction: nil, length: nil, mishit: false, liveRoundId: local.id)
        ], to: "live-real")
        XCTAssertEqual(remapped.first?.liveRoundId, "live-real")
    }

    func testShotAndRecapQueuesKeepClientId() {
        RecapQueue.enqueue(RecapQueued(
            clientId: "rec-1",
            roundId: nil,
            liveRoundId: "live-1",
            transcript: "79, bien",
            summary: "Sólida",
            source: "ios_on_device",
            model: "apple-speech-es-AR",
            durationS: 12,
            audio: Data(repeating: 3, count: 80)
        ))
        XCTAssertEqual(RecapQueue.all().first?.clientId, "rec-1")
        XCTAssertEqual(RecapQueue.all().first?.source, "ios_on_device")
        RecapQueue.remove(clientIds: ["rec-1"])
        XCTAssertTrue(RecapQueue.all().isEmpty)

        OfflinePlay.saveActive(roundId: "live-1", courseId: "118-jockey-azul", hole: 7, courseName: "Azul")
        OfflinePlay.saveLastGPS(GPSCoord(lat: -34.48, lng: -58.53), accuracy: 5)
        XCTAssertTrue(ActivePlayIntents.enqueueShot(club: "7i"))
        XCTAssertEqual(ShotQueue.all().first?.club, "7i")
        XCTAssertEqual(ShotQueue.all().first?.liveRoundId, "live-1")
        XCTAssertEqual(ShotQueue.all().first?.hole, 7)
    }

    func testIntentsAndDeepLinks() {
        XCTAssertEqual(ClubPhrase.code(for: "Hierro 7"), "7i")
        XCTAssertTrue(ClubPhrase.matchesCourse("Jockey", name: "Azul", club: "Jockey Club Argentino", courseId: "118-jockey-azul"))
        XCTAssertFalse(ClubPhrase.matchesCourse("Pinamar", name: "Azul", club: "Jockey", courseId: "118-jockey-azul"))

        XCTAssertEqual(GolfletURL.parse(URL(string: "golflet://play?course=Jockey")!), .startRound(hint: "Jockey"))
        XCTAssertEqual(GolfletURL.parse(URL(string: "golflet://recap")!), .recordRecap)
        XCTAssertEqual(GolfletURL.parse(URL(string: "golflet://round/r88")!), .openRound(id: "r88"))
        XCTAssertEqual(GolfletURL.parse(URL(string: "golflet://shot?club=7i")!), .recordShot(club: "7i"))
        XCTAssertEqual(GolfletURL.parse(URL(string: "https://golflet.vercel.app/g/invite-mdp")!), .openInvite(token: "invite-mdp"))
        XCTAssertEqual(GolfletURL.parse(URL(string: "golflet://g/invite-mdp")!), .openInvite(token: "invite-mdp"))
        XCTAssertEqual(GolfletClubChoice.hierro7.code, "7i")

        XCTAssertEqual(
            GolfletURL.parse(URL(string: "https://golflet.vercel.app/g/invite-mdp")!),
            .openInvite(token: "invite-mdp")
        )
        XCTAssertEqual(
            GolfletURL.parse(URL(string: "https://www.golflet.vercel.app/g/abc-123")!),
            .openInvite(token: "abc-123")
        )
        XCTAssertEqual(
            GolfletURL.parse(URL(string: "golflet://g/invite-mdp")!),
            .openInvite(token: "invite-mdp")
        )
        XCTAssertEqual(GolfletURL.inviteURL(token: "invite-mdp").absoluteString, "https://golflet.vercel.app/g/invite-mdp")
        XCTAssertEqual(AssociatedDomains.applinks, "applinks:golflet.vercel.app")
        XCTAssertNil(GolfletURL.inviteToken(from: URL(string: "https://example.com/g/nope")!))

        PendingInviteStore.clear()
        PendingInviteStore.save("invite-mdp")
        XCTAssertEqual(PendingInviteStore.load(), "invite-mdp")
        PendingInviteStore.clear()
        XCTAssertNil(PendingInviteStore.load())
    }

    func testCourseEntityQueryUsesPlayerCatalog() async throws {
        let extras = (1...12).map { index in
            GPSCourseSummary(
                courseId: "club-\(index)-cancha",
                clubCode: "\(100 + index)",
                clubName: "Club \(index)",
                course: "Cancha \(index)",
                label: "Cancha \(index)",
                courseKey: "\(index):Cancha",
                holesCached: 18,
                mine: true,
                distanceKm: nil
            )
        }
        let jockey = GPSCourseSummary(
            courseId: "118-jockey-azul",
            clubCode: "118",
            clubName: "Jockey Club Argentino",
            course: "Azul",
            label: "Azul",
            courseKey: "1:Azul",
            holesCached: 18,
            mine: true,
            distanceKm: nil
        )
        CourseCache.saveList(GPSCourseList(courses: extras + [jockey], nearby: [jockey]))
        let merged = CourseCatalog.merge(CourseCache.loadList())
        XCTAssertEqual(merged.count, 13)
        XCTAssertEqual(Set(merged.map(\.courseId)).count, 13)

        let entities = extras.map(GolfletCourseEntity.init(summary:)) + [GolfletCourseEntity(summary: jockey)]
        let hits = CourseCatalog.matching("Jockey", in: entities)
        XCTAssertEqual(hits.map(\.id), ["118-jockey-azul"])
        XCTAssertTrue(CourseCatalog.matching("Cancha 12", in: entities).contains(where: { $0.id == "club-12-cancha" }))

        CourseCatalog.sourceOverride = { CourseCatalog.merge(CourseCache.loadList()) }
        defer { CourseCatalog.sourceOverride = nil }
        let query = GolfletCourseEntityQuery()
        let suggested = try await query.suggestedEntities()
        XCTAssertEqual(suggested.count, 13)
        let found = try await query.entities(matching: "Jockey")
        XCTAssertEqual(found.map(\.id), ["118-jockey-azul"])
        let byID = try await query.entities(for: ["club-3-cancha", "118-jockey-azul"])
        XCTAssertEqual(Set(byID.map(\.id)), ["club-3-cancha", "118-jockey-azul"])
    }

    func testRecapStaysOnDeviceCopy() {
        XCTAssertTrue(RecapCopy.pendingAI.contains("iPhone"))
        XCTAssertEqual(RecapDraft(transcript: "x", structuredOnDevice: true).source, "ios_on_device")
    }

    func testCourseGroupsUseHumanNamesAndClubFallback() {
        let azul = GPSCourseSummary(
            courseId: "118-jockey-azul",
            clubCode: "118",
            clubName: "Jockey Club Argentino",
            course: "Azul",
            label: "Azul",
            courseKey: "1:Azul",
            holesCached: 18,
            mine: true,
            distanceKm: 0.1,
            courseLabel: "Azul",
            clubCourseCount: 2,
            displayName: "Jockey Club Argentino · Azul"
        )
        let colorada = GPSCourseSummary(
            courseId: "118-jockey-colorada",
            clubCode: "118",
            clubName: "Jockey Club Argentino",
            course: "118-jockey-colorada",
            label: "118-jockey-colorada",
            courseKey: "1:Colorada",
            holesCached: 18,
            mine: true,
            distanceKm: 0.4,
            courseLabel: "Colorada",
            clubCourseCount: 2,
            displayName: "Jockey Club Argentino · Colorada"
        )
        let club902 = GPSCourseSummary(
            courseId: "902-unknown",
            clubCode: "902",
            clubName: "",
            course: "902-unknown",
            label: "902-unknown",
            courseKey: "",
            holesCached: 0,
            mine: true,
            distanceKm: 12
        )
        XCTAssertEqual(CourseDisplay.courseTitle(colorada), "Colorada")
        XCTAssertEqual(CourseDisplay.clubTitle(club902), "Club 902")
        XCTAssertEqual(CourseDisplay.courseTitle(club902), "Club 902")
        XCTAssertFalse(CourseDisplay.fullName(colorada).contains("118-jockey"))
        XCTAssertFalse(CourseDisplay.courseTitle(club902).contains("902-unknown"))

        let groups = CourseGroups.make([azul, colorada, club902])
        XCTAssertEqual(groups.map(\.clubName), ["Jockey Club Argentino", "Club 902"])
        XCTAssertEqual(groups.first?.courses.map(CourseDisplay.courseTitle), ["Azul", "Colorada"])
        XCTAssertEqual(groups.first?.distanceKm, 0.1)
        XCTAssertTrue(groups.last?.isSingle == true)
        XCTAssertEqual(groups.last?.courses.first?.courseId, "902-unknown")

        let stats = CourseGroups.make(from: [
            Course(clubCode: "118", clubName: "Jockey Club Buenos Aires", name: "Colorada", holes: []),
            Course(clubCode: "118", clubName: "Jockey Club Buenos Aires", name: "Azul", holes: []),
            Course(clubCode: "209", clubName: "Mar del Plata Golf Club", name: "Cancha Vieja", holes: []),
            Course(clubCode: "209", clubName: "Mar del Plata Golf Club", name: "Cancha Nueva", holes: [])
        ])
        XCTAssertEqual(stats.map(\.clubName), ["Jockey Club Buenos Aires", "Mar del Plata Golf Club"])
        XCTAssertEqual(stats.first?.courses.map(\.name), ["Azul", "Colorada"])
        XCTAssertEqual(stats.last?.courses.map(\.name), ["Cancha Nueva", "Cancha Vieja"])
    }

    func testAppGroupStaysDisabledUntilPortalGroupExists() {
        XCTAssertFalse(AppGroupAvailability.isEnabled)
        XCTAssertEqual(AppGroupAvailability.identifier, "group.com.sbuffose.golflet")
        XCTAssertNil(AppGroupAvailability.sharedDefaults)
        XCTAssertTrue(WidgetSnapshotStore.defaults === UserDefaults.standard)
    }

    func testWidgetSnapshotParsesAPIPayloadWithoutSharedContainer() throws {
        let json = """
        {
          "player": { "handicap_index": 3.1 },
          "rounds": [
            {
              "round_id": "r1",
              "course": "Colorada",
              "gross": 79,
              "net": 76,
              "date": "2026-10-12"
            }
          ]
        }
        """.data(using: .utf8)!
        let snap = try XCTUnwrap(WidgetSnapshot.parseAPI(json))
        XCTAssertEqual(snap.handicapLine, FormatAR.one(3.1))
        XCTAssertEqual(snap.lastGross, 79)
        XCTAssertEqual(snap.lastNet, 76)
        XCTAssertEqual(snap.lastCourse, "Colorada")
        XCTAssertEqual(snap.lastRoundId, "r1")
        XCTAssertEqual(snap.lastRoundURL, URL(string: "golflet://round/r1"))
        XCTAssertFalse(snap.isPlaceholder)
        XCTAssertTrue(WidgetSnapshot.placeholder.isPlaceholder)
    }
}
