import SwiftUI

struct RoundsView: View {
    var body: some View {
        MetricRoundsView(
            query: RoundListQuery(title: "Rondas", footnote: "Todas las tarjetas."),
            showsBack: false,
            screenID: "screen-rondas"
        )
            .metricDestinations()
    }
}