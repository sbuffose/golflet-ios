import XCTest
@testable import Golflet

final class AuthAPITests: XCTestCase {
    func testGolfisticsSignInSuccess() async throws {
        let api = MockAPIClient(autoSession: false)
        XCTAssertFalse(api.isAuthenticated)
        let session = try await api.signInGolfistics(matricula: "94506", clave: "secreta", savePassword: true)
        XCTAssertFalse(session.needsFirstSync)
        XCTAssertTrue(api.isAuthenticated)
    }

    func testGolfisticsRejected() async {
        let api = MockAPIClient(autoSession: false)
        do {
            _ = try await api.signInGolfistics(matricula: "0000000", clave: "x", savePassword: true)
            XCTFail("Tenía que rechazar la matrícula")
        } catch let error as GolfletError {
            let failure = error.authFailure
            XCTAssertEqual(failure?.code, "GOLFISTICS_REJECTED")
            XCTAssertEqual(failure?.message, AuthCopy.rejected.message)
            XCTAssertEqual(failure?.golfisticsURL, AuthCopy.golfisticsURL)
            XCTAssertTrue(failure?.showsGolfisticsButton == true)
            XCTAssertEqual(failure?.bannerID, "auth-rejected")
        } catch {
            XCTFail("Error inesperado")
        }
        XCTAssertFalse(api.isAuthenticated)
    }

    func testGolfisticsUnavailable() async {
        let api = MockAPIClient(autoSession: false)
        do {
            _ = try await api.signInGolfistics(matricula: "down", clave: "x", savePassword: false)
            XCTFail("Tenía que avisar la caída")
        } catch let error as GolfletError {
            XCTAssertEqual(error.authFailure?.code, "GOLFISTICS_UNAVAILABLE")
            XCTAssertTrue(error.authFailure?.isUnavailable == true)
            XCTAssertFalse(error.authFailure?.showsGolfisticsButton == true)
            XCTAssertEqual(error.authFailure?.bannerID, "auth-unavailable")
        } catch {
            XCTFail("Error inesperado")
        }
    }

    func testGolfisticsRateLimit() async {
        let api = MockAPIClient(autoSession: false)
        do {
            _ = try await api.signInGolfistics(matricula: "429", clave: "x", savePassword: true)
            XCTFail("Tenía que frenar por 429")
        } catch let error as GolfletError {
            XCTAssertEqual(error.authFailure?.code, "TOO_MANY_ATTEMPTS")
            XCTAssertEqual(error.authFailure?.retryAfterS, 900)
            XCTAssertTrue(error.authFailure?.showsGolfisticsButton == true)
            XCTAssertEqual(error.authFailure?.bannerID, "auth-rate-limit")
        } catch {
            XCTFail("Error inesperado")
        }
    }

    func testFirstSyncAfterSignIn() async throws {
        let api = MockAPIClient(autoSession: false)
        let session = try await api.signInGolfistics(matricula: "first", clave: "ok", savePassword: true)
        XCTAssertTrue(session.needsFirstSync)
        XCTAssertTrue(api.isAuthenticated)
        let result = try await api.startFirstSync(progressID: "progress-1")
        XCTAssertTrue(result.ok)
        let snap = try await api.bootstrap()
        XCTAssertFalse(snap.clubs.isEmpty)
        XCTAssertNil(snap.user?.visibleEmail)
    }

    func testParsesAuthFailureAndSession() {
        let rejected = LivePayloadMapper.authFailure(status: 401, json: [
            "code": "GOLFISTICS_REJECTED",
            "message": "No pudimos entrar a Golfistics con esa matrícula y clave.",
            "hint": "Configurala en Golfistics.",
            "golfistics_url": "https://app.golfistics.com/golf/golfisticsapp_login.php"
        ])
        XCTAssertEqual(rejected.code, "GOLFISTICS_REJECTED")
        XCTAssertEqual(rejected.golfisticsURL?.host, "app.golfistics.com")

        let limited = LivePayloadMapper.authFailure(status: 429, json: [
            "code": "TOO_MANY_ATTEMPTS",
            "message": "Esperá.",
            "retry_after_s": 900
        ])
        XCTAssertEqual(limited.retryAfterS, 900)

        let down = LivePayloadMapper.authFailure(status: 503, json: [
            "code": "GOLFISTICS_UNAVAILABLE",
            "message": "Golfistics no responde en este momento."
        ])
        XCTAssertTrue(down.isUnavailable)

        let session = LivePayloadMapper.golfisticsSession(from: [
            "token": "abc",
            "new_account": true,
            "needs_first_sync": true,
            "player": ["name": "Buffo Sempé", "handicap_index": 7.4]
        ])
        XCTAssertTrue(session.needsFirstSync)
        XCTAssertTrue(session.newAccount)
        XCTAssertEqual(session.userName, "Buffo Sempé")
    }

    func testEmptyCredentialsAreBadInput() async {
        let api = MockAPIClient(autoSession: false)
        do {
            _ = try await api.signInGolfistics(matricula: "  ", clave: "", savePassword: true)
            XCTFail("Tenía que pedir matrícula y clave")
        } catch let error as GolfletError {
            XCTAssertEqual(error.authFailure?.code, "BAD_INPUT")
        } catch {
            XCTFail("Error inesperado")
        }
    }
}
