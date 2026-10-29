import Foundation

protocol GolfletAPI: Sendable {
    var isAuthenticated: Bool { get }
    var persistsLocally: Bool { get }

    func signInGolfistics(matricula: String, clave: String, savePassword: Bool) async throws -> GolfisticsSession
    func startFirstSync(progressID: String) async throws -> SyncResult
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
    func uploadRecap(audio: Data, roundId: String?, liveRoundId: String?, draft: RecapDraft?) async throws -> Recap
    func typedRecap(roundId: String?, liveRoundId: String?, draft: RecapDraft) async throws -> Recap
    func patchRecap(id: String, body: [String: Any]) async throws -> Recap
    func recurringMistakes() async throws -> RecurringReport
    func clubStats(code: String) async throws -> ClubStatsDetail
    func metricDrilldown(metric: String, scope: String, year: Int, course: String, sort: String, order: String, range: String) async throws -> MetricDrilldown?
    func metricsSummary(range: String) async throws -> MetricsSummary
    func courseStrategy(courseKey: String?, courseId: String?) async throws -> CourseStrategy

    func groups() async throws -> [GolfletGroup]
    func createGroup(name: String, photoJPEG: Data?) async throws -> GolfletGroup
    func group(id: String) async throws -> GolfletGroup
    func updateGroup(id: String, name: String?, photoJPEG: Data?) async throws -> GolfletGroup
    func leaveGroup(id: String) async throws
    func removeMember(groupID: String, userID: String) async throws -> GolfletGroup
    func setMemberRole(groupID: String, userID: String, role: GroupRole) async throws -> GolfletGroup
    func regenerateInvite(groupID: String) async throws -> GroupInviteLink
    func disableInvite(groupID: String) async throws -> GroupInviteLink
    func pendingInvites() async throws -> [GroupInvitePreview]
    func invitePreview(token: String) async throws -> GroupInvitePreview
    func acceptInvite(token: String) async throws -> GolfletGroup
    func declineInvite(token: String) async throws
    func groupView(groupID: String) async throws -> GroupViewConfig
    func saveGroupView(groupID: String, config: GroupViewConfig) async throws -> GroupViewConfig
    func sharePrefs() async throws -> SharePrefs
    func saveSharePrefs(_ prefs: SharePrefs) async throws -> SharePrefs
    func groupComparison(groupID: String, config: GroupViewConfig) async throws -> GroupComparison

    func notifications() async throws -> NotificationsInbox
    func unreadNotifications() async throws -> UnreadNotifications
    func notification(id: String) async throws -> InboxNotification
    func markNotificationsRead(ids: [String], all: Bool) async throws
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
