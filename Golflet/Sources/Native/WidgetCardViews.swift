import SwiftUI

struct WidgetCardViews: View {
    var snapshot: WidgetSnapshot
    var compact: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: compact ? 8 : 12) {
            Text("GOLFLET")
                .font(GType.overline)
                .foregroundStyle(Color(hex: 0xC8A86A))
                .accessibilityIdentifier("widget-brand")
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(snapshot.handicapLine)
                    .font(compact ? GType.statM : GType.statL)
                    .tabular()
                    .foregroundStyle(Color(hex: 0x0F3D2E))
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .accessibilityIdentifier("widget-handicap")
                Text("HI")
                    .font(GType.label)
                    .foregroundStyle(Color(hex: 0x5E6560))
            }
            if let course = snapshot.lastCourse {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Última ronda")
                        .font(GType.label)
                        .foregroundStyle(Color(hex: 0x5E6560))
                    Text(snapshot.lastLine)
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(Color(hex: 0x121614))
                        .minimumScaleFactor(0.7)
                        .lineLimit(2)
                }
                .accessibilityIdentifier("widget-last-round")
                .accessibilityLabel("Última ronda \(course)")
            }
            if let next = snapshot.nextCourse {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Próxima")
                        .font(GType.label)
                        .foregroundStyle(Color(hex: 0x5E6560))
                    Text(next)
                        .font(GType.headline)
                        .foregroundStyle(Color(hex: 0x121614))
                        .lineLimit(1)
                    if let when = snapshot.nextWhen {
                        Text(when)
                            .font(GType.label)
                            .foregroundStyle(Color(hex: 0x9AA09B))
                    }
                }
                .accessibilityIdentifier("widget-next-round")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(compact ? 12 : 16)
        .background(Color(hex: 0xF7F5F0))
        .accessibilityIdentifier("widget-card")
    }
}

struct LiveIslandViews: View {
    var state: RoundActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.holeLine)
                    .font(GType.headline)
                    .foregroundStyle(Color(hex: 0xF7F5F0))
                    .accessibilityIdentifier("live-hole")
                Text(state.scoreLine)
                    .font(GType.label)
                    .tabular()
                    .foregroundStyle(Color(hex: 0xC8A86A))
                    .accessibilityIdentifier("live-score")
            }
            Spacer()
            HStack(spacing: 10) {
                liveYards("F", state.frontYd, "live-front")
                liveYards("C", state.centerYd, "live-center")
                liveYards("B", state.backYd, "live-back")
            }
        }
        .padding(12)
        .background(Color(hex: 0x0F3D2E))
        .accessibilityIdentifier("live-island")
    }

    private func liveYards(_ label: String, _ value: Int?, _ id: String) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(GType.overline)
                .foregroundStyle(Color(hex: 0xC8A86A))
            Text(value.map(String.init) ?? "—")
                .font(GType.headline)
                .tabular()
                .foregroundStyle(Color(hex: 0xF7F5F0))
                .minimumScaleFactor(0.6)
                .lineLimit(1)
                .accessibilityIdentifier(id)
        }
    }
}
