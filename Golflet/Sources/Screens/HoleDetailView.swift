import MapKit
import SwiftUI

struct HoleRef: Identifiable, Hashable {
    var number: Int
    var id: Int { number }
}

struct GroupRef: Identifiable, Hashable {
    var id: String
}

struct HoleDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    let courseName: String
    let holeNumber: Int
    @State private var strategy: CourseStrategy?

    private var currentHole: Int { model.presentedHole ?? holeNumber }
    private var courseKey: String { CourseIdentity.key(for: courseName) }

    var body: some View {
        GScreen(id: "screen-hoyo") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    map
                    yardages
                    history
                    strategyCard
                }
                .padding(.horizontal, 20)
                .padding(.top, 4)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-hoyo")
        .metricDestinations()
        .task { strategy = try? await model.api.courseStrategy(courseKey: courseKey, courseId: nil) }
        .onChange(of: currentHole) { _, _ in
            Task { strategy = try? await model.api.courseStrategy(courseKey: courseKey, courseId: nil) }
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Button { model.presentedHole = nil } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(p.ink2)
                        .frame(width: 32, height: 32)
                        .background(p.surface)
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("close-hole")
                Spacer()
                HStack(spacing: 8) {
                    Button { step(-1) } label: {
                        Image(systemName: "chevron.left")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 32, height: 32)
                            .background(p.surface)
                            .clipShape(Circle())
                    }
                    .accessibilityIdentifier("prev-hole")
                    Button { step(1) } label: {
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(p.ink)
                            .frame(width: 32, height: 32)
                            .background(p.surface)
                            .clipShape(Circle())
                    }
                    .accessibilityIdentifier("next-hole")
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 6)
            .background(p.bg)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "Cancha \(courseName) · tu hoyo más difícil")
            GTitle(text: "Hoyo \(currentHole)")
        }
    }

    private var map: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let geo = AzulCourse.layout(forCourse: courseName, hole: currentHole) {
                HoleSatelliteMap(hole: geo)
                    .frame(height: 340)
                    .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
                    .accessibilityIdentifier("hole-satellite-map")
                Text(AzulCourse.credit)
                    .font(GFont.ui(10))
                    .foregroundStyle(p.ink3)
            } else {
                Text("Esta cancha todavía no tiene el mapa satelital.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                    .accessibilityIdentifier("hole-map-unavailable")
            }
        }
    }

    private var yardages: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                labeled("Hoyo", "\(currentHole)")
                Spacer()
                labeled("Par", "\(stat?.par ?? courseHole?.par ?? 4)")
                Spacer()
                labeled("Yardas", longestYardage.map(String.init) ?? "—")
                Spacer()
                labeled("Handicap", "\(stat?.handicap ?? courseHole?.handicap ?? currentHole)")
            }
            .padding(.vertical, 8)
            VStack(alignment: .leading, spacing: 8) {
                ForEach(teeYardages, id: \.0) { name, yards in
                    HStack(spacing: 8) {
                        TeeDot(name: name)
                        Text("\(name) \(yards)")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                }
            }
        }
    }

    private func labeled(_ title: String, _ value: String) -> some View {
        VStack(spacing: 4) {
            Text(value)
                .font(GType.statM)
                .tabular()
                .foregroundStyle(p.ink)
            Text(title)
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Tu historial")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Text("\(stat?.samples ?? 0) vueltas")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
            GCard(radius: 22, padding: 16) {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .firstTextBaseline) {
                        Text(stat.map { FormatAR.one($0.average) } ?? "—")
                            .font(GFont.ui(44, weight: .semibold))
                            .tracking(-1.8)
                            .tabular()
                            .foregroundStyle(p.ink)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Promedio")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                            Text("\(stat.map { FormatAR.signedOne($0.averageToPar) } ?? "—") vs par")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                        Spacer()
                    }
                    if let last = stat?.averageLast16 {
                        Text("Últimas 16: \(FormatAR.one(last))")
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    if holeSeries.count > 1 {
                        MetricLineChart(points: holeSeries, valueTitle: "Golpes")
                            .frame(height: 160)
                            .accessibilityIdentifier("hole-score-chart")
                    }
                    distribution
                    comparison
                }
            }
        }
    }

    private var distribution: some View {
        let dist = stat?.distribution
        let items: [(String, Double, Color)] = [
            ("Birdie", dist?.percent(dist?.birdie ?? 0) ?? 0, p.accentInk),
            ("Par", dist?.percent(dist?.par ?? 0) ?? 0, p.ink2),
            ("Bogey", dist?.percent(dist?.bogey ?? 0) ?? 0, p.sand),
            ("Doble+", dist?.percent((dist?.double ?? 0) + (dist?.triplePlus ?? 0)) ?? 0, p.negative)
        ]
        return VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geo in
                HStack(spacing: 2) {
                    ForEach(items, id: \.0) { item in
                        if item.1 > 0 {
                            item.2.frame(width: max(4, geo.size.width * item.1 / 100), height: 8)
                        }
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 8)
            HStack {
                ForEach(items, id: \.0) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.0)
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                        Text("\(Int(item.1.rounded()))%")
                            .font(GType.headline)
                            .tabular()
                            .foregroundStyle(p.ink)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
        }
    }

    private var comparison: some View {
        let birdie = stat?.comparisons.first { $0.key == "Birdie" }
        let par = stat?.comparisons.first { $0.key == "Par" }
        let bogey = stat?.comparisons.first { $0.key == "Bogey" }
        let double = stat?.comparisons.first { $0.key == "DobleBogey" }
        return HStack {
            compare("Birdie", birdie)
            compare("Par", par)
            compare("Bogey", bogey)
            compare("Doble+", double)
        }
        .font(GType.label)
    }

    private func compare(_ label: String, _ item: SiteComparison?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .foregroundStyle(p.ink3)
            Text("\(Int(item?.playerPct ?? 0))%")
                .font(GType.headline)
                .foregroundStyle(p.ink)
            Text("todos \(Int(item?.groupPct ?? 0))%")
                .foregroundStyle(p.ink3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var strategyCard: some View {
        if let hole = strategy?.hole(currentHole) {
            StrategyHoleCard(
                hole: hole,
                courseKey: courseKey,
                warning: StrategyCopy.siteWarning(courseKey: courseKey, hole: currentHole)
            )
        }
    }

    private var course: Course? {
        model.courses.first { $0.name.caseInsensitiveCompare(courseName) == .orderedSame }
    }

    private var courseHole: CourseHole? {
        course?.holes.first { $0.number == currentHole }
    }

    private var stat: HoleStat? {
        model.holesForCourse(courseName).first { $0.number == currentHole }
    }

    private var holeSeries: [MetricPoint] {
        StatsEngine.series(
            from: StatsEngine.ranged(model.rounds, range: model.statsRange),
            kind: .hole(currentHole),
            courseName: courseName
        )
    }

    private var teeYardages: [(String, Int)] {
        let order = ["NEGRO", "ROJO", "AZUL", "BLANCO", "AMARILLO"]
        let yards = courseHole?.yards ?? [:]
        return order.compactMap { key in
            guard let value = yards[key] else { return nil }
            return (key.capitalized, value)
        }
    }

    private var longestYardage: Int? {
        courseHole?.yards.values.max()
    }

    private func step(_ delta: Int) {
        let next = min(18, max(1, currentHole + delta))
        model.presentedHole = next
    }
}

/// Read-only satellite of one Cancha Azul hole. Tee sits at the bottom, green at the top.
private struct HoleSatelliteMap: UIViewRepresentable {
    var hole: AzulHoleGeo

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.mapType = .satellite
        map.isScrollEnabled = false
        map.isZoomEnabled = false
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.showsCompass = false
        map.pointOfInterestFilter = .excludingAll
        map.delegate = context.coordinator
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        guard context.coordinator.drawnHole != hole.number else { return }
        context.coordinator.drawnHole = hole.number
        map.removeOverlays(map.overlays)
        addOverlays(map)
        let camera = MKMapCamera(
            lookingAtCenter: focus,
            fromDistance: altitude,
            pitch: 0,
            heading: hole.heading
        )
        map.setCamera(camera, animated: false)
    }

    private var focus: CLLocationCoordinate2D {
        let tee = hole.tee
        let pin = hole.pin
        return CLLocationCoordinate2D(
            latitude: (tee.lat + pin.lat) / 2,
            longitude: (tee.lng + pin.lng) / 2
        )
    }

    private var altitude: CLLocationDistance {
        let origin = AzulCoord(lat: focus.latitude, lng: focus.longitude)
        let points = hole.line + hole.green + hole.features.flatMap(\.points)
        let reach = points.map { hole.meters(from: origin, to: $0) }.max() ?? hole.meters / 2
        let halfAngle = 14.0 * Double.pi / 180
        return max(reach / tan(halfAngle) * 1.08, 280)
    }

    private func addOverlays(_ map: MKMapView) {
        func poly(_ pts: [AzulCoord], kind: String) {
            guard pts.count >= 3 else { return }
            let overlay = MKPolygon(coordinates: pts.map(\.cl), count: pts.count)
            overlay.title = kind
            map.addOverlay(overlay)
        }
        for feature in hole.features { poly(feature.points, kind: feature.kind) }
        poly(hole.green, kind: "g")
        guard hole.line.count >= 2 else { return }
        let line = MKPolyline(coordinates: hole.line.map(\.cl), count: hole.line.count)
        line.title = "line"
        map.addOverlay(line)
    }

    final class Coordinator: NSObject, MKMapViewDelegate {
        var drawnHole = 0

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let poly = overlay as? MKPolygon {
                let renderer = MKPolygonRenderer(polygon: poly)
                renderer.strokeColor = .white
                renderer.lineWidth = 1.2
                switch poly.title {
                case "g": renderer.fillColor = UIColor(red: 0.35, green: 0.72, blue: 0.38, alpha: 0.28)
                case "f": renderer.fillColor = UIColor(red: 0.45, green: 0.7, blue: 0.35, alpha: 0.18)
                case "b": renderer.fillColor = UIColor(red: 0.86, green: 0.75, blue: 0.42, alpha: 0.45)
                case "w": renderer.fillColor = UIColor(red: 0.15, green: 0.42, blue: 0.72, alpha: 0.4)
                default: renderer.fillColor = UIColor.white.withAlphaComponent(0.08)
                }
                return renderer
            }
            if let line = overlay as? MKPolyline {
                let renderer = MKPolylineRenderer(polyline: line)
                renderer.strokeColor = .white
                renderer.lineWidth = 2
                return renderer
            }
            return MKOverlayRenderer(overlay: overlay)
        }
    }
}
