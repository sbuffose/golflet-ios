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

/// USGA-inspired brand. Navy is the primary surface and text color.
/// Red is emphasis and CTAs on light surfaces. White is the light surface.
enum BrandHex {
    static let navy: UInt32 = 0x0B2545
    static let navyRaised: UInt32 = 0x13315C
    static let navyDeep: UInt32 = 0x07111C
    static let red: UInt32 = 0xC8102E
    static let redDeep: UInt32 = 0xA6192E
    /// Lighter red so emphasis text stays readable on navy surfaces.
    static let redOnDark: UInt32 = 0xFF8FA0
    static let white: UInt32 = 0xFFFFFF
    static let paper: UInt32 = 0xF6F7F9
    static let ink: UInt32 = 0x0E1B2C
    static let ink2: UInt32 = 0x3E4C62
    static let ink3: UInt32 = 0x5C687B
    static let hairline: UInt32 = 0xDCE1E8
    static let mist: UInt32 = 0xE6ECF5
    static let accentSoft: UInt32 = 0xFBE7EA
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
    let accentInk: Color
    let accentOnNavy: Color
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
        bg: Color(hex: BrandHex.paper),
        surface: Color(hex: BrandHex.white),
        surface2: Color(hex: BrandHex.mist),
        ink: Color(hex: BrandHex.ink),
        ink2: Color(hex: BrandHex.ink2),
        ink3: Color(hex: BrandHex.ink3),
        hairline: Color(hex: BrandHex.hairline),
        primary: Color(hex: BrandHex.navy),
        primary2: Color(hex: BrandHex.navyRaised),
        onPrimary: Color(hex: BrandHex.white),
        accent: Color(hex: BrandHex.red),
        accentInk: Color(hex: BrandHex.red),
        accentOnNavy: Color(hex: BrandHex.redOnDark),
        accentSoft: Color(hex: BrandHex.accentSoft),
        positive: Color(hex: BrandHex.navyRaised),
        negative: Color(hex: BrandHex.redDeep),
        turf: Color(hex: 0xDCE6F3),
        fairway: Color(hex: 0xB5C7E0),
        green: Color(hex: 0x8DBE73),
        sand: Color(hex: 0xEFE3C6),
        water: Color(hex: 0xBBD7DE),
        dangerSoft: Color(hex: BrandHex.accentSoft)
    )

    static let dark = Palette(
        bg: Color(hex: BrandHex.navyDeep),
        surface: Color(hex: 0x102033),
        surface2: Color(hex: 0x16304A),
        ink: Color(hex: 0xF2F5F8),
        ink2: Color(hex: 0xB4BECB),
        ink3: Color(hex: 0x7A8696),
        hairline: Color(hex: 0x24364A),
        primary: Color(hex: BrandHex.navyRaised),
        primary2: Color(hex: 0x1D4578),
        onPrimary: Color(hex: BrandHex.white),
        accent: Color(hex: BrandHex.red),
        accentInk: Color(hex: BrandHex.redOnDark),
        accentOnNavy: Color(hex: BrandHex.redOnDark),
        accentSoft: Color(hex: 0x3A1A22),
        positive: Color(hex: 0x8AA4C8),
        negative: Color(hex: 0xE07A86),
        turf: Color(hex: 0x1A2C42),
        fairway: Color(hex: 0x2A4460),
        green: Color(hex: 0x3D6A38),
        sand: Color(hex: 0x3A3424),
        water: Color(hex: 0x2A4046),
        dangerSoft: Color(hex: 0x3A1A22)
    )

    static func make(_ scheme: ColorScheme) -> Palette {
        scheme == .dark ? .dark : .light
    }

    func teeColor(_ name: String) -> Color {
        switch name.lowercased() {
        case "negro": return Color(hex: 0x1E1E1E)
        case "azul": return Color(hex: 0x2D5BA8)
        case "blanco": return Color(hex: BrandHex.white)
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
        case .ultraLight: return .thin
        case .thin: return .light
        case .light: return .regular
        case .regular: return .medium
        case .medium: return .semibold
        case .semibold: return .bold
        default: return .bold
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
    static var largeTitle: Font { GFont.ui(40, weight: .semibold) }
    static var sheetTitle: Font { GFont.ui(24, weight: .semibold) }
    static var section: Font { GFont.ui(18, weight: .semibold) }
    static var headline: Font { GFont.ui(15, weight: .semibold) }
    static var body: Font { GFont.ui(15, weight: .regular) }
    static var label: Font { GFont.ui(13, weight: .medium) }
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

    /// Web `MES` abbreviations: ene, feb, mar…
    static let webMonths = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]

    static func webMonthYear(_ date: Date) -> String {
        let parts = Calendar.gregorian.dateComponents([.month, .year], from: date)
        let month = webMonths[max(0, min(11, (parts.month ?? 1) - 1))]
        return "\(month). \(parts.year ?? 0)"
    }

    static func webDay(_ date: Date) -> String {
        let parts = Calendar.gregorian.dateComponents([.day, .month, .year], from: date)
        let month = webMonths[max(0, min(11, (parts.month ?? 1) - 1))]
        return "\(parts.day ?? 0) \(month) \(parts.year ?? 0)"
    }

    static func signedInt(_ value: Int) -> String {
        if value > 0 { return "+\(value)" }
        if value < 0 { return "−\(-value)" }
        return "E"
    }

    static func teeChip(_ date: Date) -> String {
        let locale = Locale(identifier: "es_AR")
        let weekday = DateFormatter()
        weekday.locale = locale
        weekday.dateFormat = "EEE"
        let day = DateFormatter()
        day.locale = locale
        day.dateFormat = "d"
        let time = DateFormatter()
        time.locale = locale
        time.dateFormat = "HH:mm"
        let raw = weekday.string(from: date)
            .replacingOccurrences(of: ".", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let short = raw.isEmpty ? raw : raw.prefix(1).uppercased() + raw.dropFirst()
        return "\(short) \(day.string(from: date)) · \(time.string(from: date))"
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
