import SwiftUI

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

struct Palette: Equatable {
    let bg: Color
    let surface: Color
    let surface2: Color
    let ink: Color
    let ink2: Color
    let ink3: Color
    let hairline: Color
    let primary: Color
    let primary2: Color
    let onPrimary: Color
    let accent: Color
    let accentSoft: Color
    let positive: Color
    let negative: Color
    let turf: Color
    let fairway: Color
    let green: Color
    let sand: Color
    let water: Color
    let dangerSoft: Color

    static let light = Palette(
        bg: Color(hex: 0xF7F5F0),
        surface: Color(hex: 0xFFFFFF),
        surface2: Color(hex: 0xF0EDE5),
        ink: Color(hex: 0x121614),
        ink2: Color(hex: 0x5E6560),
        ink3: Color(hex: 0x9AA09B),
        hairline: Color(hex: 0xE6E2D8),
        primary: Color(hex: 0x0F3D2E),
        primary2: Color(hex: 0x1B5A44),
        onPrimary: Color(hex: 0xF7F5F0),
        accent: Color(hex: 0xC8A86A),
        accentSoft: Color(hex: 0xF3EAD6),
        positive: Color(hex: 0x2F7D5B),
        negative: Color(hex: 0xB4553F),
        turf: Color(hex: 0xDCE8D2),
        fairway: Color(hex: 0xB7D3A0),
        green: Color(hex: 0x8DBE73),
        sand: Color(hex: 0xEFE3C6),
        water: Color(hex: 0xBBD7DE),
        dangerSoft: Color(hex: 0xF3E4DF)
    )

    static let dark = Palette(
        bg: Color(hex: 0x0C1210),
        surface: Color(hex: 0x16201C),
        surface2: Color(hex: 0x1C2924),
        ink: Color(hex: 0xF2EFE8),
        ink2: Color(hex: 0xB4B8B2),
        ink3: Color(hex: 0x7A817C),
        hairline: Color(hex: 0x2A3530),
        primary: Color(hex: 0x1B5A44),
        primary2: Color(hex: 0x2A7A5C),
        onPrimary: Color(hex: 0xF7F5F0),
        accent: Color(hex: 0xC8A86A),
        accentSoft: Color(hex: 0x3A3220),
        positive: Color(hex: 0x5BA884),
        negative: Color(hex: 0xD47A66),
        turf: Color(hex: 0x243328),
        fairway: Color(hex: 0x2F4A32),
        green: Color(hex: 0x3D6A38),
        sand: Color(hex: 0x3A3424),
        water: Color(hex: 0x2A4046),
        dangerSoft: Color(hex: 0x3A241F)
    )

    static func make(_ scheme: ColorScheme) -> Palette {
        scheme == .dark ? .dark : .light
    }

    func teeColor(_ name: String) -> Color {
        switch name.lowercased() {
        case "negro": return Color(hex: 0x1E1E1E)
        case "azul": return Color(hex: 0x2D5BA8)
        case "blanco": return schemeIsDark ? Color(hex: 0xF7F5F0) : Color(hex: 0xFFFFFF)
        case "amarillo": return Color(hex: 0xE2B93B)
        case "rojo": return Color(hex: 0xB83A2E)
        case "celeste": return Color(hex: 0x8CC3DF)
        case "verde": return Color(hex: 0x4F8A4B)
        case "colorada": return Color(hex: 0xB83A2E)
        default: return ink3
        }
    }

    private var schemeIsDark: Bool { bg == Palette.dark.bg }
}

private struct PaletteKey: EnvironmentKey {
    static let defaultValue = Palette.light
}

private struct GolfletTypeTokenKey: EnvironmentKey {
    static let defaultValue = TextPrefs.default.signature
}

extension EnvironmentValues {
    var palette: Palette {
        get { self[PaletteKey.self] }
        set { self[PaletteKey.self] = newValue }
    }

    var golfletTypeToken: String {
        get { self[GolfletTypeTokenKey.self] }
        set { self[GolfletTypeTokenKey.self] = newValue }
    }
}

enum GFont {
    static func ui(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        let prefs = TextPrefsRuntime.current
        let scaled = prefs.scaledSize(size, dynamic: TextPrefsRuntime.dynamicMultiplier)
        return Font.custom(postScript(resolvedWeight(weight, prefs: prefs)), size: scaled)
    }

    static func resolvedWeight(_ weight: Font.Weight, prefs: TextPrefs = TextPrefsRuntime.current) -> Font.Weight {
        guard prefs.weight == .marked else { return weight }
        switch weight {
        case .regular, .light, .thin, .ultraLight: return .medium
        case .medium: return .semibold
        default: return .semibold
        }
    }

    static func postScript(_ weight: Font.Weight) -> String {
        switch weight {
        case .medium: return "Geist-Medium"
        case .semibold, .bold, .heavy, .black: return "Geist-SemiBold"
        default: return "Geist-Regular"
        }
    }
}

enum GType {
    static var largeTitle: Font { GFont.ui(42, weight: .semibold) }
    static var sheetTitle: Font { GFont.ui(30, weight: .semibold) }
    static var section: Font { GFont.ui(20, weight: .semibold) }
    static var headline: Font { GFont.ui(15.5, weight: .semibold) }
    static var body: Font { GFont.ui(16, weight: .regular) }
    static var label: Font { GFont.ui(12.5, weight: .medium) }
    static var overline: Font { GFont.ui(11, weight: .semibold) }
    static var statHero: Font { GFont.ui(80, weight: .semibold) }
    static var statL: Font { GFont.ui(32, weight: .semibold) }
    static var statM: Font { GFont.ui(24, weight: .semibold) }
}

extension TextPrefs {
    static func clampedDynamic(_ size: DynamicTypeSize) -> CGFloat {
        let raw: CGFloat
        switch size {
        case .xSmall: raw = 0.94
        case .small: raw = 0.97
        case .medium, .large: raw = 1.00
        case .xLarge: raw = 1.06
        case .xxLarge: raw = 1.10
        case .xxxLarge: raw = 1.14
        default: raw = 1.16
        }
        return min(1.16, max(0.92, raw))
    }
}

enum FormatAR {
    private static let decimal: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.minimumFractionDigits = 1
        f.maximumFractionDigits = 1
        f.numberStyle = .decimal
        return f
    }()

    private static let decimalOpt: NumberFormatter = {
        let f = NumberFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.minimumFractionDigits = 0
        f.maximumFractionDigits = 1
        f.numberStyle = .decimal
        return f
    }()

    static func one(_ value: Double) -> String {
        decimal.string(from: NSNumber(value: value)) ?? String(format: "%.1f", value)
    }

    static func signedOne(_ value: Double) -> String {
        let body = one(abs(value))
        if value > 0.049 { return "+\(body)" }
        if value < -0.049 { return "-\(body)" }
        return body
    }

    static func int(_ value: Int) -> String {
        "\(value)"
    }

    static func monthYear(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.dateFormat = "LLLL yyyy"
        return f.string(from: date)
    }

    static func dayMonth(_ date: Date) -> (day: String, month: String) {
        let d = DateFormatter()
        d.locale = Locale(identifier: "es_AR")
        d.dateFormat = "d"
        let m = DateFormatter()
        m.locale = Locale(identifier: "es_AR")
        m.dateFormat = "MMM"
        return (d.string(from: date), m.string(from: date).replacingOccurrences(of: ".", with: "").uppercased())
    }

    static func longDate(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.dateFormat = "d MMMM yyyy"
        return f.string(from: date)
    }

    static func syncDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "es_AR")
        f.dateFormat = "d MMM yyyy"
        return f.string(from: date).replacingOccurrences(of: ".", with: "")
    }

    static func signedInt(_ value: Int) -> String {
        if value > 0 { return "+\(value)" }
        if value < 0 { return "−\(-value)" }
        return "E"
    }
}

struct PaletteInjector: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dynamicTypeSize) private var dynamicType

    func body(content: Content) -> some View {
        let dyn = TextPrefs.clampedDynamic(dynamicType)
        TextPrefsRuntime.dynamicMultiplier = dyn
        let token = "\(TextPrefsRuntime.current.signature)|\(String(format: "%.2f", dyn))"
        return content
            .environment(\.palette, Palette.make(scheme))
            .environment(\.golfletTypeToken, token)
    }
}

extension View {
    func golfletChrome() -> some View {
        modifier(PaletteInjector())
    }

    func tabular() -> some View {
        monospacedDigit()
    }
}
