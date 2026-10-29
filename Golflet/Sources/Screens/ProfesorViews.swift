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
                        GOverline(text: "Tu cuenta")
                        GTitle(text: "Mis profesores", size: 34)
                    }

                    VStack(spacing: 0) {
                        ForEach(model.profesores) { profesor in
                            NavigationLink {
                                ProfesorDetailView(profesor: profesor)
                                    .golfletChrome()
                            } label: {
                                ProfesorAccountRow(
                                    profesor: profesor,
                                    id: "home-profesor-\(profesor.id)"
                                )
                            }
                            .buttonStyle(.plain)
                        }

                        NavigationLink {
                            ProfesorMatchView(onAdded: onSelect)
                        } label: {
                            ProfesorActionRow(
                                symbol: "magnifyingglass",
                                title: "Encontrar un profesor",
                                subtitle: "5 preguntas y te mostramos los que mejor te quedan"
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("profesores-encontrar")

                        NavigationLink {
                            AgregarProfesorSheet(showsClose: false, onSelect: onSelect)
                        } label: {
                            ProfesorActionRow(
                                symbol: "plus",
                                title: "Agregar un profesor",
                                subtitle: "Buscalo por nombre o matrícula entre los profesores de Golflet"
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("profesores-agregar")
                    }
                    .background(p.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                    if model.profesores.isEmpty {
                        Text("Tu profesor solo ve tus métricas si vos lo activás. Notas, estrategia y tee times nunca se comparten.")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-home-profesores")
        .safeAreaInset(edge: .top) { closeBar(dismiss: dismiss, id: "close-home-profesores") }
        .task { await model.refreshProfesores() }
    }
}

struct AgregarProfesorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    var showsClose = true
    var onSelect: (Profesor) -> Void

    @State private var query = ""
    @State private var results: [Profesor] = []
    @State private var isSearching = false
    @State private var addingID: String?
    @State private var help = "Escribí al menos 2 letras. Tocá un profesor para agregarlo: no ve nada tuyo hasta que lo actives."
    @State private var searchGeneration = 0

    var body: some View {
        GScreen(id: "screen-agregar-profesor") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Profesores")
                        GTitle(text: "Agregar un profesor", size: 34)
                    }

                    GField(label: "Nombre o matrícula") {
                        TextField("Empezá a escribir, por ejemplo Manu", text: $query)
                            .textInputAutocapitalization(.words)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("profesor-search")
                    }

                    if isSearching && results.isEmpty && needle.count >= 2 {
                        Text("Buscando…")
                            .font(GType.label)
                            .foregroundStyle(p.ink3)
                    }

                    if !results.isEmpty {
                        VStack(spacing: 10) {
                            ForEach(results) { profesor in
                                searchRow(profesor)
                            }
                        }
                    }

                    Text(help)
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                        .accessibilityIdentifier("profesor-search-help")

                    if needle.count >= 2 && !isSearching && results.isEmpty {
                        Text("No encontramos profesores con “\(needle)”.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("profesor-search-empty")
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text("¿No sabés a quién elegir?")
                            .font(GType.section)
                            .foregroundStyle(p.ink)
                        NavigationLink {
                            ProfesorMatchView(onAdded: onSelect)
                        } label: {
                            GCard(radius: 18, padding: 14) {
                                ProfesorActionRow(
                                    symbol: "magnifyingglass",
                                    title: "Encontrar un profesor",
                                    subtitle: "5 preguntas y te mostramos los profesores de Golflet que mejor te quedan",
                                    padded: false
                                )
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("profesores-encontrar")
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-agregar-profesor")
        .safeAreaInset(edge: .top) {
            if showsClose {
                closeBar(dismiss: dismiss, id: "close-agregar-profesor")
            } else {
                MetricBackBar()
            }
        }
        .onChange(of: query) { _, _ in
            scheduleSearch()
        }
    }

    private var needle: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func scheduleSearch() {
        searchGeneration += 1
        let generation = searchGeneration
        let value = needle
        guard value.count >= 2 else {
            results = []
            isSearching = false
            help = "Escribí al menos 2 letras. Tocá un profesor para agregarlo: no ve nada tuyo hasta que lo actives."
            return
        }
        isSearching = true
        Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            guard generation == searchGeneration else { return }
            let found = await model.searchProfesores(query: value)
            guard generation == searchGeneration else { return }
            results = found
            isSearching = false
            if found.isEmpty {
                help = "Probá con otra parte del nombre o con su matrícula."
            } else {
                help = found.count == 1 ? "1 profesor" : "\(found.count) profesores"
            }
        }
    }

    private func searchRow(_ profesor: Profesor) -> some View {
        Button {
            Task { await pick(profesor) }
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
                        Text(profesor.locationsLine ?? (profesor.pending ? "Todavía no activó su cuenta" : "Sin lugares cargados"))
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    Spacer()
                    Text(profesor.linked ? "Ya está" : (addingID == profesor.id ? "…" : "Agregar"))
                        .font(GType.label)
                        .foregroundStyle(profesor.linked ? p.ink3 : p.primary)
                    MetricChevron(color: p.ink3)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(addingID != nil)
        .accessibilityIdentifier(profesor.linked ? "home-profesor-\(profesor.id)" : "add-profesor-\(profesor.id)")
    }

    private func pick(_ profesor: Profesor) async {
        if profesor.linked {
            dismiss()
            onSelect(profesor)
            return
        }
        addingID = profesor.id
        if let added = await model.addProfesor(id: profesor.id) {
            dismiss()
            onSelect(added)
        }
        addingID = nil
    }
}

struct ProfesorMatchView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    var onAdded: (Profesor) -> Void

    @State private var step = 1
    @State private var answers = ProfesorMatchAnswers.empty
    @State private var matches: [ProfesorMatch] = []
    @State private var showsResults = false
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var addingID: String?

    var body: some View {
        GScreen(id: "screen-encontrar-profesor") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 18) {
                    VStack(alignment: .leading, spacing: 6) {
                        GOverline(text: "Encontrar un profesor")
                        if showsResults {
                            GTitle(text: resultsTitle, size: 30)
                        } else {
                            Text("Paso \(step) de 5")
                                .font(GType.label)
                                .foregroundStyle(p.ink3)
                            GTitle(text: ProfesorMatchOptions.questions[step - 1], size: 30)
                        }
                    }

                    if isLoading {
                        Text("Cargando…")
                            .font(GType.body)
                            .foregroundStyle(p.ink3)
                    } else if showsResults {
                        resultsBody
                    } else {
                        stepBody
                        navRow
                    }

                    if let error = model.errorMessage {
                        Text(error)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
        }
        .accessibilityIdentifier("screen-encontrar-profesor")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .task { await load() }
    }

    @ViewBuilder
    private var stepBody: some View {
        switch step {
        case 1:
            VStack(alignment: .leading, spacing: 12) {
                Text("Tocá los horarios que te sirven.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                availabilityGrid
            }
        case 2:
            VStack(alignment: .leading, spacing: 12) {
                Text(hcpHelp)
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                hcpStepper
            }
        case 3:
            chipGroup(options: ProfesorMatchOptions.playFreq, selected: answers.playFreq) { key in
                answers.playFreq = key
            }
        case 4:
            if answers.locationChoices.isEmpty {
                GCard(radius: 18, padding: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Todavía no hay lugares cargados")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text("Ningún profesor cargó dónde da clases. Podés seguir igual: no filtramos por lugar.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Elegí uno o más. Son los lugares donde dan clases los profesores de Golflet.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                    chipWrap(options: answers.locationChoices.map { ($0, $0) }, selected: Set(answers.locations)) { key in
                        if answers.locations.contains(key) {
                            answers.locations.removeAll { $0 == key }
                        } else {
                            answers.locations.append(key)
                        }
                    }
                }
            }
        default:
            VStack(alignment: .leading, spacing: 16) {
                Text("Por clase")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                chipGroup(options: ProfesorMatchOptions.budget, selected: answers.budget) { key in
                    answers.budget = key
                }
                Text("¿Cada cuánto?")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                chipGroup(options: ProfesorMatchOptions.classFreq, selected: answers.classFreq) { key in
                    answers.classFreq = key
                }
            }
        }
    }

    private var availabilityGrid: some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                Color.clear.frame(width: 36)
                ForEach(ProfesorMatchOptions.slots, id: \.0) { _, label in
                    Text(label)
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                        .frame(maxWidth: .infinity)
                }
            }
            ForEach(ProfesorMatchOptions.days, id: \.0) { day, label in
                HStack(spacing: 8) {
                    Text(label)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .frame(width: 36, alignment: .leading)
                    ForEach(ProfesorMatchOptions.slots, id: \.0) { slot, slotLabel in
                        let on = (answers.availability[day] ?? []).contains(slot)
                        Button {
                            toggleSlot(day: day, slot: slot)
                        } label: {
                            RoundedRectangle(cornerRadius: 10, style: .continuous)
                                .fill(on ? p.primary : p.surface2)
                                .frame(height: 36)
                                .overlay {
                                    if on {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(p.onPrimary)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("\(label) \(slotLabel)")
                        .accessibilityAddIdentifiers(["match-slot-\(day)-\(slot)"])
                    }
                }
            }
        }
        .accessibilityIdentifier("match-availability")
    }

    private var hcpStepper: some View {
        HStack(spacing: 16) {
            Button {
                bumpHcp(-1)
            } label: {
                Text("−")
                    .font(GType.statM)
                    .foregroundStyle(p.ink)
                    .frame(width: 48, height: 48)
                    .background(p.surface2)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("match-hcp-down")
            Text(answers.hcp.map(FormatAR.one) ?? "—")
                .font(GType.statL)
                .tabular()
                .foregroundStyle(p.ink)
                .frame(minWidth: 80)
                .accessibilityIdentifier("match-hcp")
            Button {
                bumpHcp(1)
            } label: {
                Text("+")
                    .font(GType.statM)
                    .foregroundStyle(p.ink)
                    .frame(width: 48, height: 48)
                    .background(p.surface2)
                    .clipShape(Circle())
            }
            .accessibilityIdentifier("match-hcp-up")
        }
    }

    private var navRow: some View {
        HStack(spacing: 12) {
            if step > 1 {
                Button("Atrás") { step -= 1 }
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity)
                    .background(p.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityIdentifier("match-back")
            } else {
                Button("Cancelar") { dismiss() }
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .padding(.vertical, 14)
                    .frame(maxWidth: .infinity)
                    .background(p.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .accessibilityIdentifier("match-cancel")
            }
            Button(step == 5 ? "Ver profesores" : "Siguiente") {
                Task { await advance() }
            }
            .font(GType.headline)
            .foregroundStyle(p.onPrimary)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(p.primary)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .disabled(isSaving)
            .accessibilityIdentifier("match-next")
        }
        .buttonStyle(.plain)
    }

    private var resultsBody: some View {
        VStack(alignment: .leading, spacing: 14) {
            if matches.isEmpty {
                GCard(radius: 18, padding: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Probá con más horarios o lugares")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text("Solo te mostramos profesores reales de Golflet. A medida que se sumen, van a aparecer acá.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
                .accessibilityIdentifier("match-empty")
            } else {
                ForEach(matches) { match in
                    matchCard(match)
                }
            }
            Button("Editar respuestas") {
                showsResults = false
                step = 1
            }
            .font(GType.headline)
            .foregroundStyle(p.ink)
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(p.surface2)
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("match-edit")
            Text("Tus respuestas son privadas: los profesores no las ven. Al agregar uno, “Puede ver mis métricas” queda apagado.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
    }

    private func matchCard(_ match: ProfesorMatch) -> some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    HomeHcpAvatar(
                        url: match.profesor.photoURL,
                        initials: match.profesor.initials,
                        size: 44,
                        fill: p.primary,
                        ink: p.onPrimary,
                        ring: Color(hex: HomeHcpPeopleLayout.celeste),
                        verified: match.profesor.verified
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(match.profesor.name)
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text(matchSubtitle(match))
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    Spacer()
                }
                if !match.reasons.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(match.reasons, id: \.self) { reason in
                            Text("· \(reason)")
                                .font(GType.label)
                                .foregroundStyle(p.ink2)
                        }
                    }
                }
                if match.profesor.pending {
                    Text("Todavía no activó su cuenta: lo agregás igual y ve tus datos solo cuando lo actives.")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
                if match.profesor.linked {
                    Button("Ya está en tus profesores") {
                        dismiss()
                        onAdded(match.profesor)
                    }
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(p.surface2)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityIdentifier("home-profesor-\(match.profesor.id)")
                } else {
                    Button(addingID == match.profesor.id ? "…" : "Agregar") {
                        Task { await addMatch(match) }
                    }
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(p.primary)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .disabled(addingID != nil)
                    .accessibilityIdentifier("add-profesor-\(match.profesor.id)")
                }
            }
        }
        .accessibilityIdentifier("match-\(match.profesor.id)")
    }

    private var resultsTitle: String {
        if matches.isEmpty { return "Todavía no hay un profesor que coincida" }
        if matches.count == 1 { return "Encontramos un profesor para vos" }
        return "Encontramos \(matches.count) profesores para vos"
    }

    private var hcpHelp: String {
        if let suggested = answers.suggestedHcp {
            return "Lo tomamos de tu índice oficial (\(FormatAR.one(suggested))). Cambialo si querés."
        }
        return "Si no tenés hándicap, poné uno aproximado."
    }

    private func matchSubtitle(_ match: ProfesorMatch) -> String {
        var parts: [String] = []
        if let line = match.profesor.locationsLine {
            parts.append(line)
        } else {
            parts.append("Sin lugares cargados")
        }
        if let min = match.priceMin, let max = match.priceMax, min != max {
            parts.append("$\(min.formatted(.number.locale(Locale(identifier: "es_AR")))) a $\(max.formatted(.number.locale(Locale(identifier: "es_AR")))) por clase")
        } else if let price = match.priceMin ?? match.priceMax {
            parts.append("$\(price.formatted(.number.locale(Locale(identifier: "es_AR")))) por clase")
        }
        return parts.joined(separator: " · ")
    }

    private func chipGroup(options: [(String, String)], selected: String?, onPick: @escaping (String) -> Void) -> some View {
        chipWrap(options: options, selected: selected.map { Set([$0]) } ?? []) { key in
            onPick(key)
        }
    }

    private func chipWrap(options: [(String, String)], selected: Set<String>, onPick: @escaping (String) -> Void) -> some View {
        FlexibleChipRow(options: options, selected: selected, onPick: onPick)
    }

    private func toggleSlot(day: String, slot: String) {
        var current = answers.availability[day] ?? []
        if current.contains(slot) {
            current.removeAll { $0 == slot }
        } else {
            current.append(slot)
        }
        if current.isEmpty {
            answers.availability[day] = nil
        } else {
            answers.availability[day] = current
        }
    }

    private func bumpHcp(_ delta: Double) {
        let current = answers.hcp ?? answers.suggestedHcp ?? 18
        answers.hcp = min(54, max(-10, (current + delta).rounded(toPlaces: 1)))
    }

    private func load() async {
        isLoading = true
        answers = await model.profesorMatchAnswers()
        if answers.hcp == nil {
            answers.hcp = answers.suggestedHcp
        }
        isLoading = false
    }

    private func advance() async {
        isSaving = true
        let ok = await model.saveProfesorMatchAnswers(answers)
        isSaving = false
        guard ok else { return }
        if step < 5 {
            step += 1
            return
        }
        matches = await model.profesorMatches()
        showsResults = true
    }

    private func addMatch(_ match: ProfesorMatch) async {
        addingID = match.profesor.id
        if let added = await model.addProfesor(id: match.profesor.id, source: "match") {
            dismiss()
            onAdded(added)
        }
        addingID = nil
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

private struct ProfesorAccountRow: View {
    @Environment(\.palette) private var p
    let profesor: Profesor
    let id: String

    var body: some View {
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
            if profesor.newContent > 0 {
                Text(profesor.newContent == 1 ? "1 nuevo" : "\(profesor.newContent) nuevos")
                    .font(GType.label)
                    .foregroundStyle(p.primary)
            }
            MetricChevron(color: p.ink3)
        }
        .padding(14)
        .contentShape(Rectangle())
        .accessibilityIdentifier(id)
    }
}

private struct ProfesorActionRow: View {
    @Environment(\.palette) private var p
    var symbol: String
    var title: String
    var subtitle: String
    var padded = true

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(p.surface2)
                Image(systemName: symbol)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(p.ink2)
            }
            .frame(width: 44, height: 44)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text(subtitle)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .multilineTextAlignment(.leading)
            }
            Spacer()
            MetricChevron(color: p.ink3)
        }
        .padding(padded ? 14 : 0)
        .contentShape(Rectangle())
    }
}

private struct FlexibleChipRow: View {
    @Environment(\.palette) private var p
    let options: [(String, String)]
    let selected: Set<String>
    var onPick: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(options, id: \.0) { key, label in
                let on = selected.contains(key)
                Button {
                    onPick(key)
                } label: {
                    Text(label)
                        .font(GType.headline)
                        .foregroundStyle(on ? p.onPrimary : p.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(on ? p.primary : p.surface2)
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("match-opt-\(key)")
            }
        }
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let factor = pow(10.0, Double(places))
        return (self * factor).rounded() / factor
    }
}

private extension View {
    func accessibilityAddIdentifiers(_ ids: [String]) -> some View {
        accessibilityIdentifier(ids.joined(separator: " "))
    }
}
