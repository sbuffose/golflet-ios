import CoreGraphics
import Foundation
import simd

enum YardageBook {
    static let paper = CGColor.sRGB(0xF4F0E6)
    static let sheet = CGColor.sRGB(0xF7F5F0)
    static let ink = CGColor.sRGB(0x0F3D2E)
    static let gold = CGColor.sRGB(0xC8A86A)
    static let rough = CGColor.sRGB(0xDCE2CF)
    static let semi = CGColor.sRGB(0xCED8BF)
    static let fairwayA = CGColor.sRGB(0xB6CCA6)
    static let fairwayB = CGColor.sRGB(0xABC49B)
    static let fringe = CGColor.sRGB(0xA1BE92)
    static let putting = CGColor.sRGB(0x93B886)
    static let puttingB = CGColor.sRGB(0x8AB17D)
    static let puttingLit = CGColor.sRGB(0xA3C597)
    static let sandLite = CGColor.sRGB(0xF3EAD5)
    static let sandDark = CGColor.sRGB(0xE4D6B6)
    static let waterA = CGColor.sRGB(0xB3CCC8)
    static let waterB = CGColor.sRGB(0xD3E2DE)
    static let tree = CGColor.sRGB(0x5D7E66)
    static let treeDark = CGColor.sRGB(0x45664F)
    static let treeLite = CGColor.sRGB(0x86A38A)
    static let treeMid = CGColor.sRGB(0x58785F)

    static func sstep(_ a: Double, _ b: Double, _ x: Double) -> Double {
        let t = clamp((x - a) / (b - a), 0, 1)
        return t * t * (3 - 2 * t)
    }

    static func clamp(_ x: Double, _ a: Double, _ b: Double) -> Double {
        min(max(x, a), b)
    }

    static func lerp(_ a: Double, _ b: Double, _ t: Double) -> Double {
        a + (b - a) * t
    }

    static func easeInOut(_ t: Double) -> Double {
        t < 0.5 ? 4 * t * t * t : 1 - pow(-2 * t + 2, 3) / 2
    }

    static func easeOut(_ t: Double) -> Double {
        1 - pow(1 - t, 3)
    }

    static func easeSin(_ t: Double) -> Double {
        0.5 - 0.5 * cos(.pi * t)
    }

    static func cx(_ y: Double) -> Double {
        -6 + 20 * sstep(110, 330, y) + 3 * sin(y / 37)
    }

    static func hw(_ y: Double) -> Double {
        if y < 60 { return 0 }
        return (15 + 3.5 * sin(y / 41 + 0.6))
            * sqrt(sstep(60, 84, y))
            * (1 - 0.22 * sstep(255, 300, y) + 0.22 * sstep(300, 352, y))
            * sqrt(1 - sstep(346, 378, y))
    }

    static let green = Ellipse(x: cx(396) + 2, y: 396, rx: 14.5, ry: 17, rot: 0.18)
    static let pin = SIMD2<Double>(green.x + 2.6, green.y + 4)
    static let pond = Ellipse(x: cx(150) - 44, y: 152, rx: 17, ry: 30, rot: 0.12)
    static let bounds = Region(x0: -95, x1: 105, y0: -40, y1: 470)

    static let bunkers: [Bunker] = [
        Bunker(x: cx(242) + 21, y: 242, rx: 9, ry: 4.6, rot: -0.5, lobes: [(-4, 1.5, 3.5), (4, -1, 3.2)]),
        Bunker(x: green.x - 17.5, y: green.y - 2, rx: 4.6, ry: 9.5, rot: 0.25, lobes: [(0, 5, 3.6)]),
        Bunker(x: green.x + 13, y: green.y - 15, rx: 7.5, ry: 3.6, rot: -0.6, lobes: [(3, 1, 2.8)]),
        Bunker(x: cx(205) - 22, y: 205, rx: 6, ry: 3.4, rot: 0.4, lobes: [])
    ]

    static let fairway: [SIMD2<Double>] = {
        var left: [SIMD2<Double>] = []
        var right: [SIMD2<Double>] = []
        var y = 60.0
        while y <= 378 {
            left.append(SIMD2(cx(y) - hw(y), y))
            right.append(SIMD2(cx(y) + hw(y), y))
            y += 2
        }
        return left + right.reversed()
    }()

    struct Ellipse {
        var x: Double
        var y: Double
        var rx: Double
        var ry: Double
        var rot: Double
    }

    struct Bunker {
        var x: Double
        var y: Double
        var rx: Double
        var ry: Double
        var rot: Double
        var lobes: [(Double, Double, Double)]
    }

    struct Region {
        var x0: Double
        var x1: Double
        var y0: Double
        var y1: Double
        var width: Double { x1 - x0 }
        var height: Double { y1 - y0 }
    }

    struct Tree {
        var x: Double
        var y: Double
        var r: Double
        var t: Double
    }

    struct Shot {
        var land: SIMD2<Double>
        var roll: SIMD2<Double>
        var hD: Double
        var cD: Double
        var land2: SIMD2<Double>
        var rest2: SIMD2<Double>
        var hA: Double
        var cA: Double
        var club: String
        var tee: SIMD2<Double>
        var holes: Bool
    }

    struct Arc {
        var start: SIMD2<Double>
        var end: SIMD2<Double>
        var height: Double
        var curve: Double
        var u: Double
        var alpha: Double
        var isPutt: Bool
    }

    struct Note {
        var at: SIMD2<Double>
        var text: String
        var distance: Int
        var born: Double
    }

    struct Spark {
        var x: Double
        var y: Double
        var vx: Double
        var vy: Double
        var life: Double
        var size: Double
        var phase: Double
    }

    struct Camera {
        var x: Double
        var y: Double
        var z: Double
        var r: Double
    }

    struct Frame {
        var camera: Camera
        var ball: SIMD3<Double>
        var arcs: [Arc]
        var notes: [Note]
        var sparks: [Spark]
        var flagWave: Double
        var holedAge: Double?
        var fade: Double
        var time: Double
    }

    static func trees() -> [Tree] {
        var rng = SeededRNG(11)
        var items: [Tree] = []
        var y = -40.0
        while y < 480 {
            let step = 3.5 + rng.next() * 4
            for s in [-1.0, 1.0] {
                for row in 0..<3 {
                    if rng.next() < 0.3 + Double(row) * 0.18 { continue }
                    let w = y > 372 ? 30.0 : max(hw(y), 12)
                    let x = cx(y) + s * (w + 22 + Double(row) * 11 + rng.next() * 9)
                    if hypot(x - pond.x, (y - pond.y) * 0.7) < 30 { continue }
                    items.append(Tree(x: x, y: y + rng.next() * 3, r: 3.8 + rng.next() * 3.6, t: rng.next()))
                }
            }
            y += step
        }
        return items.sorted { $0.y > $1.y }
    }

    static func variants() -> [Shot] {
        [
            Shot(
                land: SIMD2(cx(232) - 3, 232),
                roll: SIMD2(cx(246) - 2, 246),
                hD: 30, cD: -7,
                land2: SIMD2(pin.x - 1.5, pin.y - 6),
                rest2: SIMD2(pin.x - 1.1, pin.y - 2.8),
                hA: 22, cA: 4,
                club: "Hierro 8",
                tee: SIMD2(cx(0), 0),
                holes: false
            ),
            Shot(
                land: SIMD2(cx(226) + 4, 226),
                roll: SIMD2(cx(240) + 4, 240),
                hD: 28, cD: 6,
                land2: SIMD2(pin.x + 1.8, pin.y - 6.5),
                rest2: SIMD2(pin.x + 1.2, pin.y - 3),
                hA: 21, cA: -4,
                club: "Hierro 9",
                tee: SIMD2(cx(0), 0),
                holes: false
            )
        ]
    }

    static func shotPos(start: SIMD2<Double>, end: SIMD2<Double>, height: Double, curve: Double, u: Double) -> SIMD3<Double> {
        let v = pow(u, 1.25)
        let dx = end.x - start.x
        let dy = end.y - start.y
        let length = hypot(dx, dy)
        let L = length > 0 ? length : 1
        let lat = curve * 4 * (u - u * u)
        return SIMD3(
            lerp(start.x, end.x, u) + dy / L * lat,
            lerp(start.y, end.y, u) - dx / L * lat,
            height * sin(.pi * v)
        )
    }

    static func flightU(_ t: Double) -> Double {
        t * (1.3 - 0.3 * t)
    }

    static func dirAt(_ y: Double) -> Double {
        -atan((cx(y + 20) - cx(y - 20)) / 40) * 0.6
    }

    static func stillFrame(width: Double, height: Double) -> Frame {
        let shot = variants()[0]
        let zoom = min(width / 150, height / 470) * 0.98
        return Frame(
            camera: Camera(x: cx(230), y: 215, z: zoom, r: 0),
            ball: SIMD3(shot.rest2.x, shot.rest2.y, 0),
            arcs: [
                Arc(start: shot.tee, end: shot.land, height: shot.hD, curve: shot.cD, u: 1, alpha: 1, isPutt: false),
                Arc(start: shot.roll, end: shot.land2, height: shot.hA, curve: shot.cA, u: 1, alpha: 1, isPutt: false)
            ],
            notes: [
                Note(
                    at: shot.land,
                    text: "Driver",
                    distance: Int(round(hypot(shot.land.x - shot.tee.x, shot.land.y - shot.tee.y))),
                    born: -1e6
                )
            ],
            sparks: [],
            flagWave: 0,
            holedAge: nil,
            fade: 0,
            time: 0
        )
    }
}

struct SeededRNG {
    private var seed: Int

    init(_ seed: Int) {
        self.seed = seed
    }

    mutating func next() -> Double {
        seed = (seed * 16807) % 2_147_483_647
        return Double(seed) / 2_147_483_647
    }
}

enum YardageBookCopy {
    static func caption(stage: SyncStage, outcome: SyncSession.Outcome) -> String {
        if outcome == .failed { return "No se pudo actualizar" }
        if outcome == .succeeded || stage == .done { return "Listo" }
        switch stage {
        case .connect: return "Conectando"
        case .list: return "Buscando tarjetas"
        case .cards: return "Leyendo tarjetas"
        case .handicap: return "Historial de hándicap"
        case .save: return "Guardando rondas"
        case .done: return "Listo"
        }
    }

    static func count(_ progress: SyncAPIProgress, outcome: SyncSession.Outcome) -> String? {
        if outcome == .succeeded {
            if let n = progress.listTotal ?? progress.total { return "\(n) tarjetas" }
            return nil
        }
        if progress.stage == .cards || progress.stage == .save, let total = progress.total, total > 0 {
            return "\(progress.done ?? 0) / \(total)"
        }
        return nil
    }
}

final class YardageBookPlayer {
    private enum Phase: String {
        case drive, droll, cam1, appr, aroll, cam2, putt, hold, out, holed
    }

    private static let times: [Phase: Double] = [
        .drive: 2600, .droll: 600, .cam1: 800, .appr: 2200, .aroll: 500,
        .cam2: 700, .putt: 1800, .hold: 700, .out: 700
    ]

    private var variants: [YardageBook.Shot]
    private var variantIndex = 0
    private var shot: YardageBook.Shot
    private var phase: Phase = .drive
    private var phaseStart = 0.0
    private var time = 0.0
    private var camera = YardageBook.Camera(x: YardageBook.cx(40), y: 40, z: 2.2, r: 0)
    private var velocity = YardageBook.Camera(x: 0, y: 0, z: 0, r: 0)
    private var target = YardageBook.Camera(x: YardageBook.cx(40), y: 40, z: 2.2, r: 0)
    private var ball = SIMD3(YardageBook.cx(0), 0, 0)
    private var arcs: [YardageBook.Arc] = []
    private var notes: [YardageBook.Note] = []
    private var sparks: [YardageBook.Spark] = []
    private var fade = 0.0
    private var holedAt: Double?
    private var flagWave = 0.0
    private var finishing = false
    private var lastDate: TimeInterval?

    init() {
        variants = YardageBook.variants()
        shot = variants[0]
        newHole()
    }

    func finish() {
        finishing = true
    }

    func still(width: Double, height: Double) -> YardageBook.Frame {
        YardageBook.stillFrame(width: width, height: height)
    }

    func tick(dtMs: Double) -> YardageBook.Frame {
        update(dt: dtMs)
        return frame()
    }

    func advance(to date: Date) -> YardageBook.Frame {
        let now = date.timeIntervalSinceReferenceDate
        let dt = lastDate.map { min(50, (now - $0) * 1000) } ?? (1000 / 60)
        lastDate = now
        return tick(dtMs: dt)
    }

    private func frame() -> YardageBook.Frame {
        YardageBook.Frame(
            camera: camera,
            ball: ball,
            arcs: arcs,
            notes: notes,
            sparks: sparks,
            flagWave: flagWave,
            holedAge: holedAt.map { time - $0 },
            fade: fade,
            time: time
        )
    }

    private func start(_ next: Phase) {
        phase = next
        phaseStart = time
    }

    private func newHole() {
        shot = variants[variantIndex % variants.count]
        variantIndex += 1
        shot.tee = SIMD2(YardageBook.cx(0), 0)
        shot.holes = false
        arcs = []
        notes = []
        ball = SIMD3(shot.tee.x, shot.tee.y, 0)
        start(.drive)
    }

    private func update(dt: Double) {
        let speed: Double
        if finishing, !(phase == .putt && shot.holes) && phase != .holed {
            speed = 2.4
        } else {
            speed = 1
        }
        time += dt * speed
        let t = time - phaseStart
        flagWave += dt

        switch phase {
        case .drive, .appr:
            let duration = Self.times[phase] ?? 2200
            let tau = YardageBook.clamp(t / duration, 0, 1)
            let u = YardageBook.flightU(tau)
            let startP = phase == .drive ? shot.tee : shot.roll
            let endP = phase == .drive ? shot.land : shot.land2
            let height = phase == .drive ? shot.hD : shot.hA
            let curve = phase == .drive ? shot.cD : shot.cA
            let arc = YardageBook.Arc(start: startP, end: endP, height: height, curve: curve, u: u, alpha: 1, isPutt: false)
            if phase == .drive {
                if arcs.isEmpty { arcs = [arc] } else { arcs[0] = arc }
            } else {
                if arcs.count < 2 { arcs.append(arc) } else { arcs[1] = arc }
            }
            ball = YardageBook.shotPos(start: startP, end: endP, height: height, curve: curve, u: u)
            let look = phase == .drive ? YardageBook.lerp(0.35, 0.7, YardageBook.easeSin(tau)) : 0.7
            let fx = YardageBook.lerp(startP.x, endP.x, look)
            let fy = YardageBook.lerp(startP.y, endP.y, look)
            if phase == .drive {
                target = YardageBook.Camera(
                    x: fx, y: fy,
                    z: YardageBook.lerp(2.0, 1.25, YardageBook.easeSin(YardageBook.clamp(tau * 1.3, 0, 1))),
                    r: YardageBook.dirAt(fy)
                )
            } else {
                target = YardageBook.Camera(
                    x: fx, y: fy,
                    z: YardageBook.lerp(1.6, 2.6, YardageBook.easeSin(tau)),
                    r: YardageBook.dirAt(fy) * 0.5
                )
            }
            if tau >= 1 {
                notes.append(YardageBook.Note(
                    at: endP,
                    text: phase == .drive ? "Driver" : shot.club,
                    distance: Int(round(hypot(endP.x - startP.x, endP.y - startP.y))),
                    born: time
                ))
                start(phase == .drive ? .droll : .aroll)
            }
        case .droll, .aroll:
            let duration = Self.times[phase] ?? 500
            let k = YardageBook.easeOut(YardageBook.clamp(t / duration, 0, 1))
            let from = phase == .droll ? shot.land : shot.land2
            let to = phase == .droll ? shot.roll : shot.rest2
            ball = SIMD3(YardageBook.lerp(from.x, to.x, k), YardageBook.lerp(from.y, to.y, k), 0)
            if t >= duration { start(phase == .droll ? .cam1 : .cam2) }
        case .cam1:
            target = YardageBook.Camera(
                x: YardageBook.lerp(shot.roll.x, YardageBook.green.x, 0.45),
                y: YardageBook.lerp(shot.roll.y, YardageBook.green.y, 0.45),
                z: 1.9,
                r: YardageBook.dirAt(300) * 0.5
            )
            if t >= (Self.times[.cam1] ?? 800) { start(.appr) }
        case .cam2:
            target = YardageBook.Camera(x: YardageBook.pin.x - 1, y: YardageBook.pin.y - 3, z: 4.6, r: 0)
            if t >= (Self.times[.cam2] ?? 700) {
                shot.holes = finishing
                start(.putt)
            }
        case .putt:
            let duration = Self.times[.putt] ?? 1800
            let k = YardageBook.easeOut(YardageBook.clamp(t / duration, 0, 1))
            let end = shot.holes ? YardageBook.pin : SIMD2(YardageBook.pin.x + 0.25, YardageBook.pin.y + 0.3)
            let brk = sin(.pi * k) * 0.5 * (shot.cA >= 0 ? 1 : -1)
            ball = SIMD3(YardageBook.lerp(shot.rest2.x, end.x, k) + brk, YardageBook.lerp(shot.rest2.y, end.y, k), 0)
            let putt = YardageBook.Arc(start: shot.rest2, end: end, height: 0, curve: shot.cA, u: k, alpha: 1, isPutt: true)
            if arcs.count < 3 { arcs.append(putt) } else { arcs[2] = putt }
            target = YardageBook.Camera(x: YardageBook.pin.x, y: YardageBook.pin.y - 1.2, z: shot.holes ? 5.6 : 5, r: 0)
            if t >= duration {
                if shot.holes {
                    holedAt = time
                    burst()
                    start(.holed)
                } else {
                    start(.hold)
                }
            }
        case .hold:
            if t >= (Self.times[.hold] ?? 700) { start(.out) }
        case .out:
            fade = YardageBook.easeInOut(YardageBook.clamp(t / (Self.times[.out] ?? 700), 0, 1))
            target = YardageBook.Camera(x: YardageBook.cx(40), y: 40, z: 2.2, r: 0)
            if t >= (Self.times[.out] ?? 700) {
                camera = target
                velocity = YardageBook.Camera(x: 0, y: 0, z: 0, r: 0)
                newHole()
            }
        case .holed:
            break
        }

        if phase != .out {
            fade = max(0, fade - dt / 400)
        }
        spring(dt: dt / 1000)
        sparks = sparks.compactMap { spark in
            var next = spark
            next.life -= dt
            next.x += spark.vx * dt / 1000
            next.y += spark.vy * dt / 1000
            next.vx *= 0.97
            next.vy *= 0.97
            return next.life > 0 ? next : nil
        }
    }

    private func spring(dt: Double) {
        let w = 3.4
        func step(_ value: Double, _ vel: Double, _ tgt: Double) -> (Double, Double) {
            let force = w * w * (tgt - value) - 2 * w * vel
            let nextVel = vel + force * dt
            return (value + nextVel * dt, nextVel)
        }
        (camera.x, velocity.x) = step(camera.x, velocity.x, target.x)
        (camera.y, velocity.y) = step(camera.y, velocity.y, target.y)
        (camera.z, velocity.z) = step(camera.z, velocity.z, target.z)
        (camera.r, velocity.r) = step(camera.r, velocity.r, target.r)
    }

    private func burst() {
        var rng = SeededRNG(99)
        for _ in 0..<26 {
            let a = rng.next() * .pi * 2
            let v = 1.2 + rng.next() * 3.4
            sparks.append(YardageBook.Spark(
                x: YardageBook.pin.x,
                y: YardageBook.pin.y,
                vx: cos(a) * v,
                vy: sin(a) * v,
                life: 700 + rng.next() * 700,
                size: 0.5 + rng.next(),
                phase: rng.next() * 6
            ))
        }
    }
}

extension CGColor {
    static func sRGB(_ hex: UInt32, alpha: CGFloat = 1) -> CGColor {
        CGColor(
            srgbRed: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: alpha
        )
    }
}
