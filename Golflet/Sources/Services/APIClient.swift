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

    func gpsCourses(lat: Double?, lng: Double?) async throws -> GPSCourseList
    func gpsCourse(id: String, lat: Double?, lng: Double?) async throws -> GPSCourseDetail
    func createLiveRound(courseId: String?, tee: String?) async throws -> LiveRound
    func liveRound(id: String) async throws -> LiveRoundDetail
    func patchLiveRound(id: String, body: [String: Any]) async throws -> LiveRound
    func postShots(liveRoundId: String, drafts: [ShotDraft]) async throws -> [Shot]
    func patchShot(id: String, body: [String: Any]) async throws -> Shot
    func recap(roundId: String?, liveRoundId: String?) async throws -> Recap?
    func uploadRecap(audio: Data, roundId: String?, liveRoundId: String?) async throws -> Recap
    func typedRecap(roundId: String?, liveRoundId: String?, transcript: String) async throws -> Recap
    func patchRecap(id: String, body: [String: Any]) async throws -> Recap
    func retryRecap(id: String) async throws -> Recap
    func recurringMistakes() async throws -> RecurringReport
    func clubStats(code: String) async throws -> ClubStatsDetail
    func metricDrilldown(metric: String, scope: String, year: Int, course: String, sort: String, order: String) async throws -> MetricDrilldown?
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
