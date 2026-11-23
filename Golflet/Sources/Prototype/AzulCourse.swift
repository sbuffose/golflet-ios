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
    /// Day the 3–9 / 12–18 display swap starts. Stored JSON keeps the previous order.
    static let nineSwapFrom = "2026-11-22"
    static let legacyDay = "2026-11-21"

    private static var cache: [Int: AzulHoleGeo]?

    /// Display hole to stored hole. 1, 2, 10 and 11 stay. 3↔12 through 9↔18.
    static func nineSwap(_ n: Int) -> Int {
        guard (1...18).contains(n) else { return n }
        if (3...9).contains(n) { return n + 9 }
        if (12...18).contains(n) { return n - 9 }
        return n
    }

    /// A missing date is the layout used while playing. Hole 10 keeps its own green.
    static func currentLayout(playedOn: String?) -> Bool {
        let day = String((playedOn ?? "").prefix(10))
        guard day.count == 10 else { return true }
        return day >= nineSwapFrom
    }

    static func hole(_ n: Int, playedOn: String? = nil) -> AzulHoleGeo {
        let display = min(18, max(1, n))
        let stored = currentLayout(playedOn: playedOn) ? nineSwap(display) : display
        let holes = all()
        if var hit = holes[stored] {
            hit.number = display
            return hit
        }
        return AzulHoleGeo(
            number: display,
            par: 4,
            meters: 350,
            line: [AzulCoord(lat: -34.4854, lng: -58.5324), AzulCoord(lat: -34.4831, lng: -58.5288)],
            green: [],
            features: []
        )
    }

    static let coloradaCredit = "Salida © OpenStreetMap contributors (ODbL) · Cancha Colorada, Jockey Club. El centro del green es Golfistics, no el pin."

    /// Satellite when this course has a verified tee and green. Azul uses the OSM green. Colorada uses the OSM tee and the Golfistics green center. Anything else stays empty.
    static func layout(forCourse name: String, hole number: Int, playedOn: String? = nil) -> AzulHoleGeo? {
        if isJockeyAzul(name) {
            guard (1...18).contains(number) else { return nil }
            let geo = hole(number, playedOn: playedOn)
            if geo.green.count >= 3 || geo.line.count >= 2 { return geo }
            return nil
        }
        if isJockeyColorada(name) {
            return colorada(number)
        }
        return nil
    }

    static func mapCredit(forCourse name: String) -> String {
        isJockeyColorada(name) ? coloradaCredit : credit
    }

    static func isJockeyColorada(_ name: String) -> Bool {
        let folded = fold(name)
        return folded == "colorada" || folded == "cancha colorada" || folded.hasSuffix(" colorada")
    }

    static func isJockeyAzul(_ name: String) -> Bool {
        let folded = fold(name)
        return folded == "azul" || folded == "cancha azul" || folded.hasSuffix(" azul")
    }

    private static func fold(_ name: String) -> String {
        name.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: Locale(identifier: "es_AR"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    /// Tee (OSM) and green center (Golfistics) for Colorada. No invented fairway.
    private static func colorada(_ number: Int) -> AzulHoleGeo? {
        let rows: [(Int, Double, Double, Double, Double)] = [
            (1, -34.486807, -58.533269, -34.490067, -58.532539),
            (2, -34.489591, -58.532118, -34.492205, -58.53098),
            (3, -34.492426, -58.531169, -34.492939, -58.532418),
            (4, -34.493173, -58.532755, -34.489552, -58.5347),
            (5, -34.489726, -58.535028, -34.487046, -58.536376),
            (6, -34.48675, -58.536086, -34.48935, -58.534432),
            (7, -34.489643, -58.534154, -34.492641, -58.532579),
            (8, -34.492405, -58.531975, -34.490726, -58.532405),
            (9, -34.490359, -58.532814, -34.48734, -58.533617),
            (10, -34.486039, -58.532711, -34.489163, -58.530356),
            (11, -34.489433, -58.530408, -34.487916, -58.526105),
            (12, -34.487718, -58.52579, -34.489198, -58.52554),
            (13, -34.489508, -58.525682, -34.489718, -58.530098),
            (14, -34.490076, -58.530296, -34.48989, -58.526547),
            (15, -34.490177, -58.52663, -34.491849, -58.530522),
            (16, -34.49213, -58.5307, -34.488713, -58.532084),
            (17, -34.488188, -58.532242, -34.489345, -58.531108),
            (18, -34.489114, -58.530852, -34.486794, -58.532922),
        ]
        guard let row = rows.first(where: { $0.0 == number }) else { return nil }
        let tee = AzulCoord(lat: row.1, lng: row.2)
        let center = AzulCoord(lat: row.3, lng: row.4)
        let meters = CLLocation(latitude: tee.lat, longitude: tee.lng)
            .distance(from: CLLocation(latitude: center.lat, longitude: center.lng))
        guard meters >= 40, meters <= 750 else { return nil }
        return AzulHoleGeo(number: number, par: 4, meters: meters, line: [tee, center], green: [], features: [])
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
