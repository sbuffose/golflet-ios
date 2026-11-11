import SwiftUI

enum GMotion {
    static func spring(_ reduce: Bool) -> Animation? {
        reduce ? nil : .spring(response: 0.42, dampingFraction: 0.86)
    }

    static func fade(_ reduce: Bool) -> Animation? {
        reduce ? nil : .easeInOut(duration: 0.22)
    }
}

struct RoundZoomSource: ViewModifier {
    var id: String
    var space: Namespace.ID

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.matchedTransitionSource(id: id, in: space)
        } else {
            content
        }
    }
}

struct RoundZoomDestination: ViewModifier {
    var id: String
    var space: Namespace.ID

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 18, *) {
            content.navigationTransition(.zoom(sourceID: id, in: space))
        } else {
            content
        }
    }
}

struct GSelectionHaptic<T: Equatable>: ViewModifier {
    var reduce: Bool
    var trigger: T

    @ViewBuilder
    func body(content: Content) -> some View {
        if reduce {
            content
        } else {
            content.sensoryFeedback(.selection, trigger: trigger)
        }
    }
}

/// Counts up to `value` for the eye. The accessibility label is the finished number immediately.
struct CountUpText: View {
    var value: Double
    var format: (Double) -> String
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown: Double = 0

    var body: some View {
        Text(format(reduceMotion ? value : shown))
            .accessibilityLabel(format(value))
            .onAppear { play() }
            .onChange(of: value) { _, _ in play() }
    }

    private func play() {
        if reduceMotion {
            shown = value
            return
        }
        shown = 0
        let steps = 10
        for step in 1...steps {
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(28 * step))
                shown = value * Double(step) / Double(steps)
            }
        }
    }
}
