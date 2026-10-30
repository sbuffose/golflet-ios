import CoreGraphics
import Foundation

struct PlanHoleFrame {
    var ref: PlanLL
    var bearing: Double

    func xy(_ ll: PlanLL) -> PlanXY {
        PlanCore.xy(ll, ref: ref)
    }

    func ll(_ xy: PlanXY) -> PlanLL {
        PlanCore.ll(xy, ref: ref)
    }

    /// Metres in hole space: tee at the bottom, green up.
    func toScreen(_ ll: PlanLL) -> CGPoint {
        let m = xy(ll)
        let b = PlanCore.rad(bearing)
        let c = cos(b), s = sin(b)
        return CGPoint(x: m.x * c - m.y * s, y: -(m.x * s + m.y * c))
    }

    func fromScreen(_ p: CGPoint) -> PlanLL {
        let b = PlanCore.rad(bearing)
        let c = cos(b), s = sin(b)
        let yy = -p.y
        return ll(PlanXY(x: p.x * c + yy * s, y: -p.x * s + yy * c))
    }

    func playPath(_ hole: CourseMapHole) -> [PlanXY] {
        var line = hole.line.map(xy)
        if let center = hole.green?.center {
            if !line.isEmpty { line.removeLast() }
            line.append(xy(center))
        }
        return line
    }
}

enum PlanGeometry {
    static func frame(for hole: CourseMapHole) -> PlanHoleFrame {
        let ref = hole.tees.first?.center ?? hole.line.first ?? PlanLL(lng: 0, lat: 0)
        return PlanHoleFrame(ref: ref, bearing: hole.bearingTrue ?? 0)
    }

    static func pickTee(from tees: [PlanCardTee], stored: String?, usual: String?, mapYd: Int?) -> PlanCardTee? {
        if let stored, let match = tees.first(where: { $0.key == stored }) { return match }
        if let usual, let match = tees.first(where: { $0.key == usual }) { return match }
        if let mapYd {
            return tees.min(by: { abs($0.yards - mapYd) < abs($1.yards - mapYd) })
        }
        return tees.first
    }

    static func teeSpot(hole: CourseMapHole, frame: PlanHoleFrame, yards: Int) -> PlanLL? {
        let boxes = hole.tees.compactMap { tee -> (CourseMapTee, Double)? in
            guard let toGreen = tee.toGreenYd else { return nil }
            return (tee, abs(toGreen - Double(yards)))
        }.sorted { $0.1 < $1.1 }
        if let best = boxes.first, best.1 <= 6 {
            return best.0.center
        }
        let path = frame.playPath(hole)
        guard path.count >= 2 else { return hole.tees.first?.center ?? hole.line.first }
        var need = Double(yards) * PlanCore.yardMeters
        for i in stride(from: path.count - 1, through: 1, by: -1) {
            let a = path[i], b = path[i - 1]
            let L = PlanCore.dist(a, b)
            if need <= L || i == 1 {
                let k = need / (L == 0 ? 1 : L)
                return frame.ll(PlanXY(x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k))
            }
            need -= L
        }
        return hole.line.first
    }

    static func hazards(_ hole: CourseMapHole, frame: PlanHoleFrame) -> [PlanHazardPoly] {
        var id = 0
        var out: [PlanHazardPoly] = []
        for bunker in hole.bunkers {
            out.append(PlanHazardPoly(id: id, kind: "bunker", poly: bunker.polygon.map(frame.xy)))
            id += 1
        }
        for water in hole.water {
            out.append(PlanHazardPoly(id: id, kind: "agua", poly: water.map(frame.xy)))
            id += 1
        }
        for wood in hole.woods {
            out.append(PlanHazardPoly(id: id, kind: "bosque", poly: wood.map(frame.xy)))
            id += 1
        }
        return out
    }

    static func fit(points: [CGPoint], size: CGSize, padTop: CGFloat, padBottom: CGFloat) -> CGRect {
        guard let first = points.first else {
            return CGRect(x: 0, y: 0, width: max(size.width, 1), height: max(size.height, 1))
        }
        var minX = first.x, maxX = first.x, minY = first.y, maxY = first.y
        for p in points {
            minX = min(minX, p.x); maxX = max(maxX, p.x)
            minY = min(minY, p.y); maxY = max(maxY, p.y)
        }
        let world = CGRect(x: minX - 18, y: minY - 24, width: max(40, maxX - minX + 36), height: max(40, maxY - minY + 48))
        let usable = CGSize(width: max(120, size.width), height: max(160, size.height - padTop - padBottom))
        let scale = min(usable.width / world.width, usable.height / world.height)
        let draw = CGSize(width: world.width * scale, height: world.height * scale)
        let origin = CGPoint(
            x: (size.width - draw.width) / 2 - world.minX * scale,
            y: padTop + (usable.height - draw.height) / 2 - world.minY * scale
        )
        return CGRect(x: origin.x, y: origin.y, width: scale, height: scale)
    }

    static func project(_ p: CGPoint, fit: CGRect) -> CGPoint {
        CGPoint(x: fit.minX + p.x * fit.width, y: fit.minY + p.y * fit.width)
    }

    static func unproject(_ p: CGPoint, fit: CGRect) -> CGPoint {
        let s = fit.width == 0 ? 1 : fit.width
        return CGPoint(x: (p.x - fit.minX) / s, y: (p.y - fit.minY) / s)
    }
}
