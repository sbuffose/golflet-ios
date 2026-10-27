import XCTest
import CoreGraphics
@testable import Golflet

final class SyncProgressParserTests: XCTestCase {
    func testParsesNestedProgress() {
        let json: [String: Any] = [
            "progress": [
                "phase": "reading",
                "message": "Leyendo tarjetas · 34 de 97",
                "current": 34,
                "total": 97
            ]
        ]
        let progress = SyncProgressParser.parse(json)
        XCTAssertEqual(progress?.phase, .reading)
        XCTAssertEqual(progress?.line, "Leyendo tarjetas · 34 de 97")
        XCTAssertEqual(progress?.current, 34)
        XCTAssertEqual(progress?.total, 97)
    }

    func testParsesSSELine() {
        let progress = SyncProgressParser.parseLine(
            #"data: {"phase":"calculating","message":"Calculando tu hándicap"}"#
        )
        XCTAssertEqual(progress?.phase, .calculating)
        XCTAssertEqual(progress?.line, "Calculando tu hándicap")
    }

    func testFormatsReadingFallback() {
        let progress = SyncProgress(phase: .reading, message: "", current: 34, total: 97)
        XCTAssertEqual(progress.line, "Leyendo tarjetas · 34 de 97")
    }

    func testIgnoresBareSyncResult() {
        XCTAssertNil(SyncProgressParser.parse(["sync": ["ok": true, "message": "Listo"]]))
    }

    func testStagedConnectingCopy() {
        let step = SyncProgressParser.staged(
            clubName: "Jockey Club Argentino",
            elapsed: 1,
            knownCards: 97,
            compressed: false
        )
        XCTAssertEqual(step.phase, .connecting)
        XCTAssertEqual(step.line, "Conectando con Jockey Club Argentino")
    }

    func testStagedReadingCopy() {
        let step = SyncProgressParser.staged(
            clubName: "Jockey Club Argentino",
            elapsed: 40,
            knownCards: 97,
            compressed: false
        )
        XCTAssertEqual(step.phase, .reading)
        XCTAssertTrue(step.line.contains("Leyendo tarjetas ·"))
        XCTAssertTrue(step.line.contains("de 97"))
    }

    func testStagedHandicapCopy() {
        let step = SyncProgressParser.staged(
            clubName: "Jockey Club Argentino",
            elapsed: 80,
            knownCards: 97,
            compressed: false
        )
        XCTAssertEqual(step.phase, .calculating)
        XCTAssertEqual(step.line, "Calculando tu hándicap")
    }

    func testQuadPointEnds() {
        let p0 = CGPoint(x: 0, y: 10)
        let c = CGPoint(x: 5, y: 0)
        let p1 = CGPoint(x: 10, y: 10)
        let start = YardageBookLayout.quadPoint(t: 0, p0: p0, control: c, p1: p1)
        let end = YardageBookLayout.quadPoint(t: 1, p0: p0, control: c, p1: p1)
        XCTAssertEqual(start.x, 0, accuracy: 0.001)
        XCTAssertEqual(end.x, 10, accuracy: 0.001)
        XCTAssertEqual(end.y, 10, accuracy: 0.001)
    }
}
