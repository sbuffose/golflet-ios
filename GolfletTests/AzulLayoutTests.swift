import XCTest
@testable import Golflet

final class AzulLayoutTests: XCTestCase {
    func testJockeyAzulUsesRealHoleGeometry() {
        let geo = AzulCourse.layout(forCourse: "Azul", hole: 2)
        XCTAssertEqual(geo?.number, 2)
        XCTAssertGreaterThanOrEqual(geo?.green.count ?? 0, 3)
        XCTAssertGreaterThanOrEqual(geo?.line.count ?? 0, 2)
        XCTAssertNotNil(AzulCourse.layout(forCourse: "Cancha Azul", hole: 1))
    }

    func testOtherCoursesDoNotUseAzulGeometry() {
        let colorada = AzulCourse.layout(forCourse: "Colorada", hole: 2)
        let azul = AzulCourse.layout(forCourse: "Azul", hole: 2)
        XCTAssertEqual(colorada?.line.count, 2)
        XCTAssertEqual(colorada?.green.count, 0, "Colorada no usa el polígono del green de la Azul")
        XCTAssertNotEqual(colorada?.line.first?.lat, azul?.line.first?.lat)
        XCTAssertNil(AzulCourse.layout(forCourse: "Colorada", hole: 99))
        XCTAssertNil(AzulCourse.layout(forCourse: "Cancha Nueva", hole: 1))
        XCTAssertNil(AzulCourse.layout(forCourse: "Azul", hole: 99))
    }

    func testAzulSwapsOnlyTheMiddleHoles() {
        let current3 = AzulCourse.layout(forCourse: "Azul", hole: 3, playedOn: "2026-11-22")
        let legacy12 = AzulCourse.layout(forCourse: "Azul", hole: 12, playedOn: AzulCourse.legacyDay)
        let current12 = AzulCourse.layout(forCourse: "Azul", hole: 12, playedOn: "2026-11-22")
        let legacy3 = AzulCourse.layout(forCourse: "Azul", hole: 3, playedOn: "2026-10-04")
        let hole10 = AzulCourse.layout(forCourse: "Azul", hole: 10, playedOn: "2026-11-22")
        let hole10Legacy = AzulCourse.layout(forCourse: "Azul", hole: 10, playedOn: "2026-10-04")
        let hole1 = AzulCourse.layout(forCourse: "Azul", hole: 1, playedOn: "2026-11-22")
        let hole2 = AzulCourse.layout(forCourse: "Azul", hole: 2, playedOn: "2026-11-22")
        let hole2Legacy = AzulCourse.layout(forCourse: "Azul", hole: 2, playedOn: "2026-10-04")
        let hole11 = AzulCourse.layout(forCourse: "Azul", hole: 11, playedOn: "2026-11-22")
        let hole11Legacy = AzulCourse.layout(forCourse: "Azul", hole: 11, playedOn: "2026-10-04")
        XCTAssertEqual(current3?.number, 3)
        XCTAssertEqual(current3?.line.first?.lat ?? 0, legacy12?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertEqual(current12?.line.first?.lat ?? 0, legacy3?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertEqual(hole10?.line.first?.lat ?? 0, hole10Legacy?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertNotEqual(hole10?.line.first?.lat, hole1?.line.first?.lat)
        XCTAssertEqual(hole2?.line.first?.lat ?? 0, hole2Legacy?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertEqual(hole11?.line.first?.lat ?? 0, hole11Legacy?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertTrue(AzulCourse.currentLayout(playedOn: nil))
        XCTAssertTrue(AzulCourse.currentLayout(playedOn: "2026-11-22"))
        XCTAssertFalse(AzulCourse.currentLayout(playedOn: "2026-10-04"))
        for n in 1...18 {
            XCTAssertEqual(AzulCourse.nineSwap(AzulCourse.nineSwap(n)), n)
        }
        XCTAssertEqual(AzulCourse.nineSwap(1), 1)
        XCTAssertEqual(AzulCourse.nineSwap(2), 2)
        XCTAssertEqual(AzulCourse.nineSwap(10), 10)
        XCTAssertEqual(AzulCourse.nineSwap(11), 11)
        XCTAssertEqual(AzulCourse.nineSwap(3), 12)
        XCTAssertEqual(AzulCourse.nineSwap(9), 18)
        XCTAssertEqual(AzulCourse.hole(3, playedOn: "2026-11-22").par, 4)
        XCTAssertEqual(AzulCourse.hole(7, playedOn: "2026-11-22").par, 4)
        XCTAssertEqual(AzulCourse.hole(8, playedOn: "2026-11-22").par, 5)
        XCTAssertEqual(AzulCourse.hole(16, playedOn: "2026-11-22").par, 3)
        XCTAssertEqual(AzulCourse.hole(17, playedOn: "2026-11-22").par, 4)
    }
}
