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

        if first(app, "metric-tarjetas").waitForExistence(timeout: 3) {
            first(app, "metric-tarjetas").tap()
            XCTAssertTrue(waitFor(app, "screen-metric-rounds", timeout: 6), "El detalle de tarjetas no se abrió")
            saveShot("14_metric_rondas")
            dismissIfPresent(app, "metric-back")
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

        if first(app, "filter-azul").waitForExistence(timeout: 3) {
            first(app, "filter-azul").tap()
        }
        if first(app, "course-strategy").waitForExistence(timeout: 4) {
            first(app, "course-strategy").tap()
            XCTAssertTrue(waitFor(app, "screen-strategy", timeout: 6), "No se abrió Cómo jugar la cancha")
            saveShot("20_strategy")
            XCTAssertTrue(first(app, "strategy-hole-7").waitForExistence(timeout: 4))
            first(app, "strategy-hole-7").tap()
            XCTAssertTrue(waitFor(app, "screen-strategy-hole", timeout: 6))
            XCTAssertTrue(waitFor(app, "strategy-plan-title", timeout: 4))
            saveShot("21_strategy_hoyo7")
            if first(app, "strategy-hazard-0").waitForExistence(timeout: 2) {
                first(app, "strategy-hazard-0").tap()
            }
            if first(app, "strategy-club").waitForExistence(timeout: 3) {
                first(app, "strategy-club").tap()
                XCTAssertTrue(waitFor(app, "screen-club-stats", timeout: 6), "El palo de la estrategia no abrió stats")
                dismissIfPresent(app, "metric-back")
            }
            dismissIfPresent(app, "metric-back")
            dismissIfPresent(app, "metric-back")
            XCTAssertTrue(waitFor(app, "screen-cancha", timeout: 5))
        }

        tapTab(app, "Mi bolsa")
        XCTAssertTrue(waitFor(app, "screen-bolsa", timeout: 6))
        saveShot("08_bolsa")

        if first(app, "bag-Driver").waitForExistence(timeout: 3) {
            first(app, "bag-Driver").tap()
            XCTAssertTrue(waitFor(app, "screen-club-stats", timeout: 6), "El detalle del palo no se abrió")
            saveShot("15_club_stats")
            dismissIfPresent(app, "metric-back")
        }
    }

    func testPlayRecapAndRecurring() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))

        XCTAssertTrue(first(app, "play-start").waitForExistence(timeout: 4))
        first(app, "play-start").tap()
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6), "No se abrió la lista de canchas")
        saveShot("16_play_canchas")
        XCTAssertTrue(first(app, "course-118-jockey-azul").waitForExistence(timeout: 4))
        first(app, "course-118-jockey-azul").tap()
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8), "No se abrió el hoyo GPS")
        XCTAssertTrue(waitFor(app, "distance-center", timeout: 4))
        saveShot("17_play_hoyo")
        if first(app, "play-hole-picker").waitForExistence(timeout: 3) {
            first(app, "play-hole-picker").tap()
            if first(app, "pick-hole-7").waitForExistence(timeout: 4) {
                first(app, "pick-hole-7").tap()
            }
        }
        XCTAssertTrue(first(app, "strategy-compact").waitForExistence(timeout: 6), "Falta el plan compacto en el hoyo 7")
        saveShot("22_play_strategy")
        first(app, "strategy-compact").tap()
        XCTAssertTrue(waitFor(app, "screen-strategy-hole", timeout: 6))
        saveShot("23_play_strategy_full")
        dismissIfPresent(app, "close-strategy")
        first(app, "play-hit").tap()
        XCTAssertTrue(first(app, "club-Dr").waitForExistence(timeout: 4))
        first(app, "club-Dr").tap()
        XCTAssertTrue(first(app, "result-fairway").waitForExistence(timeout: 4))
        first(app, "result-fairway").tap()
        dismissIfPresent(app, "play-close")
        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 6))

        if first(app, "home-recurring").waitForExistence(timeout: 4) {
            first(app, "home-recurring").tap()
            XCTAssertTrue(waitFor(app, "screen-recurring", timeout: 6))
            saveShot("18_recurring")
            dismissIfPresent(app, "metric-back")
            XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))
        }

        if waitFor(app, "last-round-card", timeout: 4) {
            first(app, "last-round-card").tap()
            XCTAssertTrue(waitFor(app, "screen-ronda", timeout: 6))
            XCTAssertTrue(first(app, "recap-start").waitForExistence(timeout: 3))
            first(app, "recap-start").tap()
            XCTAssertTrue(waitFor(app, "screen-recap", timeout: 6))
            saveShot("19_recap")
            dismissIfPresent(app, "close-recap")
            dismissIfPresent(app, "close-round")
        }
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
        XCTAssertTrue(first(app, "auth-matricula").waitForExistence(timeout: 3))
        XCTAssertFalse(first(app, "auth-email").exists)
        XCTAssertFalse(first(app, "auth-tab-up").exists)

        type(app.textFields["auth-matricula"], "94506")
        type(app.secureTextFields["auth-clave"], "clave123")
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
        XCTAssertFalse(first(app, "club-picker").exists)
        XCTAssertFalse(first(app, "club-url").exists)
        if app.textFields["club-matricula"].waitForExistence(timeout: 3) {
            type(app.textFields["club-matricula"], "94506")
        }
        if app.secureTextFields["club-clave"].waitForExistence(timeout: 3) {
            type(app.secureTextFields["club-clave"], "clave123")
        }
        saveShot("11_vincular")
    }

    func testGolfisticsLoginRejected() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "0000000")
        type(app.secureTextFields["auth-clave"], "mala")
        app.buttons["auth-submit"].tap()
        XCTAssertTrue(waitFor(app, "auth-rejected", timeout: 6), "Falta el rechazo de Golfistics")
        XCTAssertTrue(first(app, "auth-golfistics-open").waitForExistence(timeout: 3))
        saveShot("24_login_rechazada")
    }

    func testGolfisticsLoginUnavailable() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "down")
        type(app.secureTextFields["auth-clave"], "x")
        app.buttons["auth-submit"].tap()
        XCTAssertTrue(waitFor(app, "auth-unavailable", timeout: 6), "Falta el aviso de que Golfistics no responde")
        XCTAssertFalse(first(app, "auth-golfistics-open").exists)
        saveShot("26_login_caida")
    }

    func testGolfisticsLoginRateLimited() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "429")
        type(app.secureTextFields["auth-clave"], "x")
        app.buttons["auth-submit"].tap()
        XCTAssertTrue(waitFor(app, "auth-rate-limit", timeout: 6), "Falta el aviso de demasiados intentos")
        XCTAssertTrue(first(app, "auth-golfistics-open").waitForExistence(timeout: 3))
        saveShot("27_login_429")
    }

    func testGolfisticsFirstSync() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth", "-ui-testing-first-sync"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "94506")
        type(app.secureTextFields["auth-clave"], "clave123")
        app.buttons["auth-submit"].tap()
        let overlay = first(app, "sync-overlay")
        let label = first(app, "sync-progress-label")
        XCTAssertTrue(
            overlay.waitForExistence(timeout: 8) || label.waitForExistence(timeout: 2),
            "El primer sync no abrió el overlay"
        )
        saveShot("25_login_first_sync")
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
        let placeholders = [
            "Tu nombre",
            "vos@ejemplo.com",
            "Mínimo 8 caracteres",
            "Tu matrícula",
            "Tu número de matrícula",
            "La misma que usás en Golfistics"
        ]
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
