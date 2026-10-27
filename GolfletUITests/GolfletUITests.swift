import XCTest

final class GolfletUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testNavigateEveryScreenAndCapture() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10), "Bootstrap del mock no terminó")
        XCTAssertTrue(waitFor(app, "handicap-card"))
        saveShot("01_inicio")

        if waitFor(app, "last-round-card", timeout: 4) {
            first(app, "last-round-card").tap()
            XCTAssertTrue(waitFor(app, "screen-ronda", timeout: 6))
            saveShot("04_ronda")
            dismissIfPresent(app, "close-round")
            XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))
        }

        if app.buttons["add-club-home"].waitForExistence(timeout: 3) {
            app.buttons["add-club-home"].tap()
            XCTAssertTrue(waitFor(app, "screen-clubes", timeout: 6))
            saveShot("09_clubes")
            dismissIfPresent(app, "close-clubes")
            XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))
        }

        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))
        saveShot("02_resumen")

        tapTab(app, "Rondas")
        XCTAssertTrue(waitFor(app, "screen-rondas", timeout: 6))
        saveShot("03_rondas")

        tapTab(app, "Cancha")
        XCTAssertTrue(waitFor(app, "screen-cancha", timeout: 6))
        if waitFor(app, "filter-colorada", timeout: 2) {
            first(app, "filter-colorada").tap()
        }
        saveShot("05_cancha")

        if app.buttons["hole-1"].waitForExistence(timeout: 4) {
            app.buttons["hole-1"].tap()
            XCTAssertTrue(waitFor(app, "screen-hoyo", timeout: 6))
            saveShot("06_hoyo")
            dismissIfPresent(app, "close-hole")
        }

        tapTab(app, "Mi bolsa")
        XCTAssertTrue(waitFor(app, "screen-bolsa", timeout: 6))
        saveShot("08_bolsa")
    }

    func testSyncOverlayThenInicio() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10), "Bootstrap del mock no terminó")
        let sync = app.buttons["home-sync-118"]
        XCTAssertTrue(sync.waitForExistence(timeout: 6), "Falta el botón de actualizar el club demo")
        XCTAssertTrue(sync.isHittable, "Actualizar no es tappable")

        let overlay = first(app, "sync-overlay")
        let label = first(app, "sync-progress-label")
        let overlayAppeared = expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: overlay)
        sync.tap()
        let arrived = XCTWaiter.wait(for: [overlayAppeared], timeout: 8)
        XCTAssertTrue(arrived == .completed || overlay.exists || label.exists, "El overlay de sync no apareció")
        saveShot("12_sync")

        let overlay = first(app, "sync-overlay")
        let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: overlay)
        wait(for: [gone], timeout: 12)
        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 4))
        saveShot("13_inicio_despues_sync")
    }

    func testLoginAndLinkingScreens() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        saveShot("10_login")

        let email = app.textFields["auth-email"]
        XCTAssertTrue(email.waitForExistence(timeout: 3))
        type(email, "demo@golflet.app")
        let password = app.secureTextFields["auth-password"]
        XCTAssertTrue(password.waitForExistence(timeout: 3))
        type(password, "password1")
        if app.keyboards.buttons["Return"].waitForExistence(timeout: 1) {
            app.keyboards.buttons["Return"].tap()
        } else if app.keyboards.buttons["Intro"].waitForExistence(timeout: 1) {
            app.keyboards.buttons["Intro"].tap()
        }
        let submit = app.buttons["auth-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        submit.tap()

        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 12), "El login demo no llegó a Inicio")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 8))
        if app.buttons["add-club-home"].waitForExistence(timeout: 6) {
            app.buttons["add-club-home"].tap()
        } else if app.buttons["avatar-button"].waitForExistence(timeout: 3) {
            app.buttons["avatar-button"].tap()
        }
        XCTAssertTrue(waitFor(app, "screen-clubes", timeout: 8))
        if app.textFields["club-matricula"].waitForExistence(timeout: 3) {
            type(app.textFields["club-matricula"], "94506")
        }
        if app.secureTextFields["club-clave"].waitForExistence(timeout: 3) {
            type(app.secureTextFields["club-clave"], "clave123")
        }
        saveShot("11_vincular")
    }

    private func first(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    @discardableResult
    private func waitFor(_ app: XCUIApplication, _ id: String, timeout: TimeInterval = 15) -> Bool {
        first(app, id).waitForExistence(timeout: timeout)
    }

    private func dismissIfPresent(_ app: XCUIApplication, _ id: String) {
        let button = app.buttons[id]
        if button.waitForExistence(timeout: 2) {
            button.tap()
            return
        }
        let any = first(app, id)
        if any.waitForExistence(timeout: 1) {
            any.tap()
        }
    }

    private func type(_ element: XCUIElement, _ text: String) {
        element.tap()
        let placeholders = ["Tu nombre", "vos@ejemplo.com", "Mínimo 8 caracteres", "Tu matrícula"]
        if let current = element.value as? String,
           !current.isEmpty,
           current != text,
           current != (element.placeholderValue ?? ""),
           !placeholders.contains(current) {
            let delete = String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count)
            element.typeText(delete)
        }
        element.typeText(text)
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
