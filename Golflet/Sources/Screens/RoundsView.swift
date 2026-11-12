import SwiftUI

struct RoundsView: View {
    var showsBack = true
    var body: some View {
        MetricRoundsView(
            query: RoundListQuery(title: "Rondas", footnote: "Todas las tarjetas.", showPeriod: false),
            showsBack: showsBack,
            screenID: "screen-rondas"
        )
    }
}