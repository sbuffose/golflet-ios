import CoreLocation
import MapKit
import SwiftUI

struct PlanHoleMap: View {
    @Environment(\.palette) private var p
    let hole: CourseMapHole
    let frame: PlanHoleFrame
    let start: PlanLL
    let shots: [PlanSavedShot]
    let pending: PlanPendingShot?
    let landing: PlanLL?
    let noWind: PlanLL?
    let suggested: Bool
    let confirmed: [PlanLiveNumbers]
    let clubName: String
    let mode: PlanViewMode
    let onTap: (PlanLL) -> Void
    let onSelectConfirmed: (Int) -> Void

    var body: some View {
        GeometryReader { geo in
            let pts = drawPoints
            let fit = PlanGeometry.fit(points: pts, size: geo.size, padTop: 56, padBottom: 8)
            ZStack {
                if mode == .satelital {
                    satMap
                } else {
                    Canvas { ctx, size in
                        drawDiseno(ctx, size: size, fit: fit)
                    }
                }
                if mode == .diseno {
                    confirmedPills(fit: fit)
                    if let landing {
                        landingRing(at: PlanGeometry.project(frame.toScreen(landing), fit: fit), name: clubName, suggested: suggested)
                    }
                }
            }
            .contentShape(Rectangle())
            .gesture(
                SpatialTapGesture().onEnded { value in
                    if mode == .diseno {
                        let local = PlanGeometry.unproject(value.location, fit: fit)
                        onTap(frame.fromScreen(local))
                    }
                }
            )
            .accessibilityIdentifier("plan-map")
        }
    }

    private var drawPoints: [CGPoint] {
        var pts = hole.line.map(frame.toScreen)
        pts.append(contentsOf: hole.fairways.flatMap { $0.map(frame.toScreen) })
        if let green = hole.green {
            pts.append(contentsOf: green.polygon.map(frame.toScreen))
            if let c = green.center { pts.append(frame.toScreen(c)) }
        }
        pts.append(frame.toScreen(start))
        if let landing { pts.append(frame.toScreen(landing)) }
        return pts
    }

    private func drawDiseno(_ ctx: GraphicsContext, size: CGSize, fit: CGRect) {
        func P(_ ll: PlanLL) -> CGPoint { PlanGeometry.project(frame.toScreen(ll), fit: fit) }
        func poly(_ pts: [PlanLL]) -> Path {
            var path = Path()
            guard let first = pts.first else { return path }
            path.move(to: P(first))
            for pt in pts.dropFirst() { path.addLine(to: P(pt)) }
            path.closeSubpath()
            return path
        }
        ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(p.turf))
        for fairway in hole.fairways {
            ctx.fill(poly(fairway), with: .color(p.fairway))
        }
        if let green = hole.green, !green.polygon.isEmpty {
            ctx.fill(poly(green.polygon), with: .color(p.green))
        }
        for bunker in hole.bunkers {
            ctx.fill(poly(bunker.polygon), with: .color(p.sand))
        }
        if hole.line.count > 1 {
            var line = Path()
            line.move(to: P(hole.line[0]))
            for pt in hole.line.dropFirst() { line.addLine(to: P(pt)) }
            ctx.stroke(line, with: .color(p.primary.opacity(0.45)), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [5, 4]))
        }
        for marker in hole.markers {
            if marker.across.count >= 2 {
                var across = Path()
                across.move(to: P(marker.across[0]))
                across.addLine(to: P(marker.across[1]))
                ctx.stroke(across, with: .color(.white), lineWidth: 2)
            }
            let label = Text("\(marker.yards)")
                .font(GType.label)
                .foregroundStyle(p.ink)
            ctx.draw(label, at: P(marker.point), anchor: .center)
        }
        var chain = [start] + shots.compactMap(\.to)
        if let landing { chain.append(landing) }
        if chain.count > 1 {
            var shot = Path()
            shot.move(to: P(chain[0]))
            for pt in chain.dropFirst() { shot.addLine(to: P(pt)) }
            ctx.stroke(shot, with: .color(p.primary), style: StrokeStyle(lineWidth: 2.4, lineCap: .round, lineJoin: .round))
        }
        if let noWind {
            let c = P(noWind)
            ctx.stroke(Path(ellipseIn: CGRect(x: c.x - 5, y: c.y - 5, width: 10, height: 10)), with: .color(.white), style: StrokeStyle(lineWidth: 1.6, dash: [3, 2]))
        }
        let tee = P(start)
        ctx.fill(Path(ellipseIn: CGRect(x: tee.x - 6, y: tee.y - 6, width: 12, height: 12)), with: .color(p.accent))
        ctx.stroke(Path(ellipseIn: CGRect(x: tee.x - 8, y: tee.y - 8, width: 16, height: 16)), with: .color(.white), lineWidth: 1.4)
    }

    @ViewBuilder
    private func confirmedPills(fit: CGRect) -> some View {
        let points = [start] + shots.compactMap(\.to)
        ForEach(Array(confirmed.enumerated()), id: \.offset) { index, live in
            if index + 1 < points.count {
                let a = PlanGeometry.project(frame.toScreen(points[index]), fit: fit)
                let b = PlanGeometry.project(frame.toScreen(points[index + 1]), fit: fit)
                Button {
                    onSelectConfirmed(index)
                } label: {
                    VStack(spacing: 0) {
                        Text("\(PlanCore.clubName(live.club)) · \(live.shotYards)")
                            .font(GType.label)
                            .tabular()
                            .foregroundStyle(p.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.7)
                    }
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(.white.opacity(0.94))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("plan-pin-\(index)")
                .position(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
            }
        }
    }

    private func landingRing(at point: CGPoint, name: String, suggested: Bool) -> some View {
        VStack(spacing: 4) {
            ZStack {
                Circle()
                    .stroke(Color.white, lineWidth: 3)
                    .frame(width: 22, height: 22)
                if suggested {
                    Circle()
                        .stroke(Color(hex: 0xC8A86A), lineWidth: 2)
                        .frame(width: 28, height: 28)
                }
            }
            Text(name)
                .font(GType.label)
                .foregroundStyle(p.ink)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(.white.opacity(0.94))
                .clipShape(Capsule())
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .position(point)
        .accessibilityIdentifier("plan-landing")
        .allowsHitTesting(false)
    }

    private var satMap: some View {
        let center = hole.green?.center ?? hole.line.last ?? start
        return PlanSatMap(
            hole: hole,
            start: start,
            shots: shots,
            landing: landing,
            clubName: clubName,
            onTap: onTap
        )
        .accessibilityIdentifier("plan-sat")
        .overlay(alignment: .topLeading) {
            Color.clear.frame(width: 1, height: 1)
        }
        .onAppear { _ = center }
    }
}

private struct PlanSatMap: View {
    @Environment(\.palette) private var p
    let hole: CourseMapHole
    let start: PlanLL
    let shots: [PlanSavedShot]
    let landing: PlanLL?
    let clubName: String
    let onTap: (PlanLL) -> Void

    @State private var position: MapCameraPosition = .automatic

    var body: some View {
        MapReader { proxy in
            Map(position: $position, interactionModes: [.pan, .zoom]) {
                if hole.line.count > 1 {
                    MapPolyline(hole.line.map(\.clLocation))
                        .stroke(Color(hex: 0xC8A86A), lineWidth: 2)
                }
                Annotation("Salida", coordinate: start.clLocation) {
                    Circle().fill(Color(hex: 0xC8A86A)).frame(width: 10, height: 10)
                }
                if let landing {
                    Annotation(clubName, coordinate: landing.clLocation) {
                        VStack(spacing: 3) {
                            Circle().stroke(.white, lineWidth: 3).frame(width: 20, height: 20)
                            Text(clubName)
                                .font(GType.label)
                                .foregroundStyle(Color(hex: 0x121614))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.94))
                                .clipShape(Capsule())
                        }
                    }
                }
            }
            .mapStyle(.imagery)
            .gesture(
                SpatialTapGesture().onEnded { value in
                    if let coord = proxy.convert(value.location, from: .local) {
                        onTap(PlanLL(lng: coord.longitude, lat: coord.latitude))
                    }
                }
            )
        }
        .onAppear {
            let coords = ([start] + hole.line + (hole.green?.polygon ?? [])).map(\.clLocation)
            if let first = coords.first {
                var region = MKCoordinateRegion(center: first, latitudinalMeters: 380, longitudinalMeters: 380)
                if coords.count > 1 {
                    let lats = coords.map(\.latitude)
                    let lngs = coords.map(\.longitude)
                    region = MKCoordinateRegion(
                        center: CLLocationCoordinate2D(
                            latitude: (lats.min()! + lats.max()!) / 2,
                            longitude: (lngs.min()! + lngs.max()!) / 2
                        ),
                        span: MKCoordinateSpan(
                            latitudeDelta: max(0.002, (lats.max()! - lats.min()!) * 1.6),
                            longitudeDelta: max(0.002, (lngs.max()! - lngs.min()!) * 1.6)
                        )
                    )
                }
                position = .region(region)
            }
        }
    }
}

private extension PlanLL {
    var clLocation: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}
