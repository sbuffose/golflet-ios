import SwiftUI

struct SyncProgressView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        let session = model.syncSession
        GScreen {
            VStack(alignment: .leading, spacing: 0) {
                placeholderMark
                    .padding(.top, 28)
                    .padding(.bottom, 22)

                VStack(alignment: .leading, spacing: 4) {
                    GOverline(text: session?.clubName ?? "Golflet")
                    Text(session?.title ?? "Leyendo tus tarjetas")
                        .font(GType.sheetTitle)
                        .tracking(-1.05)
                        .foregroundStyle(p.ink)
                        .accessibilityIdentifier("sync-progress-label")
                }
                .padding(.bottom, 18)

                stepsCard(session)

                Text("Esto puede tardar un rato.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                    .padding(.top, 16)

                Spacer()
            }
            .padding(.horizontal, 20)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("sync-overlay")
        .accessibilityLabel(session?.title ?? "Leyendo tus tarjetas")
        .task(id: session?.outcome) {
            guard session?.outcome == .succeeded else { return }
            try? await Task.sleep(for: .milliseconds(RuntimeFlags.isUITesting ? 180 : 700))
            model.finishSuccessfulSync()
        }
    }

    private var placeholderMark: some View {
        HStack {
            Spacer()
            ZStack {
                Circle()
                    .fill(p.primary)
                    .frame(width: 56, height: 56)
                Image(systemName: "flag.fill")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(p.accent)
            }
            Spacer()
        }
        .accessibilityHidden(true)
    }

    private func stepsCard(_ session: SyncSession?) -> some View {
        let progress = session?.progress ?? SyncAPIProgress(stage: .connect)
        let club = session?.clubName ?? progress.club ?? "tu club"
        return VStack(spacing: 0) {
            ForEach(Array(SyncStage.visible.enumerated()), id: \.element) { index, stage in
                let state = SyncStepCopy.state(for: stage, progress: progress, outcome: session?.outcome ?? .running)
                let label = state == .error
                    ? (session?.errorMessage ?? progress.error ?? "No se pudo actualizar")
                    : SyncStepCopy.label(stage: stage, state: state, club: club, progress: progress)
                VStack(spacing: 0) {
                    if index > 0 { p.hairline.frame(height: 1) }
                    HStack(alignment: .center, spacing: 12) {
                        stepIcon(state)
                        Text(label)
                            .font(GFont.ui(15, weight: .medium))
                            .foregroundStyle(stepColor(state))
                            .tabular()
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding(.vertical, 12)
                }
                .accessibilityIdentifier("sync-step-\(stage.rawValue)")
            }
        }
        .padding(.horizontal, 16)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .shadow(color: Color.black.opacity(0.04), radius: 1, y: 1)
        .shadow(color: Color.black.opacity(0.06), radius: 12, y: 8)
    }

    private func stepIcon(_ state: SyncStepState) -> some View {
        ZStack {
            switch state {
            case .todo:
                Circle().stroke(Color(hex: 0xD9D4C8), lineWidth: 1.5)
            case .active:
                Circle().stroke(Color(hex: 0xC8A86A), lineWidth: 1.5)
            case .done:
                Circle().fill(Color(hex: 0x0F3D2E))
                Image(systemName: "checkmark")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundStyle(Color(hex: 0xF7F5F0))
            case .error:
                Circle().fill(Color(hex: 0xB5543C))
            }
        }
        .frame(width: 18, height: 18)
    }

    private func stepColor(_ state: SyncStepState) -> Color {
        switch state {
        case .todo: return p.ink3
        case .active: return p.ink
        case .done: return p.ink2
        case .error: return Color(hex: 0x8E3A24)
        }
    }
}
