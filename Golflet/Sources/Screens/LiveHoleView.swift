import MapKit
import SwiftUI

struct LiveHoleView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.dismiss) private var dismiss

    @State private var holeN: Int
    @State private var mode: Mode = .aim
    @State private var center = AzulCoord(lat: -34.48, lng: -58.53)
    @State private var player: AzulCoord
    @State private var target: AzulCoord
    @State private var pin: AzulCoord
    @State private var shots: [MarkedShot] = []
    @State private var score = 0
    @State private var showScore = false
    @State private var showMore = false
    @State private var waterAsk = false
    @State private var lastLie: SGLie = .fairway
    @State private var fly: Double = 1
    @State private var heading: Double = 0

    enum Mode { case aim, track, score }

    init(start: Int = 1) {
        let geo = AzulCourse.hole(start)
        _holeN = State(initialValue: start)
        _player = State(initialValue: geo.tee)
        _target = State(initialValue: geo.pin)
        _pin = State(initialValue: geo.pin)
        _center = State(initialValue: geo.tee)
        _heading = State(initialValue: geo.heading)
        _score = State(initialValue: geo.par)
    }

    private var geo: AzulHoleGeo { AzulCourse.hole(holeN) }
    private var unit: String { model.onboarding.unit }
    private func fmt(_ m: Double) -> String {
        let v = unit == "yd" ? m * 1.0936 : m
        return "\(Int(v.rounded())) \(unit == "yd" ? "yd" : "m")"
    }

    var body: some View {
        ZStack {
            LiveHoleMapView(
                hole: geo,
                player: player,
                pin: pin,
                target: target,
                shots: shots,
                heading: heading,
                trackMode: mode == .track,
                fly: fly,
                onCenter: { coord in
                    center = coord
                    if mode == .track {
                        lastLie = geo.lie(at: coord)
                        waterAsk = lastLie == .agua
                    }
                }
            )
            .ignoresSafeArea()

            overlays
        }
        .accessibilityIdentifier("screen-live-hole")
        .accessibilityElement(children: .contain)
        .onAppear { resetHole(holeN, animate: false) }
        .safeAreaInset(edge: .bottom) { bottomBar }
    }

    private var overlays: some View {
        VStack {
            HStack {
                Button { dismiss(); model.showsLiveHole = false } label: { roundIcon("house.fill") }
                    .accessibilityIdentifier("live-home")
                Spacer()
                NavigationLink { AntesDeSalirView() } label: { roundIcon("line.3.horizontal") }
                    .accessibilityIdentifier("live-menu")
            }
            .padding(.horizontal, 12)
            .padding(.top, 8)

            Button { model.showsAntesDeSalir = true } label: {
                Text("Modo \(model.homeMode.title)")
                    .font(GFont.ui(13, weight: .semibold))
                    .foregroundStyle(p.ink)
                    .padding(.horizontal, 13)
                    .padding(.vertical, 8)
                    .background(.ultraThinMaterial)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("live-mode")

            if model.roundSettings.shows(.partido, mode: model.homeMode) || showMore {
                chip("Todavía no hay resultado", id: "live-partido")
            }

            Spacer()

            if mode == .track {
                VStack(spacing: 4) {
                    let dist = geo.meters(from: player, to: center)
                    let toPin = geo.meters(from: center, to: pin)
                    if toPin < 1.5 {
                        Text("En el hoyo").font(GType.headline)
                    } else {
                        Text(fmt(dist)).font(GType.statM).tabular()
                        Text("\(lastLie.rawValue) · \(fmt(toPin)) al hoyo")
                            .font(GType.label)
                    }
                }
                .padding(10)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(radius: 8)
                .offset(y: -8)
                .accessibilityIdentifier("live-reticle-label")
            }

            reticle
                .opacity(mode == .track ? 1 : 0)
                .allowsHitTesting(false)
        }
    }

    private var reticle: some View {
        ZStack {
            Circle().stroke(Color(hex: BrandHex.red), lineWidth: 3).frame(width: 22, height: 22).background(Circle().fill(Color.white))
            Circle().fill(Color(hex: BrandHex.red)).frame(width: 3, height: 3)
        }
        .accessibilityIdentifier("live-reticle")
    }

    private func chip(_ text: String, id: String) -> some View {
        Text(text)
            .font(GFont.ui(12, weight: .semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(p.primary)
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 12)
            .accessibilityIdentifier(id)
    }

    private func roundIcon(_ name: String) -> some View {
        Image(systemName: name)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(p.ink)
            .frame(width: 44, height: 44)
            .background(Circle().fill(Color.white.opacity(0.96)))
            .shadow(radius: 6)
    }

    private var bottomBar: some View {
        VStack(spacing: 10) {
            if waterAsk && mode == .track {
                HStack {
                    Text("¿Penalidad de agua?").font(GType.headline)
                    Spacer()
                    Button("Sí") { confirmShot(penalty: true, holed: false) }
                    Button("No") { waterAsk = false; confirmShot(penalty: false, holed: false) }
                }
                .padding(12)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .accessibilityIdentifier("live-water")
            }
            if showScore {
                scorePad
            } else {
                HStack(spacing: 10) {
                    if model.roundSettings.shows(.palo, mode: model.homeMode) || showMore {
                        let d = geo.meters(from: player, to: target)
                        let club = PrototypeBag.suggest(meters: d, bag: model.onboarding.bag, i7: model.onboarding.i7)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Mira").font(GType.label).foregroundStyle(p.ink3)
                            Text(PrototypeBag.label(club.0)).font(GType.headline).foregroundStyle(p.ink)
                                .accessibilityIdentifier("live-club")
                        }
                        .padding(.horizontal, 12)
                    }
                    if model.roundSettings.shows(.track, mode: model.homeMode) || showMore || model.homeMode == .mej {
                        Button(mode == .track ? "ENTER" : "TRACK") {
                            if mode == .track {
                                let onCup = TrackSession.onCup(meters: Double(geo.meters(from: center, to: pin)))
                                confirmShot(penalty: false, holed: onCup)
                            } else { withAnimation(motion) { mode = .track } }
                        }
                        .font(GType.headline)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(Capsule())
                        .accessibilityLabel(mode == .track ? "ENTER" : "TRACK. Marcar el golpe.")
                        .accessibilityIdentifier("live-confirm")
                        if mode == .track {
                            Button("AIM") { withAnimation(motion) { mode = .aim } }
                                .font(GType.headline)
                                .foregroundStyle(p.primary)
                                .accessibilityLabel("AIM. Apuntar.")
                        }
                    }
                    Button("Anotar score") { showScore = true }
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .padding(.horizontal, 18)
                        .padding(.vertical, 12)
                        .background(p.primary)
                        .clipShape(Capsule())
                        .accessibilityIdentifier("live-score")
                    if mode == .track {
                        Button("En el hoyo") { confirmShot(penalty: false, holed: true) }
                            .font(GType.headline)
                            .foregroundStyle(p.primary)
                            .accessibilityIdentifier("live-inholed")
                    }
                }
            }
            HStack {
                Button { switchHole(holeN == 1 ? 18 : holeN - 1) } label: {
                    Image(systemName: "chevron.left").font(.system(size: 18, weight: .bold))
                }
                .accessibilityIdentifier("live-prev")
                Spacer()
                VStack(spacing: 2) {
                    Text("Hoyo \(holeN)").font(GType.headline).foregroundStyle(p.ink)
                    Text("Par \(geo.par) · \(fmt(geo.meters))").font(GType.label).foregroundStyle(p.ink3)
                }
                .accessibilityIdentifier("live-hole-title")
                Spacer()
                Button { switchHole(holeN == 18 ? 1 : holeN + 1) } label: {
                    Image(systemName: "chevron.right").font(.system(size: 18, weight: .bold))
                }
                .accessibilityIdentifier("live-next")
            }
            Button(showMore ? "Menos" : "Más") { showMore.toggle() }
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier("live-more")
            Text(AzulCourse.credit)
                .font(GFont.ui(10))
                .foregroundStyle(p.ink3)
                .multilineTextAlignment(.center)
        }
        .padding(12)
        .background(.ultraThinMaterial)
    }

    private var scorePad: some View {
        VStack(spacing: 10) {
            HStack {
                Text("Vos").font(GType.headline)
                Spacer()
                Button("−") { score = max(1, score - 1) }
                    .frame(width: 40, height: 40)
                    .background(p.surface2)
                    .clipShape(Circle())
                Text("\(score)").font(GType.statM).tabular().frame(width: 40)
                    .accessibilityIdentifier("live-score-value")
                Button("+") { score += 1 }
                    .frame(width: 40, height: 40)
                    .background(p.surface2)
                    .clipShape(Circle())
            }
            HStack {
                Button("Guardar") { model.saveLiveScore(hole: holeN, score: score); showScore = false }
                Button("Guardar y seguir") {
                    model.saveLiveScore(hole: holeN, score: score)
                    showScore = false
                    switchHole(holeN == 18 ? 1 : holeN + 1)
                }
            }
            .font(GType.headline)
        }
        .padding(12)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }

    private var motion: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.86)
    }

    private func confirmShot(penalty: Bool, holed: Bool) {
        let to = holed ? pin : center
        let shot = MarkedShot(from: player, to: to, lie: lastLie, holed: holed, penalty: penalty)
        shots.append(shot)
        let sg = StrokesGained.shot(
            hole: holeN, index: shots.count - 1, startLie: shots.count == 1 ? .salida : lastLie,
            startM: geo.meters(from: player, to: pin), endLie: holed ? .hoyo : geo.lie(at: to),
            endM: holed ? 0 : geo.meters(from: to, to: pin), holed: holed, penalty: penalty, par: geo.par,
            club: PrototypeBag.suggest(meters: geo.meters(from: player, to: to), bag: model.onboarding.bag, i7: model.onboarding.i7).0
        )
        model.addLiveShot(sg)
        if reduceMotion {
            fly = 1
            finishConfirm(holed: holed, to: to)
        } else {
            fly = 0
            withAnimation(.easeOut(duration: 0.46)) { fly = 1 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                finishConfirm(holed: holed, to: to)
            }
        }
    }

    private func finishConfirm(holed: Bool, to: AzulCoord) {
        waterAsk = false
        if holed {
            showScore = true
            mode = .aim
        } else {
            player = to
            target = pin
            mode = .aim
        }
    }

    private func switchHole(_ n: Int) {
        if reduceMotion {
            resetHole(n, animate: false)
        } else {
            withAnimation(.easeIn(duration: 0.2)) { }
            resetHole(n, animate: true)
        }
    }

    private func resetHole(_ n: Int, animate: Bool) {
        holeN = n
        let g = AzulCourse.hole(n)
        player = g.tee
        pin = g.pin
        target = g.pin
        heading = g.heading
        shots = []
        score = g.par
        mode = .aim
        showScore = false
        model.liveHoleNumber = n
    }
}

struct MarkedShot: Hashable {
    var from: AzulCoord
    var to: AzulCoord
    var lie: SGLie
    var holed: Bool
    var penalty: Bool
}

struct LiveHoleMapView: UIViewRepresentable {
    var hole: AzulHoleGeo
    var player: AzulCoord
    var pin: AzulCoord
    var target: AzulCoord
    var shots: [MarkedShot]
    var heading: Double
    var trackMode: Bool
    var fly: Double
    var onCenter: (AzulCoord) -> Void

    func makeCoordinator() -> Coord { Coord(onCenter: onCenter) }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.mapType = .satellite
        map.isRotateEnabled = true
        map.isPitchEnabled = false
        map.showsCompass = false
        map.delegate = context.coordinator
        context.coordinator.attach(map)
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.onCenter = onCenter
        context.coordinator.trackMode = trackMode
        if context.coordinator.holeN != hole.number {
            context.coordinator.holeN = hole.number
            map.removeOverlays(map.overlays)
            map.removeAnnotations(map.annotations)
            addOverlays(map)
            let cam = MKMapCamera(lookingAtCenter: mid(), fromDistance: 420, pitch: 0, heading: heading)
            map.setCamera(cam, animated: false)
        }
        context.coordinator.reportCenter(map)
    }

    private func mid() -> CLLocationCoordinate2D {
        CLLocationCoordinate2D(
            latitude: (player.lat + pin.lat) / 2,
            longitude: (player.lng + pin.lng) / 2
        )
    }

    private func addOverlays(_ map: MKMapView) {
        func poly(_ pts: [AzulCoord], kind: String) {
            guard pts.count >= 3 else { return }
            let overlay = MKPolygon(coordinates: pts.map(\.cl), count: pts.count)
            overlay.title = kind
            map.addOverlay(overlay)
        }
        for f in hole.features { poly(f.points, kind: f.kind) }
        poly(hole.green, kind: "g")
        let line = MKPolyline(coordinates: hole.line.map(\.cl), count: hole.line.count)
        line.title = "line"
        map.addOverlay(line)
    }

    final class Coord: NSObject, MKMapViewDelegate {
        var onCenter: (AzulCoord) -> Void
        var holeN = 0
        var trackMode = false
        init(onCenter: @escaping (AzulCoord) -> Void) { self.onCenter = onCenter }

        func attach(_ map: MKMapView) {
            map.addGestureRecognizer(UIPanGestureRecognizer(target: self, action: #selector(pan)))
        }

        @objc func pan(_ g: UIPanGestureRecognizer) {
            guard let map = g.view as? MKMapView else { return }
            reportCenter(map)
        }

        func reportCenter(_ map: MKMapView) {
            let c = map.centerCoordinate
            onCenter(AzulCoord(lat: c.latitude, lng: c.longitude))
        }

        func mapView(_ mapView: MKMapView, rendererFor overlay: MKOverlay) -> MKOverlayRenderer {
            if let poly = overlay as? MKPolygon {
                let r = MKPolygonRenderer(polygon: poly)
                r.strokeColor = .white
                r.lineWidth = 1.2
                switch poly.title {
                case "g": r.fillColor = UIColor(red: 0.35, green: 0.72, blue: 0.38, alpha: 0.28)
                case "f": r.fillColor = UIColor(red: 0.45, green: 0.7, blue: 0.35, alpha: 0.18)
                case "b": r.fillColor = UIColor(red: 0.86, green: 0.75, blue: 0.42, alpha: 0.45)
                case "w": r.fillColor = UIColor(red: 0.15, green: 0.42, blue: 0.72, alpha: 0.4)
                default: r.fillColor = UIColor.white.withAlphaComponent(0.08)
                }
                return r
            }
            if let line = overlay as? MKPolyline {
                let r = MKPolylineRenderer(polyline: line)
                r.strokeColor = .white
                r.lineWidth = 2
                return r
            }
            return MKOverlayRenderer(overlay: overlay)
        }

        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            reportCenter(mapView)
        }
    }
}
