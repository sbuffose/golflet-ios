import CoreGraphics
import UIKit

enum YardageBookMap {
    static let metersPerPixel: CGFloat = 3

    static let shared: CGImage = render(scale: metersPerPixel, region: YardageBook.bounds)

    static func render(scale: CGFloat, region: YardageBook.Region) -> CGImage {
        let width = Int(ceil(region.width * Double(scale)))
        let height = Int(ceil(region.height * Double(scale)))
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format)
        let image = renderer.image { ctx in
            let c = ctx.cgContext
            c.translateBy(x: -region.x0 * Double(scale), y: region.y1 * Double(scale))
            c.scaleBy(x: scale, y: -scale)
            drawWorld(c, scale: scale, region: region)
        }
        return image.cgImage!
    }

    private static func drawWorld(_ c: CGContext, scale: CGFloat, region: YardageBook.Region) {
        var rng = SeededRNG(23)
        c.setFillColor(YardageBook.paper)
        c.fill(CGRect(x: region.x0, y: region.y0, width: region.width, height: region.height))

        for k in stride(from: 7, through: 0, by: -1) {
            c.setAlpha(k == 0 ? 1 : 0.16)
            c.setFillColor(YardageBook.rough)
            c.beginPath()
            let start = -24.0 - Double(k) * 2
            let end = 444.0 + Double(k) * 2
            var y = start
            var first = true
            while y <= end {
                let w = corridor(y, k: k)
                let x = YardageBook.cx(y) - w
                if first { c.move(to: CGPoint(x: x, y: y)); first = false } else { c.addLine(to: CGPoint(x: x, y: y)) }
                y += 4
            }
            y = end
            while y >= start {
                c.addLine(to: CGPoint(x: YardageBook.cx(y) + corridor(y, k: k), y: y))
                y -= 4
            }
            c.closePath()
            c.fillPath()
        }
        c.setAlpha(1)

        let speckles = Int(region.width * region.height * 0.06)
        for _ in 0..<speckles {
            let x = region.x0 + rng.next() * region.width
            let y = region.y0 + rng.next() * region.height
            c.setFillColor(rng.next() < 0.5 ? CGColor.sRGB(0x0F3D2E, alpha: 0.035) : CGColor.sRGB(0xFFFFFF, alpha: 0.18))
            c.fill(CGRect(x: x, y: y, width: 0.5 + rng.next() * 0.6, height: 0.5 + rng.next() * 0.6))
        }

        addEllipse(c, YardageBook.pond)
        let pondBox = CGRect(x: YardageBook.pond.x - 20, y: YardageBook.pond.y - 30, width: 40, height: 60)
        let water = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [YardageBook.waterA, YardageBook.waterB] as CFArray,
            locations: [0, 1]
        )!
        c.saveGState()
        c.clip()
        c.drawLinearGradient(water, start: CGPoint(x: pondBox.minX, y: pondBox.maxY), end: CGPoint(x: pondBox.maxX, y: pondBox.minY), options: [])
        c.setStrokeColor(CGColor.sRGB(0xFFFFFF, alpha: 0.55))
        c.setLineWidth(0.35)
        for k in 0..<9 {
            let yy = YardageBook.pond.y - 22 + Double(k) * 5.5
            c.beginPath()
            c.move(to: CGPoint(x: YardageBook.pond.x - 9 + Double(k % 3) * 3, y: yy))
            c.addQuadCurve(to: CGPoint(x: YardageBook.pond.x + 7 - Double(k % 2) * 4, y: yy), control: CGPoint(x: YardageBook.pond.x, y: yy + 1.2))
            c.strokePath()
        }
        c.restoreGState()
        addEllipse(c, YardageBook.pond)
        c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.32))
        c.setLineWidth(0.3)
        c.strokePath()

        c.setLineDash(phase: 0, lengths: [2.2, 1.6])
        c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.16))
        c.setLineWidth(1.3)
        c.beginPath()
        var pathY = 8.0
        var pathFirst = true
        while pathY <= 380 {
            let x = YardageBook.cx(pathY) + max(YardageBook.hw(pathY), 14) + 15 + 3 * sin(pathY / 50)
            if pathFirst { c.move(to: CGPoint(x: x, y: pathY)); pathFirst = false } else { c.addLine(to: CGPoint(x: x, y: pathY)) }
            pathY += 4
        }
        c.strokePath()
        c.setLineDash(phase: 0, lengths: [])

        let semi = YardageBook.fairway.map { p in
            SIMD2(p.x + (p.x - YardageBook.cx(p.y) >= 0 ? 1 : -1) * 3.2, p.y)
        }
        addPoly(c, semi)
        c.setFillColor(YardageBook.semi)
        c.fillPath()

        c.saveGState()
        addPoly(c, YardageBook.fairway)
        c.setShadow(offset: CGSize(width: 0, height: -0.8), blur: 2.2, color: CGColor.sRGB(0x0F3D2E, alpha: 0.18))
        c.setFillColor(YardageBook.fairwayA)
        c.fillPath()
        c.restoreGState()

        c.saveGState()
        addPoly(c, YardageBook.fairway)
        c.clip()
        c.setFillColor(YardageBook.fairwayB)
        for k in -60..<80 {
            let y = Double(k) * 9
            c.beginPath()
            c.move(to: CGPoint(x: -120, y: y))
            c.addLine(to: CGPoint(x: 140, y: y + 150))
            c.addLine(to: CGPoint(x: 140, y: y + 154.5))
            c.addLine(to: CGPoint(x: -120, y: y + 4.5))
            c.closePath()
            c.fillPath()
        }
        let shade = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [
                CGColor.sRGB(0x0F3D2E, alpha: 0.07),
                CGColor.sRGB(0xFFFFFF, alpha: 0.08),
                CGColor.sRGB(0x0F3D2E, alpha: 0.10)
            ] as CFArray,
            locations: [0, 0.45, 1]
        )!
        c.drawLinearGradient(shade, start: CGPoint(x: -60, y: 0), end: CGPoint(x: 60, y: 0), options: [])
        c.restoreGState()
        addPoly(c, YardageBook.fairway)
        c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.38))
        c.setLineWidth(max(0.22, 1.1 / scale))
        c.strokePath()

        for (dy, w) in [(-8.0, 7.0), (0.0, 8.0), (9.0, 7.0)] {
            let rect = CGRect(x: YardageBook.cx(dy) - w / 2, y: dy - 2.6, width: w, height: 5.2)
            let path = UIBezierPath(roundedRect: rect, cornerRadius: 1.6)
            c.saveGState()
            c.setShadow(offset: CGSize(width: 0, height: -0.5), blur: 1.2, color: CGColor.sRGB(0x0F3D2E, alpha: 0.18))
            c.setFillColor(YardageBook.fairwayA)
            c.addPath(path.cgPath)
            c.fillPath()
            c.restoreGState()
            c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.35))
            c.setLineWidth(max(0.2, 1 / scale))
            c.addPath(path.cgPath)
            c.strokePath()
        }

        c.saveGState()
        addEllipse(c, YardageBook.green, grow: 3.2)
        c.setShadow(offset: CGSize(width: 0, height: -0.8), blur: 2.5, color: CGColor.sRGB(0x0F3D2E, alpha: 0.2))
        c.setFillColor(YardageBook.fringe)
        c.fillPath()
        c.restoreGState()

        c.saveGState()
        addEllipse(c, YardageBook.green)
        let greenGrad = CGGradient(
            colorsSpace: CGColorSpaceCreateDeviceRGB(),
            colors: [YardageBook.puttingLit, YardageBook.puttingB] as CFArray,
            locations: [0, 1]
        )!
        c.clip()
        c.drawRadialGradient(
            greenGrad,
            startCenter: CGPoint(x: YardageBook.green.x - 4, y: YardageBook.green.y + 6),
            startRadius: 1,
            endCenter: CGPoint(x: YardageBook.green.x, y: YardageBook.green.y),
            endRadius: 20,
            options: [.drawsAfterEndLocation]
        )
        c.setFillColor(CGColor.sRGB(0xFFFFFF, alpha: 0.07))
        for k in -6..<6 {
            c.saveGState()
            c.translateBy(x: YardageBook.green.x, y: YardageBook.green.y)
            c.rotate(by: 0.5)
            c.fill(CGRect(x: Double(k) * 4, y: -30, width: 2, height: 60))
            c.restoreGState()
        }
        c.restoreGState()
        addEllipse(c, YardageBook.green)
        c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.42))
        c.setLineWidth(max(0.2, 1.1 / scale))
        c.strokePath()

        for bunker in YardageBook.bunkers {
            c.saveGState()
            addBunker(c, bunker, grow: 0.9)
            c.setFillColor(CGColor.sRGB(0x0F3D2E, alpha: 0.10))
            c.fillPath()
            c.restoreGState()

            c.saveGState()
            addBunker(c, bunker)
            let sand = CGGradient(
                colorsSpace: CGColorSpaceCreateDeviceRGB(),
                colors: [YardageBook.sandLite, YardageBook.sandDark] as CFArray,
                locations: [0, 1]
            )!
            c.clip()
            c.drawLinearGradient(
                sand,
                start: CGPoint(x: bunker.x - bunker.rx, y: bunker.y + bunker.ry),
                end: CGPoint(x: bunker.x + bunker.rx, y: bunker.y - bunker.ry),
                options: []
            )
            for _ in 0..<Int(bunker.rx * bunker.ry * 9) {
                let a = rng.next() * .pi * 2
                let r = sqrt(rng.next())
                c.setFillColor(rng.next() < 0.5 ? CGColor.sRGB(0x786034, alpha: 0.20) : CGColor.sRGB(0xFFFFFF, alpha: 0.55))
                c.fill(CGRect(
                    x: bunker.x + cos(a) * r * (bunker.rx + 4),
                    y: bunker.y + sin(a) * r * (bunker.ry + 4),
                    width: 0.14,
                    height: 0.14
                ))
            }
            c.restoreGState()
            addBunker(c, bunker)
            c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.40))
            c.setLineWidth(max(0.2, 1 / scale))
            c.strokePath()
        }

        let forest = YardageBook.trees()
        for tree in forest {
            let R = tree.r * 1.45
            c.setFillColor(CGColor.sRGB(0x0F3D2E, alpha: 0.16))
            c.fillEllipse(in: CGRect(x: tree.x + tree.r * 0.6 - R, y: tree.y - tree.r * 0.6 - R, width: R * 2, height: R * 2))
        }
        for tree in forest {
            c.beginPath()
            for k in 0..<9 {
                let a = Double(k) / 9 * .pi * 2
                let rr = tree.r * (0.9 + 0.12 * sin(Double(k) * 2.3 + tree.t * 9))
                let p = CGPoint(x: tree.x + cos(a) * rr, y: tree.y + sin(a) * rr)
                if k == 0 { c.move(to: p) } else { c.addLine(to: p) }
            }
            c.closePath()
            c.setFillColor(tree.t < 0.5 ? YardageBook.tree : YardageBook.treeMid)
            c.fillPath()
            c.beginPath()
            for k in 0..<9 {
                let a = Double(k) / 9 * .pi * 2
                let rr = tree.r * (0.9 + 0.12 * sin(Double(k) * 2.3 + tree.t * 9))
                let p = CGPoint(x: tree.x + cos(a) * rr, y: tree.y + sin(a) * rr)
                if k == 0 { c.move(to: p) } else { c.addLine(to: p) }
            }
            c.closePath()
            c.setStrokeColor(CGColor.sRGB(0x0F3D2E, alpha: 0.35))
            c.setLineWidth(max(0.15, 0.8 / scale))
            c.strokePath()
        }
    }

    private static func corridor(_ y: Double, k: Int) -> Double {
        max(YardageBook.hw(y), y > 360 ? 30 : 14) + 30 + Double(k) * 2.2 + 3 * sin(y / 23 + Double(k))
    }

    private static func addPoly(_ c: CGContext, _ pts: [SIMD2<Double>]) {
        c.beginPath()
        for (i, p) in pts.enumerated() {
            if i == 0 { c.move(to: CGPoint(x: p.x, y: p.y)) } else { c.addLine(to: CGPoint(x: p.x, y: p.y)) }
        }
        c.closePath()
    }

    private static func addEllipse(_ c: CGContext, _ e: YardageBook.Ellipse, grow: Double = 0) {
        c.beginPath()
        c.saveGState()
        c.translateBy(x: e.x, y: e.y)
        c.rotate(by: e.rot)
        c.addEllipse(in: CGRect(x: -(e.rx + grow), y: -(e.ry + grow), width: (e.rx + grow) * 2, height: (e.ry + grow) * 2))
        c.restoreGState()
    }

    private static func addBunker(_ c: CGContext, _ b: YardageBook.Bunker, grow: Double = 0) {
        c.beginPath()
        c.saveGState()
        c.translateBy(x: b.x, y: b.y)
        c.rotate(by: b.rot)
        c.addEllipse(in: CGRect(x: -(b.rx + grow), y: -(b.ry + grow), width: (b.rx + grow) * 2, height: (b.ry + grow) * 2))
        c.restoreGState()
        let ca = cos(b.rot)
        let sa = sin(b.rot)
        for (dx, dy, r) in b.lobes {
            let cx = b.x + dx * ca - dy * sa
            let cy = b.y + dx * sa + dy * ca
            c.addEllipse(in: CGRect(x: cx - (r + grow), y: cy - (r + grow), width: (r + grow) * 2, height: (r + grow) * 2))
        }
    }
}
