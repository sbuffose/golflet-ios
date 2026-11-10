import Foundation

enum IronSetStore {
    struct Saved: Equatable, Sendable {
        var brand: String
        var model: String
    }

    private static let brandKey = "golflet.iron-set.brand"
    private static let modelKey = "golflet.iron-set.model"

    static func load(defaults: UserDefaults = .standard) -> Saved? {
        let brand = defaults.string(forKey: brandKey)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let model = defaults.string(forKey: modelKey)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !brand.isEmpty, !model.isEmpty else { return nil }
        return Saved(brand: brand, model: model)
    }

    static func save(brand: String, model: String, defaults: UserDefaults = .standard) {
        defaults.set(brand, forKey: brandKey)
        defaults.set(model, forKey: modelKey)
    }

    static func clear(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: brandKey)
        defaults.removeObject(forKey: modelKey)
    }
}
