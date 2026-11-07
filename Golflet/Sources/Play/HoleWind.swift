import Foundation

/// Wind direction relative to a verified tee-to-green bearing.
/// Meteorological convention: `windFromDeg` is where the wind comes FROM.
enum HoleWind {
    enum Relative: Equatable, Sendable {
        case favor
        case contra
        case cruzado
        case unavailable

        var label: String {
            switch self {
            case .favor: return "a favor"
            case .contra: return "en contra"
            case .cruzado: return "cruzado"
            case .unavailable: return "sin rumbo"
            }
        }
    }

    struct Hole: Equatable, Sendable, Identifiable {
        var id: Int { number }
        var number: Int
        var relative: Relative
        var speedKmh: Int?
        var bearingDeg: Double?

        var line: String {
            guard let speedKmh else { return "Hoyo \(number) · sin velocidad" }
            switch relative {
            case .unavailable:
                return "Hoyo \(number) · \(speedKmh) km/h · sin rumbo del hoyo"
            case .favor, .contra, .cruzado:
                return "Hoyo \(number) · \(relative.label) · \(speedKmh) km/h"
            }
        }
    }

    /// Degrees clockwise from north. Nil when the text is not a real cardinal.
    static func degrees(from text: String?) -> Double? {
        guard var raw = text?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(), !raw.isEmpty else {
            return nil
        }
        raw = raw.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR"))
        raw = raw.replacingOccurrences(of: "del ", with: "")
            .replacingOccurrences(of: "desde ", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        switch raw {
        case "n", "norte": return 0
        case "ne", "noreste": return 45
        case "e", "este": return 90
        case "se", "sudeste", "sureste": return 135
        case "s", "sur": return 180
        case "so", "suroeste", "sudoeste": return 225
        case "o", "w", "oeste": return 270
        case "no", "nw", "noroeste": return 315
        default: return nil
        }
    }

    /// `bearingDeg` is the direction of play, tee toward the green.
    /// Wind FROM that same direction is into the face (en contra).
    static func relative(windFromDeg: Double?, bearingDeg: Double?) -> Relative {
        guard let windFromDeg, let bearingDeg else { return .unavailable }
        let delta = normalize(windFromDeg - bearingDeg)
        if delta < 45 || delta >= 315 { return .contra }
        if delta >= 135 && delta < 225 { return .favor }
        return .cruzado
    }

    static func holes(course: GPSCourseDetail, windFromDeg: Double?, speedKmh: Int?) -> [Hole] {
        rows(holes: course.holes, windFromDeg: windFromDeg, speedKmh: speedKmh)
    }

    static func rows(holes: [GPSHole], windFromDeg: Double?, speedKmh: Int?) -> [Hole] {
        holes.map { hole in
            let bearing = bearing(of: hole)
            return Hole(
                number: hole.number,
                relative: relative(windFromDeg: windFromDeg, bearingDeg: bearing),
                speedKmh: speedKmh,
                bearingDeg: bearing
            )
        }
    }

    /// Arrow points where the wind pushes the ball: up the screen is the direction of play.
    static func arrowDegrees(_ relative: Relative) -> Double {
        switch relative {
        case .favor: return 0
        case .contra: return 180
        case .cruzado: return 90
        case .unavailable: return 0
        }
    }

    static func bearing(of hole: GPSHole) -> Double? {
        guard let tee = hole.tee, let pin = hole.green.center ?? hole.green.front ?? hole.green.back else {
            return nil
        }
        return HoleGeoMath.heading(from: tee, to: pin)
    }

    static func relativeText(windFromDeg: Double?, holes: [Hole]) -> String {
        guard windFromDeg != nil else {
            return "El horario no dice de dónde viene. No clasifico el viento."
        }
        let known = holes.filter { $0.relative != .unavailable }
        if holes.isEmpty || known.isEmpty {
            return "Sin rumbo verificado del tee al green. No clasifico el viento."
        }
        var lines = known.map(\.line)
        let missing = holes.filter { $0.relative == .unavailable }.map { "\($0.number)" }
        if !missing.isEmpty {
            lines.append("Hoyos \(missing.joined(separator: ", ")): sin rumbo.")
        }
        return lines.joined(separator: "\n")
    }

    static func summary(windFromDeg: Double?, speedKmh: Int?, holes: [Hole]) -> String {
        var lines: [String] = []
        if let speedKmh {
            if let windFromDeg {
                lines.append("Viento \(speedKmh) km/h desde \(TeeForecast.cardinal(windFromDeg)).")
            } else {
                lines.append("Viento \(speedKmh) km/h. El horario no trae de dónde viene.")
            }
        }
        if holes.isEmpty || windFromDeg == nil {
            lines.append("Sin rumbo verificado del tee al green. No clasifico el viento.")
            return lines.joined(separator: " ")
        }
        let known = holes.filter { $0.relative != .unavailable }
        if known.isEmpty {
            lines.append("Sin rumbo verificado del tee al green. No clasifico el viento.")
        } else {
            lines.append(contentsOf: known.map(\.line))
            let missing = holes.filter { $0.relative == .unavailable }.map { "\($0.number)" }
            if !missing.isEmpty {
                lines.append("Hoyos \(missing.joined(separator: ", ")): sin rumbo.")
            }
        }
        return lines.joined(separator: "\n")
    }

    private static func normalize(_ degrees: Double) -> Double {
        let wrapped = degrees.truncatingRemainder(dividingBy: 360)
        return wrapped < 0 ? wrapped + 360 : wrapped
    }
}
