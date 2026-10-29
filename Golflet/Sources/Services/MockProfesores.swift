import Foundation

extension MockAPIClient {
    private static let profesoresLock = NSLock()
    private static var linkedIDs: Set<String> = []
    private static var matchAnswers = ProfesorMatchAnswers.empty

    static func resetProfesores() {
        profesoresLock.lock()
        defer { profesoresLock.unlock() }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-no-profesor") {
            linkedIDs = []
        } else if ProcessInfo.processInfo.arguments.contains("-ui-testing-many-profesores") {
            linkedIDs = Set(profesorDirectory.map(\.id))
        } else {
            linkedIDs = Set(mockProfesores.map(\.id))
        }
        matchAnswers = ProfesorMatchAnswers(
            availability: [:],
            hcp: 3.1,
            playFreq: nil,
            locations: [],
            budget: nil,
            classFreq: nil,
            suggestedHcp: 3.1,
            locationChoices: matchLocationChoices
        )
    }

    func profesores() async throws -> [Profesor] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        return mutateProfesores { ids in
            Self.profesorDirectory.filter { ids.contains($0.id) }.map { withLink($0, linked: true) }
        }
    }

    func searchProfesores(query: String) async throws -> [Profesor] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        let linked = mutateProfesores { $0 }
        return ProfesorSearch.matches(query, in: Self.profesorDirectory).map {
            withLink($0, linked: linked.contains($0.id))
        }
    }

    func addProfesor(id: String, source: String?) async throws -> Profesor {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        _ = source
        return try mutateProfesores { ids in
            guard let found = Self.profesorDirectory.first(where: { $0.id == id }) else {
                throw GolfletError.server("No encontramos a ese profesor.")
            }
            ids.insert(id)
            return withLink(found, linked: true)
        }
    }

    func profesorMatchAnswers() async throws -> ProfesorMatchAnswers {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        Self.profesoresLock.lock()
        defer { Self.profesoresLock.unlock() }
        return Self.matchAnswers
    }

    func saveProfesorMatchAnswers(_ answers: ProfesorMatchAnswers) async throws -> ProfesorMatchAnswers {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        Self.profesoresLock.lock()
        defer { Self.profesoresLock.unlock() }
        Self.matchAnswers.availability = answers.availability
        Self.matchAnswers.hcp = answers.hcp
        Self.matchAnswers.playFreq = answers.playFreq
        Self.matchAnswers.locations = answers.locations
        Self.matchAnswers.budget = answers.budget
        Self.matchAnswers.classFreq = answers.classFreq
        return Self.matchAnswers
    }

    func profesorMatches() async throws -> [ProfesorMatch] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        let linked = mutateProfesores { $0 }
        return Self.profesorDirectory.map { profesor in
            let item = withLink(profesor, linked: linked.contains(profesor.id))
            return ProfesorMatch(
                profesor: item,
                reasons: matchReasons(for: item),
                priceMin: 20_000,
                priceMax: 35_000
            )
        }
    }

    static let matchLocationChoices = [
        "Jockey Club Buenos Aires",
        "Olivos Golf Club",
        "Mar del Plata Golf Club"
    ]

    static let profesorDirectory: [Profesor] = mockProfesores + [
        Profesor(
            id: "p-lucia",
            name: "Lucía Fernández",
            photoURL: nil,
            verified: false,
            locations: ["Olivos Golf Club"],
            bio: nil,
            pending: false,
            canViewMetrics: false,
            canHearAudio: false,
            newContent: 0,
            linked: false,
            matricula: "LUC-22"
        ),
        Profesor(
            id: "p-diego",
            name: "Diego Rossi",
            photoURL: nil,
            verified: true,
            locations: ["Mar del Plata Golf Club"],
            bio: nil,
            pending: false,
            canViewMetrics: true,
            canHearAudio: false,
            newContent: 1,
            linked: false,
            matricula: "20901"
        ),
        Profesor(
            id: "p-sofia",
            name: "Sofía Méndez",
            photoURL: nil,
            verified: false,
            locations: ["Jockey Club Buenos Aires"],
            bio: nil,
            pending: true,
            canViewMetrics: false,
            canHearAudio: false,
            newContent: 0,
            linked: false,
            matricula: "SOF-10"
        )
    ]

    static let mockProfesores: [Profesor] = [
        Profesor(
            id: "p-manu",
            name: "Manu García",
            photoURL: nil,
            verified: true,
            locations: ["Jockey Club Buenos Aires"],
            bio: "Profesor de golf. Clases en cancha y en el driving.",
            pending: false,
            canViewMetrics: false,
            canHearAudio: false,
            newContent: 0,
            linked: true,
            matricula: "94506"
        )
    ]

    private func withLink(_ profesor: Profesor, linked: Bool) -> Profesor {
        var copy = profesor
        copy.linked = linked
        return copy
    }

    private func matchReasons(for profesor: Profesor) -> [String] {
        var reasons: [String] = []
        if let place = profesor.locations.first {
            reasons.append("Da clases en \(place)")
        }
        reasons.append("Horarios compatibles")
        return reasons
    }

    private func mutateProfesores<T>(_ work: (inout Set<String>) throws -> T) rethrows -> T {
        Self.profesoresLock.lock()
        defer { Self.profesoresLock.unlock() }
        return try work(&Self.linkedIDs)
    }
}
