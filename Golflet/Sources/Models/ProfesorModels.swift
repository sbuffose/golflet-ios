import Foundation

struct Profesor: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var photoURL: String?
    var verified: Bool
    var locations: [String]
    var bio: String?
    var pending: Bool
    var canViewMetrics: Bool
    var canHearAudio: Bool
    var newContent: Int
    var linked: Bool = true
    var matricula: String? = nil

    var initials: String {
        let letters = GroupsParser.initials(name)
        return letters.isEmpty ? "P" : letters
    }

    var locationsLine: String? {
        let shown = locations
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
            .prefix(2)
        return shown.isEmpty ? nil : shown.joined(separator: " · ")
    }
}

enum ProfesorSearch {
    static func matches(_ query: String, in catalog: [Profesor]) -> [Profesor] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard needle.count >= 2 else { return [] }
        return catalog.filter {
            $0.name.range(of: needle, options: [.caseInsensitive, .diacriticInsensitive]) != nil
                || ($0.matricula?.localizedCaseInsensitiveContains(needle) == true)
        }
    }
}

struct ProfesorMatchAnswers: Hashable, Sendable {
    var availability: [String: [String]] = [:]
    var hcp: Double?
    var playFreq: String?
    var locations: [String] = []
    var budget: String?
    var classFreq: String?
    var suggestedHcp: Double?
    var locationChoices: [String] = []

    static let empty = ProfesorMatchAnswers()
}

struct ProfesorMatch: Identifiable, Hashable, Sendable {
    var profesor: Profesor
    var reasons: [String]
    var priceMin: Int?
    var priceMax: Int?

    var id: String { profesor.id }
}

enum ProfesorMatchOptions {
    static let questions = [
        "¿Cuándo podés tomar clases?",
        "¿Cuál es tu nivel?",
        "¿Cada cuánto jugás?",
        "¿Dónde te queda cómodo?",
        "¿Cuánto querés invertir?"
    ]
    static let days: [(String, String)] = [
        ("lun", "Lun"), ("mar", "Mar"), ("mie", "Mié"), ("jue", "Jue"),
        ("vie", "Vie"), ("sab", "Sáb"), ("dom", "Dom")
    ]
    static let slots: [(String, String)] = [
        ("m", "Mañana"), ("t", "Tarde"), ("n", "Noche")
    ]
    static let playFreq: [(String, String)] = [
        ("lt1m", "Menos de 1 por mes"),
        ("1_2m", "1 o 2 por mes"),
        ("semanal", "Semanal"),
        ("2sem", "2 o más por semana")
    ]
    static let budget: [(String, String)] = [
        ("b1", "Hasta $20.000"),
        ("b2", "$20.000 a $35.000"),
        ("b3", "$35.000 a $50.000"),
        ("b4", "Más de $50.000")
    ]
    static let classFreq: [(String, String)] = [
        ("suelta", "Clase suelta"),
        ("semanal", "Semanal"),
        ("quincenal", "Quincenal"),
        ("mensual", "Mensual")
    ]
}
