import Foundation

enum LiveRoundState {
    static func make(
        course: GPSCourseDetail,
        hole: Int,
        here: GPSCoord?,
        shots: [Shot],
        practice: Bool = false,
        headingDeg: Double? = nil,
        windKmh: Int? = nil,
        windFromDeg: Double? = nil,
        matchHonor: String? = nil,
        matchStatus: String? = nil
    ) -> RoundActivityAttributes.ContentState {
        let current = course.holes.first { $0.number == hole }
        let green = current?.green
        let played = Set(shots.map(\.hole))
        let strokes = shots.count
        let parPlayed = course.holes
            .filter { played.contains($0.number) }
            .reduce(0) { $0 + $1.par }
        let toPar = played.isEmpty ? nil : strokes - parPlayed
        return RoundActivityAttributes.ContentState(
            hole: hole,
            par: current?.par ?? 4,
            frontYd: yards(from: here, to: green?.front),
            centerYd: yards(from: here, to: green?.center),
            backYd: yards(from: here, to: green?.back),
            strokes: strokes,
            toPar: toPar,
            course: course.course,
            strokeIndex: current?.hcp,
            windLine: practice ? WindFacing.line(speedKmh: windKmh, windFromDeg: windFromDeg, headingDeg: headingDeg) : nil,
            matchLine: MatchCard.line(honor: matchHonor, status: matchStatus)
        )
    }

    private static func yards(from here: GPSCoord?, to target: GPSCoord?) -> Int? {
        guard let here, let target else { return nil }
        return PlayMath.yards(from: here, to: target)
    }
}

enum WindFacing {
    /// Wind-from bearing minus the direction the phone is facing.
    static func relative(windFromDeg: Double, headingDeg: Double) -> String {
        let delta = normalize(windFromDeg - headingDeg)
        if delta < 22.5 || delta >= 337.5 { return "de frente" }
        if delta < 67.5 { return "de frente a la derecha" }
        if delta < 112.5 { return "de la derecha" }
        if delta < 157.5 { return "de atrás a la derecha" }
        if delta < 202.5 { return "de atrás" }
        if delta < 247.5 { return "de atrás a la izquierda" }
        if delta < 292.5 { return "de la izquierda" }
        return "de frente a la izquierda"
    }

    static func line(speedKmh: Int?, windFromDeg: Double?, headingDeg: Double?) -> String? {
        guard let speedKmh else { return nil }
        if let windFromDeg, let headingDeg {
            return "Viento \(speedKmh) km/h · \(relative(windFromDeg: windFromDeg, headingDeg: headingDeg))"
        }
        if let windFromDeg {
            return "Viento \(speedKmh) km/h · desde \(cardinal(windFromDeg))"
        }
        return "Viento \(speedKmh) km/h"
    }

    private static func cardinal(_ degrees: Double) -> String {
        let names = ["N", "NE", "E", "SE", "S", "SO", "O", "NO"]
        let index = Int((normalize(degrees) + 22.5) / 45) % 8
        return names[index]
    }

    private static func normalize(_ degrees: Double) -> Double {
        let wrapped = degrees.truncatingRemainder(dividingBy: 360)
        return wrapped < 0 ? wrapped + 360 : wrapped
    }
}

enum MatchCard {
    static func line(honor: String?, status: String?) -> String? {
        let honor = cleaned(honor)
        let status = cleaned(status)
        switch (honor, status) {
        case let (honor?, status?): return "Golpe: \(honor) · \(status)"
        case let (honor?, nil): return "Golpe: \(honor)"
        case let (nil, status?): return status
        case (nil, nil): return nil
        }
    }

    private static func cleaned(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }
}
