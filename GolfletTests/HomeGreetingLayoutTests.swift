import XCTest
@testable import Golflet

final class HomeGreetingLayoutTests: XCTestCase {
    private let names = ["Agustin", "Maximiliano", "Juan Bautista"]
    private let chip = "Sáb 31 · 12:33"

    func testGreetingNeverTruncatesAndTabMovesBelowWhenNeeded() {
        let tab = HomeGreetingLayout.tabWidth(chipWhen: chip)
        XCTAssertGreaterThan(tab, 120)
        XCTAssertLessThan(tab, 220)

        let widths: [(String, CGFloat)] = [
            ("SE", HomeGreetingLayout.seWidth),
            ("SE Max", HomeGreetingLayout.seMaxWidth),
            ("standard", HomeGreetingLayout.standardWidth)
        ]

        for name in names {
            let label = HomeGreetingLayout.text(name)
            XCTAssertTrue(label.hasPrefix("Hola, "))
            XCTAssertTrue(label.contains(name))
            let ideal = HomeGreetingLayout.greetingWidth(label)
            XCTAssertGreaterThan(ideal, 80, "No midió \(label)")

            for (device, screen) in widths {
                let withTab = HomeGreetingLayout.availableWidth(screenWidth: screen, hasTab: true)
                let withoutTab = HomeGreetingLayout.availableWidth(screenWidth: screen, hasTab: false)
                let placement = HomeGreetingLayout.place(
                    availableWidth: withTab,
                    greetingIdealWidth: ideal,
                    tabWidth: tab
                )
                let compact = ideal * HomeGreetingLayout.compactScale
                if compact + HomeGreetingLayout.spacing + tab <= withTab {
                    XCTAssertEqual(placement, .sideBySide, "\(name) debería compartir fila en \(device)")
                } else {
                    XCTAssertEqual(placement, .stacked, "\(name) debería bajar el tab en \(device)")
                }

                let alone = HomeGreetingLayout.place(
                    availableWidth: withoutTab,
                    greetingIdealWidth: ideal,
                    tabWidth: nil
                )
                XCTAssertEqual(alone, .sideBySide, "Sin tee time no hay tab que bajar (\(name) \(device))")
                XCTAssertGreaterThan(
                    withoutTab,
                    ideal * HomeGreetingLayout.minScale,
                    "\(name) no entra ni achicado en \(device) sin tab"
                )
            }
        }
    }

    func testLongNamesStackOnSE() {
        let tab = HomeGreetingLayout.tabWidth(chipWhen: chip)
        let se = HomeGreetingLayout.availableWidth(screenWidth: HomeGreetingLayout.seWidth, hasTab: true)
        for name in ["Maximiliano", "Juan Bautista"] {
            let ideal = HomeGreetingLayout.greetingWidth(HomeGreetingLayout.text(name))
            XCTAssertEqual(
                HomeGreetingLayout.place(availableWidth: se, greetingIdealWidth: ideal, tabWidth: tab),
                .stacked,
                "\(name) no puede compartir fila con el tab en iPhone SE"
            )
        }
    }
}
