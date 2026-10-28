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
    var selectedCourseName = "Colorada"
    var presentedRound: Round?
    var presentedHole: Int?
    var showsClubs = false
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

    let api: any GolfletAPI
    let notes: NotesStore
    private var reopenClubsAfterFailure = false

    init(api: any GolfletAPI, notes: NotesStore) {
        self.api = api
        self.notes = notes
        self.isSignedIn = api.isAuthenticated
    }

    var isAuthenticated: Bool { isSignedIn }
    var isLive: Bool { !api.persistsLocally }
    var home: HomeSnapshot { StatsEngine.home(rounds: rounds) }
    var summary: SummarySnapshot { StatsEngine.summary(rounds: rounds, filter: courseFilter) }

    func courseSnapshot() -> CourseSnapshot {
        StatsEngine.course(named: selectedCourseName, rounds: rounds, courses: courses, tees: tees)
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
            isLoaded = true
            await consumeIntent()
        } catch {
            errorMessage = error.localizedDescription
            isLoaded = true
        }
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
