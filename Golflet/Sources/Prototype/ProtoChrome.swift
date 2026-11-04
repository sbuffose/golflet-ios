import SwiftUI

struct DemoPill: View {
    @Environment(\.palette) private var p
    var text = "Datos de ejemplo"
    var body: some View {
        Text(text)
            .font(GFont.ui(11.5, weight: .semibold))
            .foregroundStyle(p.primary2)
            .padding(.horizontal, 9)
            .padding(.vertical, 4)
            .background(p.surface2)
            .clipShape(Capsule())
    }
}

struct ProtoCard<Content: View>: View {
    @Environment(\.palette) private var p
    var content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(p.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(p.hairline, lineWidth: 1)
            )
    }
}

struct ProtoHero<Content: View>: View {
    @Environment(\.palette) private var p
    var content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(p.primary)
            .foregroundStyle(p.onPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

struct RobertoGuide: View {
    var small = false
    var thinking = false
    var body: some View {
        ZStack {
            Circle()
                .fill(Color(hex: 0x13315C).opacity(0.16))
                .frame(width: small ? 88 : 140, height: small ? 88 : 140)
            Circle()
                .stroke(Color(hex: 0x0B2545), style: StrokeStyle(lineWidth: 3, dash: [10, 8]))
                .frame(width: small ? 72 : 112, height: small ? 72 : 112)
                .rotationEffect(.degrees(thinking ? 180 : 0))
            RobertoGlyph()
                .frame(width: small ? 56 : 88, height: small ? 62 : 96)
        }
        .accessibilityLabel("Roberto, tu caddie en Golflet")
        .accessibilityIdentifier("roberto-guide")
    }
}

struct RobertoGlyph: View {
    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width, size.height) / 100
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: x * s, y: y * s) }
            var cap = Path()
            cap.move(to: p(18, 36)); cap.addQuadCurve(to: p(82, 36), control: p(50, 8))
            cap.addLine(to: p(78, 42)); cap.addQuadCurve(to: p(22, 42), control: p(50, 24))
            cap.closeSubpath()
            ctx.fill(cap, with: .color(Color(hex: 0x0B2545)))
            ctx.fill(Path(ellipseIn: CGRect(x: 17 * s, y: 25 * s, width: 66 * s, height: 66 * s)), with: .color(Color(hex: 0xD9E0EA)))
            ctx.stroke(Path(ellipseIn: CGRect(x: 17 * s, y: 25 * s, width: 66 * s, height: 66 * s)), with: .color(Color(hex: 0x0B2545)), lineWidth: 3)
            ctx.fill(Path(ellipseIn: CGRect(x: 37 * s, y: 52 * s, width: 8 * s, height: 11 * s)), with: .color(Color(hex: 0x0B2545)))
            ctx.fill(Path(ellipseIn: CGRect(x: 55 * s, y: 52 * s, width: 8 * s, height: 11 * s)), with: .color(Color(hex: 0x0B2545)))
            var smile = Path()
            smile.move(to: p(42, 70)); smile.addQuadCurve(to: p(58, 70), control: p(50, 77))
            ctx.stroke(smile, with: .color(Color(hex: 0x0B2545)), style: StrokeStyle(lineWidth: 3, lineCap: .round))
        }
    }
}

struct ExampleNote: View {
    @Environment(\.palette) private var p
    var text: String
    var body: some View {
        Text(text)
            .font(GType.label)
            .foregroundStyle(p.ink3)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct ProtoRow: View {
    @Environment(\.palette) private var p
    var title: String
    var subtitle: String?
    var trailing: String?
    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(GType.headline).foregroundStyle(p.ink)
                if let subtitle {
                    Text(subtitle).font(GType.label).foregroundStyle(p.ink3)
                }
            }
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing).font(GType.headline).foregroundStyle(p.ink).tabular()
            }
            Image(systemName: "chevron.right").font(.system(size: 13, weight: .semibold)).foregroundStyle(p.ink3)
        }
        .padding(.vertical, 10)
    }
}
