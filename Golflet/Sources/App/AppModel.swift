import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    var user: GolfletUser?
    var profile = PlayerProfile(displayName: "Jugador Demo", initials: "JD", currentHandicap: 3.1)
    var clubs: [LinkedClub] = []
    var rounds: [Round] = []
    var courses: [Course] = []
    var tees: [TeeRating] = []
    var holeStats: [CourseHoleStats] = []
    var bag: [BagClub] = []
    var isLoaded = false
    var isBusy = false
    var errorMessage: String?
    var authFailure: AuthFailure?
    var selectedTab: AppTab = .inicio
    var courseFilter: CourseFilter = .all
    var statsRange: StatsRange = .all {
        didSet { statsRange.persist() }
    }
    var selectedCourseName = "Colorada"
    var presentedRound: Round?
    var presentedHole: Int?
    var showsClubs = false
    var showsNotifications = false
    var notifications: [InboxNotification] = []
    var unreadNotificationCount = 0
    var unreadBadge: String?
    var notificationsAvailable = false
    var syncSession: SyncSession?
    var celebrateCards: Int?
    var toastMessage: String?
    var isSignedIn: Bool
    var showsPlay = false
    var presentedRecap: RecapTarget?
    var recurring: RecurringReport?
    var pendingCourseHint: String?
    var activeLiveRound: LiveRound?
    var activeCourse: GPSCourseDetail?
    var metricsSummary: MetricsSummary?
    var groups: [GolfletGroup] = []
    var pendingInvites: [GroupInvitePreview] = []
    var sharePrefs = SharePrefs.allShared
    var presentedInvite: GroupInvitePreview?
    var presentedGroupID: String?
    var showsCreateGroup = false
    var showsSharePrefs = false
    var showsGroups = false
    var inviteShare: InviteSharePayload?

    let api: any GolfletAPI
    let notes: NotesStore
    private var reopenClubsAfterFailure = false

    init(api: any GolfletAPI, notes: NotesStore) {
        self.api = api
        self.notes = notes
        self.isSignedIn = api.isAuthenticated
        let testing = ProcessInfo.processInfo.arguments.contains("-ui-testing")
            || ProcessInfo.processInfo.arguments.contains("-ui-testing-auth")
        self.statsRange = testing ? .all : StatsRange.persisted()
        if testing { PendingInviteStore.clear() }
        if let index = ProcessInfo.processInfo.arguments.firstIndex(of: "-pending-invite"),
           ProcessInfo.processInfo.arguments.indices.contains(index + 1) {
            PendingInviteStore.save(ProcessInfo.processInfo.arguments[index + 1])
        }
    }

    var isAuthenticated: Bool { isSignedIn }
    var isLive: Bool { !api.persistsLocally }
    var home: HomeSnapshot { StatsEngine.home(rounds: rounds) }
    var summary: SummarySnapshot { StatsEngine.summary(rounds: rounds, filter: courseFilter, range: statsRange) }
    var rangeRoundCount: Int { metricsSummary?.roundsInRange ?? summary.validRoundCount }

    func courseSnapshot() -> CourseSnapshot {
        StatsEngine.course(named: selectedCourseName, rounds: rounds, courses: courses, tees: tees, range: statsRange)
    }

    func rangedValidRounds(course: String? = nil) -> [Round] {
        var scoped = StatsEngine.eighteenHoleValid(StatsEngine.ranged(rounds, range: statsRange))
        if let course {
            scoped = scoped.filter { $0.course.caseInsensitiveCompare(course) == .orderedSame }
        } else if let name = courseFilter.courseName {
            scoped = scoped.filter { $0.course.caseInsensitiveCompare(name) == .orderedSame }
        }
        return scoped
    }

    func holesForCourse(_ name: String) -> [HoleStat] {
        let scoped = StatsEngine.ranged(rounds, range: statsRange)
        if StatsEngine.hasCompleteHoleData(scoped) {
            let computed = StatsEngine.holeAverages(rounds: scoped, course: name)
            if !computed.isEmpty { return computed }
        }
        return holeStats.first { $0.course.caseInsensitiveCompare(name) == .orderedSame }?.holes ?? []
    }

    func load() async {
        guard isAuthenticated else {
            isLoaded = true
            return
        }
        do {
            let snap = try await api.bootstrap()
            apply(snap)
            if api.persistsLocally {
                bag = notes.bag()
            }
            await flushOffline()
            recurring = try? await api.recurringMistakes()
            if let courses = try? await api.gpsCourses(lat: nil, lng: nil) {
                CourseCache.saveList(courses)
            }
            publishWidgetSnapshot()
            await refreshMetricsSummary()
            await refreshGroups()
            await refreshNotifications()
            isLoaded = true
            await consumeIntent()
        } catch {
            errorMessage = error.localizedDescription
            isLoaded = true
        }
    }

    func setStatsRange(_ range: StatsRange) {
        statsRange = range
        Task { await refreshMetricsSummary() }
    }

    func refreshMetricsSummary() async {
        guard isSignedIn else {
            metricsSummary = nil
            return
        }
        metricsSummary = try? await api.metricsSummary(range: statsRange.query)
    }

    func metricChartPoints(_ query: MetricChartQuery) async -> [MetricPoint] {
        let local = StatsEngine.series(
            from: StatsEngine.ranged(rounds, range: query.range),
            kind: query.kind,
            courseName: query.courseName
        )
        guard let metric = query.kind.apiMetric else { return local }
        let year = Calendar.gregorian.component(.year, from: Date())
        let course = query.courseName.flatMap { CourseIdentity.key(for: $0) } ?? "all"
        guard let drill = try? await api.metricDrilldown(
            metric: metric,
            scope: "all",
            year: year,
            course: course,
            sort: "date",
            order: "desc",
            range: query.range.query
        ) else { return local }
        let remote = drill.chartPoints(preferMonthly: query.kind.usesMonthly)
        return remote.isEmpty ? local : remote
    }

    func signInGolfistics(matricula: String, clave: String, savePassword: Bool) async {
        await run {
            let session = try await api.signInGolfistics(
                matricula: matricula.trimmingCharacters(in: .whitespacesAndNewlines),
                clave: clave,
                savePassword: savePassword
            )
            isSignedIn = true
            if session.needsFirstSync {
                await performClubSync(clubName: "Golfistics App", accountId: nil, knownCards: nil, kind: .link) { progressID in
                    try await api.startFirstSync(progressID: progressID)
                }
            } else {
                await load()
            }
            await consumePendingInvite()
        }
    }

    func signOut() async {
        await run {
            try await api.signOut()
            isSignedIn = false
            user = nil
            clubs = []
            rounds = []
            courses = []
            tees = []
            holeStats = []
            bag = []
            recurring = nil
            groups = []
            pendingInvites = []
            notifications = []
            unreadNotificationCount = 0
            unreadBadge = nil
            notificationsAvailable = false
            showsNotifications = false
            presentedInvite = nil
            presentedGroupID = nil
            inviteShare = nil
            isLoaded = true
        }
    }

    func addClub(matricula: String, clave: String, savePassword: Bool) async {
        await performClubSync(clubName: "Golfistics App", accountId: nil, knownCards: nil, kind: .link) { progressID in
            try await api.linkClub(
                matricula: matricula,
                password: clave,
                savePassword: savePassword,
                progressID: progressID
            )
        }
    }

    func requestSync(_ club: LinkedClub, password: String? = nil, savePassword: Bool = false) {
        let progressID = beginRunningSession(
            clubName: club.name,
            accountId: club.accountId,
            knownCards: club.cardCount,
            kind: .refresh
        )
        Task {
            await finishClubSync(progressID: progressID, knownCards: club.cardCount, kind: .refresh) { id in
                try await api.syncAccount(id: club.accountId, password: password, savePassword: savePassword, progressID: id)
            }
        }
    }

    func syncClub(_ club: LinkedClub, password: String? = nil, savePassword: Bool = false) async {
        await performClubSync(clubName: club.name, accountId: club.accountId, knownCards: club.cardCount, kind: .refresh) { progressID in
            try await api.syncAccount(id: club.accountId, password: password, savePassword: savePassword, progressID: progressID)
        }
    }

    func finishSuccessfulSync() {
        selectedTab = .inicio
        showsClubs = false
        syncSession = nil
    }

    func forgetPassword(_ club: LinkedClub) async {
        await run {
            try await api.forgetPassword(accountId: club.accountId)
            await load()
        }
    }

    func unlink(_ club: LinkedClub) async {
        await run {
            try await api.unlink(accountId: club.accountId)
            await load()
        }
    }

    func saveRoundNotes(roundId: String, putts: Int?, gir: Int?, fir: Int?, text: String) async {
        notes.saveNote(roundId: roundId, text: text)
        if let index = rounds.firstIndex(where: { $0.roundId == roundId }) {
            rounds[index].putts = putts
            rounds[index].gir = gir
            rounds[index].fir = fir
            rounds[index].notes = text
            rounds[index].notesAt = Date()
        }
        if presentedRound?.roundId == roundId {
            presentedRound?.putts = putts
            presentedRound?.gir = gir
            presentedRound?.fir = fir
            presentedRound?.notes = text
        }
        do {
            try await api.saveRoundNotes(roundId: roundId, putts: putts, gir: gir, fir: fir, notes: text)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func updateBagClub(name: String, carry: Int?, total: Int?) {
        bag = bag.map { item in
            guard item.name == name else { return item }
            return BagClub(name: name, carry: carry, total: total)
        }
        notes.saveBag(bag)
        Task { [bag] in
            do {
                self.bag = try await api.saveBag(bag)
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }

    func openLastRound() {
        presentedRound = home.lastRound
    }

    func endPlay(recapLiveRoundId: String?) {
        showsPlay = false
        activeLiveRound = nil
        activeCourse = nil
        OfflinePlay.clearActive()
        RoundLiveActivity.end()
        guard let recapLiveRoundId else { return }
        Task {
            try? await Task.sleep(for: .milliseconds(RuntimeFlags.isUITesting ? 80 : 450))
            presentedRecap = RecapTarget(liveRoundId: recapLiveRoundId)
        }
    }

    func openRecap(roundId: String?, liveRoundId: String? = nil) {
        presentedRecap = RecapTarget(roundId: roundId, liveRoundId: liveRoundId)
    }

    func handleURL(_ url: URL) {
        if let action = GolfletURL.parse(url) {
            if case .recordShot(let club) = action {
                _ = ActivePlayIntents.enqueueShot(club: club)
            }
            if case .openInvite(let token) = action {
                PendingInviteStore.save(token)
            }
            IntentRouter.shared.post(action)
            Task { await consumeIntent() }
        }
    }

    func consumeIntent() async {
        guard let action = IntentRouter.shared.take() else { return }
        switch action {
        case .startRound(let hint):
            pendingCourseHint = hint
            showsPlay = true
        case .recordShot:
            if activeLiveRound == nil {
                pendingCourseHint = OfflinePlay.loadActive()?.courseName ?? ""
                showsPlay = true
            }
            await flushOffline()
        case .recordRecap:
            if let live = activeLiveRound?.id {
                presentedRecap = RecapTarget(liveRoundId: live)
            } else {
                presentedRecap = RecapTarget(roundId: home.lastRound?.roundId, liveRoundId: OfflinePlay.loadActive()?.roundId)
            }
        case .openRound(let id):
            presentedRound = rounds.first { $0.roundId == id } ?? home.lastRound
        case .openInvite(let token):
            PendingInviteStore.save(token)
            if isSignedIn {
                await consumePendingInvite()
            } else {
                toastMessage = "Invitación guardada. Entrá con tu matrícula para verla."
            }
        }
    }

    func consumePendingInvite() async {
        guard isSignedIn, let token = PendingInviteStore.load() else { return }
        do {
            let preview = try await api.invitePreview(token: token)
            presentedInvite = preview
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func presentCreateGroup() {
        presentAfterDismissing { $0.showsCreateGroup = true }
    }

    func presentGroupDetail(_ id: String) {
        presentAfterDismissing { $0.presentedGroupID = id }
    }

    func presentInvite(_ invite: GroupInvitePreview) {
        presentAfterDismissing { $0.presentedInvite = invite }
    }

    func presentSharePrefs() {
        presentAfterDismissing { $0.showsSharePrefs = true }
    }

    func presentGroups() {
        presentAfterDismissing { $0.showsGroups = true }
    }

    func presentNotifications() {
        presentAfterDismissing { model in
            model.showsNotifications = true
            Task { await model.markNotificationsReadOnOpen() }
        }
    }

    func presentClubs() {
        presentAfterDismissing { $0.showsClubs = true }
    }

    func openAvatar() {
        if unreadBadgeText != nil {
            presentNotifications()
        } else {
            showsClubs = true
        }
    }

    var unreadBadgeText: String? {
        guard notificationsAvailable else { return nil }
        return NotificationBadge.display(count: unreadNotificationCount, badge: unreadBadge)
    }

    private func presentAfterDismissing(_ present: @escaping (AppModel) -> Void) {
        showsGroups = false
        showsClubs = false
        showsNotifications = false
        Task { @MainActor in
            present(self)
        }
    }

    func refreshNotifications() async {
        guard isSignedIn else { return }
        do {
            async let loadedUnread = api.unreadNotifications()
            async let loadedInbox = api.notifications()
            let unread = try await loadedUnread
            let inbox = try await loadedInbox
            notifications = inbox.items
            unreadNotificationCount = unread.unreadCount
            unreadBadge = unread.badge ?? inbox.badge
            notificationsAvailable = true
        } catch {
            notifications = []
            unreadNotificationCount = 0
            unreadBadge = nil
            notificationsAvailable = false
        }
    }

    func markNotificationsReadOnOpen() async {
        let ids = notifications.filter(\.isUnread).map(\.id)
        notifications = notifications.map { item in
            var copy = item
            copy.isUnread = false
            return copy
        }
        unreadNotificationCount = 0
        unreadBadge = nil
        guard !ids.isEmpty else { return }
        try? await api.markNotificationsRead(ids: ids, all: true)
    }

    func openNotification(_ item: InboxNotification) async {
        if let updated = try? await api.notification(id: item.id) {
            if let index = notifications.firstIndex(where: { $0.id == item.id }) {
                notifications[index] = updated
            }
        } else if let index = notifications.firstIndex(where: { $0.id == item.id }) {
            notifications[index].isUnread = false
        }
        unreadNotificationCount = notifications.filter(\.isUnread).count
        unreadBadge = NotificationBadge.text(unreadNotificationCount)
    }

    func refreshGroups() async {
        guard isSignedIn else { return }
        do {
            async let loadedGroups = api.groups()
            async let loadedInvites = api.pendingInvites()
            async let loadedShare = api.sharePrefs()
            groups = try await loadedGroups
            pendingInvites = try await loadedInvites
            sharePrefs = try await loadedShare
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createGroup(name: String, photoJPEG: Data?) async {
        await run {
            let group = try await api.createGroup(name: name, photoJPEG: photoJPEG)
            groups.insert(group, at: 0)
            if let invite = group.invite, invite.enabled {
                inviteShare = InviteSharePayload(groupName: group.name, url: invite.url)
            }
            await refreshGroups()
        }
    }

    func acceptInvite(_ preview: GroupInvitePreview, openGroup: Bool = true) async {
        await run {
            let group = try await api.acceptInvite(token: preview.token)
            PendingInviteStore.clear()
            presentedInvite = nil
            pendingInvites.removeAll { $0.token == preview.token }
            notifications.removeAll { $0.inviteToken == preview.token }
            unreadNotificationCount = notifications.filter(\.isUnread).count
            unreadBadge = NotificationBadge.text(unreadNotificationCount)
            if !groups.contains(where: { $0.id == group.id }) {
                groups.insert(group, at: 0)
            }
            if openGroup {
                presentedGroupID = group.id
            }
            await refreshGroups()
            await refreshNotifications()
        }
    }

    func declineInvite(_ preview: GroupInvitePreview) async {
        await run {
            try await api.declineInvite(token: preview.token)
            PendingInviteStore.clear()
            presentedInvite = nil
            pendingInvites.removeAll { $0.token == preview.token }
            notifications.removeAll { $0.inviteToken == preview.token }
            unreadNotificationCount = notifications.filter(\.isUnread).count
            unreadBadge = NotificationBadge.text(unreadNotificationCount)
            await refreshNotifications()
        }
    }

    func updateGroup(_ group: GolfletGroup, name: String?, photoJPEG: Data?) async {
        await run {
            let updated = try await api.updateGroup(id: group.id, name: name, photoJPEG: photoJPEG)
            replace(updated)
        }
    }

    func regenerateInvite(_ group: GolfletGroup) async {
        await run {
            let link = try await api.regenerateInvite(groupID: group.id)
            if let index = groups.firstIndex(where: { $0.id == group.id }) {
                groups[index].invite = link
            }
            inviteShare = InviteSharePayload(groupName: group.name, url: link.url)
        }
    }

    func disableInvite(_ group: GolfletGroup) async {
        await run {
            let link = try await api.disableInvite(groupID: group.id)
            if let index = groups.firstIndex(where: { $0.id == group.id }) {
                groups[index].invite = link
            }
        }
    }

    func setMemberRole(group: GolfletGroup, member: GroupMember, role: GroupRole) async {
        await run {
            let updated = try await api.setMemberRole(groupID: group.id, userID: member.id, role: role)
            replace(updated)
        }
    }

    func removeMember(group: GolfletGroup, member: GroupMember) async {
        await run {
            let updated = try await api.removeMember(groupID: group.id, userID: member.id)
            replace(updated)
        }
    }

    func leaveGroup(_ group: GolfletGroup) async {
        await run {
            try await api.leaveGroup(id: group.id)
            groups.removeAll { $0.id == group.id }
            if presentedGroupID == group.id { presentedGroupID = nil }
        }
    }

    func saveGroupView(groupID: String, config: GroupViewConfig) async {
        await run {
            _ = try await api.saveGroupView(groupID: groupID, config: config)
        }
    }

    func saveSharePrefs(_ prefs: SharePrefs) async {
        sharePrefs = prefs
        await run {
            sharePrefs = try await api.saveSharePrefs(prefs)
        }
    }

    private func replace(_ group: GolfletGroup) {
        if let index = groups.firstIndex(where: { $0.id == group.id }) {
            groups[index] = group
        } else {
            groups.insert(group, at: 0)
        }
    }

    func publishWidgetSnapshot(next: NextRoundHint? = nil) {
        WidgetSnapshotStore.save(WidgetSnapshot.make(home: home, next: next))
    }

    func rememberPlay(course: GPSCourseDetail, round: LiveRound) {
        activeCourse = course
        activeLiveRound = round
        OfflinePlay.saveActive(roundId: round.id, courseId: course.courseId, hole: round.currentHole, courseName: course.course)
    }

    func flushOffline() async {
        await flushShotQueue()
        await flushRecapQueue()
    }

    func flushShotQueue() async {
        let pending = ShotQueue.all()
        guard !pending.isEmpty else { return }
        let groups = Dictionary(grouping: pending, by: \.liveRoundId)
        for (liveId, drafts) in groups {
            var target = liveId
            if OfflinePlay.isLocal(liveId) {
                guard let local = OfflinePlay.lookup(liveId) else { continue }
                do {
                    let created = try await api.createLiveRound(courseId: local.courseId, tee: local.tee)
                    target = created.id
                    OfflinePlay.remove(liveId)
                    if activeLiveRound?.id == liveId {
                        activeLiveRound = created
                    }
                } catch {
                    break
                }
            }
            do {
                let mapped = OfflinePlay.remap(Array(drafts.prefix(200)), to: target)
                let posted = try await api.postShots(liveRoundId: target, drafts: mapped)
                ShotQueue.remove(clientIds: Set(posted.compactMap(\.clientId)))
            } catch {
                break
            }
        }
    }

    func flushRecapQueue() async {
        for item in RecapQueue.all() {
            do {
                if let audio = item.audio, audio.count >= 1_024 {
                    _ = try await api.uploadRecap(
                        audio: audio,
                        roundId: item.roundId,
                        liveRoundId: item.liveRoundId,
                        draft: RecapDraft(
                            transcript: item.transcript,
                            summary: item.summary,
                            structuredOnDevice: item.source == "ios_on_device",
                            fromSpeech: true,
                            model: item.model,
                            durationS: item.durationS
                        )
                    )
                } else {
                    _ = try await api.typedRecap(
                        roundId: item.roundId,
                        liveRoundId: item.liveRoundId,
                        draft: RecapDraft(
                            transcript: item.transcript,
                            summary: item.summary,
                            structuredOnDevice: item.source == "ios_on_device",
                            fromSpeech: item.source != nil,
                            model: item.model,
                            durationS: item.durationS
                        )
                    )
                }
                RecapQueue.remove(clientIds: [item.clientId])
            } catch {
                break
            }
        }
    }

    @discardableResult
    private func beginRunningSession(
        clubName: String,
        accountId: String?,
        knownCards: Int?,
        kind: SyncSession.Kind
    ) -> String {
        errorMessage = nil
        isBusy = true
        let progressID = UUID().uuidString
        syncSession = SyncSession(
            id: UUID(),
            progressID: progressID,
            kind: kind,
            clubName: clubName,
            accountId: accountId,
            knownCards: knownCards,
            startedAt: Date(),
            progress: SyncAPIProgress(club: clubName, stage: .connect),
            outcome: .running
        )
        reopenClubsAfterFailure = showsClubs
        showsClubs = false
        return progressID
    }

    private func performClubSync(
        clubName: String,
        accountId: String?,
        knownCards: Int?,
        kind: SyncSession.Kind,
        work: (String) async throws -> SyncResult
    ) async {
        let progressID = beginRunningSession(
            clubName: clubName,
            accountId: accountId,
            knownCards: knownCards,
            kind: kind
        )
        await finishClubSync(progressID: progressID, knownCards: knownCards, kind: kind, work: work)
    }

    private func finishClubSync(
        progressID: String,
        knownCards: Int?,
        kind: SyncSession.Kind,
        work: (String) async throws -> SyncResult
    ) async {
        guard let session = syncSession, session.progressID == progressID else {
            isBusy = false
            return
        }
        let poller = Task { await pollRemoteProgress(sessionID: session.id, progressID: progressID) }
        defer {
            poller.cancel()
            isBusy = false
        }

        do {
            let result = try await work(progressID)
            if result.ok {
                await load()
                selectedTab = .inicio
                showsClubs = false
                let cards = result.cardCount ?? home.cards
                let added = result.newCards ?? max(0, cards - (knownCards ?? 0))
                markSyncSucceeded(sessionID: session.id, cards: cards, newCards: added)
                celebrateCards = cards
                toastMessage = added > 0 && (knownCards ?? 0) > 0
                    ? "\(added) tarjetas nuevas · \(cards) en total"
                    : "Al día · \(cards) tarjetas"
            } else {
                await failSync(sessionID: session.id, kind: kind, message: result.message)
            }
        } catch {
            await failSync(sessionID: session.id, kind: kind, message: error.localizedDescription)
        }
    }

    private func applyRemoteProgress(_ progress: SyncAPIProgress, sessionID: UUID) {
        guard var session = syncSession, session.id == sessionID, session.outcome == .running else { return }
        var next = progress.merging(onto: session.progress)
        if let name = next.club, !name.isEmpty {
            session.clubName = name
        } else if next.club == nil {
            next.club = session.clubName
        }
        session.progress = next
        syncSession = session
    }

    private func markSyncSucceeded(sessionID: UUID, cards: Int, newCards: Int) {
        guard var session = syncSession, session.id == sessionID else { return }
        session.outcome = .succeeded
        session.resultCards = cards
        session.resultNewCards = newCards
        session.progress.stage = .done
        session.progress.finished = true
        session.progress.listTotal = session.progress.listTotal ?? cards
        session.progress.cardsTotal = session.progress.cardsTotal ?? newCards
        syncSession = session
    }

    private func failSync(sessionID: UUID, kind: SyncSession.Kind, message: String) async {
        errorMessage = message
        if var session = syncSession, session.id == sessionID {
            session.outcome = .failed
            session.errorMessage = message
            session.progress.error = message
            syncSession = session
        }
        let wait = RuntimeFlags.isUITesting ? 0.2 : (kind == .link ? 1.6 : 2.2)
        try? await Task.sleep(for: .seconds(wait))
        if syncSession?.id == sessionID {
            syncSession = nil
        }
        if reopenClubsAfterFailure { showsClubs = true }
    }

    private func pollRemoteProgress(sessionID: UUID, progressID: String) async {
        try? await Task.sleep(for: .milliseconds(RuntimeFlags.isUITesting ? 40 : 350))
        while !Task.isCancelled, syncSession?.id == sessionID, syncSession?.outcome == .running {
            if let progress = await api.pollSyncProgress(progressID: progressID) {
                applyRemoteProgress(progress, sessionID: sessionID)
            }
            try? await Task.sleep(for: .milliseconds(RuntimeFlags.isUITesting ? 80 : 700))
        }
    }

    private func apply(_ snap: AppSnapshot) {
        user = snap.user
        profile = snap.profile
        clubs = snap.clubs
        rounds = snap.rounds
        courses = snap.courses
        tees = snap.tees
        holeStats = snap.holeStats
        bag = snap.bag
        if let last = snap.rounds.sorted(by: { $0.date > $1.date }).first,
           last.course == "Azul" || last.course == "Colorada" {
            selectedCourseName = last.course
        }
    }

    private func run(_ work: () async throws -> Void) async {
        errorMessage = nil
        authFailure = nil
        isBusy = true
        defer { isBusy = false }
        do {
            try await work()
        } catch {
            if let golf = error as? GolfletError, let failure = golf.authFailure {
                authFailure = failure
                errorMessage = failure.message
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }
}

enum AppTab: String, CaseIterable, Identifiable {
    case inicio, resumen, rondas, cancha, bolsa
    var id: String { rawValue }

    var title: String {
        switch self {
        case .inicio: return "Inicio"
        case .resumen: return "Resumen"
        case .rondas: return "Rondas"
        case .cancha: return "Cancha"
        case .bolsa: return "Mi bolsa"
        }
    }

    var systemImage: String {
        switch self {
        case .inicio: return "house"
        case .resumen: return "chart.xyaxis.line"
        case .rondas: return "square.stack"
        case .cancha: return "flag"
        case .bolsa: return "bag"
        }
    }
}
