import MapKit
import SwiftUI
import UIKit

struct MapRing: Hashable {
    var kind: String
    var points: [GPSCoord]
}

struct HoleShotMark: Hashable {
    var number: Int
    var coord: GPSCoord
}

enum HoleGeoMath {
    static func heading(from tee: GPSCoord, to pin: GPSCoord) -> Double {
        let dLng = (pin.lng - tee.lng) * .pi / 180
        let lat1 = tee.lat * .pi / 180
        let lat2 = pin.lat * .pi / 180
        let y = sin(dLng) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
        let deg = atan2(y, x) * 180 / .pi
        return (deg + 360).truncatingRemainder(dividingBy: 360)
    }

    static func azul(course: GPSCourseDetail, hole: Int) -> AzulHoleGeo? {
        let blob = (course.courseId + " " + course.course + " " + course.courseKey)
            .folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR"))
            .lowercased()
        guard blob.contains("azul") else { return nil }
        return AzulCourse.hole(hole)
    }

    static func rings(course: GPSCourseDetail, hole: GPSHole?) -> (rings: [MapRing], line: [GPSCoord]) {
        if let hole, let azul = azul(course: course, hole: hole.number) {
            var rings = azul.features.map { feature in
                MapRing(kind: feature.kind, points: feature.points.map { GPSCoord(lat: $0.lat, lng: $0.lng) })
            }
            if azul.green.count >= 3 {
                rings.append(MapRing(kind: "g", points: azul.green.map { GPSCoord(lat: $0.lat, lng: $0.lng) }))
            }
            let line = azul.line.map { GPSCoord(lat: $0.lat, lng: $0.lng) }
            return (rings, line)
        }
        guard let hole else { return ([], []) }
        var rings: [MapRing] = []
        if let center = hole.green.center {
            rings.append(MapRing(kind: "g", points: ring(around: center, front: hole.green.front, back: hole.green.back)))
        }
        let tee = hole.tee
        let pin = hole.green.center ?? hole.green.front ?? tee
        let line = [tee, pin].compactMap { $0 }
        return (rings, line)
    }

    static func lie(course: GPSCourseDetail, hole: Int, at point: GPSCoord) -> SGLie? {
        guard let azul = azul(course: course, hole: hole) else { return nil }
        return azul.lie(at: AzulCoord(lat: point.lat, lng: point.lng))
    }

    private static func ring(around center: GPSCoord, front: GPSCoord?, back: GPSCoord?) -> [GPSCoord] {
        let front = front ?? GPSCoord(lat: center.lat - 0.00008, lng: center.lng)
        let back = back ?? GPSCoord(lat: center.lat + 0.00008, lng: center.lng)
        let dLat = back.lat - front.lat
        let dLng = back.lng - front.lng
        let side = GPSCoord(lat: -dLng * 0.35, lng: dLat * 0.35)
        return [
            front,
            GPSCoord(lat: center.lat + side.lat, lng: center.lng + side.lng),
            back,
            GPSCoord(lat: center.lat - side.lat, lng: center.lng - side.lng)
        ]
    }
}

/// Satellite hole. In TRACK the map moves under a fixed reticle. In AIM the target annotation drags.
struct HoleSatelliteMap: UIViewRepresentable {
    var holeNumber: Int
    var tee: GPSCoord
    var pin: GPSCoord
    var player: GPSCoord
    var target: GPSCoord
    var shotPoints: [GPSCoord]
    var rings: [MapRing]
    var line: [GPSCoord]
    var trackMode: Bool
    var heading: Double
    var animateCamera: Bool
    var focus: GPSCoord
    var focusID: String
    /// Closed hole: the camera sits on the green and the tee stays down-screen, the same overview the web uses.
    var framesHole: Bool = false
    var zoom: Int = 0
    var shotMarks: [HoleShotMark] = []
    var onCenter: (GPSCoord) -> Void
    var onTarget: (GPSCoord) -> Void

    func makeCoordinator() -> Coord {
        Coord(onCenter: onCenter, onTarget: onTarget)
    }

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.mapType = .satellite
        map.isAccessibilityElement = false
        map.accessibilityElementsHidden = true
        map.isRotateEnabled = false
        map.isPitchEnabled = false
        map.showsCompass = false
        map.pointOfInterestFilter = .excludingAll
        map.delegate = context.coordinator
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        context.coordinator.onCenter = onCenter
        context.coordinator.onTarget = onTarget
        context.coordinator.trackMode = trackMode
        let holeChanged = context.coordinator.holeNumber != holeNumber
        if holeChanged {
            context.coordinator.holeNumber = holeNumber
            map.removeOverlays(map.overlays)
            map.removeAnnotations(map.annotations)
            addRings(map)
        }
        let cameraKey = "\(focusID)|\(framesHole)|\(zoom)"
        if context.coordinator.cameraKey != cameraKey {
            context.coordinator.cameraKey = cameraKey
            let holeMeters = max(40.0, Double(PlayMath.meters(from: tee, to: pin)))
            // Web overview (`frameHole` mode overview) keeps the green at the reticle and the tee down-screen.
            let distance = (framesHole ? max(360, holeMeters * 1.15) : max(90, holeMeters * 0.72)) * pow(0.78, Double(zoom))
            let look = framesHole ? pin : focus
            let camera = MKMapCamera(lookingAtCenter: look.cl, fromDistance: distance, pitch: 0, heading: heading)
            map.setCamera(camera, animated: animateCamera && !holeChanged)
        }
        refreshShots(map)
        refreshAnnotations(map, context: context)
        context.coordinator.reportCenter(map)
    }

    private func addRings(_ map: MKMapView) {
        for ring in rings where ring.points.count >= 3 {
            let overlay = MKPolygon(coordinates: ring.points.map(\.cl), count: ring.points.count)
            overlay.title = ring.kind
            map.addOverlay(overlay)
        }
        if line.count >= 2 {
            let overlay = MKPolyline(coordinates: line.map(\.cl), count: line.count)
            overlay.title = "line"
            map.addOverlay(overlay)
        }
    }

    private func refreshShots(_ map: MKMapView) {
        map.removeOverlays(map.overlays.filter { $0.title == "shots" })
        guard shotPoints.count >= 2 else { return }
        let overlay = MKPolyline(coordinates: shotPoints.map(\.cl), count: shotPoints.count)
        overlay.title = "shots"
        map.addOverlay(overlay)
    }

    private func refreshAnnotations(_ map: MKMapView, context: Context) {
        if context.coordinator.dragging { return }
        map.removeAnnotations(map.annotations)
        map.addAnnotation(HolePoint(kind: "player", coord: player))
        map.addAnnotation(HolePoint(kind: "pin", coord: pin))
        if !trackMode {
            map.addAnnotation(HolePoint(kind: "aim", coord: target))
        }
        for mark in shotMarks {
            map.addAnnotation(HolePoint(kind: "n:\(mark.number)", coord: mark.coord))
        }
    }

    final class Coord: NSObject, MKMapViewDelegate {
        var onCenter: (GPSCoord) -> Void
        var onTarget: (GPSCoord) -> Void
        var holeNumber = 0
        var cameraKey = ""
        var trackMode = false
        var dragging = false

        init(onCenter: @escaping (GPSCoord) -> Void, onTarget: @escaping (GPSCoord) -> Void) {
            self.onCenter = onCenter
            self.onTarget = onTarget
        }

        func reportCenter(_ map: MKMapView) {
            let center = map.centerCoordinate
            onCenter(GPSCoord(lat: center.latitude, lng: center.longitude))
        }

        func mapViewDidChangeVisibleRegion(_ mapView: MKMapView) {
            reportCenter(mapView)
        }

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
            let renderer = MKPolylineRenderer(overlay: overlay)
            renderer.strokeColor = overlay.title == "shots" ? UIColor(red: 0.78, green: 0.06, blue: 0.18, alpha: 1) : .white
            renderer.lineWidth = overlay.title == "shots" ? 3 : 2
            return renderer
        }

        func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
            guard let point = annotation as? HolePoint else { return nil }
            let view = mapView.dequeueReusableAnnotationView(withIdentifier: point.kind) ?? MKAnnotationView(annotation: annotation, reuseIdentifier: point.kind)
            view.annotation = annotation
            view.canShowCallout = false
            let marker = HoleMarker.image(kind: point.kind)
            view.image = marker
            view.centerOffset = point.kind == "pin" ? CGPoint(x: 0, y: -10) : (point.kind.hasPrefix("n:") ? CGPoint(x: 8, y: -8) : .zero)
            view.isDraggable = point.kind == "aim"
            return view
        }

        func mapView(_ mapView: MKMapView, annotationView view: MKAnnotationView, didChange newState: MKAnnotationView.DragState, fromOldState oldState: MKAnnotationView.DragState) {
            switch newState {
            case .starting, .dragging:
                dragging = true
            case .ending, .canceling:
                dragging = false
                if let coord = view.annotation?.coordinate {
                    onTarget(GPSCoord(lat: coord.latitude, lng: coord.longitude))
                }
                view.setDragState(.none, animated: false)
            default:
                break
            }
        }
    }
}

final class HolePoint: MKPointAnnotation {
    var kind: String

    init(kind: String, coord: GPSCoord) {
        self.kind = kind
        super.init()
        coordinate = coord.cl
    }
}

enum HoleMarker {
    static func image(kind: String) -> UIImage {
        if kind.hasPrefix("n:"), let number = Int(kind.dropFirst(2)) {
            let size: CGFloat = 22
            let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
            return renderer.image { _ in
                let rect = CGRect(x: 1, y: 1, width: size - 2, height: size - 2)
                UIColor(red: 0.78, green: 0.06, blue: 0.18, alpha: 1).setFill()
                UIBezierPath(ovalIn: rect).fill()
                let text = NSAttributedString(string: "\(number)", attributes: [
                    .font: UIFont.systemFont(ofSize: 12, weight: .bold),
                    .foregroundColor: UIColor.white
                ])
                let box = text.size()
                text.draw(at: CGPoint(x: (size - box.width) / 2, y: (size - box.height) / 2))
            }
        }
        let size: CGFloat = kind == "aim" ? 28 : 18
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: size, height: size))
        return renderer.image { ctx in
            let rect = CGRect(x: 1, y: 1, width: size - 2, height: size - 2)
            UIColor.white.setFill()
            ctx.cgContext.fillEllipse(in: rect)
            let color: UIColor = kind == "pin" ? UIColor(red: 0.78, green: 0.06, blue: 0.18, alpha: 1) : UIColor(red: 0.04, green: 0.15, blue: 0.27, alpha: 1)
            color.setStroke()
            ctx.cgContext.setLineWidth(2)
            ctx.cgContext.strokeEllipse(in: rect.insetBy(dx: 3, dy: 3))
        }
    }
}

private extension GPSCoord {
    var cl: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }
}
