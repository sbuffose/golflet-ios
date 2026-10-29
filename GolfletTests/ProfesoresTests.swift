import XCTest
@testable import Golflet

final class ProfesoresTests: XCTestCase {
    func testParsesLinkedProfesoresList() {
        let json: [String: Any] = [
            "profesores": [
                [
                    "profesor_id": "p-manu",
                    "name": "Manu García",
                    "photo_url": "https://golflet.vercel.app/p.jpg",
                    "verified": true,
                    "locations": ["Jockey Club", "Olivos"],
                    "bio": "Clases en cancha",
                    "can_view_metrics": true,
                    "new_content": 2
                ],
                [
                    "id": "p-lucia",
                    "display_name": "Lucía Fernández",
                    "is_verified": 0,
                    "clubs": "Olivos Golf Club",
                    "pending": true
                ]
            ]
        ]
        let list = ProfesoresParser.list(from: json)
        XCTAssertEqual(list.count, 2)
        XCTAssertEqual(list[0].id, "p-manu")
        XCTAssertEqual(list[0].name, "Manu García")
        XCTAssertEqual(list[0].photoURL, "https://golflet.vercel.app/p.jpg")
        XCTAssertTrue(list[0].verified)
        XCTAssertEqual(list[0].locations, ["Jockey Club", "Olivos"])
        XCTAssertEqual(list[0].bio, "Clases en cancha")
        XCTAssertTrue(list[0].canViewMetrics)
        XCTAssertEqual(list[0].newContent, 2)
        XCTAssertEqual(list[0].initials, "MG")
        XCTAssertEqual(list[1].id, "p-lucia")
        XCTAssertFalse(list[1].verified)
        XCTAssertTrue(list[1].pending)
        XCTAssertEqual(list[1].locations, ["Olivos Golf Club"])
    }

    func testParsesCombinedInicioField() {
        let single: [String: Any] = [
            "inicio": [
                "profesor": [
                    "profesor_id": "p-1",
                    "name": "Ana Pérez",
                    "verified": "true",
                    "avatar_url": "https://golflet.vercel.app/a.jpg"
                ]
            ]
        ]
        let one = ProfesoresParser.list(from: single)
        XCTAssertEqual(one.count, 1)
        XCTAssertEqual(one[0].id, "p-1")
        XCTAssertEqual(one[0].name, "Ana Pérez")
        XCTAssertTrue(one[0].verified)
        XCTAssertEqual(one[0].photoURL, "https://golflet.vercel.app/a.jpg")

        let many: [String: Any] = [
            "inicio": [
                "profesores": [
                    ["profesor_id": "a", "name": "Ana"],
                    ["profesor_id": "b", "name": "Bruno", "verified": true]
                ]
            ]
        ]
        XCTAssertEqual(ProfesoresParser.list(from: many).map(\.id), ["a", "b"])
    }

    func testSnapshotReadsProfesoresFromData() {
        let json: [String: Any] = [
            "player": ["name": "Jugador Demo", "handicap_index": 3.1],
            "profesores": [[
                "profesor_id": "p-manu",
                "name": "Manu García",
                "verified": true
            ]]
        ]
        let snap = LivePayloadMapper.snapshot(from: json)
        XCTAssertEqual(snap.profesores.count, 1)
        XCTAssertEqual(snap.profesores.first?.name, "Manu García")
        XCTAssertTrue(snap.profesores.first?.verified == true)
    }

    func testMockReturnsVerifiedProfesor() async throws {
        let api = MockAPIClient(autoSession: true)
        let list = try await api.profesores()
        XCTAssertEqual(list.count, 1)
        XCTAssertEqual(list.first?.id, "p-manu")
        XCTAssertTrue(list.first?.verified == true)
        XCTAssertEqual(ProfesoresAPIPaths.list, "/api/profesores")
        XCTAssertEqual(ProfesoresAPIPaths.detail("p-manu"), "/api/profesores/p-manu")
        XCTAssertEqual(HomeHcpPeopleLayout.profesorVisible, 3)
        XCTAssertEqual(HomeHcpPeopleLayout.groupVisible, 4)
    }
}
