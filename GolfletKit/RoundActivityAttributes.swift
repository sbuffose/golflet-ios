import ActivityKit
import Foundation

public struct RoundActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable, Sendable {
        public var hole: Int
        public var par: Int
        public var frontYd: Int?
        public var centerYd: Int?
        public var backYd: Int?
        public var strokes: Int
        public var toPar: Int?
        public var course: String

        public init(
            hole: Int,
            par: Int,
            frontYd: Int? = nil,
            centerYd: Int? = nil,
            backYd: Int? = nil,
            strokes: Int,
            toPar: Int? = nil,
            course: String
        ) {
            self.hole = hole
            self.par = par
            self.frontYd = frontYd
            self.centerYd = centerYd
            self.backYd = backYd
            self.strokes = strokes
            self.toPar = toPar
            self.course = course
        }

        public var holeLine: String { "Hoyo \(hole) · Par \(par)" }

        public var scoreLine: String {
            if let toPar { return "\(strokes) · \(KitFormat.signedInt(toPar))" }
            return "\(strokes) golpes"
        }

        public var centerLine: String {
            guard let centerYd else { return "—" }
            return "\(centerYd)"
        }
    }

    public var courseName: String
    public var clubName: String
    public var liveRoundId: String

    public init(courseName: String, clubName: String, liveRoundId: String) {
        self.courseName = courseName
        self.clubName = clubName
        self.liveRoundId = liveRoundId
    }
}

enum KitFormat {
    private static let decimal: NumberFormatter = {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "es_AR")
        formatter.minimumFractionDigits = 1
        formatter.maximumFractionDigits = 1
        formatter.numberStyle = .decimal
        return formatter
    }()

    static func one(_ value: Double) -> String {
        decimal.string(from: NSNumber(value: value)) ?? String(format: "%.1f", value)
    }

    static func signedInt(_ value: Int) -> String {
        if value > 0 { return "+\(value)" }
        if value < 0 { return "−\(-value)" }
        return "E"
    }
}
