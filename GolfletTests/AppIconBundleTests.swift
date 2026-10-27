import XCTest
@testable import Golflet

final class AppIconBundleTests: XCTestCase {
    func testAppStore120IconIsLooseInHostBundle() {
        let catalogName = Bundle.main.url(forResource: "AppIcon60@2x", withExtension: "png")
        let legacyName = Bundle.main.url(forResource: "Icon-60@2x", withExtension: "png")
        XCTAssertNotNil(catalogName, "ASC requires AppIcon60@2x.png (120x120) in the .app root")
        XCTAssertNotNil(legacyName, "ASC also looks up Icon-60@2x.png via CFBundleIconFiles")
        for url in [catalogName, legacyName].compactMap({ $0 }) {
            let data = try? Data(contentsOf: url)
            XCTAssertNotNil(data)
            XCTAssertGreaterThan(data?.count ?? 0, 0)
        }
    }

    func testHostBundleHasGeistAndAssetCatalog() {
        XCTAssertNotNil(
            Bundle.main.url(forResource: "Geist-Regular", withExtension: "otf"),
            "Geist-Regular.otf must ship in the .app"
        )
        XCTAssertNotNil(
            Bundle.main.url(forResource: "Assets", withExtension: "car"),
            "Assets.car must ship so ASC can see the 1024 Any Appearance icon"
        )
    }
}
