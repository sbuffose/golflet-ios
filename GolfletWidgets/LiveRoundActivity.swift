import ActivityKit
import GolfletKit
import SwiftUI
import WidgetKit

struct LiveRoundActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RoundActivityAttributes.self) { context in
            LiveIslandBanner(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(context.state.holeLine)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(WidgetChrome.paper)
                        Text(context.state.course)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(WidgetChrome.gold)
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text(context.state.centerLine)
                            .font(.system(size: 22, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(WidgetChrome.paper)
                        Text("yd al centro")
                            .font(.system(size: 10, weight: .medium))
                            .foregroundStyle(WidgetChrome.gold)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.scoreLine)
                            .font(.system(size: 13, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(WidgetChrome.gold)
                        Spacer()
                        liveYards("F", context.state.frontYd)
                        liveYards("C", context.state.centerYd)
                        liveYards("B", context.state.backYd)
                    }
                }
            } compactLeading: {
                Text("H\(context.state.hole)")
                    .font(.system(size: 12, weight: .semibold))
            } compactTrailing: {
                Text(context.state.centerLine)
                    .font(.system(size: 12, weight: .semibold))
                    .monospacedDigit()
            } minimal: {
                Text("H\(context.state.hole)")
                    .font(.system(size: 11, weight: .semibold))
            }
            .widgetURL(URL(string: "golflet://play"))
        }
    }

    private func liveYards(_ label: String, _ value: Int?) -> some View {
        VStack(spacing: 1) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(WidgetChrome.gold)
            Text(value.map(String.init) ?? "—")
                .font(.system(size: 14, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(WidgetChrome.paper)
        }
        .frame(minWidth: 28)
    }
}

struct LiveIslandBanner: View {
    var state: RoundActivityAttributes.ContentState

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(state.holeLine)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(WidgetChrome.paper)
                Text(state.scoreLine)
                    .font(.system(size: 12, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(WidgetChrome.gold)
            }
            Spacer()
            HStack(spacing: 10) {
                bannerYards("F", state.frontYd)
                bannerYards("C", state.centerYd)
                bannerYards("B", state.backYd)
            }
        }
        .padding(12)
        .activityBackgroundTint(WidgetChrome.green)
        .activitySystemActionForegroundColor(WidgetChrome.paper)
        .widgetURL(URL(string: "golflet://play"))
    }

    private func bannerYards(_ label: String, _ value: Int?) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(WidgetChrome.gold)
            Text(value.map(String.init) ?? "—")
                .font(.system(size: 15, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(WidgetChrome.paper)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
        }
    }
}
