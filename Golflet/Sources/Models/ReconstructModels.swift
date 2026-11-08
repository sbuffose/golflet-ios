import Foundation

struct ReconstructionPoint: Equatable, Sendable {
    var lat: Double
    var lng: Double
}

struct ReconstructionRound: Identifiable, Equatable, Sendable {
    var id: String
    var date: String
    var course: String
    var clubName: String
    var clubCode: String
    var vmCourse: String
    var roundId: String?
}

struct ReconstructionSetup: Equatable, Sendable {
    var officialRounds: [ReconstructionRound]
    var saved: [ReconstructionRound]
}

struct ReconstructionDraft: Equatable, Sendable {
    var hole: Int
    var club: String
    var result: String?
    var penaltyStrokes: Int
    var lat: Double?
    var lng: Double?
    var endLat: Double?
    var endLng: Double?
    var distanceM: Double?

    var body: [String: Any] {
        var out: [String: Any] = [
            "hole": hole,
            "club": club,
            "penalty_strokes": penaltyStrokes,
        ]
        if let result, !result.isEmpty { out["result"] = result }
        if let lat { out["lat"] = lat }
        if let lng { out["lng"] = lng }
        if let endLat { out["end_lat"] = endLat }
        if let endLng { out["end_lng"] = endLng }
        if let distanceM { out["distance_m"] = distanceM }
        return out
    }
}

struct ReconstructionShot: Identifiable, Equatable, Sendable {
    var id: String
    var hole: Int
    var club: String
    var result: String?
    var penaltyStrokes: Int
    var lat: Double?
    var lng: Double?
    var endLat: Double?
    var endLng: Double?
    var distanceM: Double?
    var positionLabel: String
    var distanceLabel: String

    var draft: ReconstructionDraft {
        ReconstructionDraft(hole: hole, club: club, result: result, penaltyStrokes: penaltyStrokes, lat: lat, lng: lng, endLat: endLat, endLng: endLng, distanceM: lat == nil ? distanceM : nil)
    }
}

enum ReconstructionCourseId {
    static func make(clubCode: String, course: String) -> String {
        let folded = course.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        var slug = ""
        var dash = false
        for scalar in folded.unicodeScalars {
            let ch = Character(scalar)
            if ch.isLetter || ch.isNumber {
                slug.append(ch)
                dash = false
            } else if !dash && !slug.isEmpty {
                slug.append("-")
                dash = true
            }
        }
        if slug.hasSuffix("-") { slug.removeLast() }
        return "\(clubCode)-\(slug)"
    }
}
