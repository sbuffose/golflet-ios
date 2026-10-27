import Foundation

protocol GolfletAPI: Sendable {
    func login(clubURL: URL, matricula: String, clave: String) async throws -> LinkedClub
    func linkedClubs() async throws -> [LinkedClub]
    func unlink(clubCode: String) async throws
    func profile() async throws -> PlayerProfile
    func rounds(filter: RoundFilter) async throws -> [Round]
    func courses() async throws -> [Course]
    func tees() async throws -> [TeeRating]
    func holeStats() async throws -> [CourseHoleStats]
    func bag() async throws -> [BagClub]
    func saveBag(_ items: [BagClub]) async throws
}

/// Placeholder for the live Next.js API. Keep the surface identical so we can swap MockAPIClient later.
struct LiveAPIClient: GolfletAPI {
    var baseURL: URL

    func login(clubURL: URL, matricula: String, clave: String) async throws -> LinkedClub {
        throw GolfletError.notImplemented
    }

    func linkedClubs() async throws -> [LinkedClub] { throw GolfletError.notImplemented }
    func unlink(clubCode: String) async throws { throw GolfletError.notImplemented }
    func profile() async throws -> PlayerProfile { throw GolfletError.notImplemented }
    func rounds(filter: RoundFilter) async throws -> [Round] { throw GolfletError.notImplemented }
    func courses() async throws -> [Course] { throw GolfletError.notImplemented }
    func tees() async throws -> [TeeRating] { throw GolfletError.notImplemented }
    func holeStats() async throws -> [CourseHoleStats] { throw GolfletError.notImplemented }
    func bag() async throws -> [BagClub] { throw GolfletError.notImplemented }
    func saveBag(_ items: [BagClub]) async throws { throw GolfletError.notImplemented }
}
