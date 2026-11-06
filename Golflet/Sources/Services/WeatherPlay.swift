import Foundation

/// What the booked tee time actually says about the weather, and what that
/// means for this player's own carry and cards. Missing numbers stay missing.
enum WeatherPlay {
    struct Report: Equatable, Sendable {
        var lines: [String]
        var hasNumbers: Bool
    }

    static func report(booking: TeeTime?, rounds: [Round], bag: [BagClub]) -> Report {
        guard let booking else {
            return Report(lines: ["No hay un tee time reservado, así que no hay viento, temperatura ni lluvia."], hasNumbers: false)
        }
        var lines: [String] = []
        let carry = driverCarry(bag)
        if let kmh = booking.windKmh {
            var wind = "Viento \(kmh) km/h"
            if let from = booking.windFrom, !from.isEmpty {
                wind += " desde \(from)"
            }
            lines.append(wind + ".")
            if booking.windFrom == nil || booking.windFrom?.isEmpty == true {
                lines.append("El horario no dice de dónde viene, así que no cambio el palo.")
            } else {
                lines.append("El horario no trae el rumbo de cada hoyo, así que el plan de salida queda como está.")
            }
            if let carry {
                lines.append("Tu driver está en \(carry) m. Con viento de frente de esta fuerza, pensá un palo más en los hierros.")
            }
        }
        if let temp = booking.tempC {
            lines.append("Temperatura \(temp)°.")
            if temp < 15 {
                if let carry {
                    lines.append("Por debajo de 15° la pelota vuela menos. Con el driver a \(carry) m, un palo más alcanza en los hierros.")
                } else {
                    lines.append("Por debajo de 15° la pelota vuela menos. No tengo tu distancia de driver para pasar eso a metros.")
                }
            }
        }
        if let rain = booking.rainMm {
            if rain > 0 {
                lines.append("Lluvia \(FormatAR.one(rain)) mm. El grip y el primer bote cambian. No calculo golpes de más.")
            } else {
                lines.append("Lluvia 0 mm.")
            }
        }
        lines.append(contentsOf: scoring(rounds: rounds, forecast: booking.forecast))
        if lines.isEmpty {
            return Report(
                lines: ["\(booking.chipWhen) en \(booking.course.isEmpty ? booking.clubName : booking.course) no trae viento, temperatura ni lluvia."],
                hasNumbers: false
            )
        }
        if let slot = booking.course.isEmpty ? nil : booking.course {
            lines.insert("Horario: \(booking.chipWhen) · \(slot).", at: 0)
        }
        return Report(lines: lines, hasNumbers: booking.windKmh != nil || booking.tempC != nil || booking.rainMm != nil)
    }

    static func driverCarry(_ bag: [BagClub]) -> Int? {
        bag.first { club in
            let name = club.name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
            return name == "dr" || name.contains("driver")
        }?.carry
    }

    /// Average gross only for weather words that are already written on his cards.
    private static func scoring(rounds: [Round], forecast: String?) -> [String] {
        let labeled = rounds.filter { round in
            guard let weather = round.weather?.trimmingCharacters(in: .whitespacesAndNewlines), !weather.isEmpty else { return false }
            return round.gross != nil
        }
        guard !labeled.isEmpty else {
            return ["Tus tarjetas no tienen el clima anotado, así que no comparo el score."]
        }
        guard let forecast, !forecast.isEmpty else { return [] }
        let same = labeled.filter { $0.weather?.caseInsensitiveCompare(forecast) == .orderedSame }
        guard !same.isEmpty, let average = averageGross(same) else { return [] }
        return ["En tus tarjetas marcadas «\(forecast)», el promedio es \(FormatAR.one(average))."]
    }

    private static func averageGross(_ rounds: [Round]) -> Double? {
        let values = rounds.compactMap(\.gross)
        guard !values.isEmpty else { return nil }
        return Double(values.reduce(0, +)) / Double(values.count)
    }
}
