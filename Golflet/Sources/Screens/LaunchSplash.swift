import SwiftUI

/// Cold-launch mark. The caddie and the red 18 flag play every time the app
/// opens, then the root fades into onboarding or home. Reduce Motion holds
/// a still frame instead of moving the caddie.
struct LaunchSplash: View {
    var firstLaunch: Bool
    var reduceMotion: Bool
    var onFinish: () -> Void

    @State private var shown = false
    @State private var flag = false

    var body: some View {
        ZStack {
            Color(hex: BrandHex.navy)
                .ignoresSafeArea()
            VStack(spacing: 18) {
                ZStack(alignment: .topTrailing) {
                    Image("OnboardingCaddie")
                        .resizable()
                        .scaledToFit()
                        .frame(height: firstLaunch ? 240 : 200)
                        .offset(y: shown || reduceMotion ? 0 : 28)
                        .opacity(shown || reduceMotion ? 1 : 0)
                        .accessibilityHidden(true)
                    LaunchFlag()
                        .frame(width: 72, height: 54)
                        .rotationEffect(.degrees(flag || reduceMotion ? 0 : -8))
                        .offset(x: 18, y: 8)
                        .opacity(flag || reduceMotion ? 1 : 0)
                }
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
                flag = true
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

struct LaunchFlag: View {
    var body: some View {
        Canvas { context, size in
            var pole = Path()
            pole.move(to: CGPoint(x: 6, y: 2))
            pole.addLine(to: CGPoint(x: 6, y: size.height))
            context.stroke(pole, with: .color(Color(hex: BrandHex.white)), lineWidth: 2)
            var cloth = Path()
            cloth.move(to: CGPoint(x: 8, y: 4))
            cloth.addLine(to: CGPoint(x: size.width - 2, y: 10))
            cloth.addLine(to: CGPoint(x: 8, y: 28))
            cloth.closeSubpath()
            context.fill(cloth, with: .color(Color(hex: BrandHex.red)))
        }
        .overlay(alignment: .topLeading) {
            Text("18")
                .font(GFont.ui(13, weight: .bold))
                .foregroundStyle(Color(hex: BrandHex.white))
                .padding(.leading, 14)
                .padding(.top, 2)
        }
        .accessibilityHidden(true)
    }
}
