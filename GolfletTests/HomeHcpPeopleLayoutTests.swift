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
        XCTAssertEqual(HomeHcpPeopleLayout.profesorAvatar, 28)
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
        XCTAssertEqual(
            HomeGreetingLayout.place(availableWidth: se, greetingIdealWidth: ana, tabWidth: tab),
            .sideBySide
        )
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
                [sampleProfesor("p-1", "Manu García")],
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
            XCTAssertLessThan(size.height, 160)
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
