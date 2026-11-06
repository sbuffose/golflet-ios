import CoreLocation
import Foundation

/// Jockey Club Cancha Azul hole geometry from OpenStreetMap (ODbL).
/// © OpenStreetMap contributors. Credit required.
struct AzulCoord: Hashable {
    var lat: Double
    var lng: Double
    var cl: CLLocationCoordinate2D { CLLocationCoordinate2D(latitude: lat, longitude: lng) }
}

struct AzulFeature: Hashable {
    /// OSM class: f fairway, g green, b bunker, w water, t tee.
    var kind: String
    var points: [AzulCoord]
}

struct AzulHoleGeo: Identifiable, Hashable {
    var number: Int
    var par: Int
    var meters: Double
    var line: [AzulCoord]
    var green: [AzulCoord]
    var features: [AzulFeature]
    var id: Int { number }

    var tee: AzulCoord { line.first ?? AzulCoord(lat: -34.48, lng: -58.53) }
    var pin: AzulCoord {
        guard !green.isEmpty else { return line.last ?? tee }
        let lat = green.map(\.lat).reduce(0, +) / Double(green.count)
        let lng = green.map(\.lng).reduce(0, +) / Double(green.count)
        return AzulCoord(lat: lat, lng: lng)
    }

    /// Heading from tee to green so tee sits at the bottom and the green at the top.
    var heading: Double {
        let t = tee.cl
        let g = pin.cl
        let dLng = (g.longitude - t.longitude) * .pi / 180
        let lat1 = t.latitude * .pi / 180
        let lat2 = g.latitude * .pi / 180
        let y = sin(dLng) * cos(lat2)
        let x = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dLng)
        let deg = atan2(y, x) * 180 / .pi
        return (deg + 360).truncatingRemainder(dividingBy: 360)
    }

    func meters(from a: AzulCoord, to b: AzulCoord) -> Double {
        let la = CLLocation(latitude: a.lat, longitude: a.lng)
        return la.distance(from: CLLocation(latitude: b.lat, longitude: b.lng))
    }

    func lie(at p: AzulCoord) -> SGLie {
        let feats = features + (green.isEmpty ? [] : [AzulFeature(kind: "g", points: green)])
        for kind in ["w", "b", "g", "t", "f"] {
            if feats.contains(where: { $0.kind == kind && AzulCourse.inPoly(p, $0.points) }) {
                switch kind {
                case "w": return .agua
                case "b": return .bunker
                case "g": return .green
                case "t": return .salida
                default: return .fairway
                }
            }
        }
        return .rough
    }
}

enum AzulCourse {
    static let credit = "Mapa © OpenStreetMap contributors (ODbL) · Cancha Azul, Jockey Club"

    private static var cache: [Int: AzulHoleGeo]?

    static func hole(_ n: Int) -> AzulHoleGeo {
        let holes = all()
        if let hit = holes[min(18, max(1, n))] { return hit }
        return AzulHoleGeo(
            number: n,
            par: 4,
            meters: 350,
            line: [AzulCoord(lat: -34.4854, lng: -58.5324), AzulCoord(lat: -34.4831, lng: -58.5288)],
            green: [],
            features: []
        )
    }

    /// Real Cancha Azul geometry for the hole-detail map. Other courses return nil.
    static func layout(forCourse name: String, hole number: Int) -> AzulHoleGeo? {
        guard isJockeyAzul(name), let geo = all()[number] else { return nil }
        guard geo.green.count >= 3 || geo.line.count >= 2 else { return nil }
        return geo
    }

    static func isJockeyAzul(_ name: String) -> Bool {
        let folded = name
            .folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_AR"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        return folded == "azul" || folded == "cancha azul" || folded.hasSuffix(" azul")
    }

    static func all() -> [Int: AzulHoleGeo] {
        if let cache { return cache }
        let loaded = load()
        cache = loaded
        return loaded
    }

    static func inPoly(_ p: AzulCoord, _ poly: [AzulCoord]) -> Bool {
        guard poly.count >= 3 else { return false }
        var inside = false
        var j = poly.count - 1
        for i in 0..<poly.count {
            let a = poly[i], b = poly[j]
            if (a.lat > p.lat) != (b.lat > p.lat) {
                let span = b.lat - a.lat
                let x = (b.lng - a.lng) * (p.lat - a.lat) / (span == 0 ? 1e-12 : span) + a.lng
                if p.lng < x { inside.toggle() }
            }
            j = i
        }
        return inside
    }

    private static func load() -> [Int: AzulHoleGeo] {
        let url = Bundle.main.url(forResource: "hoyos-azul", withExtension: "json")
            ?? Bundle(for: AzulCourseMarker.self).url(forResource: "hoyos-azul", withExtension: "json")
        guard let url,
              let data = try? Data(contentsOf: url),
              let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return [:] }
        var out: [Int: AzulHoleGeo] = [:]
        for (key, raw) in root {
            guard let n = Int(key), let blob = raw as? [String: Any] else { continue }
            let line = coords(blob["l"])
            let green = coords(blob["g"])
            var feats: [AzulFeature] = []
            if let list = blob["f"] as? [Any] {
                for item in list {
                    guard let pair = item as? [Any], pair.count == 2,
                          let kind = pair[0] as? String else { continue }
                    feats.append(AzulFeature(kind: kind, points: coords(pair[1])))
                }
            }
            let meters = (blob["m"] as? Double) ?? (blob["m"] as? Int).map(Double.init) ?? length(line)
            let par = (blob["p"] as? Int) ?? 4
            out[n] = AzulHoleGeo(number: n, par: par, meters: meters, line: line, green: green, features: feats)
        }
        return out
    }

    private static func coords(_ raw: Any?) -> [AzulCoord] {
        guard let rows = raw as? [[Any]] else { return [] }
        return rows.compactMap { row in
            guard row.count >= 2,
                  let lat = num(row[0]), let lng = num(row[1]) else { return nil }
            return AzulCoord(lat: lat, lng: lng)
        }
    }

    private static func num(_ raw: Any) -> Double? {
        if let d = raw as? Double { return d }
        if let i = raw as? Int { return Double(i) }
        if let n = raw as? NSNumber { return n.doubleValue }
        return nil
    }

    private static func length(_ line: [AzulCoord]) -> Double {
        guard line.count > 1 else { return 0 }
        var d = 0.0
        for i in 1..<line.count {
            d += CLLocation(latitude: line[i - 1].lat, longitude: line[i - 1].lng)
                .distance(from: CLLocation(latitude: line[i].lat, longitude: line[i].lng))
        }
        return d
    }
}

private final class AzulCourseMarker {}
