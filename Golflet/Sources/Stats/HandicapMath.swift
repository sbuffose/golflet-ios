import Foundation

/// World Handicap System helpers used by Golflet.
/// Differential = (113 / slope) × (adjusted gross − course rating), rounded to 1 decimal.
enum HandicapMath {
    static func courseHandicap(index: Double, slope: Double, rating: Double, par: Int) -> Int {
        let raw = index * slope / 113.0 + (rating - Double(par))
        return Int(raw.rounded())
    }

    /// Strokes received on a hole from the course handicap and stroke index (1 = hardest).
    static func extraStrokes(courseHandicap: Int, holeStrokeIndex: Int) -> Int {
        guard holeStrokeIndex >= 1, holeStrokeIndex <= 18 else { return 0 }
        if courseHandicap == 0 { return 0 }
        if courseHandicap > 0 {
            let fullCycles = courseHandicap / 18
            let remainder = courseHandicap % 18
            return fullCycles + (holeStrokeIndex <= remainder ? 1 : 0)
        }
        let given = abs(courseHandicap)
        let fullCycles = given / 18
        let remainder = given % 18
        // Plus handicap: strokes given on the easiest holes (highest stroke index).
        return -(fullCycles + (holeStrokeIndex > 18 - remainder ? 1 : 0))
    }

    static func netDoubleBogey(par: Int, courseHandicap: Int, holeStrokeIndex: Int) -> Int {
        max(par, par + 2 + extraStrokes(courseHandicap: courseHandicap, holeStrokeIndex: holeStrokeIndex))
    }

    static func adjustedStrokes(strokes: Int, par: Int, courseHandicap: Int, holeStrokeIndex: Int) -> Int {
        min(strokes, netDoubleBogey(par: par, courseHandicap: courseHandicap, holeStrokeIndex: holeStrokeIndex))
    }

    static func adjustedGross(
        holes: [(par: Int, strokeIndex: Int, strokes: Int)],
        courseHandicap: Int
    ) -> Int {
        holes.reduce(0) { partial, hole in
            partial + adjustedStrokes(
                strokes: hole.strokes,
                par: hole.par,
                courseHandicap: courseHandicap,
                holeStrokeIndex: hole.strokeIndex
            )
        }
    }

    static func differential(adjustedGross: Double, courseRating: Double, slope: Double) -> Double {
        guard slope > 0 else { return 0 }
        return round1((113.0 / slope) * (adjustedGross - courseRating))
    }

    /// Official WHS: most recent 20 differentials, average of the best 8 (with the short-record table).
    static func handicapIndex(differentialsNewestLast: [Double]) -> Double? {
        let recent = Array(differentialsNewestLast.suffix(20))
        guard !recent.isEmpty else { return nil }
        let rule = usage(forCount: recent.count)
        guard rule.count > 0 else { return nil }
        let best = recent.sorted().prefix(rule.count)
        let average = best.reduce(0, +) / Double(best.count)
        return round1(average + rule.adjustment)
    }

    struct UsageRule: Equatable {
        var count: Int
        var adjustment: Double
    }

    static func usage(forCount n: Int) -> UsageRule {
        switch n {
        case 0, 1, 2: return UsageRule(count: 0, adjustment: 0)
        case 3: return UsageRule(count: 1, adjustment: -2.0)
        case 4: return UsageRule(count: 1, adjustment: -1.0)
        case 5: return UsageRule(count: 1, adjustment: 0)
        case 6: return UsageRule(count: 2, adjustment: -1.0)
        case 7, 8: return UsageRule(count: 2, adjustment: 0)
        case 9, 10, 11: return UsageRule(count: 3, adjustment: 0)
        case 12, 13, 14: return UsageRule(count: 4, adjustment: 0)
        case 15, 16: return UsageRule(count: 5, adjustment: 0)
        case 17, 18: return UsageRule(count: 6, adjustment: 0)
        case 19: return UsageRule(count: 7, adjustment: 0)
        default: return UsageRule(count: 8, adjustment: 0)
        }
    }

    static func round1(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }
}
