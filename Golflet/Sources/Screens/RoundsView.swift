import SwiftUI

struct RoundsView: View {
    var showsBack = true
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var body: some View {
        MetricRoundsView(
            query: RoundListQuery(title: "Rondas", showPeriod: false),
            showsBack: showsBack,
            screenID: "screen-rondas"
        )
        .safeAreaInset(edge: .bottom) {
            Button { model.showsReconstruct = true } label: {
                Text("Cargar una vuelta ya jugada")
                    .font(GType.headline)
                    .foregroundStyle(Color.white)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
            .padding(.bottom, 8)
            .accessibilityIdentifier("reconstruct-start")
        }
    }
}