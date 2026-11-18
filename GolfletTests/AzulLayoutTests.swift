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
}
