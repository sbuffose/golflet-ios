import Foundation

struct ForecastHour: Hashable, Sendable, Identifiable {
    var date: Date
    var tempC: Int?
    var rainMm: Double?
    var windKmh: Int?
    var windFromDeg: Int?
    var id: Date { date }

    var windFromES: String? {
        windFromDeg.map(TeeForecast.cardinal)
    }

    var line: String {
        let hour = TeeForecast.hourLabel(date)
        var parts = [hour]
        if let windKmh {
            var wind = "\(windKmh) km/h"
            if let windFromES { wind += " del \(windFromES)" }
            parts.append(wind)
        }
        if let tempC { parts.append("\(tempC)°") }
        if let rainMm {
            parts.append(rainMm > 0 ? "lluvia \(FormatAR.one(rainMm)) mm" : "sin lluvia")
        }
        return parts.joined(separator: " · ")
    }
}

enum CoursePin {
    static func coordinate(club: String, course: String) -> (lat: Double, lng: Double, title: String)? {
        let blob = fold(club + " " + course)
        if blob.contains("mar del plata") {
            return (-38.02999, -57.53624, "Mar del Plata Golf Club")
        }
        if blob.contains("jockey") {
            return (-34.4866, -58.5296, club.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Jockey Club" : club)
        }
        return nil
    }

    private static func fold(_ value: String) -> String {
        value.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
    }
}

/// Hourly forecast for a tee time. Open-Meteo, no key. Skipped during UI tests
/// so a booking without numbers keeps the honest «pronóstico» line.
enum TeeForecast {
    struct Window: Equatable, Sendable {
        var hours: [ForecastHour]
        var pinTitle: String
        var lat: Double
        var lng: Double
        var failed: Bool

        var shiftLine: String? {
            TeeForecast.shiftLine(hours: hours)
        }
    }

    static func cardinal(_ degrees: Int) -> String {
        let dirs = ["norte", "noreste", "este", "sudeste", "sur", "sudoeste", "oeste", "noroeste"]
        let wrapped = (degrees % 360 + 360) % 360
        let index = Int((Double(wrapped) + 22.5) / 45.0) % 8
        return dirs[index]
    }

    static func hourLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }

    static func shiftLine(hours: [ForecastHour]) -> String? {
        let speeds = hours.compactMap(\.windKmh)
        let dirs = hours.compactMap(\.windFromDeg)
        guard speeds.count >= 2 || dirs.count >= 2 else { return nil }
        var parts: [String] = []
        if let first = speeds.first, let last = speeds.last, abs(first - last) >= 5 {
            parts.append("el viento pasa de \(first) a \(last) km/h")
        }
        if let first = dirs.first, let last = dirs.last, angleDelta(first, last) >= 45 {
            parts.append("el rumbo gira de \(cardinal(first)) a \(cardinal(last))")
        }
        if parts.isEmpty { return "El viento se mantiene en estas horas." }
        return "En las próximas horas, " + parts.joined(separator: " y ") + "."
    }

    static func load(booking: TeeTime) async -> Window? {
        guard !RuntimeFlags.isUITesting else { return nil }
        guard let pin = CoursePin.coordinate(club: booking.clubName, course: booking.course) else { return nil }
        let empty = Window(hours: [], pinTitle: pin.title, lat: pin.lat, lng: pin.lng, failed: true)
        guard let hours = await fetch(lat: pin.lat, lng: pin.lng, around: booking.startsAt) else {
            return empty
        }
        return Window(hours: hours, pinTitle: pin.title, lat: pin.lat, lng: pin.lng, failed: hours.isEmpty)
    }

    static func playText(window: Window, booking: TeeTime, rounds: [Round], bag: [BagClub], holes: [GPSHole] = []) -> String {
        guard let hour = window.hours.first, hour.windKmh != nil || hour.tempC != nil || hour.rainMm != nil else {
            return "No pude leer el viento de este horario."
        }
        var filled = booking
        filled.windKmh = hour.windKmh
        filled.windFrom = hour.windFromES
        filled.tempC = hour.tempC
        filled.rainMm = hour.rainMm
        var lines = WeatherPlay.report(booking: filled, rounds: rounds, bag: bag, holes: holes).lines
        lines.append(contentsOf: window.hours.map(\.line))
        if let shift = window.shiftLine { lines.append(shift) }
        return lines.joined(separator: "\n")
    }

    private static func angleDelta(_ a: Int, _ b: Int) -> Int {
        let raw = abs(a - b) % 360
        return min(raw, 360 - raw)
    }

    private static func fetch(lat: Double, lng: Double, around: Date) async -> [ForecastHour]? {
        var parts = URLComponents(string: "https://api.open-meteo.com/v1/forecast")
        parts?.queryItems = [
            URLQueryItem(name: "latitude", value: String(lat)),
            URLQueryItem(name: "longitude", value: String(lng)),
            URLQueryItem(name: "hourly", value: "temperature_2m,precipitation,wind_speed_10m,wind_direction_10m"),
            URLQueryItem(name: "wind_speed_unit", value: "kmh"),
            URLQueryItem(name: "timezone", value: "America/Argentina/Buenos_Aires"),
            URLQueryItem(name: "forecast_days", value: "16")
        ]
        guard let url = parts?.url else { return nil }
        var request = URLRequest(url: url)
        request.timeoutInterval = 12
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let hourly = json["hourly"] as? [String: Any]
        else { return nil }
        return slice(hourly: hourly, around: around)
    }

    static func slice(hourly: [String: Any], around: Date) -> [ForecastHour] {
        let times = hourly["time"] as? [String] ?? []
        let temps = hourly["temperature_2m"] as? [Any] ?? []
        let rain = hourly["precipitation"] as? [Any] ?? []
        let wind = hourly["wind_speed_10m"] as? [Any] ?? []
        let dir = hourly["wind_direction_10m"] as? [Any] ?? []
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        let dates = times.compactMap { formatter.date(from: $0) }
        guard let index = dates.enumerated().min(by: { abs($0.element.timeIntervalSince(around)) < abs($1.element.timeIntervalSince(around)) })?.offset else {
            return []
        }
        guard abs(dates[index].timeIntervalSince(around)) <= 3 * 3600 else { return [] }
        let end = min(dates.count, index + 6)
        return (index..<end).map { offset in
            ForecastHour(
                date: dates[offset],
                tempC: number(temps, offset).map { Int($0.rounded()) },
                rainMm: number(rain, offset),
                windKmh: number(wind, offset).map { Int($0.rounded()) },
                windFromDeg: number(dir, offset).map { Int($0.rounded()) }
            )
        }
    }

    private static func number(_ values: [Any], _ index: Int) -> Double? {
        guard index < values.count else { return nil }
        let raw = values[index]
        if raw is NSNull { return nil }
        if let value = raw as? Double { return value }
        if let value = raw as? Int { return Double(value) }
        if let value = raw as? NSNumber { return value.doubleValue }
        return nil
    }
}
