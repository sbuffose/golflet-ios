import XCTest
@testable import Golflet

final class AppIconBundleTests: XCTestCase {
    func testHostBundleHasGeistAndAssetCatalog() {
        XCTAssertNotNil(
            Bundle.main.url(forResource: "Geist-Regular", withExtension: "otf"),
            "Geist-Regular.otf must ship in the .app"
        )
        XCTAssertNotNil(
            Bundle.main.url(forResource: "Assets", withExtension: "car"),
            "Assets.car must ship so the compiled AppIcon catalog is in the bundle"
        )
    }
}
