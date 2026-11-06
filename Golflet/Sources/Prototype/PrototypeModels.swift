import Foundation
import SwiftUI

enum ProfileMode: String, CaseIterable, Identifiable, Codable {
    case clasico, comp, mej, soc
    var id: String { rawValue }

    var title: String {
        switch self {
        case .clasico: return "Clásico"
        case .comp: return "Competitivo"
        case .mej: return "Mejorar"
        case .soc: return "Social"
        }
    }

    var blurb: String {
        switch self {
        case .clasico: return "Tu hándicap, tus próximas salidas y tu historial"
        case .comp: return "Tu próximo partido, el récord contra cada rival y la tabla del grupo"
        case .mej: return "La tendencia de tu hándicap, tus errores y qué practicar"
        case .soc: return "Quién juega cuándo y lo último de tus amigos"
        }
    }

    var holeDefaults: Set<HoleFeature> {
        switch self {
        case .clasico: return []
        case .comp: return [.partido, .ritmo]
        case .mej: return [.track, .palo, .viento, .verde, .herram, .ideas, .stats]
        case .soc: return [.partido, .compartir]
        }
    }
}

enum HoleFeature: String, CaseIterable, Identifiable, Codable {
    case track, palo, viento, verde, herram, partido, ritmo, ideas, stats, compartir
    var id: String { rawValue }

    var title: String {
        switch self {
        case .track: return "Registrar golpe a golpe"
        case .palo: return "Palo sugerido, mira y dispersión"
        case .viento: return "Viento"
        case .verde: return "Vista del green"
        case .herram: return "Mover bandera y salida, ubicación"
        case .partido: return "Partido del grupo"
        case .ritmo: return "Ritmo de juego"
        case .ideas: return "Ideas de swing"
        case .stats: return "Estadísticas"
        case .compartir: return "Compartir la vuelta"
        }
    }
}

struct RoundSettings: Codable, Equatable {
    var cancha: String = "Azul"
    var tee: String = "Negras"
    var hoyos: String = "18"
    var formato: String = "Medal"
    var voz: Bool = true
    var overrides: [String: Bool] = [:]

    var startHole: Int { hoyos == "Últimos 9" ? 10 : 1 }

    func shows(_ feature: HoleFeature, mode: ProfileMode) -> Bool {
        if let over = overrides[feature.rawValue] { return over }
        return mode.holeDefaults.contains(feature)
    }

    mutating func set(_ feature: HoleFeature, on: Bool) {
        overrides[feature.rawValue] = on
    }
}

struct OnboardingState: Codable, Equatable {
    var done = false
    var name = ""
    var score = ""
    var meta = ""
    var debil = ""
    var frec = ""
    var modo = "clasico"
    var edad = ""
    var genero = ""
    var mano = ""
    var bag: [String] = PrototypeBag.defaultCodes
    var i7: Int?
    var unit = "m"
    var notifications = false

    var displayName: String {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "Martín" : trimmed
    }
}

enum PrototypeBag {
    static let groups: [(String, [String])] = [
        ("Maderas", ["Dr", "2m", "3m", "4m", "5m", "7m", "9m"]),
        ("Híbridos", ["2h", "3h", "4h", "5h", "6h", "7h"]),
        ("Hierros", ["1i", "2i", "3i", "4i", "5i", "6i", "7i", "8i", "9i"]),
        ("Wedges", ["PW", "GW", "SW", "LW", "46°", "48°", "50°", "52°", "54°", "56°", "58°", "60°", "62°", "64°"]),
        ("Putter", ["Putter"])
    ]
    static let defaultCodes = ["Dr", "3m", "5m", "4h", "5i", "6i", "7i", "8i", "9i", "PW", "52°", "56°", "60°", "Putter"]
    static let ratios: [String: Double] = [
        "Dr": 1.55, "2m": 1.45, "3m": 1.4, "4m": 1.34, "5m": 1.3, "7m": 1.22, "9m": 1.16,
        "2h": 1.28, "3h": 1.24, "4h": 1.19, "5h": 1.14, "6h": 1.09, "7h": 1.04,
        "1i": 1.3, "2i": 1.25, "3i": 1.2, "4i": 1.15, "5i": 1.1, "6i": 1.05, "7i": 1, "8i": 0.94, "9i": 0.88,
        "PW": 0.81, "GW": 0.74, "SW": 0.6, "LW": 0.5,
        "46°": 0.8, "48°": 0.76, "50°": 0.72, "52°": 0.68, "54°": 0.64, "56°": 0.6, "58°": 0.55, "60°": 0.5, "62°": 0.46, "64°": 0.42
    ]

    static func label(_ code: String) -> String {
        switch code {
        case "Dr": return "Driver"
        case "2m": return "Madera 2"
        case "3m": return "Madera 3"
        case "4m": return "Madera 4"
        case "5m": return "Madera 5"
        case "7m": return "Madera 7"
        case "9m": return "Madera 9"
        case "Putter": return "Putter"
        default:
            if code.hasSuffix("i") { return "Hierro \(code.dropLast())" }
            if code.hasSuffix("h") { return "Híbrido \(code.dropLast())" }
            return code
        }
    }

    static func chip(_ code: String) -> String {
        if code.hasSuffix("i") { return "\(code.dropLast())i" }
        return code
    }

    static func distance(code: String, i7Meters: Int, unit: String) -> Int? {
        guard let ratio = ratios[code] else { return nil }
        let meters = Double(i7Meters) * ratio
        return Int((unit == "yd" ? meters * 1.0936 : meters).rounded())
    }

    static func suggest(meters: Double, bag: [String], i7: Int?) -> (String, Double) {
        let i7m = Double(i7 ?? 135)
        if meters < 12 { return ("Putter", meters) }
        let clubs = bag.filter { $0 != "Putter" && ratios[$0] != nil }
            .map { ($0, i7m * (ratios[$0] ?? 1)) }
            .sorted { $0.1 < $1.1 }
        if let hit = clubs.first(where: { $0.1 >= meters }) { return hit }
        return clubs.last ?? ("Hierro 7", i7m)
    }
}

struct ProtoGroup: Identifiable, Hashable, Codable {
    var id: String
    var name: String
    var kind: String
    var members: [String]
    var example: Bool
}

struct ProtoChallenge: Identifiable, Hashable, Codable {
    var id: String
    var tipo: String
    var period: String
    var progress: Int
}

enum PrototypeStore {
    private static let modeKey = "golflet.proto.mode"
    private static let onboardingKey = "golflet.proto.onboarding.v2"
    private static let settingsKey = "golflet.proto.round"
    private static let planKey = "golflet.proto.plan"
    private static let groupsKey = "golflet.proto.groups"
    private static let challengesKey = "golflet.proto.challenges"

    static var testing: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("-ui-testing") || args.contains("-ui-testing-auth")
    }

    static var forceOnboarding: Bool {
        ProcessInfo.processInfo.arguments.contains("-ui-testing-onboarding")
    }

    static func loadMode() -> ProfileMode {
        if testing && !forceOnboarding { return .clasico }
        if let raw = UserDefaults.standard.string(forKey: modeKey), let mode = ProfileMode(rawValue: raw) {
            return mode
        }
        return .clasico
    }

    static func saveMode(_ mode: ProfileMode) {
        UserDefaults.standard.set(mode.rawValue, forKey: modeKey)
    }

    static func loadOnboarding() -> OnboardingState {
        if forceOnboarding { return OnboardingState() }
        if testing { return OnboardingState(done: true) }
        if let data = UserDefaults.standard.data(forKey: onboardingKey),
           let state = try? JSONDecoder().decode(OnboardingState.self, from: data) {
            return state
        }
        return OnboardingState()
    }

    static func saveOnboarding(_ state: OnboardingState) {
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: onboardingKey)
        }
    }

    static func loadSettings() -> RoundSettings {
        if let data = UserDefaults.standard.data(forKey: settingsKey),
           let settings = try? JSONDecoder().decode(RoundSettings.self, from: data) {
            return settings
        }
        return RoundSettings()
    }

    static func saveSettings(_ settings: RoundSettings) {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: settingsKey)
        }
    }

    static func loadPlanDone() -> Set<String> {
        Set(UserDefaults.standard.stringArray(forKey: planKey) ?? [])
    }

    static func savePlanDone(_ done: Set<String>) {
        UserDefaults.standard.set(Array(done), forKey: planKey)
    }
}
