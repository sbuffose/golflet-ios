import SwiftUI

struct SyncProgressView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let session = model.syncSession
        GScreen {
            VStack(spacing: 0) {
                Spacer(minLength: 28)
                VStack(spacing: 8) {
                    GOverline(text: "Golflet")
                    Text(session?.title ?? "Actualizar")
                        .font(GType.sheetTitle)
                        .tracking(-1.1)
                        .foregroundStyle(p.ink)
                        .multilineTextAlignment(.center)
                }
                .padding(.horizontal, 28)

                YardageBookSyncScene(
                    outcome: session?.outcome ?? .running,
                    onHoledOut: { model.finishSuccessfulSync() }
                )
                .padding(.horizontal, 28)
                .padding(.top, 18)
                .padding(.bottom, 8)
                .frame(maxHeight: 420)

                VStack(spacing: 8) {
                    Text(session?.progress.line ?? "Conectando")
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                        .multilineTextAlignment(.center)
                        .contentTransition(.opacity)
                        .animation(reduceMotion ? nil : .easeInOut(duration: 0.28), value: session?.progress.line)
                        .accessibilityIdentifier("sync-progress-label")

                    Text("Hoyo 7 · 385 yardas")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
                .padding(.horizontal, 32)
                .padding(.top, 6)

                Spacer(minLength: 36)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sync-overlay")
        .accessibilityLabel(session?.title ?? "Actualizar")
        .accessibilityValue(session?.progress.line ?? "")
        .allowsHitTesting(true)
    }
}
