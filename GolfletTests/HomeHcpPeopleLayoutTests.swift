import SwiftUI
import XCTest
@testable import Golflet

final class HomeHcpPeopleLayoutTests: XCTestCase {
    func testColumnFitsOn320Content() {
        let width = HomeHcpPeopleLayout.seContentWidth
        XCTAssertEqual(width, 280)
        XCTAssertLessThanOrEqual(HomeHcpPeopleLayout.columnWidth(profesorCount: 0, groupCount: 0), width)
        XCTAssertLessThanOrEqual(HomeHcpPeopleLayout.columnWidth(profesorCount: 1, groupCount: 1), width)
        XCTAssertLessThanOrEqual(HomeHcpPeopleLayout.columnWidth(profesorCount: 4, groupCount: 5), width)
        XCTAssertEqual(HomeHcpPeopleLayout.gold, 0xC8A86A)
        XCTAssertEqual(HomeHcpPeopleLayout.celeste, 0x75AADB)
        XCTAssertEqual(HomeHcpPeopleLayout.profesorAvatar, 28)
        XCTAssertNil(HomeHcpPeopleLayout.profesorCaption(0))
        XCTAssertNil(HomeHcpPeopleLayout.profesorCaption(1))
        XCTAssertEqual(HomeHcpPeopleLayout.profesorCaption(2), "2 profes")
        XCTAssertEqual(HomeHcpPeopleLayout.profesorCaption(5), "5 profes")
        XCTAssertEqual(HomeHcpPeopleLayout.addLabel, "Agregar profesor")
        XCTAssertEqual(HomeHcpPeopleLayout.seWidth, 320)
        XCTAssertEqual(HomeHcpPeopleLayout.seCardWidth, 240)
        XCTAssertEqual(
            HomeHcpPeopleLayout.profesorWidth(count: 4),
            HomeHcpPeopleLayout.profesorWidth(count: 3),
            "Más de 3 profesores no suman un chip +N"
        )
        XCTAssertGreaterThan(HomeHcpPeopleLayout.profesorWidth(count: 0), HomeHcpPeopleLayout.profesorAvatar)
    }

    func testPeopleMoveAboveOn320OrCollision() {
        let people = HomeHcpPeopleLayout.columnWidth(profesorCount: 0, groupCount: 0)
        let number = HomeHcpPeopleLayout.numberWidth(3.1)
        XCTAssertEqual(
            HomeHcpPeopleLayout.place(cardWidth: HomeHcpPeopleLayout.seCardWidth, numberWidth: number, peopleWidth: people),
            .above
        )
        XCTAssertEqual(
            HomeHcpPeopleLayout.place(
                cardWidth: HomeHcpPeopleLayout.cardInnerWidth(screenWidth: 390),
                numberWidth: number,
                peopleWidth: people
            ),
            .beside
        )
        XCTAssertEqual(
            HomeHcpPeopleLayout.place(cardWidth: 310, numberWidth: 220, peopleWidth: 110),
            .above
        )
    }

    func testGreetingRuleUnchangedOn320() {
        let tab = HomeGreetingLayout.tabWidth(chipWhen: "Sáb 31 · 12:33")
        let se = HomeGreetingLayout.availableWidth(screenWidth: HomeGreetingLayout.seWidth, hasTab: true)
        XCTAssertEqual(HomeGreetingLayout.seWidth, 320)
        XCTAssertEqual(HomeGreetingLayout.minSize, 28)
        XCTAssertEqual(HomeGreetingLayout.tabReserve, 12)
        let reserved = HomeGreetingLayout.reservedTabWidth(tab)
        XCTAssertEqual(reserved, tab + 12)
        let ana = HomeGreetingLayout.greetingWidth(HomeGreetingLayout.text("Ana"))
        let anaPlace = HomeGreetingLayout.place(availableWidth: se, greetingIdealWidth: ana, tabWidth: tab)
        if ana + reserved <= se {
            XCTAssertEqual(anaPlace, .sideBySide)
        } else {
            XCTAssertEqual(anaPlace, .sideBySideShrunk, "Ana en 320 se achica; no baja el tab")
        }
        XCTAssertNotEqual(anaPlace, .stacked)
        let long = HomeGreetingLayout.greetingWidth(HomeGreetingLayout.text("Juan Bautista"))
        XCTAssertEqual(
            HomeGreetingLayout.place(availableWidth: se, greetingIdealWidth: long, tabWidth: tab),
            .stacked
        )
    }

    @MainActor
    func testStackedPeopleFitAt320() {
        let content = HomeHcpPeopleLayout.seContentWidth
        let cases: [(profesores: [Profesor], groups: [GolfletGroup])] = [
            ([], []),
            ([sampleProfesor("p-1", "Manu García")], []),
            ([], [sampleGroup("g-1", "Sábados")]),
            (
                [sampleProfesor("p-1", "Manu García"), sampleProfesor("p-2", "Lucía Fernández")],
                (1...5).map { sampleGroup("g-\($0)", "Grupo \($0)") }
            )
        ]
        for (profesores, groups) in cases {
            let size = fittedSize(
                of: HomeHcpPeople(
                    profesores: profesores,
                    groups: groups,
                    onProfesor: { _ in },
                    onProfesores: {},
                    onAddProfesor: {},
                    onGroups: {},
                    onCreate: {}
                )
                .padding(20)
                .background(Color(hex: 0x0F3D2E))
                .golfletChrome(),
                width: content
            )
            XCTAssertLessThanOrEqual(
                size.width,
                content + 1,
                "La columna HCP se pasa de 320pt (\(profesores.count)p/\(groups.count)g): \(size)"
            )
            XCTAssertGreaterThan(size.height, 70, "La columna HCP tiene que ir apilada")
            XCTAssertLessThan(size.height, 200)
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

    private func sampleProfesor(_ id: String, _ name: String) -> Profesor {
        Profesor(
            id: id,
            name: name,
            photoURL: nil,
            verified: true,
            locations: [],
            bio: nil,
            pending: false,
            canViewMetrics: false,
            canHearAudio: false,
            newContent: 0
        )
    }

    private func sampleGroup(_ id: String, _ name: String) -> GolfletGroup {
        let owner = GroupMember(
            id: "u-1",
            name: "Jugador",
            initials: "JU",
            photoURL: nil,
            role: .admin,
            isOwner: true
        )
        return GolfletGroup(
            id: id,
            name: name,
            photoURL: nil,
            owner: owner,
            members: [owner],
            myRole: .admin,
            invite: nil
        )
    }
}
