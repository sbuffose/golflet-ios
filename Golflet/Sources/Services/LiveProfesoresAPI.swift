import Foundation

extension LiveGolfletAPI {
    func profesores() async throws -> [Profesor] {
        ProfesoresParser.list(from: try await request("GET", ProfesoresAPIPaths.list))
    }

    func searchProfesores(query: String) async throws -> [Profesor] {
        ProfesoresParser.searchResults(from: try await request("GET", ProfesoresAPIPaths.searchQuery(query)))
    }

    func addProfesor(id: String, source: String?) async throws -> Profesor {
        let json = try await request("POST", ProfesoresAPIPaths.list, body: ProfesoresParser.addBody(id: id, source: source))
        if let one = ProfesoresParser.profesor(from: json["profesor"] ?? json) { return one }
        return ProfesoresParser.list(from: json).first { $0.id == id }
            ?? Profesor(id: id, name: id, photoURL: nil, verified: false, locations: [], bio: nil, pending: false, canViewMetrics: false, canHearAudio: false, newContent: 0, linked: true)
    }

    func profesorMatchAnswers() async throws -> ProfesorMatchAnswers {
        ProfesoresParser.matchAnswers(from: try await request("GET", ProfesoresAPIPaths.matchAnswers))
    }

    func saveProfesorMatchAnswers(_ answers: ProfesorMatchAnswers) async throws -> ProfesorMatchAnswers {
        let json = try await request("PUT", ProfesoresAPIPaths.matchAnswers, body: ProfesoresParser.matchAnswersBody(answers))
        return ProfesoresParser.matchAnswers(from: json)
    }

    func profesorMatches() async throws -> [ProfesorMatch] {
        ProfesoresParser.matches(from: try await request("GET", ProfesoresAPIPaths.match))
    }
}
