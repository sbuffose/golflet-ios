import Foundation

struct ReconstructionPoint: Equatable, Sendable {
    var lat: Double
    var lng: Double
}

struct HoleEnds: Equatable, Sendable {
    var tee: ReconstructionPoint?
    var flag: ReconstructionPoint?

    func verified() -> (tee: ReconstructionPoint, flag: ReconstructionPoint)? {
        guard let tee, let flag else { return nil }
        let meters = HoleEnds.meters(tee, flag)
        guard meters >= 40, meters <= 700 else { return nil }
        return (tee, flag)
    }

    static func meters(_ a: ReconstructionPoint, _ b: ReconstructionPoint) -> Double {
        let radius = 6_371_000.0
        let p1 = a.lat * .pi / 180
        let p2 = b.lat * .pi / 180
        let dLat = (b.lat - a.lat) * .pi / 180
        let dLng = (b.lng - a.lng) * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(p1) * cos(p2) * sin(dLng / 2) * sin(dLng / 2)
        return 2 * radius * asin(min(1, sqrt(h)))
    }
}

struct ReconstructionRound: Identifiable, Equatable, Sendable {
    var id: String
    var date: String
    var course: String
    var clubName: String
    var clubCode: String
    var vmCourse: String
    var roundId: String?
    var tee: String = ""
    var gross: Int? = nil
    var tracked: Bool = false
    var official: Bool = true
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
    var lie: String?
    var positionLabel: String
    var distanceLabel: String
    var intent: String? = nil

    var draft: ReconstructionDraft {
        ReconstructionDraft(hole: hole, club: club, result: result, penaltyStrokes: penaltyStrokes, lat: lat, lng: lng, endLat: endLat, endLng: endLng, distanceM: lat == nil ? distanceM : nil)
    }
}

struct RoundTrackContext: Equatable, Sendable {
    var roundId: String
    var date: Date
    var courseName: String
    var clubCode: String
    var hole: Int
    var liveId: String = ""

    init(roundId: String, date: Date, courseName: String, clubCode: String, hole: Int, liveId: String = "") {
        self.roundId = roundId
        self.date = date
        self.courseName = courseName
        self.clubCode = clubCode
        self.hole = hole
        self.liveId = liveId
    }
}

enum RoundTrackCourse {
    static func match(courses: [Course], clubCode: String, name: String) -> Course? {
        let wanted = fold(name)
        guard !wanted.isEmpty else { return nil }
        let named = courses.filter { fold($0.name) == wanted }
        if !clubCode.isEmpty {
            let same = named.filter { $0.clubCode == clubCode }
            return same.count == 1 ? same[0] : nil
        }
        return named.count == 1 ? named[0] : nil
    }

    private static func fold(_ text: String) -> String {
        text.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
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
