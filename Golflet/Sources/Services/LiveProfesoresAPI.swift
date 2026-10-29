import Foundation

extension LiveGolfletAPI {
    func profesores() async throws -> [Profesor] {
        ProfesoresParser.list(from: try await request("GET", ProfesoresAPIPaths.list))
    }
}
