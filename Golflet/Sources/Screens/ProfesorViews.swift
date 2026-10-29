import SwiftUI

struct HomeProfesoresSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    var onSelect: (Profesor) -> Void
    @State private var query = ""

    var body: some View {
        GScreen(id: "screen-home-profesores") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Profesores")
                        GTitle(text: "Mis profesores", size: 34)
                    }
                    Text("Cada uno abre su página. Buscá para agregar otro; el listado se está armando.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)

                    GField(label: "Buscar") {
                        TextField("Nombre del profesor", text: $query)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("profesor-search")
                    }

                    if !linkedMatches.isEmpty {
                        ForEach(linkedMatches) { profesor in
                            profesorRow(profesor, id: "home-profesor-\(profesor.id)")
                        }
                    }

                    if !addMatches.isEmpty {
                        ForEach(addMatches) { profesor in
                            profesorRow(profesor, id: "add-profesor-\(profesor.id)")
                        }
                    }

                    if linkedMatches.isEmpty && addMatches.isEmpty {
                        Text(emptyCopy)
                            .font(GType.body)
                            .foregroundStyle(p.ink3)
                            .accessibilityIdentifier("profesor-search-empty")
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-home-profesores")
        .overlay { GProbe(id: "screen-agregar-profesor", label: "Mis profesores") }
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-home-profesores") }
    }

    private var needle: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var linkedMatches: [Profesor] {
        needle.isEmpty ? model.profesores : ProfesorSearch.matches(needle, in: model.profesores)
    }

    private var catalog: [Profesor] {
        model.api.persistsLocally ? MockAPIClient.profesorDirectory : []
    }

    private var addMatches: [Profesor] {
        guard needle.count >= 2 else { return [] }
        let linked = Set(model.profesores.map(\.id))
        return ProfesorSearch.matches(needle, in: catalog).filter { !linked.contains($0.id) }
    }

    private var emptyCopy: String {
        if needle.count < 2 {
            return model.profesores.isEmpty
                ? "Escribí al menos dos letras para buscar a tu profesor."
                : "Tus profesores. Escribí para buscar o agregar otro."
        }
        if catalog.isEmpty {
            return "Todavía no hay un listado para buscar. Te avisamos cuando esté."
        }
        return "No encontramos a ese profesor todavía."
    }

    private func profesorRow(_ profesor: Profesor, id: String) -> some View {
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
                        ring: Color(hex: HomeHcpPeopleLayout.celeste),
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
        .accessibilityIdentifier(id)
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
                        GOverline(text: "Mis profesores")
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
                            ring: Color(hex: HomeHcpPeopleLayout.celeste),
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
