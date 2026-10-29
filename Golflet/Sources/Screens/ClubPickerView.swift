import SwiftUI

struct ClubPickerBlock: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var payload: NeedsClubPayload
    var onPick: (ClubCatalogEntry) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("¿Tu club no aparece? Elegilo")
                .font(GType.section)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("club-picker-title")
            Text(payload.message)
                .font(GType.label)
                .foregroundStyle(p.ink2)
            ForEach(payload.clubs) { club in
                Button {
                    onPick(club)
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(club.name)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .multilineTextAlignment(.leading)
                            if club.id == 124 {
                                Text("San Isidro")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink3)
                            }
                        }
                        Spacer()
                        if model.pendingClubID == club.id {
                            Image(systemName: "checkmark")
                                .foregroundStyle(p.primary)
                        }
                    }
                    .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("club-pick-\(club.id)")
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("club-picker")
    }
}
