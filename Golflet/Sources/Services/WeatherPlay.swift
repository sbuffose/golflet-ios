import Foundation

/// What the booked tee time actually says about the weather, and what that
/// means for this player's own carry and cards. Missing numbers stay missing.
enum WeatherPlay {
    struct Report: Equatable, Sendable {
        var lines: [String]
        var hasNumbers: Bool
    }

    static func report(booking: TeeTime?, rounds: [Round], bag: [BagClub], holes: [GPSHole] = []) -> Report {
        _ = rounds
        guard let booking else {
            return Report(lines: ["No hay un tee time reservado, así que no hay viento, temperatura ni lluvia."], hasNumbers: false)
        }
        var lines: [String] = []
        if let kmh = booking.windKmh {
            var wind = "Viento \(kmh) km/h"
            if let from = booking.windFrom, !from.isEmpty {
                wind += " desde \(from)"
            }
            lines.append(wind + ".")
            let fromDeg = HoleWind.degrees(from: booking.windFrom)
            let rows = HoleWind.rows(holes: holes, windFromDeg: fromDeg, speedKmh: kmh)
            lines.append(HoleWind.relativeText(windFromDeg: fromDeg, holes: rows))
        }
        if let temp = booking.tempC {
            lines.append("Temperatura \(temp)°.")
        }
        if let rain = booking.rainMm {
            if rain > 0 {
                lines.append("Lluvia \(FormatAR.one(rain)) mm.")
            } else {
                lines.append("Lluvia 0 mm.")
            }
        }
        if let carry = driverCarry(bag) {
            lines.append("Tu driver cargado es \(carry) yd.")
        }
        if booking.windKmh != nil, let temp = booking.tempC, temp < 15 {
            lines.append("Hay viento y está fresco. No los sumo en un cambio de palo.")
        }
        if lines.isEmpty {
            return Report(
                lines: ["\(booking.chipWhen) en \(booking.course.isEmpty ? booking.clubName : booking.course) no trae viento, temperatura ni lluvia."],
                hasNumbers: false
            )
        }
        return Report(lines: lines, hasNumbers: booking.windKmh != nil || booking.tempC != nil || booking.rainMm != nil)
    }

    static func driverCarry(_ bag: [BagClub]) -> Int? {
        bag.first { club in
            let name = club.name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
            return name == "dr" || name.contains("driver")
        }?.carry
    }
}
