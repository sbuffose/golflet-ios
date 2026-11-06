import SwiftUI
import UserNotifications

/// Matrícula is the first screen. Sync runs on its own. The ficha is shown only after it lands.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
    @State private var phase: Phase = .matricula
    @State private var primed = false
    @State private var draft = OnboardingState()
    @State private var asks: [OnboardingAsk] = []
    @State private var matricula = ""
    @State private var clave = ""
    @State private var savePassword = true
    @State private var wheel = 140

    private enum Phase: Equatable {
        case matricula
        case syncing
        case reveal
        case ask(Int)
        case notifications
        case plan
    }

    var body: some View {
        GScreen(id: "screen-onboarding") {
            VStack(spacing: 0) {
                topBar
                Group {
                    switch phase {
                    case .matricula: matriculaForm
                    case .syncing: syncing
                    case .reveal: reveal
                    case .ask(let index): question(index)
                    case .notifications: notifications
                    case .plan: plan
                    }
                }
                .id(phaseKey)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                .transition(.opacity.combined(with: .move(edge: .trailing)))
            }
            .padding(.horizontal, 22)
            .background(p.bg.ignoresSafeArea())
        }
        .animation(motion, value: phaseKey)
        .onAppear(perform: prime)
        .onChange(of: model.hasPlayerSnapshot) { _, ready in
            guard phase == .syncing, ready else { return }
            landAfterSync()
        }
        .onChange(of: model.syncSession?.outcome) { _, outcome in
            guard phase == .syncing else { return }
            if outcome == .failed || outcome == .succeeded {
                landAfterSync()
            }
        }
        .onChange(of: model.needsClub != nil) { _, needed in
            guard phase == .syncing, needed else { return }
            landAfterSync()
        }
        .onChange(of: model.authFailure != nil) { _, failed in
            guard phase == .syncing, failed else { return }
            landAfterSync()
        }
    }

    private var phaseKey: String {
        switch phase {
        case .matricula: return "matricula"
        case .syncing: return "syncing"
        case .reveal: return "reveal"
        case .ask(let index): return "ask-\(index)"
        case .notifications: return "notifications"
        case .plan: return "plan"
        }
    }

    private var topBar: some View {
        HStack {
            if showsBack {
                Button(action: goBack) {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Color(hex: BrandHex.navy))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(p.surface))
                }
                .accessibilityIdentifier("ob-back")
            }
            Spacer()
            Button(action: finish) {
                Text("Saltar")
                    .font(GType.headline)
                    .foregroundStyle(p.ink2)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-skip")
        }
        .padding(.top, 8)
    }

    private var showsBack: Bool {
        switch phase {
        case .matricula, .syncing: return false
        default: return true
        }
    }

    private var matriculaForm: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 18) {
                Text("¿Cuál es tu matrícula?")
                    .font(GType.sheetTitle)
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .accessibilityIdentifier("ob-matricula-title")
                Text("La contraseña es la de tu club. Con eso traigo tu ficha: hándicap, club y tarjetas.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                GField(label: "Matrícula") {
                    TextField("Tu número de matrícula", text: $matricula)
                        .keyboardType(.numberPad)
                        .textContentType(RuntimeFlags.isUITesting ? nil : .username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("ob-matricula")
                }
                GField(label: "Contraseña") {
                    SecureField("La de tu club", text: $clave)
                        .textContentType(RuntimeFlags.isUITesting ? nil : .password)
                        .accessibilityIdentifier("ob-clave")
                }
                Toggle(isOn: $savePassword) {
                    Text("Guardar la contraseña para traer las tarjetas nuevas")
                        .font(GType.body)
                        .foregroundStyle(p.ink)
                }
                .tint(Color(hex: BrandHex.red))
                if let payload = model.needsClub {
                    ClubPickerBlock(payload: payload) { club in
                        Task { await pick(club) }
                    }
                } else {
                    Button {
                        Task { await model.revealClubPicker() }
                    } label: {
                        Text("¿Tu club no aparece? Elegilo")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                    .buttonStyle(.plain)
                }
                if let failure = model.authFailure {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(failure.message)
                            .font(GType.body)
                            .foregroundStyle(p.negative)
                            .accessibilityIdentifier(failure.bannerID)
                        if let hint = failure.hint, !hint.isEmpty {
                            Text(hint).font(GType.label).foregroundStyle(p.ink2)
                        }
                    }
                } else if let error = model.errorMessage, !error.isEmpty {
                    Text(error)
                        .font(GType.label)
                        .foregroundStyle(p.negative)
                        .accessibilityIdentifier("ob-auth-error")
                }
                Button {
                    Task { await submit() }
                } label: {
                    pill("Entrar")
                }
                .buttonStyle(.plain)
                .disabled(submitDisabled)
                .accessibilityIdentifier("ob-submit")
                RobertoGuide(small: true)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
            }
            .padding(.top, 12)
            .padding(.bottom, 28)
        }
    }

    private var submitDisabled: Bool {
        if model.isBusy { return true }
        return matricula.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || clave.isEmpty
    }

    private var syncing: some View {
        OnboardingSyncWait(
            progress: model.syncSession?.progress,
            reduceMotion: reduceMotion || voiceOver
        )
    }

    private var reveal: some View {
        VStack(alignment: .leading, spacing: 18) {
            TypeLines(
                lines: revealLines,
                reduceMotion: reduceMotion || voiceOver,
                ink: Color(hex: BrandHex.navy),
                size: GType.section
            )
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            Button {
                beginQuestions()
            } label: {
                pill("Seguir")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-reveal-next")
            .padding(.bottom, 12)
        }
        .padding(.top, 12)
    }

    private var revealLines: [String] {
        guard let facts else {
            return ["Entré con tu matrícula."]
        }
        return OnboardingPlan.revealLines(for: facts)
    }

    private var facts: OnboardingFacts? {
        guard model.isSignedIn, model.hasPlayerSnapshot else { return nil }
        return OnboardingPlan.make(
            profile: model.profile,
            clubs: model.clubs,
            rounds: model.rounds,
            bag: model.bag
        )
    }

    @ViewBuilder
    private func question(_ index: Int) -> some View {
        if asks.indices.contains(index) {
            let ask = asks[index]
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    TypeLines(
                        lines: [prompt(ask)],
                        reduceMotion: reduceMotion || voiceOver,
                        ink: Color(hex: BrandHex.navy),
                        size: GType.section
                    )
                    .accessibilityIdentifier("ob-question")
                    if ask == .bag {
                        bagBody
                    } else if ask == .iron {
                        ironBody
                    } else {
                        VStack(spacing: 8) {
                            ForEach(options(ask), id: \.0) { option in
                                Button {
                                    apply(ask, option.0)
                                    advance()
                                } label: {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(option.1).font(GType.headline).foregroundStyle(p.ink)
                                        if let detail = option.2 {
                                            Text(detail).font(GType.label).foregroundStyle(p.ink3)
                                        }
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(16)
                                    .background(p.surface)
                                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                }
                                .buttonStyle(.plain)
                                .accessibilityIdentifier("ob-opt-\(option.0)")
                            }
                        }
                        .transition(.opacity)
                    }
                }
                .padding(.bottom, 24)
            }
            .padding(.top, 8)
        }
    }

    private var bagBody: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("\(draft.bag.count) / 14")
                .font(GType.headline)
                .foregroundStyle(draft.bag.count >= 14 ? p.accentInk : p.ink)
                .accessibilityIdentifier("ob-bag-count")
            VStack(alignment: .leading, spacing: 12) {
                ForEach(PrototypeBag.groups, id: \.0) { group in
                    Text(group.0).font(GType.overline).foregroundStyle(p.ink3)
                    FlexibleChips(codes: group.1, selected: draft.bag) { toggleBag($0) }
                }
            }
            Button { advance() } label: { pill("Seguir") }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ob-bag-next")
        }
    }

    private var ironBody: some View {
        VStack(spacing: 12) {
            Text("Así calculo el resto de la bolsa.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
            Picker("Unidad", selection: $draft.unit) {
                Text("Metros").tag("m")
                Text("Yardas").tag("yd")
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("ob-unit")
            Picker("Distancia", selection: $wheel) {
                ForEach(Array(stride(from: 90, through: 200, by: 1)), id: \.self) { value in
                    Text("\(value) \(draft.unit == "m" ? "m" : "yd")").tag(value)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 150)
            .accessibilityIdentifier("ob-i7-wheel")
            Button {
                draft.i7 = draft.unit == "yd" ? Int((Double(wheel) / 1.0936).rounded()) : wheel
                advance()
            } label: { pill("Seguir") }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-i7-next")
            Button("No sé, lo mido jugando") {
                draft.i7 = nil
                advance()
            }
            .font(GType.headline)
            .foregroundStyle(p.ink2)
        }
    }

    private var notifications: some View {
        VStack(alignment: .leading, spacing: 16) {
            TypeLines(
                lines: ["Te aviso cuando tus amigos salgan y cuando sea hora de practicar."],
                reduceMotion: reduceMotion || voiceOver,
                ink: Color(hex: BrandHex.navy),
                size: GType.section
            )
            Text("Solo tu próximo tee time, tus partidos y tu plan.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
            Spacer()
            Button {
                draft.notifications = true
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
                advance()
            } label: { pill("Activar avisos") }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-notif-yes")
            Button("Ahora no") {
                draft.notifications = false
                advance()
            }
            .font(GType.headline)
            .foregroundStyle(p.ink2)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("ob-notif-no")
            .padding(.bottom, 12)
        }
        .padding(.top, 12)
    }

    private var plan: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(planTitle)
                .font(GType.sheetTitle)
                .foregroundStyle(Color(hex: BrandHex.navy))
                .accessibilityIdentifier("ob-plan-title")
            VStack(alignment: .leading, spacing: 12) {
                planRow(1, "Encontrá dónde se te escapan los golpes.")
                planRow(2, "Practicá lo que más te cuesta esta semana.")
                planRow(3, "Jugá con tus amigos y llevá la cuenta.")
            }
            Spacer()
            Button(action: finish) { pill("Entrar a Golflet") }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ob-done")
                .padding(.bottom, 12)
        }
        .padding(.top, 12)
    }

    private var planTitle: String {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "Listo. Armé tu inicio." }
        let first = name.split(separator: " ").first.map(String.init) ?? name
        return "\(first), armé tu inicio."
    }

    private func planRow(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(GType.headline)
                .foregroundStyle(Color.white)
                .frame(width: 26, height: 26)
                .background(Circle().fill(Color(hex: BrandHex.red)))
            Text(text).font(GType.body).foregroundStyle(p.ink)
        }
    }

    private func pill(_ title: String) -> some View {
        Text(title)
            .font(GType.headline)
            .foregroundStyle(Color.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(Color(hex: BrandHex.red))
            .clipShape(Capsule())
    }

    private var motion: Animation? {
        reduceMotion ? nil : .easeInOut(duration: 0.45)
    }

    private func prime() {
        guard !primed else { return }
        primed = true
        draft = model.onboarding
        wheel = draft.i7 ?? 140
        if matricula.isEmpty { matricula = model.lastLinkMatricula }
    }

    private func submit() async {
        go(.syncing)
        await model.signInGolfistics(matricula: matricula, clave: clave, savePassword: savePassword)
        landAfterSync()
    }

    private func pick(_ club: ClubCatalogEntry) async {
        go(.syncing)
        await model.retryLinkWithClub(club)
        landAfterSync()
    }

    private func landAfterSync() {
        let route = OnboardingPlan.routeAfterSync(
            signedIn: model.isSignedIn,
            hasSnapshot: model.hasPlayerSnapshot,
            needsClub: model.needsClub != nil,
            authFailed: model.authFailure != nil
        )
        go(route == .reveal ? .reveal : .matricula)
    }

    private func beginQuestions() {
        let known = facts ?? OnboardingFacts(
            name: "",
            handicap: nil,
            clubName: nil,
            roundCount: 0,
            firstRound: nil,
            roundsPerYear: nil,
            averageGross: nil,
            hasBag: false,
            hasDistances: false
        )
        if draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            draft.name = known.name
        }
        if draft.score.isEmpty, let band = known.scoreBand { draft.score = band }
        if draft.frec.isEmpty, let cadence = known.cadence { draft.frec = cadence }
        asks = OnboardingPlan.asks(for: known)
        go(asks.isEmpty ? .notifications : .ask(0))
    }

    private func advance() {
        switch phase {
        case .ask(let index):
            go(index + 1 < asks.count ? .ask(index + 1) : .notifications)
        case .notifications:
            go(.plan)
        default:
            break
        }
    }

    private func goBack() {
        switch phase {
        case .reveal:
            go(.matricula)
        case .ask(let index):
            go(index == 0 ? .reveal : .ask(index - 1))
        case .notifications:
            go(asks.isEmpty ? .reveal : .ask(asks.count - 1))
        case .plan:
            go(.notifications)
        case .matricula, .syncing:
            break
        }
    }

    private func go(_ next: Phase) {
        withAnimation(motion) { phase = next }
    }

    private func prompt(_ ask: OnboardingAsk) -> String {
        switch ask {
        case .score: return "¿Cuánto hacés normalmente?"
        case .frec: return "¿Cada cuánto jugás?"
        case .meta: return "¿Qué haría que esta temporada sea un éxito?"
        case .debil: return "¿Qué sentís que te está frenando?"
        case .modo: return "¿Qué querés ver primero en el inicio?"
        case .bag: return "Armá tu bolsa."
        case .iron: return "¿A cuánto le pegás con el hierro 7?"
        }
    }

    private func options(_ ask: OnboardingAsk) -> [(String, String, String?)] {
        switch ask {
        case .score:
            return [
                ("100", "Más de 100", nil), ("90", "Entre 90 y 99", nil),
                ("80", "Entre 80 y 89", nil), ("70", "79 o menos", nil), ("ns", "No sé todavía", nil)
            ]
        case .frec:
            return [
                ("semana", "Todas las semanas", nil), ("mes", "Algunas veces por mes", nil),
                ("unames", "Una vez por mes", nil), ("cuando", "Cuando puedo", nil)
            ]
        case .meta:
            return [
                ("tgt", "Bajar golpes", nil), ("reg", "Ser más regular", nil),
                ("amigos", "Ganarles a mis amigos", nil), ("fun", "Divertirme más", nil)
            ]
        case .debil:
            return [
                ("salida", "Las salidas", nil), ("approach", "Los golpes al green", nil),
                ("corto", "El juego corto", nil), ("putt", "El putt", nil), ("ns", "Ni idea", nil)
            ]
        case .modo:
            return ProfileMode.allCases.map { ($0.rawValue, $0.title, $0.blurb) }
        case .bag, .iron:
            return []
        }
    }

    private func apply(_ ask: OnboardingAsk, _ value: String) {
        switch ask {
        case .score: draft.score = value
        case .frec: draft.frec = value
        case .meta: draft.meta = value
        case .debil: draft.debil = value
        case .modo:
            draft.modo = value
            if let mode = ProfileMode(rawValue: value) { model.setHomeMode(mode) }
        case .bag, .iron:
            break
        }
    }

    private func toggleBag(_ code: String) {
        if let idx = draft.bag.firstIndex(of: code) {
            draft.bag.remove(at: idx)
        } else if draft.bag.count < 14 {
            draft.bag.append(code)
        }
    }

    private func finish() {
        if let facts {
            if draft.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                draft.name = facts.name
            }
            if draft.score.isEmpty, let band = facts.scoreBand { draft.score = band }
            if draft.frec.isEmpty, let cadence = facts.cadence { draft.frec = cadence }
        }
        draft.done = true
        if let mode = ProfileMode(rawValue: draft.modo) { model.setHomeMode(mode) }
        model.completeOnboarding(draft)
    }
}

/// Espera de la matrícula. Las frases salen de a una. Si Golfistics manda
/// etapa, esa frase reemplaza a la del mismo paso. No afirma resultados.
private struct OnboardingSyncWait: View {
    var progress: SyncAPIProgress?
    var reduceMotion: Bool
    @State private var stage = 1

    var body: some View {
        let lines = OnboardingSyncCopy.lines(progress: progress, elapsedStages: stage)
        VStack(alignment: .leading, spacing: 18) {
            RobertoGuide(small: true, thinking: true)
                .frame(maxWidth: .infinity)
            SyncStatusLines(lines: lines, reduceMotion: reduceMotion)
            Spacer(minLength: 0)
        }
        .padding(.top, 8)
        .task(id: reduceMotion) {
            if reduceMotion {
                stage = OnboardingSyncCopy.waiting.count
                return
            }
            stage = 1
            while !Task.isCancelled, stage < OnboardingSyncCopy.waiting.count {
                try? await Task.sleep(for: .milliseconds(RuntimeFlags.isUITesting ? 220 : 1100))
                if Task.isCancelled { return }
                stage += 1
            }
        }
    }
}

private struct SyncStatusLines: View {
    var lines: [String]
    var reduceMotion: Bool
    @State private var shown = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(lines.prefix(max(shown, 0)).enumerated()), id: \.offset) { index, line in
                let current = index == min(shown, lines.count) - 1
                HStack(alignment: .top, spacing: 10) {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(current ? Color(hex: BrandHex.red) : Color(hex: BrandHex.navy).opacity(0.28))
                        .frame(width: 3)
                    Text(line)
                        .font(current ? GType.section : GType.body)
                        .foregroundStyle(current ? Color(hex: BrandHex.navy) : Color(hex: BrandHex.navyRaised))
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityIdentifier("ob-sync-line")
                .accessibilityLabel(line)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("ob-sync-status")
        .onAppear { reveal(upTo: lines.count) }
        .onChange(of: lines.count) { _, count in
            reveal(upTo: count)
        }
    }

    private func reveal(upTo count: Int) {
        if reduceMotion || count <= shown {
            shown = count
            return
        }
        withAnimation(.easeOut(duration: 0.45)) { shown = count }
    }
}

private struct TypeLines: View {
    var lines: [String]
    var reduceMotion: Bool
    var ink: Color
    var size: Font
    @State private var shown = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(Array(lines.prefix(shown).enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(size)
                    .foregroundStyle(ink)
                    .fixedSize(horizontal: false, vertical: true)
                    .transition(.opacity.combined(with: .offset(y: 10)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.45), value: shown)
        .task(id: lines.joined(separator: "\n")) {
            if reduceMotion {
                shown = lines.count
                return
            }
            shown = 0
            for index in lines.indices {
                try? await Task.sleep(for: .milliseconds(index == 0 ? 120 : 380))
                shown = index + 1
            }
        }
    }
}

private struct FlexibleChips: View {
    @Environment(\.palette) private var p
    var codes: [String]
    var selected: [String]
    var onTap: (String) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 64), spacing: 6)], spacing: 6) {
            ForEach(codes, id: \.self) { code in
                let on = selected.contains(code)
                Button { onTap(code) } label: {
                    Text(PrototypeBag.chip(code))
                        .font(GFont.ui(13, weight: .semibold))
                        .foregroundStyle(on ? Color.white : p.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(on ? Color(hex: BrandHex.navy) : p.surface2)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ob-club-\(code)")
            }
        }
    }
}
