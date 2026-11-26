import Foundation

struct TeeBox: Equatable, Sendable {
    var name: String
    var yards: Int?
    var lat: Double?
    var lng: Double?
}

enum TeeBoxes {
    /// Named tees, longest first. A center keeps a color only when the measured yards agree.
    /// One center is not assigned to a color. A tee without a matching point stays empty.
    static func list(yards: [String: Int], centers: [GPSCoord], green: GPSCoord?) -> [TeeBox] {
        var named = yards.compactMap { key, value -> (name: String, yards: Int)? in
            let name = key.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            guard !name.isEmpty, value >= 0, value < 1000 else { return nil }
            return (name, value)
        }
        named.sort { lhs, rhs in
            lhs.yards == rhs.yards ? lhs.name < rhs.name : lhs.yards > rhs.yards
        }
        let spots = centers
        let assign = green != nil && spots.count > 1 && named.count > 1
        if named.isEmpty {
            return spots.enumerated().map { index, spot in
                TeeBox(name: spots.count == 1 ? "SALIDA" : "TEE \(index + 1)", yards: nil, lat: spot.lat, lng: spot.lng)
            }
        }
        return named.map { row in
            guard assign, let green else {
                return TeeBox(name: row.name, yards: row.yards, lat: nil, lng: nil)
            }
            let hit = spots
                .map { spot -> (spot: GPSCoord, gap: Double) in
                    let yards = Double(PlayMath.meters(from: spot, to: green)) / 0.9144
                    return (spot, abs(yards - Double(row.yards)))
                }
                .filter { gap in gap.gap <= Swift.max(20.0, Double(row.yards) * 0.04) }
                .min { $0.gap < $1.gap }
            return TeeBox(name: row.name, yards: row.yards, lat: hit?.spot.lat, lng: hit?.spot.lng)
        }
    }
}
