import AppIntents
import Foundation

enum GolfletClubChoice: String, AppEnum {
    case driver
    case madera3
    case hibrido
    case hierro4
    case hierro5
    case hierro6
    case hierro7
    case hierro8
    case hierro9
    case pw
    case sw
    case lw
    case putter

    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Palo")

    static var caseDisplayRepresentations: [GolfletClubChoice: DisplayRepresentation] = [
        .driver: "Driver",
        .madera3: "Madera 3",
        .hibrido: "Híbrido",
        .hierro4: "Hierro 4",
        .hierro5: "Hierro 5",
        .hierro6: "Hierro 6",
        .hierro7: "Hierro 7",
        .hierro8: "Hierro 8",
        .hierro9: "Hierro 9",
        .pw: "PW",
        .sw: "SW",
        .lw: "LW",
        .putter: "Putter"
    ]

    var code: String {
        ClubPhrase.code(for: rawLabel)
    }

    var rawLabel: String {
        switch self {
        case .driver: return "Driver"
        case .madera3: return "Madera 3"
        case .hibrido: return "Híbrido"
        case .hierro4: return "Hierro 4"
        case .hierro5: return "Hierro 5"
        case .hierro6: return "Hierro 6"
        case .hierro7: return "Hierro 7"
        case .hierro8: return "Hierro 8"
        case .hierro9: return "Hierro 9"
        case .pw: return "PW"
        case .sw: return "SW"
        case .lw: return "LW"
        case .putter: return "Putter"
        }
    }
}

struct RegistrarGolpeIntent: AppIntent {
    static var title: LocalizedStringResource = "Registrar golpe"
    static var description = IntentDescription("Anota un golpe en la ronda GPS en curso.")
    static var openAppWhenRun = false

    @Parameter(title: "Palo", default: .hierro7)
    var club: GolfletClubChoice

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let code = club.code
        let queued = ActivePlayIntents.enqueueShot(club: code)
        await MainActor.run {
            IntentRouter.shared.post(.recordShot(club: code))
        }
        if queued {
            return .result(dialog: "Golpe con \(club.rawLabel) anotado. Se sincroniza cuando haya red.")
        }
        return .result(dialog: "Abrí la ronda GPS para anotar el golpe con \(club.rawLabel).")
    }
}

struct GolfletCourseEntity: AppEntity, Identifiable, Hashable {
    static var typeDisplayRepresentation = TypeDisplayRepresentation(name: "Cancha")
    static var defaultQuery = GolfletCourseEntityQuery()

    var id: String
    var label: String
    var clubName: String
    var courseName: String
    var clubCode: String

    init(id: String, label: String, clubName: String, courseName: String, clubCode: String = "") {
        self.id = id
        self.label = label
        self.clubName = clubName
        self.courseName = courseName
        self.clubCode = clubCode
    }

    init(summary: GPSCourseSummary) {
        let club = CourseDisplay.clubTitle(summary)
        let course = CourseDisplay.courseTitle(summary)
        self.init(
            id: summary.courseId,
            label: CourseDisplay.fullName(summary),
            clubName: club,
            courseName: course,
            clubCode: summary.clubCode
        )
    }

    var displayRepresentation: DisplayRepresentation {
        if clubName.caseInsensitiveCompare(courseName) == .orderedSame {
            return DisplayRepresentation(title: LocalizedStringResource(stringLiteral: clubName))
        }
        return DisplayRepresentation(
            title: LocalizedStringResource(stringLiteral: courseName),
            subtitle: LocalizedStringResource(stringLiteral: clubName)
        )
    }
}

struct GolfletCourseEntityQuery: EntityQuery {
    func entities(for identifiers: [GolfletCourseEntity.ID]) async throws -> [GolfletCourseEntity] {
        let wanted = Set(identifiers)
        return await CourseCatalog.entities().filter { wanted.contains($0.id) }
    }

    func suggestedEntities() async throws -> [GolfletCourseEntity] {
        await CourseCatalog.entities().sorted {
            if $0.clubName != $1.clubName {
                return $0.clubName.localizedStandardCompare($1.clubName) == .orderedAscending
            }
            return $0.courseName.localizedStandardCompare($1.courseName) == .orderedAscending
        }
    }
}

extension GolfletCourseEntityQuery: EntityStringQuery {
    func entities(matching string: String) async throws -> [GolfletCourseEntity] {
        CourseCatalog.matching(string, in: await CourseCatalog.entities())
    }
}

struct EmpezarRondaIntent: AppIntent {
    static var title: LocalizedStringResource = "Empezar ronda"
    static var description = IntentDescription("Abre Golflet para empezar una ronda GPS.")
    static var openAppWhenRun = true

    @Parameter(title: "Cancha")
    var course: GolfletCourseEntity

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run {
            IntentRouter.shared.post(.startRound(hint: course.id))
        }
        return .result(dialog: "Vamos a empezar en \(course.courseName).")
    }
}

struct GrabarResumenIntent: AppIntent {
    static var title: LocalizedStringResource = "Grabar resumen de la ronda"
    static var description = IntentDescription("Abre el recap para grabar y transcribir en el iPhone.")
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult & ProvidesDialog {
        await MainActor.run {
            IntentRouter.shared.post(.recordRecap)
        }
        return .result(dialog: "Abrí el recap. La transcripción queda en el iPhone.")
    }
}

struct GolfletShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RegistrarGolpeIntent(),
            phrases: [
                "Registrar golpe con \(\.$club) en \(.applicationName)",
                "Anotar un golpe con \(\.$club) en \(.applicationName)"
            ],
            shortTitle: "Registrar golpe",
            systemImageName: "figure.golf"
        )
        AppShortcut(
            intent: EmpezarRondaIntent(),
            phrases: [
                "Empezar ronda en \(\.$course) con \(.applicationName)",
                "Empezar ronda en \(.applicationName)"
            ],
            shortTitle: "Empezar ronda",
            systemImageName: "location"
        )
        AppShortcut(
            intent: GrabarResumenIntent(),
            phrases: [
                "Grabar resumen de la ronda en \(.applicationName)",
                "Contar cómo me fue en \(.applicationName)"
            ],
            shortTitle: "Grabar resumen",
            systemImageName: "mic"
        )
    }
}

enum ActivePlayIntents {
    static func enqueueShot(club: String) -> Bool {
        guard let active = OfflinePlay.loadActive() else { return false }
        let gps = OfflinePlay.lastGPS()
        let draft = ShotDraft(
            clientId: String(UUID().uuidString.prefix(32)),
            hole: active.hole,
            lat: gps?.0.lat ?? 0,
            lng: gps?.0.lng ?? 0,
            accuracyM: gps?.1,
            takenAt: Date(),
            club: club,
            lie: nil,
            result: nil,
            direction: nil,
            length: nil,
            mishit: false,
            liveRoundId: active.roundId
        )
        ShotQueue.enqueue(draft)
        return true
    }
}
