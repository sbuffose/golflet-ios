import SwiftUI
import XCTest
@testable import Golflet

final class TextPrefsTests: XCTestCase {
    override func setUp() {
        super.setUp()
        UserDefaults.standard.removeObject(forKey: TextPrefsStore.key)
        MockAPIClient.resetTextPrefs()
        TextPrefsRuntime.current = .default
        TextPrefsRuntime.dynamicMultiplier = 1
    }

    func testUserScaleIs100115130() {
        XCTAssertEqual(TextSizePref.normal.multiplier, 1.00, accuracy: 0.001)
        XCTAssertEqual(TextSizePref.large.multiplier, 1.15, accuracy: 0.001)
        XCTAssertEqual(TextSizePref.extraLarge.multiplier, 1.30, accuracy: 0.001)
        XCTAssertEqual(TextPrefs(size: .large).scaledSize(16), 18.4, accuracy: 0.05)
        XCTAssertEqual(TextPrefs(size: .extraLarge).scaledSize(16), 20.8, accuracy: 0.05)
    }

    func testHeroScalesLessThanBody() {
        let prefs = TextPrefs(size: .extraLarge)
        let body = prefs.scaledSize(16, role: .body) / 16
        let hero = prefs.scaledSize(80, role: .hero) / 80
        XCTAssertGreaterThan(body, hero)
        XCTAssertEqual(hero, 1 + 0.30 * 0.40, accuracy: 0.02)
        XCTAssertLessThan(prefs.scaledSize(80), 96)
    }

    func testMarkedWeightBumpsRegularAndMedium() {
        let marked = TextPrefs(size: .normal, weight: .marked)
        XCTAssertEqual(GFont.resolvedWeight(.regular, prefs: marked), .medium)
        XCTAssertEqual(GFont.resolvedWeight(.medium, prefs: marked), .semibold)
        XCTAssertEqual(GFont.resolvedWeight(.semibold, prefs: marked), .semibold)
        XCTAssertEqual(GFont.resolvedWeight(.regular, prefs: .default), .regular)
        XCTAssertEqual(GFont.postScript(.medium), "Geist-Medium")
        XCTAssertEqual(GFont.postScript(.semibold), "Geist-SemiBold")
    }

    func testParsesFlexibleWebKeys() {
        let json: [String: Any] = [
            "settings": [
                "text_size": "muy_grande",
                "font_weight": "más_marcado"
            ]
        ]
        let prefs = TextPrefsParser.prefs(from: json)
        XCTAssertEqual(prefs?.size, .extraLarge)
        XCTAssertEqual(prefs?.weight, .marked)

        let numeric = TextPrefsParser.prefs(from: ["textSize": 115, "textWeight": true])
        XCTAssertEqual(numeric?.size, .large)
        XCTAssertEqual(numeric?.weight, .marked)

        XCTAssertEqual(TextPrefsParser.jsonBody(.default)["text_size"] as? String, "normal")
        XCTAssertEqual(TextPrefsParser.listPath, "/api/me/settings")
    }

    func testPersistsLocally() {
        let defaults = UserDefaults(suiteName: "golflet.text-prefs-test")!
        defaults.removePersistentDomain(forName: "golflet.text-prefs-test")
        let prefs = TextPrefs(size: .large, weight: .marked)
        TextPrefsStore.save(prefs, defaults: defaults)
        XCTAssertEqual(TextPrefsStore.load(defaults: defaults), prefs)
    }

    func testClampsDynamicType() {
        XCTAssertEqual(TextPrefs.clampedDynamic(.large), 1.00, accuracy: 0.001)
        XCTAssertEqual(TextPrefs.clampedDynamic(.xxxLarge), 1.14, accuracy: 0.001)
        XCTAssertEqual(TextPrefs.clampedDynamic(.accessibility3), 1.16, accuracy: 0.001)
    }

    func testClampsCombinedScale() {
        let huge = TextPrefs(size: .extraLarge).scaledSize(16, dynamic: 2.0, role: .body)
        XCTAssertEqual(huge, 16 * TextPrefs.maxCombined, accuracy: 0.2)
        let tiny = TextPrefs(size: .normal).scaledSize(16, dynamic: 0.5, role: .body)
        XCTAssertEqual(tiny, 16 * TextPrefs.minCombined, accuracy: 0.2)
    }

    func testMockSettingsRoundTrip() async throws {
        let api = MockAPIClient(autoSession: true)
        var prefs = try await api.userSettings()
        XCTAssertEqual(prefs, .default)
        prefs.size = .extraLarge
        prefs.weight = .marked
        let saved = try await api.saveUserSettings(prefs)
        XCTAssertEqual(saved.size, .extraLarge)
        XCTAssertEqual(try await api.userSettings().weight, .marked)
    }
}
