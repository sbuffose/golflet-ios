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
            var path = Path()
            let w = size.width, h = size.height
            switch kind {
            case "driver":
                path.move(to: CGPoint(x: w * 0.28, y: h * 0.78))
                path.addQuadCurve(to: CGPoint(x: w * 0.72, y: h * 0.28), control: CGPoint(x: w * 0.55, y: h * 0.42))
                path.addEllipse(in: CGRect(x: w * 0.48, y: h * 0.16, width: w * 0.28, height: h * 0.22))
            case "fairway":
                path.move(to: CGPoint(x: w * 0.32, y: h * 0.78))
                path.addQuadCurve(to: CGPoint(x: w * 0.68, y: h * 0.34), control: CGPoint(x: w * 0.55, y: h * 0.48))
                path.addEllipse(in: CGRect(x: w * 0.5, y: h * 0.22, width: w * 0.22, height: h * 0.18))
            case "hybrid":
                path.move(to: CGPoint(x: w * 0.34, y: h * 0.78))
                path.addQuadCurve(to: CGPoint(x: w * 0.62, y: h * 0.4), control: CGPoint(x: w * 0.52, y: h * 0.52))
                path.addEllipse(in: CGRect(x: w * 0.48, y: h * 0.28, width: w * 0.2, height: h * 0.16))
            case "wedge":
                path.addRoundedRect(in: CGRect(x: w * 0.28, y: h * 0.42, width: w * 0.4, height: h * 0.16), cornerSize: CGSize(width: 3, height: 3))
                path.move(to: CGPoint(x: w * 0.48, y: h * 0.58))
                path.addLine(to: CGPoint(x: w * 0.48, y: h * 0.82))
            case "putter":
                path.addRoundedRect(in: CGRect(x: w * 0.22, y: h * 0.3, width: w * 0.5, height: h * 0.12), cornerSize: CGSize(width: 2, height: 2))
                path.move(to: CGPoint(x: w * 0.5, y: h * 0.42))
                path.addLine(to: CGPoint(x: w * 0.5, y: h * 0.82))
            default:
                path.addRoundedRect(in: CGRect(x: w * 0.34, y: h * 0.36, width: w * 0.28, height: h * 0.2), cornerSize: CGSize(width: 3, height: 3))
                path.move(to: CGPoint(x: w * 0.48, y: h * 0.56))
                path.addLine(to: CGPoint(x: w * 0.48, y: h * 0.82))
            }
            context.stroke(path, with: .color(Color(hex: 0x0B2545)), lineWidth: 1.6)
        }
    }
}
