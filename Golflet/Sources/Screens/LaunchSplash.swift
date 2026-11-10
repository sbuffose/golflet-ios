import SwiftUI

/// Cold-launch mark. The drawing already carries the 18 flag, so the splash
/// does not paint a second one. Reduce Motion holds a still frame.
struct LaunchSplash: View {
    var firstLaunch: Bool
    var reduceMotion: Bool
    var onFinish: () -> Void

    @State private var shown = false

    var body: some View {
        ZStack {
            Color(hex: BrandHex.navy)
                .ignoresSafeArea()
            VStack(spacing: 18) {
                CaddieMark(height: firstLaunch ? 240 : 200)
                    .offset(y: shown || reduceMotion ? 0 : 28)
                    .opacity(shown || reduceMotion ? 1 : 0)
                Text("Golflet")
                    .font(GFont.ui(28, weight: .semibold))
                    .foregroundStyle(Color(hex: BrandHex.white))
                if firstLaunch {
                    Text("La libreta, el caddie y el 18.")
                        .font(GType.body)
                        .foregroundStyle(Color(hex: BrandHex.redOnDark))
                        .opacity(shown || reduceMotion ? 1 : 0)
                }
            }
            .padding(.horizontal, 28)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Golflet")
        .accessibilityIdentifier("launch-splash")
        .accessibilityHidden(RuntimeFlags.isUITesting)
        .allowsHitTesting(!RuntimeFlags.isUITesting)
        .onAppear {
            let move = reduceMotion ? 0.0 : 0.45
            withAnimation(.easeOut(duration: move)) {
                shown = true
            }
            let hold = LaunchSplash.hold(firstLaunch: firstLaunch, reduceMotion: reduceMotion)
            Task {
                try? await Task.sleep(for: .seconds(hold))
                onFinish()
            }
        }
    }

    /// First open tells a little more. Later opens stay under a second and a half.
    /// UI tests look through the splash, so the hold is only a blink.
    static func hold(firstLaunch: Bool, reduceMotion: Bool) -> Double {
        if RuntimeFlags.isUITesting { return 0.05 }
        if reduceMotion { return 0.45 }
        return firstLaunch ? 1.5 : 1.1
    }
}
