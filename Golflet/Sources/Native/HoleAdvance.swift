import Foundation

enum HoleAdvance {
    static var cooldown: TimeInterval {
        RuntimeFlags.isUITesting ? 0.05 : 8
    }

    static let teeRadiusM = 25

    static func shouldOffer(
        now: Date = Date(),
        lastManual: Date,
        currentHole: Int,
        shotHoles: Set<Int>,
        here: GPSCoord?,
        nextTee: GPSCoord?
    ) -> Bool {
        guard now.timeIntervalSince(lastManual) >= cooldown else { return false }
        guard shotHoles.contains(currentHole) else { return false }
        guard let here, let nextTee else { return false }
        return PlayMath.meters(from: here, to: nextTee) <= teeRadiusM
    }

    static func nextHole(after current: Int, holeCount: Int) -> Int? {
        let next = current + 1
        guard next >= 1, next <= holeCount else { return nil }
        return next
    }
}
