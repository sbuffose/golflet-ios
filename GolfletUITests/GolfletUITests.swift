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
        XCTAssertTrue(first(app, "home-tee-tab").waitForExistence(timeout: 4), "Falta la pestaña de próximo tee time")
        first(app, "home-tee-tab").tap()
        XCTAssertTrue(waitFor(app, "home-tee-times", timeout: 4), "No scrolleó a la tarjeta de tee times")
        XCTAssertTrue(first(app, "home-tee-partners-tt-jockey-1").waitForExistence(timeout: 3), "Faltan los compañeros")
        saveShot("01_inicio")

        if waitFor(app, "last-round-card", timeout: 4) {
            first(app, "last-round-card").tap()
            XCTAssertTrue(waitFor(app, "screen-ronda", timeout: 6))
            saveShot("04_ronda")
            dismissSheet(app, closeID: "close-round", screenID: "screen-ronda")
            XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))
        }

        XCTAssertTrue(openClubsSheet(app, timeout: 3), "No abrió el perfil")
        XCTAssertTrue(waitFor(app, "screen-clubes", timeout: 6))
        saveShot("09_clubes")
        dismissIfPresent(app, "close-clubes")
        if first(app, "screen-notificaciones").exists {
            dismissIfPresent(app, "close-notificaciones")
        }
        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))

        if first(app, "metric-tarjetas").waitForExistence(timeout: 3) {
            first(app, "metric-tarjetas").tap()
            XCTAssertTrue(waitFor(app, "screen-metric-rounds", timeout: 6), "El detalle de tarjetas no se abrió")
            saveShot("14_metric_rondas")
            dismissIfPresent(app, "metric-back")
            XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))
        }

        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))
        XCTAssertTrue(first(app, "range-menu").waitForExistence(timeout: 4), "Falta el selector de período")
        XCTAssertTrue(first(app, "metric-game").waitForExistence(timeout: 4), "Falta la tarjeta de Métricas")
        saveShot("02_resumen")

        tapTab(app, "Rondas")
        XCTAssertTrue(waitFor(app, "screen-rondas", timeout: 6))
        saveShot("03_rondas")

        tapTab(app, "Cancha")
        XCTAssertTrue(waitFor(app, "screen-cancha", timeout: 6))
        assertCanchaHoleGrid(app)
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
        startAzulRound(app)
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8), "No se abrió el hoyo GPS")
        XCTAssertTrue(waitFor(app, "distance-center", timeout: 4))
        XCTAssertTrue(app.buttons["Ya pegué"].waitForExistence(timeout: 2) || first(app, "play-hit").label.contains("Ya pegué"), "Falta Ya pegué")
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
        submitLogin(app)

        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 12), "El login demo no llegó a Inicio")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 8))
        XCTAssertTrue(openClubsSheet(app), "No se pudo abrir Clubes después del login")
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
        submitLogin(app)
        XCTAssertTrue(waitFor(app, "auth-rejected", timeout: 6), "Falta el rechazo de Golfistics")
        XCTAssertTrue(first(app, "auth-golfistics-open").waitForExistence(timeout: 3))
        saveShot("24_login_rechazada")
    }

    func testGolfisticsLoginUnavailable() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "503")
        type(app.secureTextFields["auth-clave"], "x")
        submitLogin(app)
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
        submitLogin(app)
        XCTAssertTrue(waitFor(app, "auth-rate-limit", timeout: 6), "Falta el aviso de demasiados intentos")
        XCTAssertTrue(first(app, "auth-golfistics-open").waitForExistence(timeout: 3))
        saveShot("27_login_429")
    }

    func testGPSHoleAdvanceAsksConfirmation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-next-tee"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "play-start").waitForExistence(timeout: 4))
        first(app, "play-start").tap()
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6))
        startAzulRound(app)
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8))
        first(app, "play-hit").tap()
        XCTAssertTrue(
            app.alerts.buttons["Pasar al hoyo"].waitForExistence(timeout: 6)
                || first(app, "play-advance-confirm").waitForExistence(timeout: 2),
            "El GPS no pidió confirmación para pasar de hoyo"
        )
        saveShot("28_play_advance")
    }

    func testGolfisticsFirstSync() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth", "-ui-testing-first-sync"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "94506")
        type(app.secureTextFields["auth-clave"], "clave123")
        submitLogin(app)
        let overlay = first(app, "sync-overlay")
        let label = first(app, "sync-progress-label")
        XCTAssertTrue(
            overlay.waitForExistence(timeout: 8) || label.waitForExistence(timeout: 2),
            "El primer sync no abrió el overlay"
        )
        saveShot("25_login_first_sync")
    }

    func testResumenRangeOpensMetricChart() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))
        assertRangeMenu(app)
        XCTAssertTrue(first(app, "metric-summary-average").waitForExistence(timeout: 4))
        first(app, "metric-summary-average").tap()
        XCTAssertTrue(waitFor(app, "screen-metric-chart", timeout: 6), "El promedio no abrió el gráfico")
        XCTAssertTrue(first(app, "metric-chart").waitForExistence(timeout: 3))
        saveShot("31_resumen_rango_chart")
        dismissIfPresent(app, "metric-back")
    }

    func testHomeGreetingFitsBesideOrBelowTeeTab() throws {
        let names = ["Guillermo", "Maximiliano", "Juan Bautista"]
        for name in names {
            assertHomeGreeting(name, hasTab: true)
            assertHomeGreeting(name, hasTab: false)
        }
    }

    func testHomeHcpProfesoresStackOpensList() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-many-profesores"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "home-hcp-profesor").waitForExistence(timeout: 4), "Falta el stack de profesores")
        largest(app, "home-hcp-profesor").tap()
        XCTAssertTrue(waitFor(app, "screen-home-profesores", timeout: 6), "No se abrió Mis profesores")
        XCTAssertFalse(first(app, "profesor-search").waitForExistence(timeout: 1), "La búsqueda vive en Agregar, no en Mis profesores")
        XCTAssertTrue(first(app, "profesores-encontrar").waitForExistence(timeout: 3), "Falta Encontrar un profesor")
        XCTAssertTrue(first(app, "profesores-agregar").waitForExistence(timeout: 3), "Falta Agregar un profesor")
        XCTAssertFalse(app.staticTexts["Crear link para mi profesor"].exists)
        XCTAssertTrue(first(app, "home-profesor-p-manu").waitForExistence(timeout: 4))
        first(app, "home-profesor-p-manu").tap()
        XCTAssertTrue(waitFor(app, "screen-profesor", timeout: 8), "No entró al profesor")
        saveShot("44_inicio_hcp_profesores")
    }

    func testHomeHcpGroupsStackOpensGroup() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "home-hcp-groups").waitForExistence(timeout: 4), "Falta el stack de grupos en HCP")
        largest(app, "home-hcp-groups").tap()
        XCTAssertTrue(waitFor(app, "screen-home-groups", timeout: 6), "No se abrió la lista de grupos")
        XCTAssertTrue(first(app, "home-group-g-jockey").waitForExistence(timeout: 4))
        first(app, "home-group-g-jockey").tap()
        XCTAssertTrue(waitFor(app, "screen-grupo", timeout: 8), "No entró al grupo")
        saveShot("41_inicio_hcp_grupos")
    }

    func testHomeHcpCreateGroupWhenEmpty() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-no-groups"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "home-hcp-crear-grupo").waitForExistence(timeout: 4), "Falta Crear grupo")
        largest(app, "home-hcp-crear-grupo").tap()
        XCTAssertTrue(waitFor(app, "screen-crear-grupo", timeout: 6), "No se abrió crear grupo")
        saveShot("42_inicio_hcp_crear_grupo")
    }

    func testHomeHcpCreateGroupWhenNoProfesorOrGroups() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-no-groups", "-ui-testing-no-profesor"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertFalse(first(app, "home-hcp-profesor").waitForExistence(timeout: 2))
        XCTAssertFalse(first(app, "home-hcp-groups").exists)
        XCTAssertTrue(first(app, "home-hcp-add-profesor").waitForExistence(timeout: 4), "Falta el placeholder de profesor")
        XCTAssertTrue(first(app, "home-hcp-crear-grupo").waitForExistence(timeout: 4), "Falta Crear grupo")
        largest(app, "home-hcp-add-profesor").tap()
        XCTAssertTrue(waitFor(app, "screen-agregar-profesor", timeout: 6), "No se abrió Agregar profesor")
        let search = app.textFields["profesor-search"]
        XCTAssertTrue(search.waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "profesores-encontrar").waitForExistence(timeout: 3), "Falta Encontrar un profesor")
        XCTAssertFalse(app.staticTexts["Crear link para mi profesor"].exists)
        type(search, "Manu")
        XCTAssertTrue(first(app, "add-profesor-p-manu").waitForExistence(timeout: 4), "La búsqueda no encontró al profesor")
        first(app, "profesores-encontrar").tap()
        XCTAssertTrue(waitFor(app, "screen-encontrar-profesor", timeout: 6), "No se abrió el match")
        dismissIfPresent(app, "metric-back")
        XCTAssertTrue(waitFor(app, "screen-agregar-profesor", timeout: 6))
        dismissIfPresent(app, "close-agregar-profesor")
        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 6))
        largest(app, "home-hcp-crear-grupo").tap()
        XCTAssertTrue(waitFor(app, "screen-crear-grupo", timeout: 6), "No se abrió crear grupo")
        saveShot("45_inicio_hcp_crear_grupo_vacio")
    }

    func testPlanHoleViewSuggestsClubAndKeepsConfirmedPills() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        tapTab(app, "Cancha")
        XCTAssertTrue(waitFor(app, "screen-cancha", timeout: 6))
        let entry = first(app, "course-plan")
        reveal(app, entry)
        XCTAssertTrue(entry.waitForExistence(timeout: 4), "Falta Estrategia de juego")
        entry.tap()
        XCTAssertTrue(waitFor(app, "screen-plan-hole", timeout: 8), "No se abrió el hoyo de estrategia")
        XCTAssertTrue(first(app, "plan-view-diseno").waitForExistence(timeout: 4), "Falta Diseño")
        XCTAssertTrue(first(app, "plan-view-satelital").waitForExistence(timeout: 2), "Falta Satelital")
        XCTAssertTrue(first(app, "plan-tee").waitForExistence(timeout: 4), "Falta el tee de salida")
        XCTAssertTrue(
            first(app, "plan-shot-pill").waitForExistence(timeout: 4) || first(app, "plan-landing").waitForExistence(timeout: 2),
            "Falta el palo sugerido o el anillo de caída"
        )
        first(app, "plan-view-satelital").tap()
        first(app, "plan-view-diseno").tap()
        if first(app, "plan-shot-pill").waitForExistence(timeout: 3) {
            first(app, "plan-shot-pill").tap()
            XCTAssertTrue(first(app, "plan-breakdown").waitForExistence(timeout: 3), "El desglose tiene que ser inline")
            XCTAssertTrue(first(app, "plan-firm-normal").waitForExistence(timeout: 2), "Falta Blanda/Normal/Dura")
        }
        if first(app, "plan-confirm").waitForExistence(timeout: 3) {
            first(app, "plan-confirm").tap()
            XCTAssertTrue(first(app, "plan-pin-0").waitForExistence(timeout: 4), "El golpe confirmado no dejó cartel")
        }
        saveShot("60_plan_hoyo")
    }

    func testCanchaHoleGridDoesNotWrapOnIPhone() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        tapTab(app, "Cancha")
        XCTAssertTrue(waitFor(app, "screen-cancha", timeout: 6))
        assertCanchaHoleGrid(app)
        saveShot("30_cancha_hoyos")
    }

    func testFarFromCourseShowsClearDistanceState() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-far-gps"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "play-start").waitForExistence(timeout: 4))
        first(app, "play-start").tap()
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6))
        startAzulRound(app)
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8))
        XCTAssertTrue(waitFor(app, "distance-far", timeout: 4), "Falta Estás lejos de la cancha")
        XCTAssertFalse(first(app, "distance-center").exists)
        saveShot("32_play_lejos")
    }

    func testPaceAlertOnlyOnHole10WhenLate() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-pace-late"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        if openClubsSheet(app, timeout: 4) {
            XCTAssertTrue(first(app, "setting-pace-alert").waitForExistence(timeout: 4), "Falta el aviso de ritmo")
            dismissIfPresent(app, "close-clubes")
        }
        XCTAssertTrue(first(app, "play-start").waitForExistence(timeout: 4))
        first(app, "play-start").tap()
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6))
        startAzulRound(app)
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8))
        XCTAssertFalse(first(app, "pace-alert").exists, "El aviso no puede aparecer antes del 10")
        first(app, "play-hole-picker").tap()
        XCTAssertTrue(first(app, "pick-hole-10").waitForExistence(timeout: 4))
        first(app, "pick-hole-10").tap()
        XCTAssertTrue(
            first(app, "pace-alert").waitForExistence(timeout: 4) || app.alerts["Ritmo de juego"].waitForExistence(timeout: 3),
            "Falta el aviso de ritmo en el hoyo 10"
        )
        saveShot("33_play_ritmo")
    }

    func testStartRoundPlayersAndModality() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "play-start").waitForExistence(timeout: 4))
        first(app, "play-start").tap()
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6))
        XCTAssertTrue(first(app, "course-118-jockey-azul").waitForExistence(timeout: 4))
        first(app, "course-118-jockey-azul").tap()
        XCTAssertTrue(waitFor(app, "screen-play-start", timeout: 6), "Falta el armado de la ronda")
        XCTAssertTrue(first(app, "play-players-4").waitForExistence(timeout: 3), "Falta el selector de jugadores")
        XCTAssertTrue(first(app, "play-modality-medal").waitForExistence(timeout: 2), "Falta la modalidad")
        first(app, "play-players-2").tap()
        first(app, "play-modality-fourball").tap()
        first(app, "play-start-round").tap()
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8), "No se abrió el hoyo GPS")
        saveShot("38_play_start_ronda")
    }

    func testResumenTrendCardFillsPhoneWidth() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))

        let card = first(app, "metric-summary-trend")
        XCTAssertTrue(card.waitForExistence(timeout: 6), "Falta la card de Tendencia")
        reveal(app, card)

        let width = app.frame.width
        XCTAssertGreaterThan(width, 300, "El test tiene que correr a ancho iPhone")
        XCTAssertGreaterThan(card.frame.width, width - 56, "Tendencia no es full-width: \(card.frame)")

        let chart = largest(app, "trend-chart")
        XCTAssertTrue(chart.waitForExistence(timeout: 3), "Falta el gráfico de tendencia")
        XCTAssertGreaterThan(chart.frame.width, width * 0.62, "El gráfico quedó estrecho: \(chart.frame)")
        XCTAssertGreaterThan(chart.frame.height, 169, "El gráfico no mide ~180pt: \(chart.frame)")

        let legend = first(app, "trend-legend")
        XCTAssertTrue(legend.waitForExistence(timeout: 2), "Falta la leyenda de tees")
        XCTAssertGreaterThan(legend.frame.width, 160, "La leyenda no es una fila: \(legend.frame)")
        XCTAssertLessThan(legend.frame.height, 40, "La leyenda se apiló en columnas: \(legend.frame)")

        let footnote = first(app, "trend-footnote")
        XCTAssertTrue(footnote.waitForExistence(timeout: 2), "Falta la nota de Tendencia")
        XCTAssertGreaterThan(footnote.frame.width, width * 0.55, "La nota se partió en columnas: \(footnote.frame)")
        XCTAssertLessThan(footnote.frame.height, 56, "La nota envuelve letra por letra: \(footnote.frame)")
        XCTAssertGreaterThan(footnote.frame.minY, chart.frame.maxY - 4, "Gráfico y nota quedaron lado a lado")

        saveShot("29_resumen_tendencia")

        card.tap()
        XCTAssertTrue(waitFor(app, "screen-metric-handicap", timeout: 6), "La card no abre el detalle de tendencia")
        dismissIfPresent(app, "metric-back")
    }

    func testGruposCreateShareAndPendingInvite() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "home-grupos").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "home-pending-invite").waitForExistence(timeout: 3), "Falta la invitación pendiente")
        first(app, "home-grupos").tap()
        XCTAssertTrue(waitFor(app, "screen-grupos", timeout: 6))
        XCTAssertTrue(first(app, "pending-invite-invite-mdp").waitForExistence(timeout: 4))
        saveShot("32_grupos")

        first(app, "groups-create").tap()
        XCTAssertTrue(waitFor(app, "screen-crear-grupo", timeout: 6))
        XCTAssertTrue(app.textFields["group-name"].waitForExistence(timeout: 3))
        type(app.textFields["group-name"], "Birdie Club")
        first(app, "group-create-submit").tap()
        XCTAssertTrue(waitFor(app, "screen-compartir-grupo", timeout: 8), "No salió el share del link")
        XCTAssertTrue(first(app, "share-whatsapp").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "invite-link").waitForExistence(timeout: 3))
        XCTAssertTrue((first(app, "invite-link").label + (first(app, "invite-link").value as? String ?? "")).contains("golflet.vercel.app/g/"))
        saveShot("33_grupo_compartir")
        dismissIfPresent(app, "close-compartir")
    }

    func testInviteDeepLinkAfterLogin() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth", "-pending-invite", "invite-mdp"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "94506")
        type(app.secureTextFields["auth-clave"], "clave123")
        submitLogin(app)
        XCTAssertTrue(waitFor(app, "screen-invitacion", timeout: 12), "La invitación no apareció después del login")
        XCTAssertTrue(first(app, "invite-accept").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "invite-decline").waitForExistence(timeout: 2))
        saveShot("34_invitacion")
        let accept = app.buttons["invite-accept"].exists ? app.buttons["invite-accept"] : first(app, "invite-accept")
        if accept.isHittable {
            accept.tap()
        } else {
            accept.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(waitFor(app, "screen-grupo", timeout: 8), "Aceptar no abrió el grupo")
        saveShot("35_grupo_aceptado")
    }

    func testMetricasTabsEmptyStateAndGPSHoleTools() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))
        XCTAssertTrue(first(app, "metric-game").waitForExistence(timeout: 4), "Falta Métricas como primera tarjeta")
        XCTAssertTrue(first(app, "resumen-gps-count").waitForExistence(timeout: 3))
        first(app, "metric-game").tap()
        XCTAssertTrue(waitFor(app, "screen-metricas", timeout: 6), "No se abrió Métricas")
        XCTAssertTrue(first(app, "met-tabs").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "range-menu").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "met-gps-count").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "met-empty-tee").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "met-empty-how").waitForExistence(timeout: 3), "Falta el empty state sin datos de ejemplo")
        XCTAssertEqual(first(app, "met-empty-how").label, "Jugá con “Ya pegué” para ver tus datos")
        saveShot("52_metricas_tee")

        first(app, "met-tab-hierros").tap()
        XCTAssertTrue(first(app, "met-empty-hierros").waitForExistence(timeout: 3))
        first(app, "met-tab-gir").tap()
        XCTAssertTrue(first(app, "met-empty-gir").waitForExistence(timeout: 3))
        XCTAssertFalse(first(app, "met-gir-par-3").exists, "GIR vacío no tiene datos de ejemplo")
        first(app, "met-tab-putting").tap()
        XCTAssertTrue(first(app, "met-empty-putting").waitForExistence(timeout: 3))
        saveShot("53_metricas_putting")

        let start = app.buttons["met-empty-start"].exists ? app.buttons["met-empty-start"] : first(app, "met-empty-start")
        if start.isHittable {
            start.tap()
        } else {
            start.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6), "Empezar ronda con GPS no abrió Jugar")
        startAzulRound(app)
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8))
        XCTAssertTrue(first(app, "play-hit").waitForExistence(timeout: 4))
        XCTAssertEqual(first(app, "play-hit").label, "Ya pegué")
        first(app, "play-hit").tap()
        XCTAssertTrue(first(app, "play-drive-side").waitForExistence(timeout: 4), "Falta Izq./Fairway/Der. después del drive")
        let fairway = app.buttons["drive-fairway"].exists ? app.buttons["drive-fairway"] : first(app, "drive-fairway")
        if !fairway.waitForExistence(timeout: 3) {
            XCTAssertTrue(app.buttons["Fairway"].waitForExistence(timeout: 3), "Falta Fairway")
            app.buttons["Fairway"].tap()
        } else if fairway.isHittable {
            fairway.tap()
        } else {
            fairway.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        reveal(app, first(app, "play-putts-plus"))
        XCTAssertTrue(first(app, "play-putts-plus").waitForExistence(timeout: 3))
        first(app, "play-putts-plus").tap()
        first(app, "play-putts-plus").tap()
        XCTAssertEqual(first(app, "play-putts-value").label, "2")
        reveal(app, first(app, "play-pin"))
        first(app, "play-pin").tap()
        XCTAssertTrue(first(app, "play-pin-zones").waitForExistence(timeout: 4), "Hay que elegir Adelante/Medio/Fondo")
        XCTAssertTrue(first(app, "play-pin-save").exists)
        XCTAssertFalse(first(app, "play-pin-save").isEnabled, "Guardar bandera pide zona")
        first(app, "play-pin-zone-middle").tap()
        XCTAssertTrue(first(app, "play-pin-save").isEnabled)
        first(app, "play-pin-save").tap()
        XCTAssertTrue(first(app, "play-pin-marked").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "play-pin-marked").label.contains("la marcaste vos"))
        XCTAssertTrue(first(app, "play-pin-remark").waitForExistence(timeout: 3))
        first(app, "play-hole-next").tap()
        XCTAssertTrue(first(app, "play-putts-value").waitForExistence(timeout: 3))
        reveal(app, first(app, "play-pin-report"))
        XCTAssertTrue(first(app, "play-pin-marked").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "play-pin-marked").label.contains("cargada por un jugador"))
        XCTAssertFalse(first(app, "play-pin-marked").label.contains("Demo"))
        XCTAssertTrue(first(app, "distance-pin").waitForExistence(timeout: 3), "Faltan yardas a la bandera de hoy")
        first(app, "play-pin-report").tap()
        XCTAssertTrue(first(app, "play-pin-report-confirm").waitForExistence(timeout: 3))
        first(app, "play-pin-report-confirm").tap()
        XCTAssertTrue(first(app, "play-pin-reported").waitForExistence(timeout: 4))
        XCTAssertEqual(first(app, "play-pin-reported").label, "Reportaste esta bandera")
        first(app, "play-hole-next").tap()
        XCTAssertTrue(first(app, "play-pin-marked").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "play-pin-marked").label.contains("cargada por el club"))
        XCTAssertFalse(first(app, "play-pin").exists)
        XCTAssertFalse(first(app, "play-pin-report").exists)
        XCTAssertFalse(first(app, "play-pin-remark").exists)
        saveShot("54_play_putts_pin")
    }

    func testMetricasAndPlayFitAtLargeText() throws {
        let app = XCUIApplication()
        app.launchArguments = [
            "-ui-testing",
            "-UIPreferredContentSizeCategoryName",
            "UICTContentSizeCategoryAccessibilityXL"
        ]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))
        assertFits(app, "metric-game")
        assertFits(app, "resumen-gps-count")
        first(app, "metric-game").tap()
        XCTAssertTrue(waitFor(app, "screen-metricas", timeout: 6))
        assertFits(app, "met-tabs")
        assertFits(app, "met-gps-count")
        assertFits(app, "met-empty-how")
        assertFits(app, "met-empty-start")
        XCTAssertGreaterThan(app.frame.width, 300, "El test tiene que correr a ancho iPhone")
        saveShot("55_metricas_xl")

        dismissIfPresent(app, "metric-back")
        tapTab(app, "Inicio")
        XCTAssertTrue(first(app, "play-start").waitForExistence(timeout: 4))
        first(app, "play-start").tap()
        XCTAssertTrue(waitFor(app, "screen-play-courses", timeout: 6))
        startAzulRound(app)
        XCTAssertTrue(waitFor(app, "screen-play-hole", timeout: 8))
        assertFits(app, "play-hit")
        reveal(app, first(app, "play-putts-plus"))
        assertFits(app, "play-putts-plus")
        reveal(app, first(app, "play-pin"))
        assertFits(app, "play-pin")
        first(app, "play-pin").tap()
        XCTAssertTrue(first(app, "play-pin-zones").waitForExistence(timeout: 4))
        assertFits(app, "play-pin-zone-front")
        assertFits(app, "play-pin-zone-middle")
        assertFits(app, "play-pin-zone-back")
        assertFits(app, "play-pin-save")
        saveShot("56_play_xl")
    }

    func testQueCompartoAndGroupComparison() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        if first(app, "avatar-button").waitForExistence(timeout: 4) {
            first(app, "avatar-button").tap()
            if first(app, "notifications-cuenta").waitForExistence(timeout: 4) {
                first(app, "notifications-cuenta").tap()
            }
        } else {
            first(app, "add-club-home").tap()
        }
        XCTAssertTrue(waitFor(app, "screen-clubes", timeout: 6))
        XCTAssertTrue(first(app, "perfil-pending-invite-mdp").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "perfil-que-comparto").waitForExistence(timeout: 3))
        first(app, "perfil-que-comparto").tap()
        XCTAssertTrue(waitFor(app, "screen-que-comparto", timeout: 6))
        XCTAssertTrue(first(app, "share-always-private").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "share-scoring").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "share-profile").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "share-rounds_detail").waitForExistence(timeout: 3))
        XCTAssertFalse(app.staticTexts["Notas de voz"].exists)
        XCTAssertFalse(app.staticTexts["Estrategia"].exists)
        saveShot("36_que_comparto")
        dismissIfPresent(app, "close-que-comparto")

        if first(app, "home-grupos").waitForExistence(timeout: 4) {
            reveal(app, first(app, "home-grupos"))
            first(app, "home-grupos").tap()
        } else if first(app, "perfil-grupos").waitForExistence(timeout: 3) {
            first(app, "perfil-grupos").tap()
        } else {
            first(app, "add-club-home").tap()
            XCTAssertTrue(first(app, "perfil-grupos").waitForExistence(timeout: 4))
            first(app, "perfil-grupos").tap()
        }
        XCTAssertTrue(waitFor(app, "screen-grupos", timeout: 6))
        XCTAssertTrue(first(app, "group-g-jockey").waitForExistence(timeout: 4))
        first(app, "group-g-jockey").tap()
        XCTAssertTrue(waitFor(app, "screen-grupo", timeout: 6))
        reveal(app, first(app, "compare-handicap-ana"))
        XCTAssertTrue(first(app, "compare-handicap-ana").waitForExistence(timeout: 4))
        let hidden = first(app, "compare-handicap-ana").label
        XCTAssertTrue(hidden.contains("No compartido") || (first(app, "compare-handicap-ana").value as? String)?.contains("No compartido") == true)
        saveShot("37_grupo_comparacion")
        reveal(app, first(app, "group-comparativo"))
        XCTAssertTrue(first(app, "group-comparativo").waitForExistence(timeout: 4), "Falta la card Comparativo")
        reveal(app, first(app, "group-profile-demo"))
        XCTAssertTrue(first(app, "group-profile-demo").waitForExistence(timeout: 4), "Falta Ver perfil")
        let semana = app.buttons["group-comp-semana"].exists ? app.buttons["group-comp-semana"] : first(app, "group-comp-semana")
        reveal(app, semana)
        if semana.isHittable {
            semana.tap()
        } else {
            semana.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(waitFor(app, "screen-comparativo", timeout: 6), "No se abrió el Comparativo")
        XCTAssertTrue(first(app, "comp-row-demo").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "comp-row-ana").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "comp-row-ana").label.contains("No comparte") || (first(app, "comp-row-ana").value as? String)?.contains("No comparte") == true || first(app, "comp-who-ana").waitForExistence(timeout: 2))
        let tile = app.buttons["comp-tile-best_net"].exists ? app.buttons["comp-tile-best_net"] : first(app, "comp-tile-best_net")
        reveal(app, tile)
        if tile.waitForExistence(timeout: 4), tile.isHittable {
            tile.tap()
        } else {
            tile.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(waitFor(app, "screen-comparativo-stat", timeout: 6), "No se abrió el ranking")
        XCTAssertTrue(first(app, "comp-stat-row-ana").waitForExistence(timeout: 4), "Falta Ana en el ranking")
        let anaStat = first(app, "comp-stat-row-ana").label
        XCTAssertTrue(
            anaStat.contains("No comparte") || (first(app, "comp-stat-row-ana").value as? String)?.contains("No comparte") == true,
            "Ana tenía que decir que no comparte: \(anaStat)"
        )
        dismissIfPresent(app, "close-comparativo-stat")
        let who = app.buttons["comp-who-demo"].exists ? app.buttons["comp-who-demo"] : first(app, "comp-who-demo")
        reveal(app, who)
        if who.waitForExistence(timeout: 4), who.isHittable {
            who.tap()
        } else {
            who.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(waitFor(app, "screen-grupo-perfil", timeout: 6), "No se abrió el perfil")
        XCTAssertTrue(first(app, "profile-asi-te-ven").waitForExistence(timeout: 4), "Falta Así te ven")
        assertFits(app, "profile-asi-te-ven")
        saveShot("57_comparativo")
        dismissIfPresent(app, "close-grupo-perfil")
        dismissIfPresent(app, "close-comparativo")
    }

    func testNeedsClubPicker() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing-auth"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-login", timeout: 10))
        type(app.textFields["auth-matricula"], "noclub")
        type(app.secureTextFields["auth-clave"], "clave123")
        submitLogin(app)
        XCTAssertTrue(first(app, "club-picker").waitForExistence(timeout: 14), "Falta el picker NEEDS_CLUB")
        XCTAssertTrue(first(app, "club-pick-124").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "club-pick-124").label.contains("San Isidro") || app.staticTexts["San Isidro Golf Club"].exists)
        first(app, "club-pick-124").tap()
        saveShot("58_needs_club")
    }

    func testNotificationsBadgeAndInbox() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(first(app, "avatar-badge").waitForExistence(timeout: 4), "Falta el badge de no leídas")
        let badge = first(app, "avatar-badge")
        let badgeText = [badge.label, badge.value as? String].compactMap { $0 }.joined()
        XCTAssertTrue(badgeText.contains("2"), "El badge tenía que mostrar 2: \(badgeText)")

        first(app, "avatar-button").tap()
        XCTAssertTrue(waitFor(app, "screen-notificaciones", timeout: 6), "No se abrió Notificaciones")
        XCTAssertTrue(first(app, "notification-n-invite-mdp").waitForExistence(timeout: 4))
        XCTAssertTrue(first(app, "notification-n-club-jockey").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "notification-accept-n-invite-mdp").waitForExistence(timeout: 3))
        XCTAssertTrue(first(app, "notification-decline-n-invite-mdp").waitForExistence(timeout: 2))
        saveShot("38_notificaciones")

        first(app, "notification-decline-n-invite-mdp").tap()
        XCTAssertTrue(
            first(app, "notification-n-invite-mdp").waitForNonExistence(timeout: 4),
            "Rechazar tenía que sacar la invitación"
        )
        XCTAssertTrue(first(app, "notification-n-club-jockey").waitForExistence(timeout: 2))

        dismissIfPresent(app, "close-notificaciones")
        XCTAssertTrue(waitFor(app, "screen-inicio", timeout: 5))
        XCTAssertFalse(first(app, "avatar-badge").waitForExistence(timeout: 2), "El badge tenía que ocultarse al abrir")

        first(app, "avatar-button").tap()
        XCTAssertTrue(waitFor(app, "screen-clubes", timeout: 6), "Sin no leídas el avatar abre la cuenta")
        XCTAssertTrue(first(app, "perfil-notificaciones").waitForExistence(timeout: 3), "Falta la fila de Notificaciones")
        first(app, "perfil-notificaciones").tap()
        XCTAssertTrue(waitFor(app, "screen-notificaciones", timeout: 6))
        saveShot("38_notificaciones_perfil")
    }

    func testTextPrefsLivePreview() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        XCTAssertTrue(openClubsSheet(app), "No abrió el perfil")
        XCTAssertTrue(waitFor(app, "screen-clubes", timeout: 6))
        reveal(app, first(app, "perfil-texto"))
        XCTAssertTrue(first(app, "perfil-texto").waitForExistence(timeout: 4), "Falta Tamaño y grosor del texto")
        first(app, "perfil-texto").tap()
        XCTAssertTrue(waitFor(app, "screen-texto", timeout: 6))
        XCTAssertTrue(first(app, "text-preview").waitForExistence(timeout: 3))
        first(app, "text-size-xl").tap()
        first(app, "text-weight-marked").tap()
        XCTAssertTrue(first(app, "text-preview-hero").waitForExistence(timeout: 3))
        saveShot("46_texto_prefs")
        dismissIfPresent(app, "close-texto")
    }

    func testMainScreensAtLargestBoldStayOnScreen() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ui-testing", "-ui-testing-text-xl-bold"]
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        assertFits(app, "home-greeting")
        assertFits(app, "metric-handicap")
        assertFits(app, "metric-tarjetas")
        assertFits(app, "metric-best-gross")
        saveShot("47_texto_xl_inicio")

        tapTab(app, "Resumen")
        XCTAssertTrue(waitFor(app, "screen-resumen", timeout: 6))
        assertFits(app, "range-count")
        assertFits(app, "metric-summary-best")
        saveShot("48_texto_xl_resumen")

        tapTab(app, "Rondas")
        XCTAssertTrue(waitFor(app, "screen-rondas", timeout: 6))
        saveShot("49_texto_xl_rondas")

        tapTab(app, "Cancha")
        XCTAssertTrue(waitFor(app, "screen-cancha", timeout: 6))
        assertFits(app, "metric-course-average")
        saveShot("50_texto_xl_cancha")

        tapTab(app, "Mi bolsa")
        XCTAssertTrue(waitFor(app, "screen-bolsa", timeout: 6))
        saveShot("51_texto_xl_bolsa")
    }

    private func assertHomeGreeting(_ name: String, hasTab: Bool) {
        let app = XCUIApplication()
        var args = ["-ui-testing", "-ui-testing-greeting", name]
        if !hasTab { args.append("-ui-testing-no-tee") }
        app.launchArguments = args
        app.launch()

        XCTAssertTrue(waitFor(app, "screen-inicio"), "Inicio no apareció para \(name)")
        XCTAssertTrue(waitFor(app, "home-ready", timeout: 10))
        let greeting = first(app, "home-greeting")
        XCTAssertTrue(greeting.waitForExistence(timeout: 6), "Falta Hola, \(name)")
        let spoken = greeting.label
        XCTAssertTrue(spoken.contains(name), "El saludo truncó \(name): \(spoken)")
        XCTAssertTrue(spoken.contains("Hola"), "Falta Hola: \(spoken)")
        XCTAssertLessThan(greeting.frame.height, 64, "El saludo se partió: \(greeting.frame)")

        if hasTab {
            let tab = first(app, "home-tee-tab")
            XCTAssertTrue(tab.waitForExistence(timeout: 4), "Falta la pestaña con \(name)")
            let g = greeting.frame
            let t = tab.frame
            XCTAssertFalse(
                g.intersects(t.insetBy(dx: 1, dy: 1)),
                "Hola, \(name) se pisa con el tab: \(g) vs \(t) en \(app.frame)"
            )
            XCTAssertGreaterThan(
                t.maxX,
                app.frame.maxX - 12,
                "El tab no está al borde derecho: \(t) in \(app.frame)"
            )
            if t.minY + 4 >= g.maxY {
                XCTAssertGreaterThan(t.minY, g.midY, "El tab no quedó debajo de \(name)")
            } else {
                XCTAssertLessThanOrEqual(g.maxX, t.minX + 3, "\(name) entra en el tab")
            }
            let shot = name == "Juan Bautista" ? "40_inicio_juan_bautista" : "40_inicio_\(name.lowercased())"
            saveShot(shot)
        } else {
            XCTAssertFalse(first(app, "home-tee-tab").waitForExistence(timeout: 1), "No debería haber tab")
        }
        app.terminate()
    }

    private func startAzulRound(_ app: XCUIApplication) {
        XCTAssertTrue(first(app, "course-118-jockey-azul").waitForExistence(timeout: 4))
        first(app, "course-118-jockey-azul").tap()
        XCTAssertTrue(
            first(app, "play-start-round").waitForExistence(timeout: 4) || waitFor(app, "screen-play-start", timeout: 4),
            "Falta Empezar ronda"
        )
        first(app, "play-start-round").tap()
    }

    private func submitLogin(_ app: XCUIApplication) {
        if app.keyboards.element.exists {
            app.swipeDown()
        }
        let submit = app.buttons["auth-submit"]
        XCTAssertTrue(submit.waitForExistence(timeout: 3))
        if submit.isHittable {
            submit.tap()
        } else {
            first(app, "auth-submit").tap()
        }
    }

    private func first(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        app.descendants(matching: .any)[id].firstMatch
    }

    private func largest(_ app: XCUIApplication, _ id: String) -> XCUIElement {
        let matches = app.descendants(matching: .any).matching(identifier: id)
        guard matches.firstMatch.waitForExistence(timeout: 3) else { return matches.firstMatch }
        var best = matches.firstMatch
        var bestArea: CGFloat = 0
        for index in 0..<matches.count {
            let element = matches.element(boundBy: index)
            let area = element.frame.width * element.frame.height
            if area > bestArea {
                bestArea = area
                best = element
            }
        }
        return best
    }

    private func tapLargest(_ app: XCUIApplication, _ id: String) {
        let button = app.buttons[id]
        let target = button.waitForExistence(timeout: 1) ? button : largest(app, id)
        if target.isHittable {
            target.tap()
            return
        }
        target.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
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

    private func dismissSheet(_ app: XCUIApplication, closeID: String, screenID: String) {
        dismissIfPresent(app, closeID)
        if first(app, screenID).waitForNonExistence(timeout: 3) { return }
        dismissIfPresent(app, closeID)
        if first(app, screenID).exists {
            app.swipeDown()
        }
        _ = first(app, screenID).waitForNonExistence(timeout: 3)
    }

    private func type(_ element: XCUIElement, _ text: String) {
        element.tap()
        let placeholders = [
            "Tu nombre",
            "vos@ejemplo.com",
            "Mínimo 8 caracteres",
            "Tu matrícula",
            "Tu número de matrícula",
            "La misma que usás en Golfistics",
            "La misma que para entrar a tu club",
            "Empezá a escribir, por ejemplo Manu"
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

    @discardableResult
    private func openClubsSheet(_ app: XCUIApplication, timeout: TimeInterval = 6) -> Bool {
        if first(app, "screen-ronda").exists {
            dismissSheet(app, closeID: "close-round", screenID: "screen-ronda")
        }
        for _ in 0..<4 { app.swipeDown() }
        let avatar = app.buttons["avatar-button"].exists ? app.buttons["avatar-button"] : first(app, "avatar-button")
        if avatar.waitForExistence(timeout: timeout) {
            if !avatar.isHittable {
                for _ in 0..<4 { app.swipeDown() }
            }
            if avatar.isHittable {
                avatar.tap()
            } else {
                avatar.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
            }
            if waitFor(app, "screen-notificaciones", timeout: 3) {
                let cuenta = first(app, "notifications-cuenta")
                if cuenta.waitForExistence(timeout: 4) {
                    if cuenta.isHittable {
                        cuenta.tap()
                    } else {
                        cuenta.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
                    }
                }
            }
            return waitFor(app, "screen-clubes", timeout: 6)
        }
        let addClub = app.buttons["add-club-home"]
        guard addClub.waitForExistence(timeout: 2), addClub.isHittable else { return false }
        addClub.tap()
        return true
    }

    private func revealHittable(_ app: XCUIApplication, _ element: XCUIElement) {
        if element.isHittable { return }
        let scroll = app.scrollViews.firstMatch
        for _ in 0..<6 {
            if element.isHittable { return }
            if scroll.exists {
                scroll.swipeUp()
            } else {
                app.swipeUp()
            }
        }
    }

    private func assertRangeMenu(_ app: XCUIApplication) {
        let menu = first(app, "range-menu")
        XCTAssertTrue(menu.waitForExistence(timeout: 4), "Falta el selector de período")
        menu.tap()
        let three = app.buttons["range-3m"].exists ? app.buttons["range-3m"] : first(app, "range-3m")
        if three.waitForExistence(timeout: 3) {
            three.tap()
        } else {
            app.menuItems["3 meses"].tap()
        }
        XCTAssertTrue(first(app, "range-count").waitForExistence(timeout: 3))
    }

    private func assertCanchaHoleGrid(_ app: XCUIApplication) {
        let ten = first(app, "hole-10")
        reveal(app, ten)
        XCTAssertTrue(ten.waitForExistence(timeout: 4), "Falta el hoyo 10")
        let one = first(app, "hole-1")
        let eleven = first(app, "hole-11")
        XCTAssertGreaterThan(app.frame.width, 300, "El test tiene que correr a ancho iPhone")
        XCTAssertGreaterThan(ten.frame.width, 44, "La tile del 10 quedó estrecha: \(ten.frame)")
        XCTAssertLessThan(ten.frame.height, 86, "La tile del 10 wrappea: \(ten.frame)")
        XCTAssertEqual(ten.frame.height, one.frame.height, accuracy: 6, "El 10 no debería ser más alto que el 1")
        XCTAssertEqual(ten.frame.minY, eleven.frame.minY, accuracy: 2, "10 y 11 tienen que compartir fila")

        let legend = first(app, "course-tee-legend")
        if legend.waitForExistence(timeout: 2) {
            XCTAssertLessThan(legend.frame.height, 72, "La leyenda de tees se partió: \(legend.frame)")
        }
        if first(app, "tee-azul").waitForExistence(timeout: 1) {
            XCTAssertLessThan(first(app, "tee-azul").frame.height, 28, "Azul wrappea: \(first(app, "tee-azul").frame)")
        }
        if first(app, "tee-blanco").waitForExistence(timeout: 1) {
            XCTAssertLessThan(first(app, "tee-blanco").frame.height, 28, "Blanco wrappea: \(first(app, "tee-blanco").frame)")
        }
    }

    private func reveal(_ app: XCUIApplication, _ element: XCUIElement) {
        var attempts = 0
        while !element.isHittable && attempts < 6 {
            app.swipeUp()
            attempts += 1
        }
    }

    private func assertFits(_ app: XCUIApplication, _ id: String) {
        XCTAssertTrue(first(app, id).waitForExistence(timeout: 5), "Falta \(id)")
        let element = largest(app, id)
        reveal(app, element)
        let screen = app.frame
        XCTAssertGreaterThan(element.frame.width, 8, "\(id) no tiene ancho")
        XCTAssertLessThanOrEqual(element.frame.maxX, screen.maxX + 2, "\(id) se sale a la derecha: \(element.frame) vs \(screen)")
        XCTAssertGreaterThanOrEqual(element.frame.minX, screen.minX - 2, "\(id) se sale a la izquierda: \(element.frame)")
        XCTAssertFalse(element.label.hasSuffix("…") || element.label.hasSuffix("..."), "\(id) truncado: \(element.label)")
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
