import XCTest
@testable import Golflet

final class ClubGearTests: XCTestCase {
    func testPhotosStayOnTheirModel() {
        XCTAssertEqual(ClubGear.photo(brand: "Titleist", model: "GT2", face: "driver")?.file, "titleist-gt2-driver.jpg")
        XCTAssertEqual(ClubGear.photo(brand: "Titleist", model: "GT2", face: "fairway")?.file, "titleist-gt2-fairway.jpg")
        XCTAssertNil(ClubGear.photo(brand: "Titleist", model: "GT2", face: "hybrid"))
        XCTAssertNil(ClubGear.photo(brand: "Titleist", model: "GT3", face: "driver"))
        XCTAssertEqual(ClubGear.photo(brand: "Titleist", model: "T150", face: "iron")?.file, "titleist-t150-iron.jpg")
        XCTAssertNil(ClubGear.photo(brand: "Titleist", model: nil, face: "hybrid"))
    }

    func testPlayersMatchTheCheckedModel() {
        XCTAssertEqual(ClubGear.users(brand: "Titleist", model: "GT2", face: "driver").map(\.name), ["Will Zalatoris", "Cameron Young", "Bud Cauley"])
        XCTAssertEqual(ClubGear.users(brand: "Titleist", model: "GT2", face: "fairway").map(\.name), ["Cameron Young", "Bud Cauley"])
        XCTAssertTrue(ClubGear.users(brand: "Titleist", model: "GT2", face: "hybrid").isEmpty)
        XCTAssertEqual(ClubGear.users(brand: "Titleist", model: "T150", face: "iron").map(\.name), ["Will Zalatoris"])
        XCTAssertTrue(ClubGear.users(brand: "Titleist", model: nil, face: "wedge").isEmpty)
        XCTAssertEqual(FixtureBag.modeled.count, 14)
        XCTAssertNil(FixtureBag.modeled.first { $0.name == "Híbrido" }?.modelName)
    }
}
