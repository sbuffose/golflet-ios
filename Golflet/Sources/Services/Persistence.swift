import Foundation
import SwiftData

@Model
final class RoundNote {
    @Attribute(.unique) var roundId: String
    var text: String
    var updatedAt: Date

    init(roundId: String, text: String, updatedAt: Date = Date()) {
        self.roundId = roundId
        self.text = text
        self.updatedAt = updatedAt
    }
}

@Model
final class HoleExtra {
    var roundId: String
    var hole: Int
    var putts: Int?
    var gir: Bool?
    /// "hit", "left", "right", "na"
    var fairway: String?

    init(roundId: String, hole: Int, putts: Int? = nil, gir: Bool? = nil, fairway: String? = nil) {
        self.roundId = roundId
        self.hole = hole
        self.putts = putts
        self.gir = gir
        self.fairway = fairway
    }
}

@Model
final class BagClubRecord {
    @Attribute(.unique) var name: String
    var sortIndex: Int
    var carry: Int?
    var total: Int?

    init(name: String, sortIndex: Int, carry: Int? = nil, total: Int? = nil) {
        self.name = name
        self.sortIndex = sortIndex
        self.carry = carry
        self.total = total
    }
}

enum DefaultBag {
    static let clubs = [
        "Driver", "Madera 3", "Híbrido",
        "Hierro 4", "Hierro 5", "Hierro 6", "Hierro 7", "Hierro 8", "Hierro 9",
        "PW", "SW", "LW", "Putter"
    ]
}

@MainActor
final class NotesStore {
    let context: ModelContext

    init(container: ModelContainer) {
        self.context = ModelContext(container)
    }

    func note(for roundId: String) -> RoundNote? {
        let target = roundId
        var descriptor = FetchDescriptor<RoundNote>(predicate: #Predicate { $0.roundId == target })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    func saveNote(roundId: String, text: String) {
        if let existing = note(for: roundId) {
            existing.text = text
            existing.updatedAt = Date()
        } else {
            context.insert(RoundNote(roundId: roundId, text: text))
        }
        try? context.save()
    }

    func extras(for roundId: String) -> [HoleExtra] {
        let target = roundId
        let descriptor = FetchDescriptor<HoleExtra>(predicate: #Predicate { $0.roundId == target })
        return (try? context.fetch(descriptor)) ?? []
    }

    func upsertExtra(_ extra: HoleExtra) {
        let targetRound = extra.roundId
        let targetHole = extra.hole
        let descriptor = FetchDescriptor<HoleExtra>(
            predicate: #Predicate { $0.roundId == targetRound && $0.hole == targetHole }
        )
        if let existing = try? context.fetch(descriptor).first {
            existing.putts = extra.putts
            existing.gir = extra.gir
            existing.fairway = extra.fairway
        } else {
            context.insert(extra)
        }
        try? context.save()
    }

    func bag() -> [BagClub] {
        var descriptor = FetchDescriptor<BagClubRecord>(sortBy: [SortDescriptor(\.sortIndex)])
        let rows = (try? context.fetch(descriptor)) ?? []
        if rows.isEmpty {
            seedBag()
            descriptor = FetchDescriptor<BagClubRecord>(sortBy: [SortDescriptor(\.sortIndex)])
            let seeded = (try? context.fetch(descriptor)) ?? []
            return seeded.map { BagClub(name: $0.name, carry: $0.carry, total: $0.total) }
        }
        return rows.map { BagClub(name: $0.name, carry: $0.carry, total: $0.total) }
    }

    func saveBag(_ items: [BagClub]) {
        let existing = (try? context.fetch(FetchDescriptor<BagClubRecord>())) ?? []
        for item in existing { context.delete(item) }
        for (index, item) in items.enumerated() {
            context.insert(BagClubRecord(name: item.name, sortIndex: index, carry: item.carry, total: item.total))
        }
        try? context.save()
    }

    private func seedBag() {
        for (index, name) in DefaultBag.clubs.enumerated() {
            context.insert(BagClubRecord(name: name, sortIndex: index))
        }
        try? context.save()
    }
}
