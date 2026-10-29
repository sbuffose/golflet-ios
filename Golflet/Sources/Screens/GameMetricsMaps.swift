import SwiftUI

struct DriveDispersionMap: View {
    @Environment(\.palette) private var p
    var tee: GameTeeMetrics

    var body: some View {
        let points = tee.shots.filter { shot in
            guard let lateral = shot.lateralYd, let carry = shot.carryYd else { return false }
            return carry > 0 && lateral.isFinite
        }
        Canvas { context, size in
            let band = Double(max(tee.bandYd, 8))
            let carries = points.compactMap(\.carryYd)
            let lo = carries.min().map { max(0, ($0 - 15) / 25 * 25) } ?? 200
            let hi = carries.max().map { (($0 + 15 + 24) / 25) * 25 } ?? 300
            let sx = Double(size.width) / 96
            let sy = (Double(size.height) - 36) / max(25, Double(hi - lo))
            func x(_ yd: Double) -> CGFloat { CGFloat(Double(size.width) / 2 + max(-48, min(48, yd)) * sx) }
            func y(_ carry: Int) -> CGFloat { CGFloat(Double(size.height) - 20 - Double(carry - lo) * sy) }

            var rough = Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 14)
            context.fill(rough, with: .color(p.surface2))
            let fairway = Path(CGRect(x: x(-band), y: 0, width: x(band) - x(-band), height: size.height))
            context.fill(fairway, with: .color(p.fairway.opacity(0.55)))
            var center = Path()
            center.move(to: CGPoint(x: size.width / 2, y: 0))
            center.addLine(to: CGPoint(x: size.width / 2, y: size.height))
            context.stroke(center, with: .color(p.ink3.opacity(0.45)), lineWidth: 1)
            if let mean = tee.avgLateralYd {
                var gold = Path()
                gold.move(to: CGPoint(x: x(mean), y: 8))
                gold.addLine(to: CGPoint(x: x(mean), y: size.height - 8))
                context.stroke(gold, with: .color(p.accent), style: StrokeStyle(lineWidth: 1.6, dash: [4, 3]))
            }
            for point in points {
                let color: Color
                switch point.outcome {
                case "fairway": color = p.positive
                case "left", "right": color = p.negative
                default: color = p.ink3
                }
                let rect = CGRect(x: x(point.lateralYd!) - 4, y: y(point.carryYd!) - 4, width: 8, height: 8)
                context.fill(Path(ellipseIn: rect), with: .color(color))
            }
            let lab = { (text: String, at: CGPoint) in
                context.draw(
                    Text(text).font(GType.overline).foregroundStyle(p.ink3),
                    at: at,
                    anchor: .center
                )
            }
            lab("Izq.", CGPoint(x: x(-band) / 2, y: 12))
            lab("Der.", CGPoint(x: (x(band) + size.width) / 2, y: 12))
        }
        .frame(minHeight: 210)
        .accessibilityLabel("Dispersión de drives")
        .accessibilityIdentifier("met-drive-map")
    }
}

struct ApproachMissMap: View {
    @Environment(\.palette) private var p
    var shots: [GameApproachShot]
    var compact: Bool = false

    var body: some View {
        let points = shots.filter { $0.longYd != nil && $0.lateralYd != nil }
        Canvas { context, size in
            let side = min(size.width, size.height)
            let origin = CGPoint(x: (size.width - side) / 2, y: (size.height - side) / 2)
            let c = CGPoint(x: origin.x + side / 2, y: origin.y + side / 2)
            let scale = (side / 2 - 8) / CGFloat(34)
            context.fill(
                Path(roundedRect: CGRect(x: origin.x, y: origin.y, width: side, height: side), cornerRadius: compact ? 10 : 14),
                with: .color(p.surface2)
            )
            for ring in [10, 20, 30] {
                let r = CGFloat(ring) * scale
                var circle = Path()
                circle.addEllipse(in: CGRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2))
                context.stroke(circle, with: .color(p.ink3.opacity(0.35)), lineWidth: 1)
            }
            let flagH: CGFloat = compact ? 4 : 7
            let tip: CGFloat = compact ? 13 : 20
            var pin = Path()
            pin.move(to: c)
            pin.addLine(to: CGPoint(x: c.x, y: c.y - tip))
            context.stroke(pin, with: .color(p.accent), lineWidth: 1.4)
            var flag = Path()
            flag.move(to: CGPoint(x: c.x, y: c.y - tip))
            flag.addLine(to: CGPoint(x: c.x + (compact ? 7 : 11), y: c.y - tip + flagH / 2))
            flag.addLine(to: CGPoint(x: c.x, y: c.y - tip + flagH))
            context.fill(flag, with: .color(p.accent))
            for shot in points {
                let x = c.x + CGFloat(max(-33, min(33, shot.lateralYd!))) * scale
                let y = c.y - CGFloat(max(-33, min(33, shot.longYd!))) * scale
                let color: Color
                if shot.onGreen == true { color = p.positive }
                else if shot.onGreen == false { color = p.negative }
                else { color = p.ink3 }
                let r: CGFloat = compact ? 3.2 : 5.0
                context.fill(Path(ellipseIn: CGRect(x: x - r, y: y - r, width: r * 2, height: r * 2)), with: .color(color))
            }
            if !compact {
                let lab = { (text: String, at: CGPoint, anchor: UnitPoint) in
                    context.draw(Text(text).font(GType.overline).foregroundStyle(p.ink3), at: at, anchor: anchor)
                }
                lab("Largo", CGPoint(x: c.x, y: origin.y + 12), .center)
                lab("Corto", CGPoint(x: c.x, y: origin.y + side - 10), .center)
                lab("Izq.", CGPoint(x: origin.x + 10, y: c.y), .leading)
                lab("Der.", CGPoint(x: origin.x + side - 10, y: c.y), .trailing)
            }
        }
        .aspectRatio(1, contentMode: .fit)
        .accessibilityLabel("Mapa de errados alrededor de la bandera")
        .accessibilityIdentifier(compact ? "met-green-map-mini" : "met-green-map")
    }
}

struct GameMissBars: View {
    @Environment(\.palette) private var p
    var counts: GameMissCounts
    var known: Int

    var body: some View {
        let rows = [("short", "Corto"), ("long", "Largo"), ("left", "Izquierda"), ("right", "Derecha")]
        VStack(spacing: 10) {
            ForEach(rows, id: \.0) { key, label in
                let value = counts[key]
                HStack(spacing: 8) {
                    Text(label)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .frame(width: 78, alignment: .leading)
                        .minimumScaleFactor(0.7)
                        .lineLimit(1)
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule().fill(p.hairline)
                            Capsule()
                                .fill(p.primary)
                                .frame(width: max(3, geo.size.width * CGFloat(value) / CGFloat(counts.maxValue)))
                        }
                    }
                    .frame(height: 8)
                    Text(known > 0 ? "\(value) · \(Int((Double(value) / Double(known) * 100).rounded()))%" : "\(value)")
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                }
            }
        }
        .accessibilityIdentifier("met-miss-bars")
    }
}
