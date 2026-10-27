import SwiftUI

struct YardageBookLayout {
    var size: CGSize

    var tee: CGPoint { point(0.36, 0.90) }
    var driveLanding: CGPoint { point(0.48, 0.52) }
    var approachLanding: CGPoint { point(0.60, 0.22) }
    var cup: CGPoint { point(0.63, 0.168) }
    var flagBase: CGPoint { point(0.63, 0.168) }

    var greenCenter: CGPoint { point(0.61, 0.18) }

    func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: size.width * x, y: size.height * y)
    }

    func loftedControl(from start: CGPoint, to end: CGPoint, height: CGFloat) -> CGPoint {
        CGPoint(
            x: (start.x + end.x) / 2 + (end.x - start.x) * 0.12,
            y: min(start.y, end.y) - height
        )
    }

    func flightPath(from start: CGPoint, to end: CGPoint, height: CGFloat) -> Path {
        var path = Path()
        path.move(to: start)
        path.addQuadCurve(to: end, control: loftedControl(from: start, to: end, height: height))
        return path
    }

    func holeOutline() -> Path {
        var path = Path()
        path.move(to: point(0.26, 0.93))
        path.addCurve(to: point(0.20, 0.64), control1: point(0.16, 0.88), control2: point(0.14, 0.76))
        path.addCurve(to: point(0.36, 0.30), control1: point(0.26, 0.52), control2: point(0.28, 0.40))
        path.addCurve(to: point(0.52, 0.10), control1: point(0.44, 0.20), control2: point(0.42, 0.11))
        path.addCurve(to: point(0.76, 0.12), control1: point(0.64, 0.08), control2: point(0.72, 0.08))
        path.addCurve(to: point(0.80, 0.28), control1: point(0.82, 0.16), control2: point(0.83, 0.22))
        path.addCurve(to: point(0.62, 0.58), control1: point(0.76, 0.38), control2: point(0.70, 0.50))
        path.addCurve(to: point(0.48, 0.93), control1: point(0.56, 0.68), control2: point(0.56, 0.86))
        path.addCurve(to: point(0.26, 0.93), control1: point(0.42, 0.97), control2: point(0.32, 0.97))
        path.closeSubpath()
        return path
    }

    func greenPath() -> Path {
        Path(ellipseIn: CGRect(
            x: greenCenter.x - size.width * 0.075,
            y: greenCenter.y - size.height * 0.038,
            width: size.width * 0.15,
            height: size.height * 0.076
        ))
    }

    func ringRadius(_ yards: Int) -> CGFloat {
        let scale = min(size.width, size.height)
        return scale * (CGFloat(0.10) + CGFloat(yards) / CGFloat(250) * CGFloat(0.28))
    }

    static func quadPoint(t: CGFloat, p0: CGPoint, control: CGPoint, p1: CGPoint) -> CGPoint {
        let u = 1 - t
        return CGPoint(
            x: u * u * p0.x + 2 * u * t * control.x + t * t * p1.x,
            y: u * u * p0.y + 2 * u * t * control.y + t * t * p1.y
        )
    }

    static func lerp(_ a: CGPoint, _ b: CGPoint, _ t: CGFloat) -> CGPoint {
        CGPoint(x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t)
    }
}

enum SyncShot: Int, CaseIterable {
    case drive
    case approach
    case putt
    case holeOut
}

struct YardageBookSyncScene: View {
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var outcome: SyncSession.Outcome
    var onHoledOut: () -> Void

    @State private var shot: SyncShot = .drive
    @State private var arcTrim: CGFloat = 0
    @State private var roll: CGFloat = 0
    @State private var ballInCup = false
    @State private var flagWave: CGFloat = 0
    @State private var didFinish = false
    @State private var succeedRequested = false

    var body: some View {
        GeometryReader { geo in
            let layout = YardageBookLayout(size: geo.size)
            ZStack {
                canvas(layout)
                flag(layout)
                if showBall {
                    ball(at: ballPoint(layout), inCup: ballInCup)
                }
            }
        }
        .aspectRatio(0.78, contentMode: .fit)
        .accessibilityHidden(true)
        .sensoryFeedback(.impact(weight: .light), trigger: ballInCup)
        .task { await run() }
        .onChange(of: outcome) { _, newValue in
            if newValue == .succeeded {
                succeedRequested = true
            }
        }
    }

    private var showBall: Bool {
        if reduceMotion { return ballInCup || outcome != .running }
        return true
    }

    @ViewBuilder
    private func canvas(_ layout: YardageBookLayout) -> some View {
        let frame = layout.size
        ZStack {
            layout.holeOutline()
                .stroke(p.primary.opacity(0.88), lineWidth: 1.15)
                .frame(width: frame.width, height: frame.height)

            ForEach([100, 150, 200, 250], id: \.self) { yards in
                let radius = layout.ringRadius(yards)
                Circle()
                    .stroke(
                        p.primary.opacity(yards == 150 ? 0.18 : 0.11),
                        style: StrokeStyle(lineWidth: 0.7, dash: [1.6, 4.2], dashPhase: 1)
                    )
                    .frame(width: radius * 2, height: radius * 2)
                    .position(layout.greenCenter)
            }

            layout.greenPath()
                .stroke(p.primary.opacity(0.55), lineWidth: 0.9)
                .frame(width: frame.width, height: frame.height)

            Circle()
                .stroke(p.primary.opacity(0.7), lineWidth: 0.8)
                .frame(width: 9, height: 9)
                .position(layout.cup)

            if ballInCup {
                Circle()
                    .fill(p.primary.opacity(0.28))
                    .frame(width: 7, height: 7)
                    .position(layout.cup)
            }

            if shouldDrawArc, let flight = currentFlight(layout) {
                flight.path
                    .trim(from: 0, to: arcTrim)
                    .stroke(
                        Color(hex: 0xC8A86A),
                        style: StrokeStyle(lineWidth: 1.45, lineCap: .round)
                    )
                    .frame(width: frame.width, height: frame.height)
            }

            Circle()
                .fill(p.primary)
                .frame(width: 5, height: 5)
                .position(layout.tee)
        }
        .frame(width: frame.width, height: frame.height)
    }

    private var shouldDrawArc: Bool {
        !reduceMotion && (shot == .drive || shot == .approach) && arcTrim > 0
    }

    @ViewBuilder
    private func flag(_ layout: YardageBookLayout) -> some View {
        let poleTop = CGPoint(x: layout.flagBase.x, y: layout.flagBase.y - 28)
        let wave = reduceMotion ? 0 : flagWave
        let frame = layout.size
        ZStack {
            Path { path in
                path.move(to: layout.flagBase)
                path.addLine(to: poleTop)
            }
            .stroke(p.primary, style: StrokeStyle(lineWidth: 1.2, lineCap: .round))
            .frame(width: frame.width, height: frame.height)

            Path { path in
                path.move(to: CGPoint(x: poleTop.x + 0.6, y: poleTop.y + 1))
                path.addQuadCurve(
                    to: CGPoint(x: poleTop.x + 0.6, y: poleTop.y + 13),
                    control: CGPoint(x: poleTop.x + 16 + wave * CGFloat(3.2), y: poleTop.y + 7 + wave * CGFloat(0.6))
                )
                path.closeSubpath()
            }
            .fill(Color(hex: 0xC8A86A))
            .frame(width: frame.width, height: frame.height)
        }
        .frame(width: frame.width, height: frame.height)
    }

    private func ball(at point: CGPoint, inCup: Bool) -> some View {
        Circle()
            .fill(Color(hex: 0xF7F5F0))
            .overlay {
                Circle().stroke(Color(hex: 0xC8A86A).opacity(0.85), lineWidth: 0.7)
            }
            .frame(width: inCup ? 3 : 8, height: inCup ? 3 : 8)
            .opacity(inCup ? 0 : 1)
            .position(point)
            .shadow(color: Color.black.opacity(0.08), radius: 1, y: 0.5)
    }

    private func currentFlight(_ layout: YardageBookLayout) -> (start: CGPoint, end: CGPoint, control: CGPoint, path: Path, height: CGFloat)? {
        switch shot {
        case .drive:
            let height = layout.size.height * 0.22
            let path = layout.flightPath(from: layout.tee, to: layout.driveLanding, height: height)
            return (layout.tee, layout.driveLanding, layout.loftedControl(from: layout.tee, to: layout.driveLanding, height: height), path, height)
        case .approach:
            let height = layout.size.height * 0.13
            let path = layout.flightPath(from: layout.driveLanding, to: layout.approachLanding, height: height)
            return (layout.driveLanding, layout.approachLanding, layout.loftedControl(from: layout.driveLanding, to: layout.approachLanding, height: height), path, height)
        case .putt, .holeOut:
            return nil
        }
    }

    private func ballPoint(_ layout: YardageBookLayout) -> CGPoint {
        if reduceMotion {
            return ballInCup ? layout.cup : layout.approachLanding
        }
        if ballInCup { return layout.cup }
        switch shot {
        case .drive:
            if let flight = currentFlight(layout) {
                if arcTrim < 1 {
                    return YardageBookLayout.quadPoint(t: arcTrim, p0: flight.start, control: flight.control, p1: flight.end)
                }
                return YardageBookLayout.lerp(flight.end, layout.driveLanding, roll)
            }
            return layout.tee
        case .approach:
            if let flight = currentFlight(layout) {
                if arcTrim < 1 {
                    return YardageBookLayout.quadPoint(t: arcTrim, p0: flight.start, control: flight.control, p1: flight.end)
                }
                return YardageBookLayout.lerp(flight.end, layout.approachLanding, roll)
            }
            return layout.driveLanding
        case .putt:
            return YardageBookLayout.lerp(layout.approachLanding, CGPoint(x: layout.cup.x - 8, y: layout.cup.y + 6), roll)
        case .holeOut:
            return YardageBookLayout.lerp(
                CGPoint(x: layout.cup.x - 8, y: layout.cup.y + 6),
                layout.cup,
                roll
            )
        }
    }

    private func run() async {
        if outcome == .succeeded { succeedRequested = true }
        if reduceMotion {
            while !succeedRequested && !Task.isCancelled {
                try? await Task.sleep(for: .milliseconds(80))
            }
            if succeedRequested { await finishHoleOut(animated: false) }
            return
        }
        let wave = Task { await waveFlag() }
        if succeedRequested {
            await finishHoleOut(animated: true)
        } else {
            await playLoop()
        }
        wave.cancel()
    }

    private func playLoop() async {
        while !Task.isCancelled && !succeedRequested && !didFinish {
            await play(.drive)
            if succeedRequested || Task.isCancelled { break }
            await play(.approach)
            if succeedRequested || Task.isCancelled { break }
            await play(.putt)
        }
        if succeedRequested, !didFinish {
            await finishHoleOut(animated: true)
        }
    }

    private func play(_ next: SyncShot) async {
        shot = next
        arcTrim = 0
        roll = 0
        let fast = RuntimeFlags.isUITesting
        switch next {
        case .drive:
            let flight = fast ? 0.28 : 1.45
            let settle = fast ? 0.08 : 0.32
            withAnimation(.easeInOut(duration: flight)) { arcTrim = 1 }
            try? await Task.sleep(for: .seconds(flight))
            withAnimation(.easeOut(duration: settle)) { roll = 1 }
            try? await Task.sleep(for: .seconds(settle + (fast ? 0.04 : 0.12)))
        case .approach:
            let flight = fast ? 0.22 : 1.15
            let settle = fast ? 0.08 : 0.28
            withAnimation(.easeInOut(duration: flight)) { arcTrim = 1 }
            try? await Task.sleep(for: .seconds(flight))
            withAnimation(.easeOut(duration: settle)) { roll = 1 }
            try? await Task.sleep(for: .seconds(settle + (fast ? 0.04 : 0.1)))
        case .putt:
            let duration = fast ? 0.18 : 0.85
            withAnimation(.easeInOut(duration: duration)) { roll = 1 }
            try? await Task.sleep(for: .seconds(duration + (fast ? 0.05 : 0.18)))
        case .holeOut:
            let duration = fast ? 0.2 : 0.7
            withAnimation(.easeInOut(duration: duration)) {
                roll = 1
                ballInCup = true
            }
            try? await Task.sleep(for: .seconds(duration))
        }
    }

    private func finishHoleOut(animated: Bool) async {
        guard !didFinish else { return }
        didFinish = true
        if animated {
            await play(.holeOut)
        } else {
            shot = .holeOut
            roll = 1
            ballInCup = true
        }
        let hold = RuntimeFlags.isUITesting ? 0.22 : (reduceMotion ? 0.28 : 0.7)
        try? await Task.sleep(for: .seconds(hold))
        onHoledOut()
    }

    private func waveFlag() async {
        while !Task.isCancelled && !reduceMotion {
            let duration = RuntimeFlags.isUITesting ? 0.35 : 1.8
            withAnimation(.easeInOut(duration: duration)) {
                flagWave = flagWave == 0 ? 1 : 0
            }
            try? await Task.sleep(for: .seconds(duration))
        }
    }
}
