import Foundation
#if canImport(UIKit)
import UIKit
#endif

enum GroupRole: String, Codable, Sendable, Hashable {
    case admin
    case member

    var title: String {
        switch self {
        case .admin: return "Admin"
        case .member: return "Miembro"
        }
    }
}

struct GroupMember: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var initials: String
    var photoURL: String?
    var role: GroupRole
    var isOwner: Bool
}

struct GroupInviteLink: Hashable, Sendable {
    var token: String
    var url: URL
    var enabled: Bool

    static func make(token: String, enabled: Bool = true) -> GroupInviteLink {
        GroupInviteLink(
            token: token,
            url: GolfletURL.inviteURL(token: token),
            enabled: enabled
        )
    }
}

struct GolfletGroup: Identifiable, Hashable, Sendable {
    var id: String
    var name: String
    var photoURL: String?
    var owner: GroupMember
    var members: [GroupMember]
    var myRole: GroupRole
    var invite: GroupInviteLink?

    var isAdmin: Bool { myRole == .admin }
    var memberCount: Int { members.count }
}

struct GroupInvitePreview: Identifiable, Hashable, Sendable {
    var id: String { token }
    var token: String
    var groupID: String?
    var name: String
    var photoURL: String?
    var ownerName: String
    var ownerInitials: String
    var members: [GroupMember]
    var alreadyMember: Bool
}

struct InviteSharePayload: Identifiable, Hashable, Sendable {
    var id: String { url.absoluteString }
    var groupName: String
    var url: URL
}

enum ShareCategory: String, CaseIterable, Identifiable, Codable, Sendable {
    case scoring
    case handicap
    case birdiesPars = "birdies_pars"
    case holeHeatmap = "hole_heatmap"
    case girFairways = "gir_fairways"
    case putting
    case gpsDistances = "gps_distances"
    case bag
    case ball
    case profile
    case holeByHole = "rounds_detail"

    var id: String { rawValue }

    var title: String {
        switch self {
        case .scoring: return "Scoring"
        case .handicap: return "Hándicap"
        case .birdiesPars: return "Birdies y pares"
        case .holeHeatmap: return "Mapa por hoyo"
        case .girFairways: return "GIR y fairways"
        case .putting: return "Putting"
        case .gpsDistances: return "Distancias GPS"
        case .bag: return "Bolsa"
        case .ball: return "Pelota"
        case .profile: return "Mi perfil en los grupos"
        case .holeByHole: return "Mis tarjetas hoyo por hoyo"
        }
    }

    var apiKey: String {
        switch self {
        case .scoring: return "scores"
        case .handicap: return "handicap"
        case .birdiesPars: return "score_types"
        case .holeHeatmap: return "holes"
        case .girFairways: return "gir_fir"
        case .putting: return "putting"
        case .gpsDistances: return "gps"
        case .bag: return "bag"
        case .ball: return "ball"
        case .profile: return "profile"
        case .holeByHole: return "rounds_detail"
        }
    }

    var footnote: String {
        switch self {
        case .scoring: return "Gross, neto y resultado de cada ronda"
        case .handicap: return "Índice y diferenciales"
        case .birdiesPars: return "Águilas, birdies y pares"
        case .holeHeatmap: return "Promedio por hoyo"
        case .girFairways: return "Greens en regulación y calles"
        case .putting: return "Putts por ronda"
        case .gpsDistances: return "Carry y distancias de la ronda con GPS"
        case .bag: return "Palos y yardajes de tu bolsa"
        case .ball: return "La pelota que estás usando"
        case .profile: return "Si está apagado, en el grupo solo ven tu nombre"
        case .holeByHole: return "Que puedan abrir cada ronda, no solo los promedios"
        }
    }
}

struct SharePrefs: Hashable, Codable, Sendable {
    var scoring = true
    var handicap = true
    var birdiesPars = true
    var holeHeatmap = true
    var girFairways = true
    var putting = true
    var gpsDistances = true
    var bag = true
    var ball = true
    var profile = true
    var holeByHole = false

    static let allShared = SharePrefs()

    func isShared(_ category: ShareCategory) -> Bool {
        switch category {
        case .scoring: return scoring
        case .handicap: return handicap
        case .birdiesPars: return birdiesPars
        case .holeHeatmap: return holeHeatmap
        case .girFairways: return girFairways
        case .putting: return putting
        case .gpsDistances: return gpsDistances
        case .bag: return bag
        case .ball: return ball
        case .profile: return profile
        case .holeByHole: return holeByHole
        }
    }

    mutating func set(_ category: ShareCategory, shared: Bool) {
        switch category {
        case .scoring: scoring = shared
        case .handicap: handicap = shared
        case .birdiesPars: birdiesPars = shared
        case .holeHeatmap: holeHeatmap = shared
        case .girFairways: girFairways = shared
        case .putting: putting = shared
        case .gpsDistances: gpsDistances = shared
        case .bag: bag = shared
        case .ball: ball = shared
        case .profile: profile = shared
        case .holeByHole: holeByHole = shared
        }
    }

    var jsonBody: [String: Any] {
        [
            "prefs": Dictionary(uniqueKeysWithValues: ShareCategory.allCases.map {
                ($0.apiKey, isShared($0))
            })
        ]
    }
}

enum GroupMetricKind: String, CaseIterable, Identifiable, Codable, Sendable {
    case gross
    case net
    case handicap
    case birdies
    case pars
    case eagles
    case gir
    case fir
    case putts
    case gpsDrive
    case bagCarry
    case ball

    var id: String { rawValue }

    static func parse(_ raw: String) -> GroupMetricKind? {
        if let value = GroupMetricKind(rawValue: raw) { return value }
        switch raw {
        case "avg_gross", "best_gross", "rounds": return .gross
        case "avg_net", "best_net": return .net
        default: return nil
        }
    }

    var title: String {
        switch self {
        case .gross: return "Gross"
        case .net: return "Neto"
        case .handicap: return "Hándicap"
        case .birdies: return "Birdies"
        case .pars: return "Pares"
        case .eagles: return "Águilas"
        case .gir: return "GIR"
        case .fir: return "Fairways"
        case .putts: return "Putts"
        case .gpsDrive: return "Drive GPS"
        case .bagCarry: return "Carry promedio"
        case .ball: return "Pelota"
        }
    }

    var category: ShareCategory {
        switch self {
        case .gross, .net: return .scoring
        case .handicap: return .handicap
        case .birdies, .pars, .eagles: return .birdiesPars
        case .gir, .fir: return .girFairways
        case .putts: return .putting
        case .gpsDrive: return .gpsDistances
        case .bagCarry: return .bag
        case .ball: return .ball
        }
    }

    var lowerIsBetter: Bool {
        switch self {
        case .gross, .net, .handicap, .putts: return true
        default: return false
        }
    }

    var unit: String {
        switch self {
        case .gir, .fir: return "%"
        case .gpsDrive, .bagCarry: return " yd"
        default: return ""
        }
    }
}

enum GroupChartKind: String, CaseIterable, Identifiable, Codable, Sendable {
    case grossTrend
    case handicapTrend
    case birdies

    var id: String { rawValue }

    var title: String {
        switch self {
        case .grossTrend: return "Tendencia de gross"
        case .handicapTrend: return "Tendencia de hándicap"
        case .birdies: return "Birdies en el tiempo"
        }
    }

    var category: ShareCategory {
        switch self {
        case .grossTrend: return .scoring
        case .handicapTrend: return .handicap
        case .birdies: return .birdiesPars
        }
    }
}

struct GroupViewConfig: Hashable, Codable, Sendable {
    var metrics: [GroupMetricKind]
    var charts: [GroupChartKind]
    var range: StatsRange
    var courseFilter: String?

    static let `default` = GroupViewConfig(
        metrics: [.gross, .handicap, .birdies, .gir, .putts],
        charts: [.grossTrend, .handicapTrend],
        range: .year,
        courseFilter: nil
    )

    var jsonBody: [String: Any] {
        var sections = ["table"]
        if charts.contains(where: { $0 == .grossTrend || $0 == .handicapTrend }) {
            sections.append("trend")
        }
        if charts.contains(.birdies) { sections.append("holes") }
        var view: [String: Any] = [
            "metrics": metrics.map(\.rawValue),
            "sections": sections,
            "range": range.rawValue
        ]
        view["course"] = courseFilter
        return ["view": view]
    }
}

struct MemberMetricValue: Identifiable, Hashable, Sendable {
    var id: String { memberID }
    var memberID: String
    var memberName: String
    var initials: String
    var shared: Bool
    var value: Double?
    var text: String?

    static let hiddenLabel = "No compartido"

    var display: String {
        guard shared else { return Self.hiddenLabel }
        if let text, !text.isEmpty { return text }
        if let value { return FormatAR.one(value) }
        return "—"
    }
}

struct GroupComparisonRow: Identifiable, Hashable, Sendable {
    var id: String { metric.rawValue }
    var metric: GroupMetricKind
    var values: [MemberMetricValue]

    func ranked() -> [MemberMetricValue] {
        values
            .filter { $0.shared && $0.value != nil }
            .sorted { left, right in
                guard let a = left.value, let b = right.value else { return false }
                return metric.lowerIsBetter ? a < b : a > b
            }
    }

    func rank(of memberID: String) -> Int? {
        ranked().firstIndex { $0.memberID == memberID }.map { $0 + 1 }
    }
}

struct GroupComparison: Hashable, Sendable {
    var groupID: String
    var config: GroupViewConfig
    var rows: [GroupComparisonRow]
}

enum PendingInviteStore {
    static let key = "golflet.pendingInviteToken"

    static func save(_ token: String, defaults: UserDefaults = .standard) {
        let trimmed = token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        defaults.set(trimmed, forKey: key)
    }

    static func load(defaults: UserDefaults = .standard) -> String? {
        guard let token = defaults.string(forKey: key), !token.isEmpty else { return nil }
        return token
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: key)
    }
}

enum GroupPhoto {
    static func jpegData(from data: Data, maxBytes: Int = 400_000) -> Data {
        #if canImport(UIKit)
        guard let image = UIImage(data: data) else { return data }
        var quality: CGFloat = 0.82
        var out = image.jpegData(compressionQuality: quality) ?? data
        while out.count > maxBytes && quality > 0.28 {
            quality -= 0.14
            out = image.jpegData(compressionQuality: quality) ?? out
        }
        return out
        #else
        return data
        #endif
    }
}
