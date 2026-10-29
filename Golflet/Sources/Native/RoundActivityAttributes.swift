import Foundation

enum LiveRoundState {
    static func make(
        course: GPSCourseDetail,
        hole: Int,
        here: GPSCoord?,
        shots: [Shot]
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
            course: course.course
        )
    }

    private static func yards(from here: GPSCoord?, to target: GPSCoord?) -> Int? {
        guard let here, let target else { return nil }
        return PlayMath.displayYards(PlayMath.yards(from: here, to: target))
    }
}
