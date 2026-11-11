import SwiftUI

struct GolfletTabBar: View {
    @Binding var selection: AppTab
    @Environment(\.palette) private var p

    private let tabs: [AppTab] = [.inicio, .resumen, .rondas, .cancha, .bolsa]

    var body: some View {
        HStack(spacing: 2) {
            ForEach(tabs) { tab in
                let on = selection == tab
                Button {
                    selection = tab
                } label: {
                    VStack(spacing: 3) {
                        GolfletTabIcon(tab: tab)
                            .frame(width: 25, height: 25)
                        Text(tab.title)
                            .font(GFont.ui(10.5, weight: on ? .semibold : .medium))
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .foregroundStyle(on ? p.primary : p.ink3)
                    .background(on ? p.primary.opacity(0.08) : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityIdentifier(GolfletTabBar.identifier(tab))
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .padding(.horizontal, 8)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .background(p.bg)
        .overlay(alignment: .top) {
            Rectangle().fill(p.hairline).frame(height: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("golflet-tabbar")
    }

    static func identifier(_ tab: AppTab) -> String {
        switch tab {
        case .inicio: return "tab-inicio"
        case .resumen: return "tab-resumen"
        case .rondas: return "tab-rondas"
        case .cancha: return "tab-cancha"
        case .bolsa: return "tab-bolsa"
        case .grupos: return "tab-grupos"
        case .jugar: return "tab-jugar"
        case .academia: return "tab-academia"
        }
    }
}

/// Web tab glyphs: navy stroke, one red mark.
struct GolfletTabIcon: View {
    var tab: AppTab
    @Environment(\.palette) private var p

    var body: some View {
        Canvas { context, size in
            let stroke = StrokeStyle(lineWidth: 1.7, lineCap: .round, lineJoin: .round)
            let ink = GraphicsContext.Shading.color(p.primary)
            let red = GraphicsContext.Shading.color(p.accent)
            switch tab {
            case .inicio:
                var house = Path()
                house.move(to: CGPoint(x: size.width * 0.16, y: size.height * 0.46))
                house.addLine(to: CGPoint(x: size.width * 0.5, y: size.height * 0.16))
                house.addLine(to: CGPoint(x: size.width * 0.84, y: size.height * 0.46))
                house.addLine(to: CGPoint(x: size.width * 0.84, y: size.height * 0.86))
                house.addLine(to: CGPoint(x: size.width * 0.16, y: size.height * 0.86))
                house.closeSubpath()
                context.stroke(house, with: ink, style: stroke)
                let door = CGRect(x: size.width * 0.40, y: size.height * 0.58, width: size.width * 0.20, height: size.height * 0.28)
                context.fill(Path(door), with: red)
            case .resumen:
                var axis = Path()
                axis.move(to: CGPoint(x: size.width * 0.14, y: size.height * 0.80))
                axis.addLine(to: CGPoint(x: size.width * 0.86, y: size.height * 0.80))
                var line = Path()
                line.move(to: CGPoint(x: size.width * 0.22, y: size.height * 0.64))
                line.addLine(to: CGPoint(x: size.width * 0.40, y: size.height * 0.46))
                line.addLine(to: CGPoint(x: size.width * 0.56, y: size.height * 0.56))
                line.addLine(to: CGPoint(x: size.width * 0.78, y: size.height * 0.28))
                context.stroke(axis, with: ink, style: stroke)
                context.stroke(line, with: ink, style: stroke)
                let dot = CGRect(x: size.width * 0.70, y: size.height * 0.20, width: size.width * 0.14, height: size.height * 0.14)
                context.fill(Path(ellipseIn: dot), with: red)
            case .rondas:
                let card = CGRect(x: size.width * 0.18, y: size.height * 0.14, width: size.width * 0.64, height: size.height * 0.72)
                context.stroke(Path(roundedRect: card, cornerRadius: 3), with: ink, style: stroke)
                var rule = Path()
                rule.move(to: CGPoint(x: card.minX, y: card.minY + 2))
                rule.addLine(to: CGPoint(x: card.maxX, y: card.minY + 2))
                context.stroke(rule, with: red, style: StrokeStyle(lineWidth: 2.2, lineCap: .round))
            case .cancha:
                var pole = Path()
                pole.move(to: CGPoint(x: size.width * 0.28, y: size.height * 0.84))
                pole.addLine(to: CGPoint(x: size.width * 0.28, y: size.height * 0.18))
                context.stroke(pole, with: ink, style: stroke)
                var flag = Path()
                flag.move(to: CGPoint(x: size.width * 0.28, y: size.height * 0.20))
                flag.addLine(to: CGPoint(x: size.width * 0.72, y: size.height * 0.32))
                flag.addLine(to: CGPoint(x: size.width * 0.28, y: size.height * 0.48))
                flag.closeSubpath()
                context.fill(flag, with: red)
            default:
                var bag = Path()
                bag.addEllipse(in: CGRect(x: size.width * 0.30, y: size.height * 0.16, width: size.width * 0.40, height: size.height * 0.22))
                bag.move(to: CGPoint(x: size.width * 0.30, y: size.height * 0.46))
                bag.addLine(to: CGPoint(x: size.width * 0.26, y: size.height * 0.86))
                bag.addLine(to: CGPoint(x: size.width * 0.74, y: size.height * 0.86))
                bag.addLine(to: CGPoint(x: size.width * 0.70, y: size.height * 0.46))
                context.stroke(bag, with: ink, style: stroke)
                let ball = CGRect(x: size.width * 0.30, y: size.height * 0.22, width: size.width * 0.10, height: size.height * 0.10)
                context.fill(Path(ellipseIn: ball), with: red)
            }
        }
        .accessibilityHidden(true)
    }
}
