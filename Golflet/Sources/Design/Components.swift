import SwiftUI

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
        content
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

    var body: some View {
        HStack(spacing: 8) {
            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                } label: {
                    Text(option)
                        .font(GType.headline)
                        .foregroundStyle(selection == option ? p.ink : p.ink2)
                        .padding(.horizontal, 18)
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

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            FilterPills(options: options, selection: $selection)
        }
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
            case .handicap:
                HandicapHistoryView()
            case .recurring:
                RecurringErrorsView()
            case .clubStats(let code):
                ClubStatsView(code: code)
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
            .accessibilityIdentifier("avatar-button")
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
