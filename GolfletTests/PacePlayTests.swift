import XCTest
@testable import Golflet

final class PacePlayTests: XCTestCase {
    override func tearDown() {
        PlaySettingsStore.reset()
        PaceSessionStore.reset()
        MockAPIClient.resetPlaySettings()
        super.tearDown()
    }

    func testAlertsOnlyOnHole10WhenMoreThanTenMinutesBehind() {
        let start = Date(timeIntervalSince1970: 1_000_000)
        let late = start.addingTimeInterval((9 * 12 + 11) * 60)
        XCTAssertTrue(PaceEngine.shouldAlert(
            hole: 10,
            startedAt: start,
            now: late,
            minutesPerHole: 12,
            alertEnabled: true,
            alreadyAlerted: false
        ))
        XCTAssertFalse(PaceEngine.shouldAlert(
            hole: 9,
            startedAt: start,
            now: late,
            minutesPerHole: 12,
            alertEnabled: true,
            alreadyAlerted: false
        ))
        XCTAssertFalse(PaceEngine.shouldAlert(
            hole: 11,
            startedAt: start,
            now: late,
            minutesPerHole: 12,
            alertEnabled: true,
            alreadyAlerted: false
        ))
        let onPace = start.addingTimeInterval((9 * 12 + 9) * 60)
        XCTAssertFalse(PaceEngine.shouldAlert(
            hole: 10,
            startedAt: start,
            now: onPace,
            minutesPerHole: 12,
            alertEnabled: true,
            alreadyAlerted: false
        ))
        XCTAssertFalse(PaceEngine.shouldAlert(
            hole: 10,
            startedAt: start,
            now: late,
            minutesPerHole: 12,
            alertEnabled: false,
            alreadyAlerted: false
        ))
        XCTAssertFalse(PaceEngine.shouldAlert(
            hole: 10,
            startedAt: start,
            now: late,
            minutesPerHole: 12,
            alertEnabled: true,
            alreadyAlerted: true
        ))
    }

    func testExpectedAndElapsedPerHole() {
        XCTAssertEqual(PaceEngine.expectedMinutes(holesReached: 10, minutesPerHole: 12), 108)
        XCTAssertEqual(PaceEngine.expectedMinutes(holesReached: 1, minutesPerHole: 12), 0)
        XCTAssertEqual(PaceEngine.durationLabel(11), "11 min")
        XCTAssertEqual(PaceEngine.durationLabel(108), "1 h 48 min")
        var session = PaceSession(
            roundId: "r1",
            startedAt: Date(timeIntervalSince1970: 0),
            holeEnteredAt: [1: Date(timeIntervalSince1970: 0)],
            alertedHole10: false
        )
        session.enter(hole: 2, at: Date(timeIntervalSince1970: 15 * 60))
        XCTAssertEqual(session.elapsedOnHole(1, now: Date(timeIntervalSince1970: 20 * 60)), 15 * 60, accuracy: 0.01)
    }

    func testParsesPaceAndSettingsFromAPIShapes() {
        let settings = PaceParser.settings(from: [
            "settings": ["pace_alert_enabled": false]
        ])
        XCTAssertFalse(settings.paceAlertEnabled)
        let alerts = PaceParser.settings(from: [
            "alerts": ["pace": true]
        ])
        XCTAssertTrue(alerts.paceAlertEnabled)
        let fourBall = PaceParser.pace(from: [
            "by_players": ["4": 15],
            "by_modality": ["medal": 13]
        ], players: 4)
        XCTAssertEqual(fourBall.minutesPerHole, 15)
        XCTAssertEqual(fourBall.source, "api")
        let fallback = PaceParser.pace(from: [:])
        XCTAssertEqual(fallback.minutesPerHole, 12)
        XCTAssertEqual(fallback.source, "fallback")
        XCTAssertEqual(PaceParser.minutesPerHole(from: ["pace": ["minutes_per_hole": 14]]), 14)

        let official = PaceParser.pace(from: [
            "estimate": 216,
            "source": "club",
            "scope": "course",
            "min_per_hole": 13,
            "total_min": 234,
            "par_weighted": true,
            "timeline": [
                ["hole": 1, "par": 5, "minutes": 14, "expected_end_min": 14],
                ["hole": 2, "par": 4, "minutes": 12, "expected_end_min": 26]
            ]
        ])
        XCTAssertEqual(official.minutesPerHole, 13)
        XCTAssertEqual(official.source, "club")
        XCTAssertEqual(official.scope, "course")
        XCTAssertEqual(official.estimate, 216)
        XCTAssertEqual(official.totalMin, 234)
        XCTAssertTrue(official.parWeighted)
        XCTAssertEqual(official.timeline.count, 2)
        XCTAssertEqual(official.timeline[0].expectedEndMin, 14)

        let settingsAlert = PaceParser.settings(from: ["pace_alert": false])
        XCTAssertFalse(settingsAlert.paceAlertEnabled)

        let parsedRound = PlayParser.liveRound([
            "id": "lr1",
            "course_id": "118-jockey-azul",
            "date": "2026-10-29",
            "current_hole": 3,
            "players": 2,
            "modality": "fourball",
            "shots": 4
        ])
        XCTAssertEqual(parsedRound?.players, 2)
        XCTAssertEqual(parsedRound?.modality, "fourball")
        let defaultRound = PlayParser.liveRound(["id": "lr2", "date": "2026-10-29"])
        XCTAssertEqual(defaultRound?.players, 4)
        XCTAssertEqual(defaultRound?.modality, "medal")

        let live = PaceParser.livePace(from: [
            "expected_min": 108,
            "elapsed_min": 125,
            "behind_min": 17,
            "alert_due": true,
            "alert_text": "Vas atrasado",
            "alert_hole": 10,
            "threshold_min": 10,
            "enabled": true
        ])
        XCTAssertEqual(live.expectedMin, 108)
        XCTAssertEqual(live.elapsedMin, 125)
        XCTAssertEqual(live.behindMin, 17)
        XCTAssertTrue(live.alertDue)
        XCTAssertEqual(live.alertText, "Vas atrasado")
        XCTAssertEqual(live.alertHole, 10)
        XCTAssertEqual(live.thresholdMin, 10)
        XCTAssertTrue(live.enabled)
    }

    func testMockLiveRoundPaceAlertsOnceOnHole10() async throws {
        let api = MockAPIClient()
        let live = try await api.createLiveRound(
            courseId: "118-jockey-azul",
            tee: "Azul",
            players: 2,
            modality: "fourball"
        )
        XCTAssertEqual(live.players, 2)
        XCTAssertEqual(live.modality, "fourball")

        var pace = try await api.liveRoundPace(id: live.id)
        XCTAssertFalse(pace.alertDue)
        XCTAssertEqual(pace.alertHole, 10)
        XCTAssertEqual(pace.thresholdMin, 10)

        let patched = try await api.patchLiveRound(id: live.id, body: [
            "current_hole": 10,
            "players": 3,
            "modality": "match"
        ])
        XCTAssertEqual(patched.currentHole, 10)
        XCTAssertEqual(patched.players, 3)
        XCTAssertEqual(patched.modality, "match")

        pace = try await api.liveRoundPace(id: live.id)
        XCTAssertFalse(pace.alertDue)

        api.ageLiveRound(id: live.id, by: 3 * 3600)
        pace = try await api.liveRoundPace(id: live.id)
        XCTAssertTrue(pace.alertDue)
        XCTAssertFalse((pace.alertText ?? "").isEmpty)

        try await api.markPaceAlerted(id: live.id)
        pace = try await api.liveRoundPace(id: live.id)
        XCTAssertFalse(pace.alertDue)

        let estimate = try await api.paceConfig(
            courseId: "118-jockey-azul",
            clubCode: "118",
            players: 2,
            modality: "fourball"
        )
        XCTAssertEqual(estimate.source, "api")
        XCTAssertEqual(estimate.minutesPerHole, 12)
        XCTAssertEqual(estimate.timeline.count, 18)
        XCTAssertEqual(estimate.scope, "course")
        XCTAssertTrue(estimate.parWeighted)
    }

    func testMockSettingsRoundTrip() async throws {
        let api = MockAPIClient()
        let saved = try await api.savePlaySettings(PlaySettings(paceAlertEnabled: false))
        XCTAssertFalse(saved.paceAlertEnabled)
        let loaded = try await api.playSettings()
        XCTAssertFalse(loaded.paceAlertEnabled)
        let pace = try await api.paceConfig(courseId: "118-jockey-azul", clubCode: "118", players: 4, modality: "medal")
        XCTAssertEqual(pace.minutesPerHole, 12)
        XCTAssertEqual(pace.source, "api")
        XCTAssertEqual(pace.timeline.count, 18)
    }
}
