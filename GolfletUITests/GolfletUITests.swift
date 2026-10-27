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

    func testSyncOverlayThenInicio() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(app.otherElements["screen-inicio"].waitForExistence(timeout: 12))
        let sync = app.buttons["home-sync-118"]
        XCTAssertTrue(sync.waitForExistence(timeout: 6))
        sync.tap()

        let overlay = app.otherElements["sync-overlay"]
        XCTAssertTrue(overlay.waitForExistence(timeout: 4))
        XCTAssertTrue(app.descendants(matching: .any)["sync-progress-label"].waitForExistence(timeout: 3))
        saveShot("12_sync")

        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: overlay)
        wait(for: [gone], timeout: 12)
        XCTAssertTrue(app.otherElements["screen-inicio"].waitForExistence(timeout: 4))
        saveShot("13_inicio_despues_sync")
    }

    func testLoginAndLinkingScreens() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(app.otherElements["screen-login"].waitForExistence(timeout: 10))
        saveShot("10_login")

        if app.buttons["auth-tab-up"].waitForExistence(timeout: 2) {
            app.buttons["auth-tab-up"].tap()
        }
        let name = app.textFields["auth-name"]
        if name.waitForExistence(timeout: 3) {
            name.tap()
            name.typeText("Jugador Demo")
        }
        let email = app.textFields["auth-email"]
        XCTAssertTrue(email.waitForExistence(timeout: 3))
        email.tap()
        email.typeText("demo@golflet.app")
        let password = app.secureTextFields["auth-password"]
        XCTAssertTrue(password.waitForExistence(timeout: 3))
        password.tap()
        password.typeText("password1")
        app.buttons["auth-submit"].tap()

        XCTAssertTrue(app.otherElements["screen-inicio"].waitForExistence(timeout: 10))
        if app.buttons["add-club-home"].waitForExistence(timeout: 6) {
            app.buttons["add-club-home"].tap()
        } else if app.buttons["avatar-button"].waitForExistence(timeout: 3) {
            app.buttons["avatar-button"].tap()
        }
        XCTAssertTrue(app.otherElements["screen-clubes"].waitForExistence(timeout: 8))
        if app.textFields["club-matricula"].waitForExistence(timeout: 3) {
            app.textFields["club-matricula"].tap()
            app.textFields["club-matricula"].typeText("94506")
        }
        if app.secureTextFields["club-clave"].waitForExistence(timeout: 3) {
            app.secureTextFields["club-clave"].tap()
            app.secureTextFields["club-clave"].typeText("clave123")
        }
        saveShot("11_vincular")
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
