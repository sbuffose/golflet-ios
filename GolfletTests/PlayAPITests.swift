import XCTest
@testable import Golflet

final class PlayAPITests: XCTestCase {
    func testPlayMathYardsToJockeyGreen() {
        let tee = GPSCoord(lat: -34.485427, lng: -58.532351)
        let center = GPSCoord(lat: -34.48305197, lng: -58.52881)
        let meters = PlayMath.meters(from: tee, to: center)
        XCTAssertGreaterThan(meters, 400)
        XCTAssertLessThan(meters, 450)
        XCTAssertEqual(PlayMath.yards(334), 365)
    }

    func testClubCodeRoundTrip() {
        XCTAssertEqual(ClubCode.code(for: "Hierro 7"), "7i")
        XCTAssertEqual(ClubCode.code(for: "Driver"), "Dr")
        XCTAssertEqual(ClubCode.code(for: "Híbrido"), "Hy")
        XCTAssertEqual(ClubCode.code(for: "Wedge"), "PW")
        XCTAssertEqual(ClubCode.label(for: "7i"), "Hierro 7")
        XCTAssertEqual(ClubCode.label(for: "Pt"), "Putter")
    }

    func testRecapPendingCopy() {
        XCTAssertEqual(RecapCopy.pendingAI, "Audio guardado. La transcripción se hace en la app de iPhone…")
        XCTAssertEqual(RecapCopy.category("estrategia"), "Estrategia / mental")
        XCTAssertEqual(RecapCopy.direction("right"), "Derecha")
        XCTAssertEqual(RecapCopy.length("short"), "Corto")
    }

    func testParsesCourseAndRecap() {
        let course = PlayParser.courseDetail([
            "course": [
                "course_id": "118-jockey-azul",
                "club_code": "118",
                "club_name": "Jockey Club Argentino",
                "course": "Azul",
                "par": 72,
                "hole_count": 1,
                "holes": [[
                    "hole": 1,
                    "par": 5,
                    "hcp": 9,
                    "green": [
                        "front": ["lat": -34.48311941, "lng": -58.52894679],
                        "center": ["lat": -34.48305197, "lng": -58.52881],
                        "back": ["lat": -34.48298896, "lng": -58.52870807]
                    ],
                    "tee": ["lat": -34.485427, "lng": -58.532351]
                ]]
            ]
        ])
        XCTAssertEqual(course?.courseId, "118-jockey-azul")
        XCTAssertEqual(course?.holes.first?.green.center?.lat, -34.48305197)

        let pending = PlayParser.recap([
            "id": "r1",
            "status": "pending_ai",
            "error": RecapCopy.pendingAI,
            "has_audio": true
        ])
        XCTAssertEqual(pending?.status, "pending_ai")
        XCTAssertEqual(pending?.error, RecapCopy.pendingAI)
    }

    func testShotQueuePersistsClientIdAndCaps() {
        ShotQueue.reset()
        defer { ShotQueue.reset() }
        let draft = ShotDraft(
            clientId: "abc-1",
            hole: 1,
            lat: -34.48,
            lng: -58.53,
            accuracyM: 4,
            takenAt: Date(),
            club: "Dr",
            lie: "tee",
            result: nil,
            direction: nil,
            length: nil,
            mishit: false,
            liveRoundId: "live-1"
        )
        ShotQueue.enqueue(draft)
        XCTAssertEqual(ShotQueue.all().first?.clientId, "abc-1")
        XCTAssertEqual(ShotQueue.all().first?.liveRoundId, "live-1")
        ShotQueue.update(clientId: "abc-1") { $0.club = "7i" }
        XCTAssertEqual(ShotQueue.all().first?.club, "7i")
        for index in 0..<210 {
            ShotQueue.enqueue(ShotDraft(
                clientId: "c\(index)",
                hole: 1,
                lat: -34.48,
                lng: -58.53,
                accuracyM: 4,
                takenAt: Date(),
                club: nil,
                lie: nil,
                result: nil,
                direction: nil,
                length: nil,
                mishit: false,
                liveRoundId: "live-1"
            ))
        }
        XCTAssertLessThanOrEqual(ShotQueue.all().count, 200)
    }

    func testMockGPSRoundAndClubStats() async throws {
        let api = MockAPIClient()
        let courses = try await api.gpsCourses(lat: -34.485427, lng: -58.532351)
        XCTAssertEqual(courses.courses.first?.courseId, "118-jockey-azul")
        XCTAssertEqual(courses.nearby.first?.distanceKm, 0.1)

        let detail = try await api.gpsCourse(id: "118-jockey-azul", lat: -34.485427, lng: -58.532351)
        XCTAssertEqual(detail.holes.count, 18)
        XCTAssertNotNil(detail.holes.first?.green.center)

        let live = try await api.createLiveRound(courseId: "118-jockey-azul", tee: "Azul")
        let posted = try await api.postShots(liveRoundId: live.id, drafts: [
            ShotDraft(
                clientId: "q1",
                hole: 1,
                lat: -34.485427,
                lng: -58.532351,
                accuracyM: 4,
                takenAt: Date(),
                club: "Dr",
                lie: "tee",
                result: nil,
                direction: nil,
                length: nil,
                mishit: false,
                liveRoundId: live.id
            )
        ])
        XCTAssertEqual(posted.count, 1)
        XCTAssertEqual(posted.first?.clientId, "q1")

        let again = try await api.postShots(liveRoundId: live.id, drafts: [
            ShotDraft(
                clientId: "q1",
                hole: 1,
                lat: -34.485427,
                lng: -58.532351,
                accuracyM: 4,
                takenAt: Date(),
                club: "Dr",
                lie: "tee",
                result: nil,
                direction: nil,
                length: nil,
                mishit: false,
                liveRoundId: live.id
            )
        ])
        XCTAssertEqual(again.count, 1)

        let stats = try await api.clubStats(code: "7i")
        XCTAssertEqual(stats.club.shots, 22)
        XCTAssertEqual(stats.club.distance?.medianYd, 159)
        XCTAssertEqual(stats.club.direction?.right, 45)
        XCTAssertNotNil(stats.club.tendency)

        let empty = try await api.clubStats(code: "LW")
        XCTAssertEqual(empty.club.shots, 0)

        let recurring = try await api.recurringMistakes()
        XCTAssertEqual(recurring.items.first?.category, "putt")

        let recap = try await api.recap(roundId: "any", liveRoundId: nil)
        XCTAssertEqual(recap?.status, "ready")
        XCTAssertFalse(recap?.mistakes.isEmpty ?? true)

        let draft = RecapDraft(
            transcript: "En el 7 la salida se fue OB.",
            summary: "Salida OB en el 7.",
            mistakes: [RecapMistake(category: "salida", hole: 7, text: "Driver OB")],
            positives: [],
            structuredOnDevice: true
        )
        let typed = try await api.typedRecap(roundId: "r-on-device", liveRoundId: nil, draft: draft)
        XCTAssertEqual(typed.transcript, "En el 7 la salida se fue OB.")
        XCTAssertEqual(typed.mistakes.first?.category, "salida")
        XCTAssertTrue(draft.patchBody["restructure"] == nil)
        XCTAssertEqual(draft.jsonBody["source"] as? String, "ios_on_device")
        XCTAssertEqual(draft.jsonBody["model"] as? String, "apple-speech-es-AR + apple-fm")
        XCTAssertNil(RecapDraft(transcript: "solo texto", structuredOnDevice: false).jsonBody["source"])
        XCTAssertEqual(RecapDraft(transcript: "solo texto", structuredOnDevice: false).patchBody["restructure"] as? Bool, true)
        XCTAssertEqual(typed.source, "ios_on_device")

        XCTAssertEqual(CourseIdentity.key(for: "Azul"), "1:Azul")
        XCTAssertEqual(CourseIdentity.id(for: "Colorada"), "118-jockey-colorada")
        XCTAssertEqual(StrategyLevel.from(handicap: 3.1), .scratch)
        XCTAssertEqual(StrategyLevel.from(handicap: 12), .medio)
        XCTAssertEqual(StrategyLevel.from(handicap: 22), .alto)

        let parsed = PlayParser.strategy([
            "course_id": "118-jockey-azul",
            "course_key": "1:Azul",
            "overview": "Cancha corta y técnica.",
            "published_holes": [7],
            "holes": [[
                "hole": 7,
                "plan_title": "Híbrido al centro y wedge al green",
                "plan_text": "Salida con híbrido.",
                "tee_club": "Híbrido",
                "tee_target": "Centro del fairway",
                "why": "El bunker de la derecha agarra los drives.",
                "miss_side": "izquierda",
                "hazards": [[
                    "id": "h1",
                    "type": "bunker",
                    "type_label": "Bunker",
                    "side": "derecha",
                    "side_label": "Derecha",
                    "from_yd": 293,
                    "carry_yd": 325,
                    "from_m": 268,
                    "carry_m": 297,
                    "note": "Bunker a la derecha."
                ]],
                "variants": ["scratch": ["tee_club": "Madera 3", "plan": "Madera 3 al centro."]]
            ]]
        ])
        XCTAssertEqual(parsed.holes.first?.planTitle, "Híbrido al centro y wedge al green")
        XCTAssertEqual(parsed.holes.first?.hazards.first?.carryYd, 325)
        XCTAssertEqual(parsed.holes.first?.variants[.scratch]?.teeClub, "Madera 3")

        let azul = try await api.courseStrategy(courseKey: "1:Azul", courseId: nil)
        XCTAssertEqual(azul.publishedHoles, [7, 8])
        XCTAssertEqual(azul.hole(7)?.teeClub, "Híbrido")
        XCTAssertEqual(azul.hole(7)?.hazards.count, 3)
        let colorada = try await api.courseStrategy(courseKey: "1:Colorada", courseId: nil)
        XCTAssertTrue(colorada.holes.isEmpty)

        XCTAssertEqual(
            RecapSpeech.pickLocale(from: [
                Locale(identifier: "en-US"),
                Locale(identifier: "es-MX"),
                Locale(identifier: "es-AR")
            ])?.identifier.replacingOccurrences(of: "_", with: "-"),
            "es-AR"
        )
        XCTAssertEqual(
            RecapSpeech.pickLocale(from: [Locale(identifier: "es-ES"), Locale(identifier: "fr-FR")])?.identifier.replacingOccurrences(of: "_", with: "-"),
            "es-ES"
        )

        let metrics = try await api.metricDrilldown(
            metric: "birdies",
            scope: "year",
            year: 2026,
            course: "all",
            sort: "count",
            order: "desc",
            range: "all"
        )
        XCTAssertGreaterThan(metrics?.total ?? 0, 0)
        XCTAssertFalse(metrics?.perHole.isEmpty ?? true)
    }

    func testParsesOptionalGPSCourseDisplayFields() {
        let fresh = PlayParser.courses([
            "courses": [[
                "course_id": "118-jockey-colorada",
                "club_code": "118",
                "club_name": "Jockey Club Argentino",
                "course": "118-jockey-colorada",
                "course_label": "Colorada",
                "club_course_count": 2,
                "display_name": "Jockey Club Argentino · Colorada"
            ]],
            "nearby": []
        ])
        let item = fresh.courses[0]
        XCTAssertEqual(item.courseLabel, "Colorada")
        XCTAssertEqual(item.clubCourseCount, 2)
        XCTAssertEqual(item.displayName, "Jockey Club Argentino · Colorada")
        XCTAssertEqual(CourseDisplay.courseTitle(item), "Colorada")
        XCTAssertEqual(CourseDisplay.clubTitle(item), "Jockey Club Argentino")

        let legacy = PlayParser.courses([
            "courses": [[
                "course_id": "118-jockey-azul",
                "club_code": "118",
                "club_name": "Jockey Club Argentino",
                "course": "Azul",
                "label": "Azul"
            ]]
        ])
        XCTAssertNil(legacy.courses.first?.courseLabel)
        XCTAssertNil(legacy.courses.first?.clubCourseCount)
        XCTAssertNil(legacy.courses.first?.displayName)
        XCTAssertEqual(CourseDisplay.courseTitle(legacy.courses[0]), "Azul")
    }
}
