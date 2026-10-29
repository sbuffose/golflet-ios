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
        XCTAssertEqual(ProfesoresAPIPaths.search, "/api/profesores/search")
        XCTAssertEqual(ProfesoresAPIPaths.searchQuery("Manu García"), "/api/profesores/search?q=Manu%20Garc%C3%ADa")
        XCTAssertEqual(ProfesoresAPIPaths.match, "/api/profesores/match")
        XCTAssertEqual(ProfesoresAPIPaths.matchAnswers, "/api/profesores/match/answers")
    }

    func testSearchMatchesNameAndMatricula() {
        let catalog = MockAPIClient.profesorDirectory
        XCTAssertEqual(ProfesorSearch.matches("ma", in: catalog).map(\.id), ["p-manu"])
        XCTAssertEqual(ProfesorSearch.matches("lucía", in: catalog).map(\.id), ["p-lucia"])
        XCTAssertEqual(ProfesorSearch.matches("94506", in: catalog).map(\.id), ["p-manu"])
        XCTAssertEqual(ProfesorSearch.matches("luc-22", in: catalog).map(\.id), ["p-lucia"])
        XCTAssertTrue(ProfesorSearch.matches("x", in: catalog).isEmpty)
        XCTAssertTrue(ProfesorSearch.matches("zzz", in: catalog).isEmpty)
    }

    func testSearchParserMarksUnlinkedByDefault() {
        let json: [String: Any] = [
            "profesores": [[
                "profesor_id": "p-lucia",
                "name": "Lucía Fernández",
                "matricula": "LUC-22",
                "locations": ["Olivos Golf Club"]
            ]]
        ]
        let found = ProfesoresParser.searchResults(from: json)
        XCTAssertEqual(found.count, 1)
        XCTAssertFalse(found[0].linked)
        XCTAssertEqual(found[0].matricula, "LUC-22")
    }

    func testAddBodyIncludesSource() {
        XCTAssertEqual(ProfesoresParser.addBody(id: "p-manu", source: nil)["profesor_id"] as? String, "p-manu")
        XCTAssertNil(ProfesoresParser.addBody(id: "p-manu", source: nil)["source"])
        XCTAssertEqual(ProfesoresParser.addBody(id: "p-manu", source: "match")["source"] as? String, "match")
    }

    func testParsesMatchAnswersAndResults() {
        let json: [String: Any] = [
            "answers": [
                "availability": ["lun": ["m", "t"]],
                "hcp": 3.1,
                "play_freq": "semanal",
                "locations": ["Olivos Golf Club"],
                "budget": "b2",
                "class_freq": "semanal"
            ],
            "suggested_hcp": 3.1,
            "locations": ["Olivos Golf Club", "Jockey Club Buenos Aires"]
        ]
        let answers = ProfesoresParser.matchAnswers(from: json)
        XCTAssertEqual(answers.availability["lun"], ["m", "t"])
        XCTAssertEqual(answers.hcp, 3.1)
        XCTAssertEqual(answers.playFreq, "semanal")
        XCTAssertEqual(answers.budget, "b2")
        XCTAssertEqual(answers.locationChoices, ["Olivos Golf Club", "Jockey Club Buenos Aires"])

        let matches = ProfesoresParser.matches(from: [
            "matches": [[
                "profesor_id": "p-lucia",
                "name": "Lucía Fernández",
                "linked": false,
                "reasons": ["Da clases en Olivos Golf Club"],
                "price_min": 20000,
                "price_max": 35000
            ]]
        ])
        XCTAssertEqual(matches.count, 1)
        XCTAssertEqual(matches[0].profesor.id, "p-lucia")
        XCTAssertFalse(matches[0].profesor.linked)
        XCTAssertEqual(matches[0].priceMin, 20000)
        XCTAssertEqual(matches[0].reasons, ["Da clases en Olivos Golf Club"])
    }

    func testMockSearchAddAndMatch() async throws {
        MockAPIClient.resetProfesores()
        let api = MockAPIClient(autoSession: true)
        let listed = try await api.profesores()
        XCTAssertEqual(listed.map(\.id), ["p-manu"])

        let found = try await api.searchProfesores(query: "luc")
        XCTAssertEqual(found.map(\.id), ["p-lucia"])
        XCTAssertFalse(found[0].linked)

        let added = try await api.addProfesor(id: "p-lucia", source: nil)
        XCTAssertEqual(added.id, "p-lucia")
        XCTAssertTrue(added.linked)
        let afterAdd = try await api.profesores()
        XCTAssertEqual(afterAdd.map(\.id), ["p-manu", "p-lucia"])

        let already = try await api.searchProfesores(query: "luc")
        XCTAssertTrue(already[0].linked)

        let answers = try await api.profesorMatchAnswers()
        XCTAssertEqual(answers.suggestedHcp, 3.1)
        var next = answers
        next.playFreq = "semanal"
        next.budget = "b2"
        let saved = try await api.saveProfesorMatchAnswers(next)
        XCTAssertEqual(saved.playFreq, "semanal")
        XCTAssertEqual(saved.budget, "b2")

        let matches = try await api.profesorMatches()
        XCTAssertTrue(matches.contains { $0.profesor.id == "p-diego" && !$0.profesor.linked })
        XCTAssertTrue(matches.contains { $0.profesor.id == "p-manu" && $0.profesor.linked })
        let fromMatch = try await api.addProfesor(id: "p-diego", source: "match")
        XCTAssertTrue(fromMatch.linked)
    }
}
