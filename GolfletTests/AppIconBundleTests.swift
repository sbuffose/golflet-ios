import XCTest
@testable import Golflet

final class AppIconBundleTests: XCTestCase {
    func testAppStore120IconIsLooseInHostBundle() {
        let url = Bundle.main.url(forResource: "AppIcon60@2x", withExtension: "png")
        XCTAssertNotNil(url, "ASC requires AppIcon60@2x.png (120x120) in the .app root")
        guard let url else { return }
        let data = try? Data(contentsOf: url)
        XCTAssertNotNil(data)
        XCTAssertGreaterThan(data?.count ?? 0, 0)
    }
}
