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
            guard phase == .syncing, outcome == .succeeded else { return }
            landAfterSync()
        }
        .onChange(of: model.needsClub != nil) { _, needed in
            guard phase == .syncing, needed else { return }
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
                Text("Con tu matrícula y tu contraseña traigo tu ficha. No te la vuelvo a pedir.")
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
                    SecureField("La misma que para entrar a tu club", text: $clave)
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
            frame: OnboardingSyncCopy.frame(
                progress: model.syncSession?.progress,
                failed: model.syncSession?.outcome == .failed || model.authFailure != nil,
                message: model.authFailure?.message ?? model.syncSession?.errorMessage ?? model.errorMessage
            ),
            reduceMotion: reduceMotion || voiceOver
        ) {
            go(.matricula)
        }
    }

    private var reveal: some View {
        VStack(alignment: .leading, spacing: 22) {
            Spacer(minLength: 4)
            TypeLines(
                lines: revealLines,
                reduceMotion: reduceMotion || voiceOver,
                ink: Color(hex: BrandHex.navy),
                size: GType.section
            )
            Spacer(minLength: 16)
            Button {
                beginQuestions()
            } label: {
                pill("Seguir")
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-reveal-next")
            .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
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
        VStack(alignment: .leading, spacing: 18) {
            Spacer(minLength: 4)
            TypeLines(
                lines: ["Te aviso cuando tus amigos salgan y cuando sea hora de practicar."],
                reduceMotion: reduceMotion || voiceOver,
                ink: Color(hex: BrandHex.navy),
                size: GType.section
            )
            Text("Solo tu próximo tee time, tus partidos y tu plan.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
            Spacer(minLength: 16)
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
        let items = OnboardingPlanCards.items(facts: facts, groupCount: model.groups.count)
        return VStack(alignment: .leading, spacing: 0) {
            caddieGlow
                .frame(maxWidth: .infinity)
                .padding(.top, 4)
            Text(planTitle)
                .font(GType.sheetTitle)
                .foregroundStyle(Color(hex: BrandHex.navy))
                .fixedSize(horizontal: false, vertical: true)
                .padding(.top, 8)
                .accessibilityIdentifier("ob-plan-title")
            Spacer(minLength: 12)
            VStack(spacing: 14) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    planCard(index + 1, item)
                        .modifier(RiseIn(index: index, reduceMotion: reduceMotion || voiceOver))
                }
            }
            Spacer(minLength: 12)
            Button(action: finish) { pill("Entrar a Golflet") }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ob-done")
                .padding(.bottom, 8)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var caddieGlow: some View {
        ZStack {
            RadialGradient(
                colors: [Color(hex: BrandHex.navy).opacity(0.16), Color(hex: BrandHex.navy).opacity(0)],
                center: .center,
                startRadius: 8,
                endRadius: 92
            )
            .frame(width: 180, height: 140)
            RobertoGuide(small: true)
        }
        .accessibilityElement(children: .contain)
    }

    private var planTitle: String {
        let name = draft.name.trimmingCharacters(in: .whitespacesAndNewlines)
        if name.isEmpty { return "Listo. Armé tu inicio." }
        let first = name.split(separator: " ").first.map(String.init) ?? name
        return "\(first), armé tu inicio."
    }

    private func planCard(_ n: Int, _ item: OnboardingPlanItem) -> some View {
        HStack(alignment: .center, spacing: 12) {
            Text("\(n)")
                .font(GType.headline)
                .foregroundStyle(Color.white)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Color(hex: BrandHex.navy)))
            VStack(alignment: .leading, spacing: 4) {
                Text(item.title)
                    .font(GType.headline)
                    .foregroundStyle(Color(hex: BrandHex.navy))
                    .fixedSize(horizontal: false, vertical: true)
                Text(item.detail)
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            planFigure(item)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("ob-plan-card-\(n)")
    }

    @ViewBuilder
    private func planFigure(_ item: OnboardingPlanItem) -> some View {
        switch item.kind {
        case .index:
            Text(item.figure)
                .font(GFont.ui(32, weight: .semibold))
                .foregroundStyle(Color(hex: BrandHex.navy))
                .accessibilityIdentifier("ob-plan-index")
        case .club:
            if item.figure == "–" {
                Text("–")
                    .font(GFont.ui(32, weight: .semibold))
                    .foregroundStyle(Color(hex: BrandHex.navy))
            } else if let url = SyncClubIdentity.logoURL(planLogo(facts?.clubCode)) {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFit()
                    } else {
                        planMonogram(item.figure)
                    }
                }
                .frame(width: 52, height: 52)
                .background(Color.white)
                .clipShape(Circle())
            } else {
                planMonogram(item.figure)
            }
        case .friends:
            let faces = planFaces
            if faces.isEmpty {
                Text(item.figure)
                    .font(GFont.ui(32, weight: .semibold))
                    .foregroundStyle(Color(hex: BrandHex.navy))
            } else {
                HStack(spacing: -8) {
                    ForEach(faces, id: \.id) { member in
                        GroupPhotoView(url: member.photoURL, initials: member.initials, size: 32)
                    }
                }
                .accessibilityIdentifier("ob-plan-faces")
            }
        }
    }

    private var planFaces: [GroupMember] {
        var seen = Set<String>()
        var out: [GroupMember] = []
        for group in model.groups {
            for member in group.members where seen.insert(member.id).inserted {
                out.append(member)
                if out.count == 3 { return out }
            }
        }
        return out
    }

    private func planLogo(_ code: String?) -> String? {
        switch code {
        case "118": return "/clubs/118@2x.png"
        case "209": return "/clubs/209@2x.png"
        default: return nil
        }
    }

    private func planMonogram(_ name: String) -> some View {
        Text(SyncClubIdentity.initials(name: name))
            .font(GFont.ui(16, weight: .semibold))
            .foregroundStyle(Color.white)
            .frame(width: 52, height: 52)
            .background(Circle().fill(Color(hex: BrandHex.navy)))
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
        if model.authFailure != nil || model.syncSession?.outcome == .failed {
            return
        }
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

/// Una frase por vez, la de la etapa real. No adelanta el texto con un reloj.
private struct OnboardingSyncWait: View {
    var frame: OnboardingSyncFrame
    var reduceMotion: Bool
    var retry: () -> Void
    @State private var spin = false
    @State private var bounce = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Spacer(minLength: 8)
            ZStack {
                RadialGradient(
                    colors: [Color(hex: BrandHex.navy).opacity(0.18), Color.clear],
                    center: .center,
                    startRadius: 10,
                    endRadius: 88
                )
                .frame(width: 176, height: 150)
                RobertoGuide(small: true, thinking: true)
                    .offset(y: reduceMotion ? 0 : (bounce ? -5 : 4))
                Circle()
                    .trim(from: 0.08, to: 0.78)
                    .stroke(Color(hex: BrandHex.navy), style: StrokeStyle(lineWidth: 2.5, lineCap: .round, dash: [7, 6]))
                    .frame(width: 148, height: 148)
                    .rotationEffect(.degrees(reduceMotion ? 0 : (spin ? 360 : 0)))
            }
            .frame(maxWidth: .infinity)
            .padding(.bottom, 18)
            WordPhrase(text: frame.phrase, reduceMotion: reduceMotion)
            progressBar
                .padding(.top, 18)
            if !frame.done.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(frame.done, id: \.rawValue) { beat in
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(Color(hex: BrandHex.navy))
                            Text(beat.title)
                                .font(GType.label)
                                .foregroundStyle(Color(hex: BrandHex.navy))
                        }
                        .accessibilityIdentifier("ob-sync-done-\(beat.rawValue)")
                    }
                }
                .padding(.top, 14)
            }
            if let error = frame.error, !error.isEmpty {
                Text(error)
                    .font(GType.body)
                    .foregroundStyle(Color(hex: BrandHex.red))
                    .padding(.top, 16)
                    .accessibilityIdentifier("ob-sync-error")
                Button(action: retry) {
                    Text("Reintentar")
                        .font(GType.headline)
                        .foregroundStyle(Color(hex: BrandHex.navy))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ob-sync-retry")
            }
            Spacer(minLength: 12)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(Color(hex: 0xF5F5F5))
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.linear(duration: 1.6).repeatForever(autoreverses: false)) { spin = true }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) { bounce = true }
        }
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Color(hex: BrandHex.navy).opacity(0.12))
                Capsule()
                    .fill(Color(hex: BrandHex.navy))
                    .frame(width: max(6, geo.size.width * frame.fraction))
            }
        }
        .frame(height: 3)
        .accessibilityIdentifier("ob-sync-bar")
        .accessibilityValue("\(Int((frame.fraction * 100).rounded()))")
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.45), value: frame.fraction)
    }
}

private struct WordPhrase: View {
    var text: String
    var reduceMotion: Bool
    @State private var count = 0

    private var words: [String] { text.split(separator: " ").map(String.init) }

    private var visibleWords: [String] {
        if reduceMotion || RuntimeFlags.isUITesting { return words }
        return Array(words.prefix(count))
    }

    var body: some View {
        Text(visibleWords.joined(separator: " "))
            .font(GFont.ui(32, weight: .semibold))
            .foregroundStyle(Color(hex: BrandHex.navy))
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .opacity(count == 0 && !reduceMotion && !RuntimeFlags.isUITesting ? 0 : 1)
            .accessibilityIdentifier("ob-sync-phrase")
            .accessibilityLabel(text)
            .task(id: text) {
                let total = words.count
                if reduceMotion || RuntimeFlags.isUITesting {
                    count = total
                    return
                }
                count = 0
                for index in 1...max(total, 1) {
                    try? await Task.sleep(for: .milliseconds(25))
                    if Task.isCancelled { return }
                    withAnimation(.easeOut(duration: 0.18)) { count = min(index, total) }
                }
            }
    }
}

private struct RiseIn: ViewModifier {
    var index: Int
    var reduceMotion: Bool
    @State private var shown = false

    func body(content: Content) -> some View {
        content
            .opacity(shown || reduceMotion ? 1 : 0)
            .offset(y: shown || reduceMotion ? 0 : 12)
            .onAppear {
                if reduceMotion || RuntimeFlags.isUITesting {
                    shown = true
                    return
                }
                withAnimation(.easeOut(duration: 0.35).delay(0.08 * Double(index))) { shown = true }
            }
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
