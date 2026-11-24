import SwiftUI
import UIKit

/// Official photos we store in the app, and tour players checked against a public WITB.
/// Same facts as web/lib/club-gear.ts. A photo is never reused for another model.
enum ClubGear {
    struct Photo: Equatable {
        var brand: String
        var model: String
        var category: String
        var file: String
    }

    struct Player: Equatable, Identifiable {
        var id: String { "\(category)-\(name)" }
        var brand: String
        var model: String
        var category: String
        var name: String
        var tour: String
        var sourceURL: URL
        var whenLabel: String
    }

    static let photos: [Photo] = [
        Photo(brand: "Titleist", model: "GT2", category: "driver", file: "titleist-gt2-driver.jpg"),
        Photo(brand: "Titleist", model: "GT2", category: "fairway", file: "titleist-gt2-fairway.jpg"),
        Photo(brand: "Titleist", model: "T150", category: "iron", file: "titleist-t150-iron.jpg"),
    ]

    static let players: [Player] = [
        Player(brand: "Titleist", model: "GT2", category: "driver", name: "Will Zalatoris", tour: "PGA Tour", sourceURL: URL(string: "https://golfwrx.com/752701/will-zalatoris-witb-2025-january/")!, whenLabel: "14 ene 2025"),
        Player(brand: "Titleist", model: "GT2", category: "driver", name: "Cameron Young", tour: "PGA Tour", sourceURL: URL(string: "https://golfwrx.com/761858/cameron-young-witb-2025-june/")!, whenLabel: "16 jun 2025"),
        Player(brand: "Titleist", model: "GT2", category: "driver", name: "Bud Cauley", tour: "PGA Tour", sourceURL: URL(string: "https://golfwrx.com/761979/bud-cauley-witb-2025-june/")!, whenLabel: "18 jun 2025"),
        Player(brand: "Titleist", model: "GT2", category: "fairway", name: "Cameron Young", tour: "PGA Tour", sourceURL: URL(string: "https://golfwrx.com/761858/cameron-young-witb-2025-june/")!, whenLabel: "16 jun 2025"),
        Player(brand: "Titleist", model: "GT2", category: "fairway", name: "Bud Cauley", tour: "PGA Tour", sourceURL: URL(string: "https://golfwrx.com/761979/bud-cauley-witb-2025-june/")!, whenLabel: "18 jun 2025"),
        Player(brand: "Titleist", model: "T150", category: "iron", name: "Will Zalatoris", tour: "PGA Tour", sourceURL: URL(string: "https://golfwrx.com/752701/will-zalatoris-witb-2025-january/")!, whenLabel: "14 ene 2025"),
    ]

    static func face(_ name: String) -> String {
        let club = name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        if club == "putter" || club == "pt" || club.contains("putt") { return "putter" }
        if club == "gw" || club == "sw" || club == "lw" || club == "pw" || club == "aw" || club.contains("wedge") { return "wedge" }
        if club == "driver" || club == "dr" { return "driver" }
        if club.contains("madera") || club.contains("fairway") || club.hasSuffix("w") { return "fairway" }
        if club.contains("hibrido") || club.contains("hybrid") || club == "hy" || club.hasSuffix("h") { return "hybrid" }
        return "iron"
    }

    static func matches(_ brand: String, _ model: String) -> [Photo] {
        let b = brand.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let m = model.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !b.isEmpty, !m.isEmpty else { return [] }
        return photos.filter { $0.brand.lowercased() == b && $0.model.lowercased() == m }
    }

    static func photo(brand: String?, model: String?, face: String) -> Photo? {
        let hits = matches(brand ?? "", model ?? "")
        if hits.count == 1 { return hits[0] }
        return hits.first { $0.category == face }
    }

    static func resolvedCategory(brand: String?, model: String?, face: String) -> String? {
        if let photo = photo(brand: brand, model: model, face: face) { return photo.category }
        if matches(brand ?? "", model ?? "").count > 1 { return nil }
        let modelText = model?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return modelText.isEmpty ? face : face
    }

    static func users(brand: String?, model: String?, face: String) -> [Player] {
        guard let category = resolvedCategory(brand: brand, model: model, face: face) else { return [] }
        let b = (brand ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let m = (model ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !b.isEmpty, !m.isEmpty else { return [] }
        return players.filter { $0.brand.lowercased() == b && $0.model.lowercased() == m && $0.category == category }
    }

    static func image(file: String) -> UIImage? {
        let name = (file as NSString).deletingPathExtension
        let ext = (file as NSString).pathExtension
        let url = Bundle.main.url(forResource: name, withExtension: ext, subdirectory: "ClubGear")
            ?? Bundle.main.url(forResource: name, withExtension: ext)
        guard let url, let data = try? Data(contentsOf: url) else { return nil }
        return UIImage(data: data)
    }
}

struct ClubThumb: View {
    var brand: String?
    var model: String?
    var face: String

    var body: some View {
        Group {
            if let photo = ClubGear.photo(brand: brand, model: model, face: face),
               let image = ClubGear.image(file: photo.file) {
                Image(uiImage: image).resizable().scaledToFit()
            } else {
                ClubSilhouette(kind: ClubGear.photo(brand: brand, model: model, face: face)?.category ?? face)
            }
        }
        .accessibilityHidden(true)
    }
}

struct ClubSilhouette: View {
    var kind: String

    var body: some View {
        Canvas { context, size in
            let ink = Color(hex: 0x0B2545)
            let w = size.width, h = size.height
            let shaft = CGRect(x: w * 0.46, y: h * 0.72, width: max(2, w * 0.08), height: h * 0.24)
            context.fill(Path(roundedRect: shaft, cornerRadius: 1.5), with: .color(ink))
            switch kind {
            case "driver":
                context.fill(Self.head(w, h, top: 0.02, width: 0.92, height: 0.62, bulge: 0.16), with: .color(ink))
            case "fairway":
                context.fill(Self.head(w, h, top: 0.08, width: 0.8, height: 0.52, bulge: 0.14), with: .color(ink))
            case "hybrid":
                context.fill(Self.head(w, h, top: 0.14, width: 0.66, height: 0.44, bulge: 0.1), with: .color(ink))
            case "wedge":
                let blade = CGRect(x: w * 0.08, y: h * 0.16, width: w * 0.84, height: h * 0.5)
                context.fill(Path(roundedRect: blade, cornerRadius: 4), with: .color(ink))
                let cavity = CGRect(x: w * 0.22, y: h * 0.26, width: w * 0.56, height: h * 0.22)
                context.fill(Path(roundedRect: cavity, cornerRadius: 2), with: .color(Color(hex: 0xF6F7F9)))
                let sole = CGRect(x: w * 0.06, y: h * 0.62, width: w * 0.88, height: h * 0.08)
                context.fill(Path(roundedRect: sole, cornerRadius: 2), with: .color(ink))
            case "putter":
                let mallet = CGRect(x: w * 0.06, y: h * 0.16, width: w * 0.88, height: h * 0.28)
                context.fill(Path(roundedRect: mallet, cornerRadius: 4), with: .color(ink))
            default:
                let blade = CGRect(x: w * 0.16, y: h * 0.12, width: w * 0.68, height: h * 0.56)
                context.fill(Path(roundedRect: blade, cornerRadius: 4), with: .color(ink))
                let cavity = CGRect(x: w * 0.28, y: h * 0.24, width: w * 0.44, height: h * 0.24)
                context.fill(Path(roundedRect: cavity, cornerRadius: 2), with: .color(Color(hex: 0xF6F7F9)))
            }
        }
        .accessibilityHidden(true)
    }

    private static func head(_ w: CGFloat, _ h: CGFloat, top: CGFloat, width: CGFloat, height: CGFloat, bulge: CGFloat) -> Path {
        let x = (1 - width) / 2 * w
        let y = top * h
        let bw = width * w
        let bh = height * h
        var path = Path()
        path.move(to: CGPoint(x: x + bw * 0.2, y: y + bh))
        path.addQuadCurve(to: CGPoint(x: x + bw * 0.15, y: y + bh * 0.35), control: CGPoint(x: x - bw * bulge, y: y + bh * 0.75))
        path.addQuadCurve(to: CGPoint(x: x + bw * 0.72, y: y + bh * 0.08), control: CGPoint(x: x + bw * 0.28, y: y - bh * 0.08))
        path.addQuadCurve(to: CGPoint(x: x + bw, y: y + bh * 0.55), control: CGPoint(x: x + bw * 1.08, y: y + bh * 0.2))
        path.addQuadCurve(to: CGPoint(x: x + bw * 0.55, y: y + bh), control: CGPoint(x: x + bw * 0.95, y: y + bh * 0.95))
        path.closeSubpath()
        return path
    }
}

extension ClubGear {
    /// Same names the web uses to copy a confirmed model from Mi bolsa onto a yardage row.
    static func attach(bag: [BagClub], equipment: [BagClub]) -> [BagClub] {
        bag.map { row in
            guard let hit = equipment.first(where: { sameClub($0, row) }) else { return row }
            var next = row
            let brand = hit.brand?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let model = hit.modelName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let ownBrand = next.brand?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let ownModel = next.modelName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if ownBrand.isEmpty, !brand.isEmpty { next.brand = brand }
            if ownModel.isEmpty, !model.isEmpty { next.modelName = model }
            return next
        }
    }

    private static func sameClub(_ gear: BagClub, _ row: BagClub) -> Bool {
        let left = names(gear)
        let right = names(row)
        return left.contains { right.contains($0) }
    }

    private static func names(_ club: BagClub) -> Set<String> {
        var values = [club.name, club.code ?? "", club.displayName ?? ""].map(fold)
        values.removeAll { $0.isEmpty }
        let aliases: [String: [String]] = [
            "dr": ["driver"], "3w": ["madera 3"], "5w": ["madera 5"], "7w": ["madera 7"], "9w": ["madera 9"],
            "hy": ["hibrido"], "2h": ["hibrido 2"], "3h": ["hibrido 3"], "4h": ["hibrido 4"], "5h": ["hibrido 5"], "6h": ["hibrido 6"],
            "2i": ["hierro 2"], "3i": ["hierro 3"], "4i": ["hierro 4"], "5i": ["hierro 5"], "6i": ["hierro 6"],
            "7i": ["hierro 7"], "8i": ["hierro 8"], "9i": ["hierro 9"],
            "pw": ["pw", "pitching wedge"], "gw": ["gw", "gap wedge"], "sw": ["sw", "sand wedge"], "lw": ["lw", "lob wedge"],
            "pt": ["putter", "pt"],
        ]
        var set = Set(values)
        for (code, names) in aliases where set.contains(code) || names.contains(where: { set.contains($0) }) {
            set.insert(code)
            names.forEach { set.insert($0) }
        }
        return set
    }

    private static func fold(_ value: String) -> String {
        value.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR"))
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }
}
