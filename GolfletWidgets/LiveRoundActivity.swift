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
                            .foregroundStyle(WidgetChrome.white)
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
                            .foregroundStyle(WidgetChrome.white)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(context.state.scoreLine)
                                .font(.system(size: 15, weight: .semibold))
                                .monospacedDigit()
                                .foregroundStyle(WidgetChrome.white)
                            if let hcp = context.state.strokeIndex {
                                Text("Hcp \(hcp)")
                                    .font(.system(size: 13, weight: .medium))
                                    .foregroundStyle(WidgetChrome.white)
                            }
                            Spacer()
                            liveYards("F", context.state.frontYd)
                            liveYards("C", context.state.centerYd)
                            liveYards("B", context.state.backYd)
                        }
                        if let wind = context.state.windLine {
                            Text(wind)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(WidgetChrome.white)
                                .lineLimit(1)
                        }
                        if let match = context.state.matchLine {
                            Text(match)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(WidgetChrome.white)
                                .lineLimit(2)
                        }
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
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WidgetChrome.white)
            Text(value.map(String.init) ?? "—")
                .font(.system(size: 18, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(WidgetChrome.paper)
        }
        .frame(minWidth: 36)
    }
}

struct LiveIslandBanner: View {
    var state: RoundActivityAttributes.ContentState

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            VStack(alignment: .leading, spacing: 4) {
                Text(state.holeLine)
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(WidgetChrome.paper)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                Text(state.scoreLine)
                    .font(.system(size: 16, weight: .medium))
                    .monospacedDigit()
                    .foregroundStyle(WidgetChrome.white)
                if let hcp = state.strokeIndex {
                    Text("Hcp \(hcp)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundStyle(WidgetChrome.white)
                }
                if let wind = state.windLine {
                    Text(wind)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(WidgetChrome.white)
                        .lineLimit(2)
                }
                if let match = state.matchLine {
                    Text(match)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(WidgetChrome.white)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 12) {
                bannerYards("F", "frente", state.frontYd)
                bannerYards("C", "centro", state.centerYd)
                bannerYards("B", "fondo", state.backYd)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .activityBackgroundTint(WidgetChrome.navy)
        .activitySystemActionForegroundColor(WidgetChrome.paper)
        .widgetURL(URL(string: "golflet://play"))
    }

    private func bannerYards(_ label: String, _ caption: String, _ value: Int?) -> some View {
        VStack(spacing: 2) {
            Text(label)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(WidgetChrome.white)
            Text(value.map(String.init) ?? "—")
                .font(.system(size: 22, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(WidgetChrome.paper)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(caption)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(WidgetChrome.white)
                .lineLimit(1)
        }
        .frame(minWidth: 52)
    }
}
