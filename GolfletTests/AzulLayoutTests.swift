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

    func testAzulNinesSwapFrom22November() {
        let current12 = AzulCourse.layout(forCourse: "Azul", hole: 12)
        let legacy3 = AzulCourse.layout(forCourse: "Azul", hole: 3, playedOn: "2026-10-04")
        let legacy12 = AzulCourse.layout(forCourse: "Azul", hole: 12, playedOn: AzulCourse.legacyDay)
        XCTAssertEqual(current12?.number, 12)
        XCTAssertEqual(current12?.line.first?.lat ?? 0, legacy3?.line.first?.lat ?? 1, accuracy: 0.0000001)
        XCTAssertNotEqual(current12?.line.first?.lat, legacy12?.line.first?.lat)
        XCTAssertEqual(AzulCourse.nineSwap(AzulCourse.nineSwap(3)), 3)
        XCTAssertEqual(AzulCourse.layout(forCourse: "Azul", hole: 1)?.line.first?.lat ?? 0, AzulCourse.layout(forCourse: "Azul", hole: 10, playedOn: "2026-10-04")?.line.first?.lat ?? 1, accuracy: 0.0000001)
    }
}
