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
    var catalogue: [ClubCatalogEntry] = []
    var isLoaded = false
    var isBusy = false
    var errorMessage: String?
    var selectedTab: AppTab = .inicio
    var courseFilter: CourseFilter = .all
    var selectedCourseName = "Colorada"
    var presentedRound: Round?
    var presentedHole: Int?
    var showsClubs = false
    var syncSession: SyncSession?

    let api: any GolfletAPI
    let notes: NotesStore
    private var lastRemoteProgressAt = Date.distantPast
    private var reopenClubsAfterFailure = false

    init(api: any GolfletAPI, notes: NotesStore) {
        self.api = api
        self.notes = notes
    }

    var isAuthenticated: Bool { api.isAuthenticated }
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
            if catalogue.isEmpty {
                catalogue = (try? await api.clubCatalogue()) ?? []
            }
            isLoaded = true
        } catch {
            errorMessage = error.localizedDescription
            isLoaded = true
        }
    }

    func signUp(name: String, email: String, password: String) async {
        await run {
            try await api.signUp(name: name, email: email, password: password)
            await load()
        }
    }

    func signIn(email: String, password: String) async {
        await run {
            try await api.signIn(email: email, password: password)
            await load()
        }
    }

    func signOut() async {
        await run {
            try await api.signOut()
            user = nil
            clubs = []
            rounds = []
            courses = []
            tees = []
            holeStats = []
            bag = []
            isLoaded = true
        }
    }

    func addClub(clubID: Int?, urlString: String, matricula: String, clave: String, savePassword: Bool) async {
        let name = clubID.flatMap { id in catalogue.first { $0.id == id }?.name } ?? "tu club"
        await performClubSync(clubName: name, accountId: nil, knownCards: nil, kind: .link) { handler in
            let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
            return try await api.linkClub(
                clubID: clubID,
                baseURL: clubID == nil ? trimmed : nil,
                matricula: matricula,
                password: clave,
                savePassword: savePassword,
                progress: handler
            )
        }
    }

    func syncClub(_ club: LinkedClub, password: String? = nil, savePassword: Bool = false) async {
        await performClubSync(clubName: club.name, accountId: club.accountId, knownCards: club.cardCount, kind: .refresh) { handler in
            try await api.syncAccount(id: club.accountId, password: password, savePassword: savePassword, progress: handler)
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

    private func performClubSync(
        clubName: String,
        accountId: String?,
        knownCards: Int?,
        kind: SyncSession.Kind,
        work: (@escaping SyncProgressHandler) async throws -> SyncResult
    ) async {
        errorMessage = nil
        isBusy = true
        let session = SyncSession(
            id: UUID(),
            kind: kind,
            clubName: clubName,
            accountId: accountId,
            knownCards: knownCards,
            startedAt: Date(),
            progress: SyncProgress(phase: .connecting, message: "Conectando con \(clubName)"),
            outcome: .running
        )
        syncSession = session
        lastRemoteProgressAt = .distantPast
        reopenClubsAfterFailure = showsClubs
        showsClubs = false

        let ticker = Task { await tickStagedProgress(sessionID: session.id, clubName: clubName, knownCards: knownCards) }
        let poller = Task { await pollRemoteProgress(sessionID: session.id, accountId: accountId) }
        defer {
            ticker.cancel()
            poller.cancel()
            isBusy = false
        }

        do {
            let result = try await work { [weak self] progress in
                Task { @MainActor in
                    self?.applyRemoteProgress(progress, sessionID: session.id)
                }
            }
            if result.ok {
                await load()
                selectedTab = .inicio
                showsClubs = false
                markSyncSucceeded(sessionID: session.id)
                let timeout = RuntimeFlags.isUITesting ? 2.4 : 4.0
                let deadline = Date().addingTimeInterval(timeout)
                while syncSession?.id == session.id, Date() < deadline {
                    try? await Task.sleep(for: .milliseconds(80))
                }
                if syncSession?.id == session.id {
                    syncSession = nil
                }
            } else {
                errorMessage = result.message
                syncSession = nil
                if reopenClubsAfterFailure { showsClubs = true }
            }
        } catch {
            errorMessage = error.localizedDescription
            syncSession = nil
            if reopenClubsAfterFailure { showsClubs = true }
        }
    }

    private func applyRemoteProgress(_ progress: SyncProgress, sessionID: UUID) {
        guard var session = syncSession, session.id == sessionID, session.outcome == .running else { return }
        session.progress = progress
        syncSession = session
        lastRemoteProgressAt = Date()
    }

    private func applyStagedProgress(_ progress: SyncProgress, sessionID: UUID) {
        guard var session = syncSession, session.id == sessionID, session.outcome == .running else { return }
        session.progress = progress
        syncSession = session
    }

    private func markSyncSucceeded(sessionID: UUID) {
        guard var session = syncSession, session.id == sessionID else { return }
        session.outcome = .succeeded
        session.progress = SyncProgress(phase: .success, message: "Listo")
        syncSession = session
    }

    private func tickStagedProgress(sessionID: UUID, clubName: String, knownCards: Int?) async {
        while !Task.isCancelled, syncSession?.id == sessionID, syncSession?.outcome == .running {
            if Date().timeIntervalSince(lastRemoteProgressAt) > 1.05, let started = syncSession?.startedAt {
                let staged = SyncProgressParser.staged(
                    clubName: clubName,
                    elapsed: Date().timeIntervalSince(started),
                    knownCards: knownCards,
                    compressed: RuntimeFlags.isUITesting || api.persistsLocally
                )
                applyStagedProgress(staged, sessionID: sessionID)
            }
            try? await Task.sleep(for: .milliseconds(280))
        }
    }

    private func pollRemoteProgress(sessionID: UUID, accountId: String?) async {
        while !Task.isCancelled, syncSession?.id == sessionID, syncSession?.outcome == .running {
            if let progress = await api.pollSyncProgress(accountId: accountId) {
                applyRemoteProgress(progress, sessionID: sessionID)
            }
            try? await Task.sleep(for: .seconds(RuntimeFlags.isUITesting ? 0.4 : 2.0))
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
        isBusy = true
        defer { isBusy = false }
        do { try await work() } catch { errorMessage = error.localizedDescription }
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
