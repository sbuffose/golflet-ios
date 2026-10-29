import SwiftUI

struct HomeProfesoresSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    var onSelect: (Profesor) -> Void

    var body: some View {
        GScreen(id: "screen-home-profesores") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Tus profesores")
                        GTitle(text: "Profesores", size: 34)
                    }
                    ForEach(model.profesores) { profesor in
                        Button {
                            dismiss()
                            onSelect(profesor)
                        } label: {
                            GCard(radius: 18, padding: 14) {
                                HStack(spacing: 12) {
                                    HomeHcpAvatar(
                                        url: profesor.photoURL,
                                        initials: profesor.initials,
                                        size: 44,
                                        fill: p.primary,
                                        ink: p.onPrimary,
                                        ring: p.accent,
                                        verified: profesor.verified
                                    )
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(profesor.name)
                                            .font(GType.headline)
                                            .foregroundStyle(p.ink)
                                        Text(profesor.locationsLine ?? (profesor.pending ? "Todavía no activó su cuenta" : "Profesor"))
                                            .font(GType.label)
                                            .foregroundStyle(p.ink2)
                                    }
                                    Spacer()
                                    MetricChevron(color: p.ink3)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("home-profesor-\(profesor.id)")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-home-profesores")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-home-profesores") }
    }
}

struct ProfesorDetailView: View {
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let profesor: Profesor

    var body: some View {
        GScreen(id: "screen-profesor") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Profesores")
                        HStack(alignment: .center, spacing: 8) {
                            Text(profesor.name)
                                .font(GFont.ui(34, weight: .semibold))
                                .tracking(-1.6)
                                .foregroundStyle(p.ink)
                                .lineLimit(2)
                            if profesor.verified {
                                Image(systemName: "checkmark.seal.fill")
                                    .font(.system(size: 20, weight: .semibold))
                                    .foregroundStyle(Color(hex: 0x1D9BF0))
                                    .accessibilityLabel("Verificado")
                            }
                            Spacer(minLength: 0)
                        }
                    }

                    HStack(alignment: .center, spacing: 14) {
                        HomeHcpAvatar(
                            url: profesor.photoURL,
                            initials: profesor.initials,
                            size: 64,
                            fill: p.primary,
                            ink: p.onPrimary,
                            ring: p.accent,
                            verified: profesor.verified
                        )
                        VStack(alignment: .leading, spacing: 4) {
                            if let locations = profesor.locationsLine {
                                Text(locations)
                                    .font(GType.body)
                                    .foregroundStyle(p.ink2)
                            }
                            Text(profesor.canViewMetrics ? "Ve tus métricas" : "No ve tus métricas")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                        }
                    }

                    if profesor.pending {
                        Text("Todavía no activó su cuenta de profesor. Cuando la active, va a ver solo lo que actives acá.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }

                    if let bio = profesor.bio, !bio.isEmpty {
                        Text(bio)
                            .font(GType.body)
                            .foregroundStyle(p.ink)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-profesor")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-profesor") }
    }
}
