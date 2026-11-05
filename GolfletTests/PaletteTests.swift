import XCTest
@testable import Golflet

final class PaletteTests: XCTestCase {
    func testBrandHexMatchesUSGAPalette() {
        XCTAssertEqual(BrandHex.navy, 0x0B2545)
        XCTAssertEqual(BrandHex.red, 0xC8102E)
        XCTAssertEqual(BrandHex.white, 0xFFFFFF)
        XCTAssertEqual(HomeHcpPeopleLayout.accent, BrandHex.red)
    }
}
