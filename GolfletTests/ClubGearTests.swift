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
        let bag = [
            BagClub(name: "Driver", carry: 285),
            BagClub(name: "Madera 3", carry: 230),
            BagClub(name: "PW", carry: 120),
        ]
        let gear = [
            BagClub(name: "Driver", brand: "Titleist", modelName: "GT2", code: "Dr"),
            BagClub(name: "Madera 3", brand: "Titleist", modelName: "GT2", code: "3W"),
            BagClub(name: "Pitching wedge", code: "PW"),
        ]
        let rows = ClubGear.attach(bag: bag, equipment: gear)
        XCTAssertEqual(rows[0].brand, "Titleist")
        XCTAssertEqual(rows[0].modelName, "GT2")
        XCTAssertEqual(ClubGear.photo(brand: rows[0].brand, model: rows[0].modelName, face: "driver")?.file, "titleist-gt2-driver.jpg")
        XCTAssertEqual(ClubGear.photo(brand: rows[1].brand, model: rows[1].modelName, face: "fairway")?.file, "titleist-gt2-fairway.jpg")
        XCTAssertNil(rows[2].brand)
        XCTAssertEqual(FixtureBag.modeled.count, 14)
        XCTAssertNil(FixtureBag.modeled.first { $0.name == "Híbrido" }?.modelName)
    }
}
