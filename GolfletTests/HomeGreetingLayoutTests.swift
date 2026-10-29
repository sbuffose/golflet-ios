import XCTest
@testable import Golflet

final class HomeGreetingLayoutTests: XCTestCase {
    private let longNames = ["Guillermo", "Maximiliano", "Juan Bautista"]
    private let chip = "Sáb 31 · 12:33"

    func testDoesNotShrinkNamesThatAlreadyFit() {
        let tab = HomeGreetingLayout.tabWidth(chipWhen: chip)
        let phone = HomeGreetingLayout.availableWidth(screenWidth: HomeGreetingLayout.standardWidth, hasTab: true)
        let agustin = HomeGreetingLayout.greetingWidth(HomeGreetingLayout.text("Agustin"))
        XCTAssertEqual(
            HomeGreetingLayout.place(availableWidth: phone, greetingIdealWidth: agustin, tabWidth: tab),
            .sideBySide,
            "Agustin entra a tamaño completo; no achicar"
        )
        XCTAssertLessThanOrEqual(agustin + HomeGreetingLayout.spacing + tab, phone)
    }

    func testLongNamesShrinkOrStack() {
        let tab = HomeGreetingLayout.tabWidth(chipWhen: chip)
        XCTAssertGreaterThan(tab, 120)
        XCTAssertLessThan(tab, 220)

        let widths: [(String, CGFloat)] = [
            ("SE", HomeGreetingLayout.seWidth),
            ("SE Max", HomeGreetingLayout.seMaxWidth),
            ("standard", HomeGreetingLayout.standardWidth)
        ]

        for name in longNames {
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
                if ideal + HomeGreetingLayout.spacing + tab <= withTab {
                    XCTAssertEqual(placement, .sideBySide, "\(name) entra entero en \(device)")
                } else if ideal * HomeGreetingLayout.compactScale + HomeGreetingLayout.spacing + tab <= withTab {
                    XCTAssertEqual(placement, .sideBySideShrunk, "\(name) se achica en \(device)")
                } else {
                    XCTAssertEqual(placement, .stacked, "\(name) baja el tab en \(device)")
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
        for name in longNames {
            let ideal = HomeGreetingLayout.greetingWidth(HomeGreetingLayout.text(name))
            let placement = HomeGreetingLayout.place(availableWidth: se, greetingIdealWidth: ideal, tabWidth: tab)
            XCTAssertNotEqual(placement, .sideBySide, "\(name) no entra a tamaño completo en iPhone SE")
        }
    }
}
