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
        XCTAssertEqual(hero, 1.12, accuracy: 0.02)
        XCTAssertLessThan(prefs.scaledSize(80), 96)
    }

    func testLargeTextUsesDampedScale() {
        let grande = TextPrefs(size: .large)
        let muy = TextPrefs(size: .extraLarge)
        XCTAssertEqual(grande.sizeMultiplier(base: 16), 1.15, accuracy: 0.001)
        XCTAssertEqual(muy.sizeMultiplier(base: 16), 1.30, accuracy: 0.001)
        XCTAssertEqual(grande.sizeMultiplier(base: 26), 1.06, accuracy: 0.001)
        XCTAssertEqual(muy.sizeMultiplier(base: 26), 1.12, accuracy: 0.001)
        XCTAssertEqual(grande.scaledSize(32), 33.9, accuracy: 0.05)
        XCTAssertEqual(muy.scaledSize(42), 47.0, accuracy: 0.1)
    }

    func testMarkedWeightBumpsOneStepMax700() {
        let marked = TextPrefs(size: .normal, weight: .marked)
        XCTAssertEqual(GFont.resolvedWeight(.regular, prefs: marked), .medium)
        XCTAssertEqual(GFont.resolvedWeight(.medium, prefs: marked), .semibold)
        XCTAssertEqual(GFont.resolvedWeight(.semibold, prefs: marked), .bold)
        XCTAssertEqual(GFont.resolvedWeight(.bold, prefs: marked), .bold)
        XCTAssertEqual(GFont.resolvedWeight(.regular, prefs: .default), .regular)
        XCTAssertEqual(GFont.postScript(.medium), "Geist-Medium")
        XCTAssertEqual(GFont.postScript(.semibold), "Geist-SemiBold")
        XCTAssertEqual(GFont.postScript(.bold), "Geist-SemiBold")
    }

    func testParsesFlexibleWebKeys() {
        let json: [String: Any] = [
            "settings": [
                "text_size": "muy_grande",
                "text_weight": "marcado"
            ]
        ]
        let prefs = TextPrefsParser.prefs(from: json)
        XCTAssertEqual(prefs?.size, .extraLarge)
        XCTAssertEqual(prefs?.weight, .marked)

        let numeric = TextPrefsParser.prefs(from: ["textSize": 115, "textWeight": true])
        XCTAssertEqual(numeric?.size, .large)
        XCTAssertEqual(numeric?.weight, .marked)

        let body = TextPrefsParser.jsonBody(.default)
        XCTAssertEqual(body["text_size"] as? String, "normal")
        XCTAssertEqual(body["text_weight"] as? String, "normal")
        XCTAssertEqual(TextPrefsParser.jsonBody(TextPrefs(size: .large))["text_size"] as? String, "grande")
        XCTAssertEqual(TextPrefsParser.jsonBody(TextPrefs(size: .extraLarge, weight: .marked))["text_size"] as? String, "muy_grande")
        XCTAssertEqual(TextPrefsParser.jsonBody(TextPrefs(weight: .marked))["text_weight"] as? String, "marcado")
        XCTAssertEqual(TextPrefsParser.listPath, "/api/me/settings")
    }

    func testFourColumnTilesBecomeTwoOnNarrow320() {
        XCTAssertEqual(TextPrefsLayout.tileColumnCount(forWidth: 320), 2)
        XCTAssertEqual(TextPrefsLayout.tileColumnCount(forWidth: 280), 2)
        XCTAssertEqual(TextPrefsLayout.tileColumnCount(forWidth: 321), 4)
        XCTAssertEqual(TextPrefsLayout.tileColumnCount(forWidth: 375), 4)
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
        let reloaded = try await api.userSettings()
        XCTAssertEqual(reloaded.weight, .marked)
    }
}
