import SwiftUI

struct GProbe: View {
    let id: String
    var label: String?

    var body: some View {
        Text(label ?? id)
            .font(.system(size: 1))
            .foregroundStyle(.clear)
            .frame(width: 1, height: 1)
            .allowsHitTesting(false)
            .accessibilityIdentifier(id)
            .accessibilityLabel(label ?? id)
    }
}

struct GScreen<Content: View>: View {
    @Environment(\.palette) private var p
    var probeID: String?
    let content: Content

    init(id: String? = nil, @ViewBuilder content: () -> Content) {
        self.probeID = id
        self.content = content()
    }

    var body: some View {
        ZStack(alignment: .topLeading) {
            if let probeID {
                Text(probeID)
                    .font(.system(size: 1))
                    .foregroundStyle(.clear)
                    .frame(width: 1, height: 1)
                    .accessibilityIdentifier(probeID)
            }
            content
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(p.bg.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct GCard<Content: View>: View {
    @Environment(\.palette) private var p
    var fill: Color?
    var radius: CGFloat = 22
    var padding: CGFloat = 16
    let content: Content

    init(fill: Color? = nil, radius: CGFloat = 22, padding: CGFloat = 16, @ViewBuilder content: () -> Content) {
        self.fill = fill
        self.radius = radius
        self.padding = padding
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            content
        }
        .padding(padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(fill ?? p.surface)
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
        .shadow(color: Color.black.opacity(0.06), radius: 12, y: 8)
    }
}

struct GOverline: View {
    @Environment(\.palette) private var p
    let text: String
    var color: Color?

    var body: some View {
        Text(text.uppercased())
            .font(GType.overline)
            .tracking(1.4)
            .foregroundStyle(color ?? p.ink3)
    }
}

struct GTitle: View {
    @Environment(\.palette) private var p
    let text: String
    var size: CGFloat = 42

    var body: some View {
        Text(text)
            .font(GFont.ui(size, weight: .semibold))
            .tracking(size >= 36 ? -1.9 : -1.2)
            .foregroundStyle(p.ink)
            .lineLimit(2)
            .minimumScaleFactor(0.72)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct TeeDot: View {
    @Environment(\.palette) private var p
    let name: String
    var size: CGFloat = 8

    var body: some View {
        Circle()
            .fill(p.teeColor(name))
            .overlay {
                if name.lowercased() == "blanco" || name.lowercased() == "amarillo" {
                    Circle().stroke(p.hairline, lineWidth: 0.8)
                }
            }
            .frame(width: size, height: size)
    }
}

struct FilterPills: View {
    @Environment(\.palette) private var p
    let options: [String]
    @Binding var selection: String
    var leadingDot: ((String) -> Color?)? = nil

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                } label: {
                    HStack(spacing: 7) {
                        if let color = leadingDot?(option) {
                            Circle()
                                .fill(color)
                                .frame(width: 8, height: 8)
                                .overlay {
                                    if option.localizedCaseInsensitiveContains("blanco") {
                                        Circle().stroke(p.hairline, lineWidth: 0.8)
                                    }
                                }
                                .accessibilityHidden(true)
                        }
                        Text(option)
                            .font(GType.headline)
                            .foregroundStyle(selection == option ? p.ink : p.ink2)
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(selection == option ? p.surface : Color.clear)
                    .clipShape(Capsule())
                    .shadow(color: selection == option ? Color.black.opacity(0.06) : .clear, radius: 8, y: 2)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("filter-\(option.lowercased())")
            }
        }
        .padding(4)
        .background(p.surface2)
        .clipShape(Capsule())
    }
}

struct ScrollFilterPills: View {
    let options: [String]
    @Binding var selection: String
    var leadingDot: ((String) -> Color?)? = nil

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            FilterPills(options: options, selection: $selection, leadingDot: leadingDot)
        }
    }
}

enum StatTint: Equatable {
    case primary
    case gold
    case danger

    func ink(_ p: Palette) -> Color {
        switch self {
        case .primary: return p.primary
        case .gold: return p.accent
        case .danger: return p.negative
        }
    }

    func wash(_ p: Palette) -> Color {
        switch self {
        case .primary: return p.turf
        case .gold: return p.accentSoft
        case .danger: return p.dangerSoft
        }
    }
}

extension ScoreKind {
    var symbolName: String {
        switch self {
        case .eagle: return "star.fill"
        case .birdie: return "bird.fill"
        case .par: return "equal.circle.fill"
        case .bogey: return "minus.circle.fill"
        }
    }

    var statTint: StatTint {
        switch self {
        case .eagle, .birdie: return .gold
        case .par: return .primary
        case .bogey: return .danger
        }
    }
}

struct AccentStatCard: View {
    @Environment(\.palette) private var p
    var tint: StatTint
    var icon: String
    var title: String
    var value: String
    var secondary: String? = nil
    var footnote: String? = nil
    var share: Double? = nil
    var shareNoun: String = "los hoyos"
    var sparkline: [Double]? = nil
    var compact: Bool = false

    var body: some View {
        GCard(fill: tint.wash(p), radius: compact ? 16 : 18, padding: 0) {
            HStack(alignment: .top, spacing: 0) {
                tint.ink(p).frame(width: 4)
                VStack(alignment: .leading, spacing: compact ? 6 : 8) {
                    HStack(spacing: 6) {
                        Image(systemName: icon)
                            .font(.system(size: compact ? 12 : 13, weight: .semibold))
                            .foregroundStyle(tint.ink(p))
                            .accessibilityHidden(true)
                        Text(title)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(1)
                            .minimumScaleFactor(0.75)
                        Spacer(minLength: 4)
                        MetricChevron(color: p.ink3)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(value)
                            .font(compact ? GType.statM : GType.statL)
                            .tabular()
                            .foregroundStyle(p.ink)
                            .minimumScaleFactor(0.55)
                            .lineLimit(1)
                        if let secondary {
                            Text(secondary)
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                                .lineLimit(1)
                        }
                    }
                    if let footnote {
                        Text(footnote)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .lineLimit(2)
                    }
                    if let sparkline, sparkline.count > 1 {
                        Sparkline(values: sparkline, color: p.primary)
                            .frame(height: 26)
                            .accessibilityHidden(true)
                    }
                    if let share {
                        ProportionBar(fraction: share, color: tint.ink(p), of: shareNoun)
                    }
                }
                .padding(compact ? 11 : 14)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct ProportionBar: View {
    @Environment(\.palette) private var p
    var fraction: Double
    var color: Color
    var of: String = "los hoyos"

    var body: some View {
        let clamped = min(max(fraction, 0), 1)
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(p.hairline)
                Capsule()
                    .fill(color)
                    .frame(width: max(3, geo.size.width * CGFloat(clamped)))
            }
        }
        .frame(height: 4)
        .accessibilityLabel("\(Int((clamped * 100).rounded())) por ciento de \(of)")
    }
}

struct MetricChevron: View {
    var color: Color

    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(color)
            .accessibilityHidden(true)
    }
}

struct MetricBackBar: View {
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(p.ink2)
                    .frame(width: 32, height: 32)
                    .background(p.surface)
                    .clipShape(Circle())
            }
            .accessibilityLabel("Volver")
            .accessibilityIdentifier("metric-back")
            Spacer()
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 6)
        .background(p.bg)
    }
}

extension View {
    func metricDestinations() -> some View {
        navigationDestination(for: MetricRoute.self) { route in
            switch route {
            case .roundList(let query):
                MetricRoundsView(query: query)
            case .scoreKind(let kind, let query):
                ScoreKindDetailView(kind: kind, query: query)
            case .chart(let query):
                MetricChartView(query: query)
            case .handicap:
                HandicapHistoryView()
            case .recurring:
                RecurringErrorsView()
            case .clubStats(let code):
                ClubStatsView(code: code)
            case .strategy(let courseKey, let courseName):
                StrategyCourseView(courseKey: courseKey, courseName: courseName)
            }
        }
    }
}

struct ScoreMark: View {
    @Environment(\.palette) private var p
    let strokes: Int?
    let result: HoleResult
    var diameter: CGFloat = 28

    var body: some View {
        let text = strokes.map(String.init) ?? "—"
        Text(text)
            .font(GFont.ui(13.5, weight: .semibold))
            .tabular()
            .foregroundStyle(foreground)
            .frame(width: diameter, height: diameter)
            .background(background)
            .clipShape(Circle())
            .overlay {
                if result == .par || result == .unknown {
                    Circle().stroke(p.hairline, lineWidth: 1)
                }
            }
    }

    private var background: Color {
        switch result {
        case .eagleOrBetter: return p.accent
        case .birdie: return p.accent
        case .par, .unknown: return Color.clear
        case .bogey: return p.sand
        case .doubleOrWorse: return Color(hex: 0xE0D2B0)
        }
    }

    private var foreground: Color {
        switch result {
        case .eagleOrBetter, .birdie: return p.primary
        default: return p.ink
        }
    }
}

struct Sparkline: View {
    var values: [Double]
    var color: Color
    var lineWidth: CGFloat = 1.6

    var body: some View {
        Canvas { context, size in
            guard values.count > 1,
                  let minV = values.min(),
                  let maxV = values.max()
            else { return }
            let span = max(maxV - minV, 0.4)
            var path = Path()
            for (index, value) in values.enumerated() {
                let x = size.width * CGFloat(index) / CGFloat(values.count - 1)
                let y = size.height - CGFloat((value - minV) / span) * size.height
                if index == 0 {
                    path.move(to: CGPoint(x: x, y: y))
                } else {
                    path.addLine(to: CGPoint(x: x, y: y))
                }
            }
            context.stroke(path, with: .color(color), lineWidth: lineWidth)
        }
    }
}

struct AvatarCircle: View {
    @Environment(\.palette) private var p
    let initials: String

    var body: some View {
        Text(initials)
            .font(GFont.ui(13, weight: .semibold))
            .foregroundStyle(p.onPrimary)
            .frame(width: 36, height: 36)
            .background(p.primary)
            .clipShape(Circle())
    }
}

struct Hairline: View {
    @Environment(\.palette) private var p
    var body: some View {
        p.hairline.frame(height: 1)
    }
}

struct GField<Content: View>: View {
    @Environment(\.palette) private var p
    let label: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: label)
            content()
                .font(GType.body)
                .foregroundStyle(p.ink)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(p.surface2)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

struct AdaptiveTileGrid<Content: View>: View {
    var spacing: CGFloat = 8
    var defaultColumns: Int = TextPrefsLayout.defaultTileColumns
    @ViewBuilder var content: () -> Content
    @State private var width: CGFloat = TextPrefsLayout.narrowWidth + 1

    var body: some View {
        LazyVGrid(
            columns: Array(
                repeating: GridItem(.flexible(), spacing: spacing),
                count: TextPrefsLayout.tileColumnCount(forWidth: width, defaultCount: defaultColumns)
            ),
            spacing: spacing
        ) {
            content()
        }
        .background(
            GeometryReader { geo in
                Color.clear.preference(key: AdaptiveTileWidthKey.self, value: geo.size.width)
            }
        )
        .onPreferenceChange(AdaptiveTileWidthKey.self) { width = $0 }
    }
}

private struct AdaptiveTileWidthKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
