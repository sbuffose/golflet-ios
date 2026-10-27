import Foundation

protocol GolfletAPI: Sendable {
    var isAuthenticated: Bool { get }
    var persistsLocally: Bool { get }

    func signUp(name: String, email: String, password: String) async throws
    func signIn(email: String, password: String) async throws
    func signOut() async throws

    func bootstrap() async throws -> AppSnapshot
    func clubCatalogue() async throws -> [ClubCatalogEntry]
    func linkClub(matricula: String, password: String, savePassword: Bool, progressID: String) async throws -> SyncResult
    func syncAccount(id: String, password: String?, savePassword: Bool, progressID: String) async throws -> SyncResult
    func forgetPassword(accountId: String) async throws
    func unlink(accountId: String) async throws
    func saveRoundNotes(roundId: String, putts: Int?, gir: Int?, fir: Int?, notes: String) async throws
    func saveBag(_ items: [BagClub]) async throws -> [BagClub]
    func pollSyncProgress(progressID: String) async -> SyncAPIProgress?
}

enum APIFactory {
    static func make(arguments: [String] = ProcessInfo.processInfo.arguments) -> any GolfletAPI {
        if arguments.contains("-ui-testing-auth") {
            return MockAPIClient(autoSession: false)
        }
        if arguments.contains("-ui-testing") {
            return MockAPIClient(autoSession: true)
        }
        #if DEBUG
        if !arguments.contains("-use-live") {
            return MockAPIClient(autoSession: true)
        }
        #endif
        return LiveGolfletAPI()
    }
}
