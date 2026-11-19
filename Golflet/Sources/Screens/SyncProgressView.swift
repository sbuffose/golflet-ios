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
                    header(session, progress)
                        .padding(.top, 8)
                        .padding(.bottom, 10)
                    SyncCompactStages(session: session, progress: progress)
                    SyncArrivals(progress: progress)
                        .padding(.top, 14)
                    SyncLivePanel(progress: progress, reduceMotion: reduceMotion)
                    YardageBookView(
                        finish: session?.outcome == .succeeded,
                        caption: YardageBookCopy.caption(stage: progress.stage, outcome: session?.outcome ?? .running),
                        count: YardageBookCopy.count(progress, outcome: session?.outcome ?? .running),
                        reduceMotion: reduceMotion,
                        compact: true
                    )
                    .frame(maxWidth: .infinity)
                    .frame(height: 168)
                    .padding(.top, 16)
                    .accessibilityIdentifier("sync-yardage")
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 16)
            }
            .background(Color(hex: 0xF5F5F5))
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
            .id(progress.clubCode ?? progress.club ?? "scan")
            .transition(.opacity)
            .animation(reduceMotion ? nil : .easeInOut(duration: 0.35), value: progress.clubCode ?? progress.club ?? "")
            .accessibilityIdentifier("sync-crest-\(progress.clubCode ?? "scan")")
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
        let club = SyncClubIdentity.spokenName(progress.club ?? session?.clubName, count: progress.clubCount)
        if let ordinal = progress.clubOrdinal {
            return "\(club) · \(ordinal)"
        }
        return club
    }
}

/// Tarjetas que ya llegaron, en orden. Si todavía no hay ninguna, filas de carga.
struct SyncArrivals: View {
    let progress: SyncAPIProgress
    @State private var cards: [SyncLastCard] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let birdies = progress.stats?.birdies, birdies > 0 {
                Text(birdies == 1 ? "1 birdie encontrado" : "\(birdies) birdies encontrados")
                    .font(GType.headline)
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .accessibilityIdentifier("sync-birdies")
            }
            if let hole = lastBirdieHole {
                Text("Último birdie, hoyo \(hole)")
                    .font(GType.label)
                    .foregroundStyle(Color(hex: BrandHex.ink2))
                    .accessibilityIdentifier("sync-last-birdie")
            }
            if cards.isEmpty {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Color(hex: BrandHex.navy).opacity(0.08))
                        .frame(height: 52)
                        .accessibilityIdentifier("sync-skeleton")
                        .accessibilityLabel("Cargando tarjetas")
                }
            } else {
                ForEach(Array(cards.enumerated()), id: \.offset) { _, card in
                    cardRow(card)
                }
            }
        }
        .onAppear(perform: absorb)
        .onChange(of: cardKey) { _, _ in absorb() }
    }

    private var cardKey: String { progress.stats?.lastCard.map(Self.key) ?? "" }

    private var lastBirdieHole: Int? {
        for card in cards.reversed() {
            if let hole = card.holes.last(where: { ($0.toPar ?? 0) == -1 }) {
                return hole.number
            }
        }
        return nil
    }

    private func absorb() {
        guard let card = progress.stats?.lastCard else { return }
        let key = Self.key(card)
        guard !cards.contains(where: { Self.key($0) == key }) else { return }
        cards.append(card)
    }

    private func cardRow(_ card: SyncLastCard) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text(card.date.map(FormatAR.syncDay) ?? "–")
                    .font(GType.label)
                    .foregroundStyle(Color(hex: BrandHex.ink2))
                Text(card.course?.isEmpty == false ? card.course! : "–")
                    .font(GType.headline)
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            Text(card.gross.map(String.init) ?? "–")
                .font(GFont.ui(22, weight: .semibold))
                .foregroundStyle(Color(hex: BrandHex.navy))
                .tabular()
            Text(card.toPar.map(FormatAR.signedInt) ?? "–")
                .font(GType.label)
                .foregroundStyle(Color(hex: BrandHex.ink2))
                .tabular()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .accessibilityIdentifier("sync-card-row")
    }

    private static func key(_ card: SyncLastCard) -> String {
        let day = card.date.map { String(Int($0.timeIntervalSince1970)) } ?? ""
        return "\(day)|\(card.course ?? "")|\(card.gross ?? -1)|\(card.club ?? "")"
    }
}
