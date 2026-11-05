import SwiftUI

struct RoundsView: View {
    var body: some View {
        MetricRoundsView(
            query: RoundListQuery(title: "Rondas", footnote: "Todas las tarjetas."),
            showsBack: true,
            screenID: "screen-rondas"
        )
    }
}