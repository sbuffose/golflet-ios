import SwiftUI

struct RoundsView: View {
    var showsBack = true
    var body: some View {
        MetricRoundsView(
            query: RoundListQuery(title: "Rondas", showPeriod: false),
            showsBack: showsBack,
            screenID: "screen-rondas"
        )
    }
}