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

    func testAzulHolesKeepStoredGeometry() {
        let hole10 = AzulCourse.layout(forCourse: "Azul", hole: 10, playedOn: "2026-11-22")
        let hole10Legacy = AzulCourse.layout(forCourse: "Azul", hole: 10, playedOn: "2026-10-04")
        let hole1 = AzulCourse.layout(forCourse: "Azul", hole: 1)
        let hole12 = AzulCourse.layout(forCourse: "Azul", hole: 12, playedOn: AzulCourse.legacyDay)
        let hole3 = AzulCourse.layout(forCourse: "Azul", hole: 3, playedOn: "2026-11-22")
        XCTAssertEqual(hole10?.number, 10)
        XCTAssertEqual(hole10?.line.first?.lat ?? 0, hole10Legacy?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertNotEqual(hole10?.line.first?.lat, hole1?.line.first?.lat)
        XCTAssertNotEqual(hole12?.line.first?.lat, hole3?.line.first?.lat)
        XCTAssertFalse(AzulCourse.currentLayout(playedOn: nil))
        XCTAssertFalse(AzulCourse.currentLayout(playedOn: "2026-11-22"))
        XCTAssertEqual(AzulCourse.nineSwap(AzulCourse.nineSwap(3)), 3)
    }
}
