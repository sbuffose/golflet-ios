import SwiftUI

struct YardageBookView: View {
    var finish: Bool
    var caption: String
    var count: String?
    var reduceMotion: Bool

    @State private var player = YardageBookPlayer()

    var body: some View {
        GeometryReader { _ in
            ZStack(alignment: .top) {
                Color(hex: 0xF7F5F0)
                scene
                header
                footer
            }
        }
        .clipped()
        .accessibilityHidden(true)
        .onChange(of: finish) { _, shouldFinish in
            if shouldFinish { player.finish() }
        }
        .onAppear {
            _ = YardageBookMap.shared
            if finish { player.finish() }
        }
    }

    private var header: some View {
        HStack {
            Text("Libro de yardas")
                .font(GType.overline)
                .tracking(1.4)
                .textCase(.uppercase)
                .foregroundStyle(Color(hex: 0x0F3D2E).opacity(0.55))
            Spacer()
        }
        .padding(.horizontal, 18)
        .padding(.top, 16)
    }

    private var footer: some View {
        VStack {
            Spacer()
            HStack(alignment: .firstTextBaseline) {
                Text(caption)
                    .font(GType.overline)
                    .tracking(1.2)
                    .textCase(.uppercase)
                    .foregroundStyle(Color(hex: 0x0F3D2E).opacity(0.72))
                Spacer()
                if let count {
                    Text(count)
                        .font(GFont.ui(12.5, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x0F3D2E).opacity(0.78))
                        .tabular()
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 10)
        }
    }

    @ViewBuilder
    private var scene: some View {
        if reduceMotion {
            Canvas(opaque: true) { context, canvasSize in
                YardageBookRenderer.draw(
                    context: context,
                    size: canvasSize,
                    frame: player.still(width: canvasSize.width, height: canvasSize.height),
                    map: YardageBookMap.shared
                )
            }
        } else {
            TimelineView(.animation(minimumInterval: 1.0 / 60.0, paused: false)) { timeline in
                let frame = player.advance(to: timeline.date)
                Canvas(opaque: true) { context, canvasSize in
                    YardageBookRenderer.draw(
                        context: context,
                        size: canvasSize,
                        frame: frame,
                        map: YardageBookMap.shared
                    )
                }
            }
        }
    }
}

enum YardageBookRenderer {
    static func draw(context: GraphicsContext, size: CGSize, frame: YardageBook.Frame, map: CGImage) {
        var ctx = context
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(cgColor: YardageBook.paper)))
        blit(map, camera: frame.camera, size: size, in: &ctx)
        drawRules(frame.camera, size: size, in: &ctx)
        drawArcs(frame, size: size, in: &ctx)
        drawPin(frame, size: size, in: &ctx)
        drawNotes(frame, size: size, in: &ctx)
        drawBall(frame, size: size, in: &ctx)
        drawHoled(frame, size: size, in: &ctx)
        drawWashes(size: size, fade: frame.fade, in: &ctx)
        drawCompass(frame.camera, size: size, in: &ctx)
    }

    private static func toScreen(_ x: Double, _ y: Double, camera: YardageBook.Camera, size: CGSize) -> CGPoint {
        let c = cos(camera.r)
        let s = sin(camera.r)
        let dx = x - camera.x
        let dy = y - camera.y
        return CGPoint(
            x: size.width / 2 + (dx * c - dy * s) * camera.z,
            y: size.height * 0.56 - (dx * s + dy * c) * camera.z
        )
    }

    private static func lift(_ p: SIMD3<Double>, camera: YardageBook.Camera, size: CGSize) -> CGPoint {
        let q = toScreen(p.x, p.y, camera: camera, size: size)
        let hz = p.z * YardageBook.clamp(camera.z, 1, 2.4) * 0.95
        return CGPoint(x: q.x - hz * 0.92, y: q.y - hz * 0.38)
    }

    private static func blit(_ map: CGImage, camera: YardageBook.Camera, size: CGSize, in ctx: inout GraphicsContext) {
        let region = YardageBook.bounds
        let scale = Double(YardageBookMap.metersPerPixel)
        let c = cos(camera.r)
        let s = sin(camera.r)
        let k = camera.z / scale
        var transform = CGAffineTransform.identity
        transform.a = c * k
        transform.b = -s * k
        transform.c = s * k
        transform.d = c * k
        let ox = region.x0 - camera.x
        let oy = region.y1 - camera.y
        transform.tx = size.width / 2 + (ox * c - oy * s) * camera.z
        transform.ty = size.height * 0.56 - (ox * s + oy * c) * camera.z
        ctx.drawLayer { layer in
            layer.concatenate(transform)
            layer.draw(
                Image(decorative: map, scale: 1),
                in: CGRect(x: 0, y: 0, width: map.width, height: map.height)
            )
        }
    }

    private static func drawRules(_ camera: YardageBook.Camera, size: CGSize, in ctx: inout GraphicsContext) {
        for meters in [250, 200, 150, 100] {
            let y = YardageBook.green.y - Double(meters)
            let w = YardageBook.hw(y) + 3
            let a = toScreen(YardageBook.cx(y) - w, y, camera: camera, size: size)
            let b = toScreen(YardageBook.cx(y) + w, y, camera: camera, size: size)
            strokeLine(from: a, to: b, width: 0.8, color: Color(hex: 0xC8A86A, alpha: 0.85), in: &ctx)
            fillDot(a, r: 1.6, color: Color(hex: 0xC8A86A, alpha: 0.95), in: &ctx)
            fillDot(b, r: 1.6, color: Color(hex: 0xC8A86A, alpha: 0.95), in: &ctx)
            let label = toScreen(YardageBook.cx(y) + w + 7, y, camera: camera, size: size)
            text("\(meters)", at: label, size: 9, color: Color(hex: 0x0F3D2E, alpha: 0.78), in: &ctx)
        }
        let front = toScreen(YardageBook.green.x - 24, YardageBook.green.y - YardageBook.green.ry, camera: camera, size: size)
        let back = toScreen(YardageBook.green.x - 24, YardageBook.green.y + YardageBook.green.ry, camera: camera, size: size)
        strokeLine(from: front, to: back, width: 0.7, color: Color(hex: 0xC8A86A, alpha: 0.7), in: &ctx)
        let mid = toScreen(YardageBook.green.x - 27, YardageBook.green.y, camera: camera, size: size)
        text("34 M", at: CGPoint(x: mid.x - 10, y: mid.y), size: 9, color: Color(hex: 0x0F3D2E, alpha: 0.7), in: &ctx)
    }

    private static func drawArcs(_ frame: YardageBook.Frame, size: CGSize, in ctx: inout GraphicsContext) {
        for arc in frame.arcs {
            if arc.isPutt {
                var pts: [CGPoint] = []
                for i in 0...20 {
                    let k = arc.u * Double(i) / 20
                    let brk = sin(.pi * k) * 0.5 * (arc.curve >= 0 ? 1 : -1)
                    pts.append(toScreen(
                        YardageBook.lerp(arc.start.x, arc.end.x, k) + brk,
                        YardageBook.lerp(arc.start.y, arc.end.y, k),
                        camera: frame.camera,
                        size: size
                    ))
                }
                glowPath(pts, widths: [6, 2.4, 1], alphas: [0.14, 0.5, 1], in: &ctx)
                continue
            }
            var ground: [CGPoint] = []
            var air: [CGPoint] = []
            for i in 0...48 {
                let u = arc.u * Double(i) / 48
                let p = YardageBook.shotPos(start: arc.start, end: arc.end, height: arc.height, curve: arc.curve, u: u)
                ground.append(toScreen(p.x, p.y, camera: frame.camera, size: size))
                air.append(lift(p, camera: frame.camera, size: size))
            }
            dashed(ground, color: Color(hex: 0x0F3D2E, alpha: 0.32 * arc.alpha), in: &ctx)
            glowPath(air, widths: [16, 8, 3.2, 1.8, 0.8], alphas: [0.07, 0.16, 0.55, 1, 0.95].map { $0 * arc.alpha }, in: &ctx)
        }
    }

    private static func drawPin(_ frame: YardageBook.Frame, size: CGSize, in ctx: inout GraphicsContext) {
        let q = toScreen(YardageBook.pin.x, YardageBook.pin.y, camera: frame.camera, size: size)
        let z = YardageBook.clamp(frame.camera.z, 1.2, 9)
        let hgt = 9 + z * 3.2
        let lifted = frame.holedAge.map { YardageBook.easeInOut(YardageBook.clamp($0 / 700, 0, 1)) } ?? 0
        let up = lifted * hgt * 0.9
        var hole = Path()
        hole.addEllipse(in: CGRect(x: q.x - (1 + z * 0.3), y: q.y - (0.7 + z * 0.2), width: (1 + z * 0.3) * 2, height: (0.7 + z * 0.2) * 2))
        ctx.fill(hole, with: .color(Color(hex: 0x0F3D2E, alpha: 0.75)))
        ctx.opacity = 1 - lifted * 0.9
        let top = CGPoint(x: q.x, y: q.y - hgt - up)
        strokeLine(from: CGPoint(x: q.x, y: q.y - up), to: top, width: 1.2, color: Color(hex: 0x0F3D2E), in: &ctx)
        let fw = 5 + z * 1.2
        let fh = 3.4 + z * 0.75
        let wv = sin(frame.flagWave / 330) * 0.22
        var flag = Path()
        flag.move(to: top)
        flag.addQuadCurve(to: CGPoint(x: top.x + fw, y: top.y + fh * 0.5), control: CGPoint(x: top.x + fw * 0.5, y: top.y + fh * (0.12 + wv)))
        flag.addQuadCurve(to: CGPoint(x: top.x, y: top.y + fh), control: CGPoint(x: top.x + fw * 0.5, y: top.y + fh * (0.88 + wv)))
        ctx.fill(flag, with: .color(Color(hex: 0xC8A86A)))
        ctx.opacity = 1
    }

    private static func drawNotes(_ frame: YardageBook.Frame, size: CGSize, in ctx: inout GraphicsContext) {
        for note in frame.notes {
            let a = YardageBook.clamp((frame.time - note.born) / 450, 0, 1) * (1 - frame.fade)
            if a <= 0 { continue }
            let q = toScreen(note.at.x, note.at.y, camera: frame.camera, size: size)
            let ex = q.x + 30
            let ey = q.y - 22
            var leader = Path()
            leader.move(to: CGPoint(x: q.x + 3, y: q.y - 2))
            leader.addLine(to: CGPoint(x: ex, y: ey))
            leader.addLine(to: CGPoint(x: ex + 52 * YardageBook.easeOut(a), y: ey))
            ctx.stroke(leader, with: .color(Color(hex: 0xC8A86A, alpha: a)), lineWidth: 0.8)
            text(note.text.uppercased(), at: CGPoint(x: ex + 2, y: ey - 12), size: 8.5, color: Color(hex: 0x0F3D2E, alpha: 0.8 * a), in: &ctx)
            text("\(note.distance) m", at: CGPoint(x: ex + 2, y: ey + 2), size: 12, color: Color(hex: 0x0F3D2E, alpha: a), in: &ctx)
        }
    }

    private static func drawBall(_ frame: YardageBook.Frame, size: CGSize, in ctx: inout GraphicsContext) {
        let drop = frame.holedAge.map { YardageBook.clamp($0 / 260, 0, 1) } ?? 0
        if drop >= 1 { return }
        let g = toScreen(frame.ball.x, frame.ball.y, camera: frame.camera, size: size)
        let q = lift(frame.ball, camera: frame.camera, size: size)
        let r = CGFloat(YardageBook.clamp(1.1 + frame.camera.z * 0.2, 1.6, 3.2) * (1 + frame.ball.z * 0.012) * (1 - drop))
        var shadow = Path()
        shadow.addEllipse(in: CGRect(x: g.x + 1 - r * 1.1, y: g.y + 0.6 - r * 0.7, width: r * 2.2, height: r * 1.4))
        ctx.fill(shadow, with: .color(Color(hex: 0x0F3D2E, alpha: 0.28)))
        var ball = Path()
        ball.addEllipse(in: CGRect(x: q.x - r, y: q.y - r, width: r * 2, height: r * 2))
        ctx.fill(ball, with: .color(.white))
        ctx.stroke(ball, with: .color(Color(hex: 0x0F3D2E, alpha: 0.5)), lineWidth: 0.6)
    }

    private static func drawHoled(_ frame: YardageBook.Frame, size: CGSize, in ctx: inout GraphicsContext) {
        guard let age = frame.holedAge else { return }
        let k = YardageBook.clamp((age - 120) / 1300, 0, 1)
        let q = toScreen(YardageBook.pin.x, YardageBook.pin.y, camera: frame.camera, size: size)
        for d in [0.0, 0.18, 0.36] {
            let kk = YardageBook.clamp(k - d, 0, 1)
            if kk <= 0 || kk >= 1 { continue }
            let rx = YardageBook.easeOut(kk) * 60
            let ry = YardageBook.easeOut(kk) * 48
            var ring = Path()
            ring.addEllipse(in: CGRect(x: q.x - rx, y: q.y - ry, width: rx * 2, height: ry * 2))
            ctx.stroke(ring, with: .color(Color(hex: 0xC8A86A, alpha: 0.8 * (1 - kk))), lineWidth: 1.1)
        }
        for spark in frame.sparks {
            let s = toScreen(spark.x, spark.y, camera: frame.camera, size: size)
            let a = YardageBook.clamp(spark.life / 600, 0, 1)
            let tw = 0.6 + 0.4 * sin(frame.time / 60 + spark.phase)
            let R = (2.5 + spark.size * 3) * tw
            var star = Path()
            star.move(to: CGPoint(x: s.x, y: s.y - R))
            star.addQuadCurve(to: CGPoint(x: s.x + R * 0.6, y: s.y), control: s)
            star.addQuadCurve(to: CGPoint(x: s.x, y: s.y + R), control: s)
            star.addQuadCurve(to: CGPoint(x: s.x - R * 0.6, y: s.y), control: s)
            star.addQuadCurve(to: CGPoint(x: s.x, y: s.y - R), control: s)
            ctx.fill(star, with: .color(Color(hex: 0xC8A86A, alpha: a)))
        }
    }

    private static func drawWashes(size: CGSize, fade: Double, in ctx: inout GraphicsContext) {
        let top = Gradient(colors: [Color(hex: 0xF4F0E6, alpha: 0.88), Color(hex: 0xF4F0E6, alpha: 0)])
        ctx.fill(
            Path(CGRect(x: 0, y: 0, width: size.width, height: 84)),
            with: .linearGradient(top, startPoint: .zero, endPoint: CGPoint(x: 0, y: 84))
        )
        let foot = Gradient(stops: [
            .init(color: Color(hex: 0xF4F0E6, alpha: 0), location: 0),
            .init(color: Color(hex: 0xF4F0E6, alpha: 0), location: 0.8),
            .init(color: Color(hex: 0xF7F5F0), location: 1)
        ])
        ctx.fill(
            Path(CGRect(origin: .zero, size: size)),
            with: .linearGradient(foot, startPoint: .zero, endPoint: CGPoint(x: 0, y: size.height))
        )
        if fade > 0 {
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Color(hex: 0xF4F0E6, alpha: fade)))
        }
    }

    private static func drawCompass(_ camera: YardageBook.Camera, size: CGSize, in ctx: inout GraphicsContext) {
        let origin = CGPoint(x: size.width - 26, y: 30)
        ctx.drawLayer { layer in
            layer.translateBy(x: origin.x, y: origin.y)
            layer.rotate(by: .radians(-camera.r))
            var ring = Path()
            ring.addEllipse(in: CGRect(x: -9, y: -9, width: 18, height: 18))
            layer.stroke(ring, with: .color(Color(hex: 0x0F3D2E, alpha: 0.55)), lineWidth: 0.8)
            var north = Path()
            north.move(to: CGPoint(x: 0, y: -12))
            north.addLine(to: CGPoint(x: 2.6, y: 0))
            north.addLine(to: CGPoint(x: -2.6, y: 0))
            north.closeSubpath()
            layer.fill(north, with: .color(Color(hex: 0xC8A86A)))
            var south = Path()
            south.move(to: CGPoint(x: 0, y: 12))
            south.addLine(to: CGPoint(x: 2.6, y: 0))
            south.addLine(to: CGPoint(x: -2.6, y: 0))
            south.closeSubpath()
            layer.fill(south, with: .color(Color(hex: 0x0F3D2E, alpha: 0.5)))
        }
        let meters: Double = camera.z > 5 ? 5 : camera.z > 2 ? 20 : 50
        let L = meters * camera.z
        var bar = Path()
        bar.move(to: CGPoint(x: size.width - 18 - L, y: 56))
        bar.addLine(to: CGPoint(x: size.width - 18, y: 56))
        bar.move(to: CGPoint(x: size.width - 18 - L, y: 53))
        bar.addLine(to: CGPoint(x: size.width - 18 - L, y: 59))
        bar.move(to: CGPoint(x: size.width - 18, y: 53))
        bar.addLine(to: CGPoint(x: size.width - 18, y: 59))
        ctx.stroke(bar, with: .color(Color(hex: 0x0F3D2E, alpha: 0.6)), lineWidth: 0.8)
        text("\(Int(meters)) M", at: CGPoint(x: size.width - 46, y: 60), size: 8, color: Color(hex: 0x0F3D2E, alpha: 0.65), in: &ctx)
    }

    private static func glowPath(_ pts: [CGPoint], widths: [CGFloat], alphas: [Double], in ctx: inout GraphicsContext) {
        guard pts.count > 1 else { return }
        var path = Path()
        path.move(to: pts[0])
        for p in pts.dropFirst() { path.addLine(to: p) }
        for (width, alpha) in zip(widths, alphas) {
            let color = width <= 1 ? Color(hex: 0xFFF6DE, alpha: alpha) : Color(hex: 0xC8A86A, alpha: alpha)
            ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round, lineJoin: .round))
        }
    }

    private static func dashed(_ pts: [CGPoint], color: Color, in ctx: inout GraphicsContext) {
        guard pts.count > 1 else { return }
        var path = Path()
        path.move(to: pts[0])
        for p in pts.dropFirst() { path.addLine(to: p) }
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: 1, lineCap: .round, dash: [2, 3]))
    }

    private static func strokeLine(from a: CGPoint, to b: CGPoint, width: CGFloat, color: Color, in ctx: inout GraphicsContext) {
        var path = Path()
        path.move(to: a)
        path.addLine(to: b)
        ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width, lineCap: .round))
    }

    private static func fillDot(_ p: CGPoint, r: CGFloat, color: Color, in ctx: inout GraphicsContext) {
        ctx.fill(Path(ellipseIn: CGRect(x: p.x - r, y: p.y - r, width: r * 2, height: r * 2)), with: .color(color))
    }

    private static func text(_ value: String, at point: CGPoint, size: CGFloat, color: Color, in ctx: inout GraphicsContext) {
        let resolved = ctx.resolve(
            Text(value)
                .font(.custom("Geist-SemiBold", size: size))
                .foregroundStyle(color)
                .monospacedDigit()
        )
        ctx.draw(resolved, at: point, anchor: .leading)
    }
}
