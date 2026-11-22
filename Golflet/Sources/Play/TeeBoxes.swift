import Foundation

struct TeeBox: Equatable, Sendable {
    var name: String
    var yards: Int?
    var lat: Double?
    var lng: Double?
}

enum TeeBoxes {
    /// Named tees, longest first. A point moves only when the hole has more than one center:
    /// the farthest from the green is the longest tee. One center is not assigned to a color.
    static func list(yards: [String: Int], centers: [GPSCoord], green: GPSCoord?) -> [TeeBox] {
        var named = yards.compactMap { key, value -> (name: String, yards: Int)? in
            let name = key.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
            guard !name.isEmpty, value >= 0, value < 1000 else { return nil }
            return (name, value)
        }
        named.sort { lhs, rhs in
            lhs.yards == rhs.yards ? lhs.name < rhs.name : lhs.yards > rhs.yards
        }
        var spots = centers
        if let green, spots.count > 1 {
            spots.sort { PlayMath.meters(from: $0, to: green) > PlayMath.meters(from: $1, to: green) }
        }
        let assign = spots.count > 1
        if named.isEmpty {
            return spots.enumerated().map { index, spot in
                TeeBox(name: spots.count == 1 ? "SALIDA" : "TEE \(index + 1)", yards: nil, lat: spot.lat, lng: spot.lng)
            }
        }
        return named.enumerated().map { index, row in
            let spot = assign && index < spots.count ? spots[index] : nil
            return TeeBox(name: row.name, yards: row.yards, lat: spot?.lat, lng: spot?.lng)
        }
    }
}
