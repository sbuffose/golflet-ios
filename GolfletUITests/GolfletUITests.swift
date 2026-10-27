import XCTest

final class GolfletUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNavigateEveryScreenAndCapture() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(app.otherElements["screen-inicio"].waitForExistence(timeout: 12))
        XCTAssertTrue(app.descendants(matching: .any)["handicap-card"].waitForExistence(timeout: 12))
        saveShot("01_inicio")

        if app.descendants(matching: .any)["last-round-card"].waitForExistence(timeout: 4) {
            app.descendants(matching: .any)["last-round-card"].firstMatch.tap()
            XCTAssertTrue(app.otherElements["screen-ronda"].waitForExistence(timeout: 6))
            saveShot("04_ronda")
            if app.buttons["close-round"].waitForExistence(timeout: 2) {
                app.buttons["close-round"].tap()
            }
            XCTAssertTrue(app.otherElements["screen-inicio"].waitForExistence(timeout: 5))
        }

        if app.buttons["add-club-home"].waitForExistence(timeout: 3) {
            app.buttons["add-club-home"].tap()
            XCTAssertTrue(app.otherElements["screen-clubes"].waitForExistence(timeout: 6))
            saveShot("09_clubes")
            if app.buttons["close-clubes"].waitForExistence(timeout: 2) {
                app.buttons["close-clubes"].tap()
            }
            XCTAssertTrue(app.otherElements["screen-inicio"].waitForExistence(timeout: 5))
        }

        tapTab(app, "Resumen")
        XCTAssertTrue(app.otherElements["screen-resumen"].waitForExistence(timeout: 6))
        saveShot("02_resumen")

        tapTab(app, "Rondas")
        XCTAssertTrue(app.otherElements["screen-rondas"].waitForExistence(timeout: 6))
        saveShot("03_rondas")

        tapTab(app, "Cancha")
        XCTAssertTrue(app.otherElements["screen-cancha"].waitForExistence(timeout: 6))
        if app.descendants(matching: .any)["filter-colorada"].waitForExistence(timeout: 2) {
            app.descendants(matching: .any)["filter-colorada"].firstMatch.tap()
        }
        saveShot("05_cancha")

        if app.buttons["hole-1"].waitForExistence(timeout: 4) {
            app.buttons["hole-1"].tap()
            XCTAssertTrue(app.otherElements["screen-hoyo"].waitForExistence(timeout: 6))
            saveShot("06_hoyo")
        }

        tapTab(app, "Mi bolsa")
        XCTAssertTrue(app.otherElements["screen-bolsa"].waitForExistence(timeout: 6))
        saveShot("08_bolsa")
    }

    private func tapTab(_ app: XCUIApplication, _ name: String) {
        let tab = app.tabBars.buttons[name]
        XCTAssertTrue(tab.waitForExistence(timeout: 5), "Missing tab \(name)")
        tab.tap()
    }

    private func saveShot(_ name: String) {
        let shot = XCUIScreen.main.screenshot()
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)

        let dir = ProcessInfo.processInfo.environment["SCREENSHOT_DIR"] ?? "/tmp/golflet-screenshots"
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let url = URL(fileURLWithPath: dir).appendingPathComponent("\(name).png")
        try? shot.pngRepresentation.write(to: url)
    }
}
