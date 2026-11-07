import Foundation

/// What the booked tee time actually says about the weather, and what that
/// means for this player's own carry and cards. Missing numbers stay missing.
enum WeatherPlay {
    struct Report: Equatable, Sendable {
        var lines: [String]
        var hasNumbers: Bool
    }

    static func report(booking: TeeTime?, rounds: [Round], bag: [BagClub], holes: [GPSHole] = []) -> Report {
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
            let fromDeg = HoleWind.degrees(from: booking.windFrom)
            let rows = HoleWind.rows(holes: holes, windFromDeg: fromDeg, speedKmh: kmh)
            lines.append(HoleWind.relativeText(windFromDeg: fromDeg, holes: rows))
            if let carry {
                lines.append("Tu driver medido está en \(carry) m.")
            }
        }
        if let temp = booking.tempC {
            lines.append("Temperatura \(temp)°.")
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
