import Foundation
import Observation

@MainActor
@Observable
final class AppModel {
    var profile = PlayerProfile(displayName: "Jugador Demo", initials: "JD", currentHandicap: 3.1)
    var clubs: [LinkedClub] = []
    var rounds: [Round] = []
    var courses: [Course] = []
    var tees: [TeeRating] = []
    var holeStats: [CourseHoleStats] = []
    var bag: [BagClub] = []
    var isLoaded = false
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

    var home: HomeSnapshot { StatsEngine.home(rounds: rounds) }
    var summary: SummarySnapshot { StatsEngine.summary(rounds: rounds, filter: courseFilter) }

    func courseSnapshot() -> CourseSnapshot {
        StatsEngine.course(named: selectedCourseName, rounds: rounds, courses: courses, tees: tees)
    }

    func load() async {
        errorMessage = nil
        do {
            async let clubsTask = api.linkedClubs()
            async let profileTask = api.profile()
            async let roundsTask = api.rounds(filter: RoundFilter())
            async let coursesTask = api.courses()
            async let teesTask = api.tees()
            async let statsTask = api.holeStats()
            clubs = try await clubsTask
            profile = try await profileTask
            rounds = try await roundsTask
            courses = try await coursesTask
            tees = try await teesTask
            holeStats = try await statsTask
            bag = notes.bag()
            if let last = rounds.sorted(by: { $0.date > $1.date }).first {
                selectedCourseName = last.course == "Azul" || last.course == "Colorada" ? last.course : "Colorada"
            }
            isLoaded = true
        } catch {
            errorMessage = error.localizedDescription
            isLoaded = true
        }
    }

    func addClub(urlString: String, matricula: String, clave: String) async {
        errorMessage = nil
        let trimmed = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        let resolved = trimmed.isEmpty ? "https://golf.e-jockeyclub.org.ar/golf" : trimmed
        guard let url = URL(string: resolved) else {
            errorMessage = "La URL no es válida."
            return
        }
        do {
            let club = try await api.login(clubURL: url, matricula: matricula, clave: clave)
            if !clubs.contains(where: { $0.code == club.code }) {
                clubs.append(club)
            } else {
                clubs = clubs.map { $0.code == club.code ? club : $0 }
            }
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
    }

    func openLastRound() {
        presentedRound = home.lastRound
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
