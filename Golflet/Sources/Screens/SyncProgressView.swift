import SwiftUI

struct SyncProgressView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let session = model.syncSession
        let progress = session?.progress ?? SyncAPIProgress(stage: .connect)
        GScreen(id: "sync-overlay") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 0) {
                    YardageBookView(
                        finish: session?.outcome == .succeeded,
                        caption: YardageBookCopy.caption(stage: progress.stage, outcome: session?.outcome ?? .running),
                        count: YardageBookCopy.count(progress, outcome: session?.outcome ?? .running),
                        reduceMotion: reduceMotion,
                        compact: true
                    )
                    .frame(maxWidth: .infinity)
                    .frame(height: 200)

                    VStack(alignment: .leading, spacing: 0) {
                        header(session, progress)
                            .padding(.top, 14)
                            .padding(.bottom, 10)
                        SyncCompactStages(session: session, progress: progress)
                        SyncLivePanel(progress: progress, reduceMotion: reduceMotion)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 28)
                }
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sync-overlay")
        .accessibilityAddTraits(.updatesFrequently)
        .accessibilityLabel(session?.title ?? "Leyendo tus tarjetas")
        .task(id: session?.outcome) {
            guard session?.outcome == .succeeded else { return }
            try? await Task.sleep(for: .milliseconds(RuntimeFlags.isUITesting ? 5500 : 700))
            model.finishSuccessfulSync()
        }
    }

    private func header(_ session: SyncSession?, _ progress: SyncAPIProgress) -> some View {
        HStack(alignment: .center, spacing: 14) {
            ClubCrestView(
                club: progress.club ?? session?.clubName,
                logo: progress.clubLogo,
                initials: progress.clubInitials,
                reduceMotion: reduceMotion
            )
            VStack(alignment: .leading, spacing: 2) {
                GOverline(text: overline(session, progress))
                Text(session?.title ?? "Leyendo tus tarjetas")
                    .font(GFont.ui(26, weight: .semibold))
                    .tracking(-0.8)
                    .foregroundStyle(p.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                    .accessibilityIdentifier("sync-progress-label")
            }
        }
    }

    private func overline(_ session: SyncSession?, _ progress: SyncAPIProgress) -> String {
        let club = progress.club ?? session?.clubName ?? "Golflet"
        if let ordinal = progress.clubOrdinal {
            return "\(club) · \(ordinal)"
        }
        return club
    }
}
