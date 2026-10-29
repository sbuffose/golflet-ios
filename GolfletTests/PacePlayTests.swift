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
    }

    func testMockSettingsRoundTrip() async throws {
        let api = MockAPIClient()
        let saved = try await api.savePlaySettings(PlaySettings(paceAlertEnabled: false))
        XCTAssertFalse(saved.paceAlertEnabled)
        XCTAssertFalse(try await api.playSettings().paceAlertEnabled)
        let pace = try await api.paceConfig(courseId: "118-jockey-azul", clubCode: "118", players: 4, modality: "medal")
        XCTAssertEqual(pace.minutesPerHole, 12)
    }
}
