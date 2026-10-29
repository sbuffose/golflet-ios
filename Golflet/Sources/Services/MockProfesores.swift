import Foundation

extension MockAPIClient {
    func profesores() async throws -> [Profesor] {
        guard isAuthenticated else { throw GolfletError.notAuthenticated }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-no-profesor") {
            return []
        }
        if ProcessInfo.processInfo.arguments.contains("-ui-testing-many-profesores") {
            return Self.profesorDirectory
        }
        return Self.mockProfesores
    }

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
            newContent: 0
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
            newContent: 1
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
            newContent: 0
        )
    ]
}
