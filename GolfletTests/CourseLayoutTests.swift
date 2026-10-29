import SwiftUI
import XCTest
@testable import Golflet

final class CourseLayoutTests: XCTestCase {
    func testSixColumnsAtPhoneContentWidths() {
        XCTAssertEqual(CourseLayout.holeColumnCount(forWidth: 335), 6, "375pt iPhone minus 40pt padding")
        XCTAssertEqual(CourseLayout.holeColumnCount(forWidth: 353), 6, "393pt iPhone minus 40pt padding")
    }

    func testThreeColumnsWhenSixWouldBeTooNarrow() {
        XCTAssertEqual(CourseLayout.holeColumnCount(forWidth: 280), 3)
        XCTAssertEqual(CourseLayout.holeColumnCount(forWidth: 47), 3)
    }

    @MainActor
    func testHoleCellsStaySingleLineAt375And393() {
        let holes = sampleHoles()
        for deviceWidth in [375, 393] as [CGFloat] {
            let contentWidth = deviceWidth - 40
            XCTAssertEqual(CourseLayout.holeColumnCount(forWidth: contentWidth), 6)

            let cellWidth = (contentWidth - CourseLayout.holeSpacing * 5) / 6
            let ten = holes.first { $0.number == 10 }!
            let cellSize = fittedSize(
                of: CourseHoleCell(hole: ten, dark: true).golfletChrome(),
                width: cellWidth
            )
            XCTAssertLessThan(
                cellSize.height,
                78,
                "Hoyo 10 se wrappea a \(deviceWidth)pt (celda \(cellWidth)): \(cellSize)"
            )
            XCTAssertGreaterThan(cellSize.height, 40)

            let gridSize = fittedSize(
                of: CourseHolesGrid(holes: holes, hardest: [12, 14, 15], width: contentWidth)
                    .frame(width: contentWidth)
                    .golfletChrome(),
                width: contentWidth
            )
            XCTAssertLessThan(
                gridSize.height,
                280,
                "La grilla creció de más a \(deviceWidth)pt: \(gridSize)"
            )
            XCTAssertGreaterThan(gridSize.height, 140)
        }
    }

    @MainActor
    func testTeeLegendStaysSingleLineAt375And393() {
        let tees = [
            TeeRating(clubCode: "118", course: "Azul", tee: "Azul", courseRating: 70.4, slope: 116),
            TeeRating(clubCode: "118", course: "Azul", tee: "Blanco", courseRating: 69.8, slope: 113)
        ]
        for deviceWidth in [375, 393] as [CGFloat] {
            let contentWidth = deviceWidth - 40
            let size = fittedSize(
                of: CourseTeeLegend(tees: tees).frame(width: contentWidth).golfletChrome(),
                width: contentWidth
            )
            XCTAssertLessThan(size.height, 36, "La leyenda de tees se partió a \(deviceWidth)pt: \(size)")
            XCTAssertGreaterThan(size.width, contentWidth - 1)
        }
    }

    @MainActor
    private func fittedSize<V: View>(of view: V, width: CGFloat) -> CGSize {
        let host = UIHostingController(rootView: view)
        host.safeAreaRegions = []
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: width, height: 2000))
        window.rootViewController = host
        window.isHidden = false
        host.view.setNeedsLayout()
        host.view.layoutIfNeeded()
        return host.sizeThatFits(in: CGSize(width: width, height: 2000))
    }

    private func sampleHoles() -> [HoleStat] {
        (1...18).map { number in
            HoleStat(
                number: number,
                par: number % 6 == 0 ? 5 : (number % 3 == 0 ? 3 : 4),
                handicap: number,
                samples: 13,
                average: 4.5,
                averageToPar: number >= 10 ? 1.0 : 0.0,
                averageLast16: nil,
                best: 3,
                worst: 6,
                distribution: HoleDistribution(
                    eagleOrBetter: 0,
                    birdie: 2,
                    par: 6,
                    bogey: 4,
                    double: 1,
                    triplePlus: 0
                ),
                comparisons: []
            )
        }
    }
}
