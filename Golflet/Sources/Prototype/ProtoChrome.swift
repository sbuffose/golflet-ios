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
        Image("OnboardingCaddie")
            .resizable()
            .scaledToFit()
            .frame(height: small ? 132 : 200)
            .accessibilityIdentifier("roberto-guide")
            .accessibilityLabel(thinking ? "Roberto está pensando" : "Roberto, tu caddie en Golflet")
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
