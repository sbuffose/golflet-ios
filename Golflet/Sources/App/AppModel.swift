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

    let api: any GolfletAPI
    let notes: NotesStore

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
        await run {
            let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
            let result = try await api.linkClub(
                clubID: clubID,
                baseURL: clubID == nil ? trimmed : nil,
                matricula: matricula,
                password: clave,
                savePassword: savePassword
            )
            errorMessage = result.ok ? nil : result.message
            await load()
        }
    }

    func syncClub(_ club: LinkedClub, password: String? = nil, savePassword: Bool = false) async {
        await run {
            let result = try await api.syncAccount(id: club.accountId, password: password, savePassword: savePassword)
            errorMessage = result.ok ? nil : result.message
            await load()
        }
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
