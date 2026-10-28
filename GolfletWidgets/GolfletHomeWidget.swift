import GolfletKit
import SwiftUI
import WidgetKit

struct HomeEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot
}

struct HomeProvider: TimelineProvider {
    func placeholder(in context: Context) -> HomeEntry {
        HomeEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (HomeEntry) -> Void) {
        if context.isPreview {
            completion(HomeEntry(date: Date(), snapshot: .placeholder))
            return
        }
        Task {
            let snapshot = await WidgetTimelineAPI.fetch()
            completion(HomeEntry(date: Date(), snapshot: snapshot))
        }
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<HomeEntry>) -> Void) {
        Task {
            let snapshot = await WidgetTimelineAPI.fetch()
            let entry = HomeEntry(date: Date(), snapshot: snapshot)
            let next = Date().addingTimeInterval(30 * 60)
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }
}

struct GolfletHomeWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GolfletHome", provider: HomeProvider()) { entry in
            HomeWidgetView(snapshot: entry.snapshot)
                .containerBackground(WidgetChrome.paper, for: .widget)
        }
        .configurationDisplayName("Golflet")
        .description("Tu handicap y la última ronda.")
        .supportedFamilies([
            .systemSmall,
            .systemMedium,
            .accessoryRectangular,
            .accessoryCircular
        ])
        .contentMarginsDisabled()
    }
}

struct HomeWidgetView: View {
    @Environment(\.widgetFamily) private var family
    var snapshot: WidgetSnapshot

    var body: some View {
        switch family {
        case .accessoryCircular:
            lockCircular
        case .accessoryRectangular:
            lockRectangular
        default:
            homeCard
        }
    }

    private var homeCard: some View {
        VStack(alignment: .leading, spacing: family == .systemSmall ? 8 : 12) {
            Text("GOLFLET")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(WidgetChrome.gold)
            if snapshot.isPlaceholder {
                Text("Entrá en Golflet para ver tu HI")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(WidgetChrome.ink)
                    .minimumScaleFactor(0.7)
                    .lineLimit(3)
            } else {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(snapshot.handicapLine)
                        .font(.system(size: family == .systemSmall ? 24 : 32, weight: .semibold))
                        .monospacedDigit()
                        .foregroundStyle(WidgetChrome.green)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                    Text("HI")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(WidgetChrome.ink2)
                }
                if snapshot.lastCourse != nil {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Última ronda")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(WidgetChrome.ink2)
                        Text(snapshot.lastLine)
                            .font(.system(size: 15, weight: .semibold))
                            .monospacedDigit()
                            .foregroundStyle(WidgetChrome.ink)
                            .minimumScaleFactor(0.7)
                            .lineLimit(2)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .padding(family == .systemSmall ? 12 : 16)
        .widgetURL(snapshot.lastRoundURL ?? URL(string: "golflet://home"))
    }

    private var lockRectangular: some View {
        HStack(spacing: 8) {
            Text(snapshot.isPlaceholder ? "—" : snapshot.handicapLine)
                .font(.system(size: 20, weight: .semibold))
                .monospacedDigit()
            VStack(alignment: .leading, spacing: 1) {
                Text("HI")
                    .font(.system(size: 11, weight: .semibold))
                Text(snapshot.isPlaceholder ? "Golflet" : snapshot.lastLine)
                    .font(.system(size: 12, weight: .medium))
                    .lineLimit(1)
            }
        }
        .widgetURL(snapshot.lastRoundURL ?? URL(string: "golflet://home"))
    }

    private var lockCircular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: 0) {
                Text(snapshot.isPlaceholder ? "G" : snapshot.handicapLine)
                    .font(.system(size: 16, weight: .semibold))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text("HI")
                    .font(.system(size: 9, weight: .medium))
            }
        }
        .widgetURL(URL(string: "golflet://home"))
    }
}

enum WidgetChrome {
    static let paper = Color(red: 247 / 255, green: 245 / 255, blue: 240 / 255)
    static let green = Color(red: 15 / 255, green: 61 / 255, blue: 46 / 255)
    static let gold = Color(red: 200 / 255, green: 168 / 255, blue: 106 / 255)
    static let ink = Color(red: 18 / 255, green: 22 / 255, blue: 20 / 255)
    static let ink2 = Color(red: 94 / 255, green: 101 / 255, blue: 96 / 255)
}
