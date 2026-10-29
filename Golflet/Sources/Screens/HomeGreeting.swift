import SwiftUI
import UIKit

enum HomeGreetingPlacement: String, Equatable, Sendable {
    case sideBySide
    case sideBySideShrunk
    case stacked
}

enum HomeGreetingLayout {
    static let fullSize: CGFloat = 42
    static let compactScale: CGFloat = 0.72
    static let minScale: CGFloat = 0.62
    static let spacing: CGFloat = 8
    static let screenGutter: CGFloat = 20
    static let tabHang: CGFloat = 20
    static let seWidth: CGFloat = 320
    static let seMaxWidth: CGFloat = 375
    static let standardWidth: CGFloat = 390

    static func text(_ name: String) -> String {
        "Hola, \(name)"
    }

    static func place(
        availableWidth: CGFloat,
        greetingIdealWidth: CGFloat,
        tabWidth: CGFloat?
    ) -> HomeGreetingPlacement {
        guard let tabWidth, tabWidth > 0 else { return .sideBySide }
        if greetingIdealWidth + spacing + tabWidth <= availableWidth {
            return .sideBySide
        }
        let compact = greetingIdealWidth * compactScale
        if compact + spacing + tabWidth <= availableWidth {
            return .sideBySideShrunk
        }
        return .stacked
    }

    static func greetingWidth(_ text: String, size: CGFloat = fullSize) -> CGFloat {
        let font = UIFont(name: GFont.postScript(.semibold), size: size)
            ?? .systemFont(ofSize: size, weight: .semibold)
        let attrs: [NSAttributedString.Key: Any] = [
            .font: font,
            .kern: size >= 36 ? -1.9 : -1.2
        ]
        return ceil((text as NSString).size(withAttributes: attrs).width)
    }

    static func tabWidth(chipWhen: String) -> CGFloat {
        let titleFont = UIFont(name: GFont.postScript(.semibold), size: 11)
            ?? .systemFont(ofSize: 11, weight: .semibold)
        let chipFont = UIFont(name: GFont.postScript(.semibold), size: 15.5)
            ?? .systemFont(ofSize: 15.5, weight: .semibold)
        let title = "Próximo tee time".uppercased()
        let titleW = (title as NSString).size(withAttributes: [
            .font: titleFont,
            .kern: 1.4
        ]).width
        let chipW = (chipWhen as NSString).size(withAttributes: [.font: chipFont]).width
        return ceil(max(titleW, chipW) + 14 + 18 + 8)
    }

    static func availableWidth(screenWidth: CGFloat, hasTab: Bool) -> CGFloat {
        screenWidth - screenGutter - (hasTab ? 0 : screenGutter)
    }
}

struct HomeGreetingSplit: Layout {
    var spacing: CGFloat = HomeGreetingLayout.spacing

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) -> CGSize {
        guard let greeting = subviews.first else { return .zero }
        let available = proposal.width ?? .infinity
        let ideal = greeting.sizeThatFits(.unspecified)
        guard subviews.count > 1 else {
            let fitted = greeting.sizeThatFits(ProposedViewSize(width: available, height: nil))
            return CGSize(width: available.isFinite ? available : fitted.width, height: fitted.height)
        }
        let tab = subviews[1].sizeThatFits(.unspecified)
        switch HomeGreetingLayout.place(availableWidth: available, greetingIdealWidth: ideal.width, tabWidth: tab.width) {
        case .sideBySide:
            return CGSize(width: available.isFinite ? available : ideal.width + spacing + tab.width, height: max(ideal.height, tab.height))
        case .sideBySideShrunk:
            let greetingWidth = max(available - tab.width - spacing, 0)
            let fitted = greeting.sizeThatFits(ProposedViewSize(width: greetingWidth, height: nil))
            return CGSize(width: available.isFinite ? available : greetingWidth + spacing + tab.width, height: max(fitted.height, tab.height))
        case .stacked:
            let fitted = greeting.sizeThatFits(ProposedViewSize(width: available, height: nil))
            return CGSize(width: available.isFinite ? available : max(fitted.width, tab.width), height: fitted.height + spacing + tab.height)
        }
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Void) {
        guard let greeting = subviews.first else { return }
        let ideal = greeting.sizeThatFits(.unspecified)
        guard subviews.count > 1 else {
            greeting.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: bounds.height))
            return
        }
        let tabView = subviews[1]
        let tab = tabView.sizeThatFits(.unspecified)
        switch HomeGreetingLayout.place(availableWidth: bounds.width, greetingIdealWidth: ideal.width, tabWidth: tab.width) {
        case .sideBySide:
            greeting.place(
                at: CGPoint(x: bounds.minX, y: bounds.midY - ideal.height / 2),
                proposal: ProposedViewSize(width: ideal.width, height: ideal.height)
            )
            tabView.place(
                at: CGPoint(x: bounds.maxX - tab.width, y: bounds.midY - tab.height / 2),
                proposal: ProposedViewSize(width: tab.width, height: tab.height)
            )
        case .sideBySideShrunk:
            let greetingWidth = max(bounds.width - tab.width - spacing, 0)
            let fitted = greeting.sizeThatFits(ProposedViewSize(width: greetingWidth, height: nil))
            greeting.place(
                at: CGPoint(x: bounds.minX, y: bounds.midY - fitted.height / 2),
                proposal: ProposedViewSize(width: greetingWidth, height: fitted.height)
            )
            tabView.place(
                at: CGPoint(x: bounds.maxX - tab.width, y: bounds.midY - tab.height / 2),
                proposal: ProposedViewSize(width: tab.width, height: tab.height)
            )
        case .stacked:
            let fitted = greeting.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            greeting.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: fitted.height))
            tabView.place(
                at: CGPoint(x: bounds.maxX - tab.width, y: bounds.minY + fitted.height + spacing),
                proposal: ProposedViewSize(width: tab.width, height: tab.height)
            )
        }
    }
}

struct HomeGreetingHeader: View {
    @Environment(\.palette) private var p
    let name: String
    var booking: TeeTime?
    var onTab: () -> Void = {}

    var body: some View {
        let label = HomeGreetingLayout.text(name)
        let placement = placementHint(for: label)
        HomeGreetingSplit {
            greeting(label)
            if let booking {
                tabButton(booking)
            }
        }
        .padding(.trailing, booking == nil ? 0 : -HomeGreetingLayout.tabHang)
        .overlay {
            if booking != nil {
                GProbe(id: placement == .stacked ? "home-greeting-stack" : "home-greeting-side", label: label)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("home-greeting-row")
    }

    private func placementHint(for label: String) -> HomeGreetingPlacement {
        guard let booking else { return .sideBySide }
        let screen = UIScreen.main.bounds.width
        return HomeGreetingLayout.place(
            availableWidth: HomeGreetingLayout.availableWidth(screenWidth: screen, hasTab: true),
            greetingIdealWidth: HomeGreetingLayout.greetingWidth(label),
            tabWidth: HomeGreetingLayout.tabWidth(chipWhen: booking.chipWhen)
        )
    }

    private func tabButton(_ booking: TeeTime) -> some View {
        Button(action: onTab) {
            TeeTimeTab(booking: booking)
        }
        .buttonStyle(.plain)
        .fixedSize()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("home-tee-tab")
        .accessibilityLabel("Próximo tee time \(booking.chipWhen)")
    }

    private func greeting(_ label: String) -> some View {
        ViewThatFits(in: .horizontal) {
            Text(label)
                .font(GFont.ui(HomeGreetingLayout.fullSize, weight: .semibold))
                .tracking(-1.9)
            Text(label)
                .font(GFont.ui(HomeGreetingLayout.fullSize * HomeGreetingLayout.compactScale, weight: .semibold))
                .tracking(-1.2)
        }
        .foregroundStyle(p.ink)
        .lineLimit(1)
        .minimumScaleFactor(HomeGreetingLayout.minScale)
        .allowsTightening(true)
        .accessibilityIdentifier("home-greeting")
        .accessibilityLabel(label)
    }
}
