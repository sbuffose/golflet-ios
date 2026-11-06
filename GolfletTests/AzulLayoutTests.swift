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
        XCTAssertNil(AzulCourse.layout(forCourse: "Colorada", hole: 2))
        XCTAssertNil(AzulCourse.layout(forCourse: "Cancha Nueva", hole: 1))
        XCTAssertNil(AzulCourse.layout(forCourse: "Azul", hole: 99))
    }
}
