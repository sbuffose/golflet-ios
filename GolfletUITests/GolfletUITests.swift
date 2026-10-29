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

        if openClubsSheet(app, timeout: 3) {
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
        XCTAssertTrue(first(app, "range-menu").waitForExistence(timeout: 4), "Falta el selector de período")
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
        XCTAssertTrue(first(app, "course-118-jockey-azul").waitForExistence(timeout: 4))
        first(app, "course-118-jockey-azul").tap()
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
        first(app, "invite-accept").tap()
        XCTAssertTrue(waitFor(app, "screen-grupo", timeout: 8), "Aceptar no abrió el grupo")
        saveShot("35_grupo_aceptado")
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

    @discardableResult
    private func openClubsSheet(_ app: XCUIApplication, timeout: TimeInterval = 6) -> Bool {
        let addClub = app.buttons["add-club-home"]
        if addClub.waitForExistence(timeout: timeout) {
            revealHittable(app, addClub)
            if addClub.isHittable {
                addClub.tap()
                return true
            }
        }
        let avatar = first(app, "avatar-button")
        guard avatar.waitForExistence(timeout: 3) else { return false }
        avatar.tap()
        if first(app, "notifications-cuenta").waitForExistence(timeout: 4) {
            first(app, "notifications-cuenta").tap()
        }
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
