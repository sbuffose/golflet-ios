import SwiftUI

/// The existing caddie drawing. It already includes the 18 flag, so screens do not add a second one or a circular frame.
struct CaddieMark: View {
    var height: CGFloat = 72

    var body: some View {
        Image("OnboardingCaddie")
            .resizable()
            .scaledToFit()
            .frame(height: height)
            .accessibilityHidden(true)
    }
}
