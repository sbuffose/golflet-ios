import SwiftUI
import UserNotifications

struct OnboardingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var step = 0
    @State private var draft = OnboardingState()
    @State private var chatLines: [String] = []
    @State private var thinking = false
    @State private var wheel = 140

    private let questions: [(key: String, prompt: String, options: [(String, String, String?)])] = [
        ("score", "Contame la verdad, no se lo digo a nadie: ¿cuánto hacés normalmente?", [
            ("100", "Más de 100", nil), ("90", "Entre 90 y 99", nil), ("80", "Entre 80 y 89", nil),
            ("70", "79 o menos", nil), ("ns", "No sé todavía", nil)
        ]),
        ("meta", "¿Qué haría que esta temporada sea un éxito?", [
            ("tgt", "Bajar golpes", nil), ("reg", "Ser más regular", nil),
            ("amigos", "Ganarles a mis amigos", nil), ("fun", "Divertirme más", nil)
        ]),
        ("debil", "¿Qué sentís que te está frenando?", [
            ("salida", "Las salidas", nil), ("approach", "Los golpes al green", nil),
            ("corto", "El juego corto", nil), ("putt", "El putt", nil), ("ns", "Ni idea", nil)
        ]),
        ("frec", "¿Cada cuánto jugás o practicás?", [
            ("semana", "Todas las semanas", nil), ("mes", "Algunas veces por mes", nil),
            ("unames", "Una vez por mes", nil), ("cuando", "Cuando puedo", nil)
        ]),
        ("modo", "¿Y qué buscás en el golf? Así armo tu inicio.",
         ProfileMode.allCases.map { ($0.rawValue, $0.title, $0.blurb) }),
        ("edad", "¿Cuántos años tenés?", [
            ("24", "Menos de 25", nil), ("34", "25 a 34", nil), ("44", "35 a 44", nil),
            ("54", "45 a 54", nil), ("64", "55 a 64", nil), ("65", "65 o más", nil)
        ]),
        ("genero", "Para el hándicap y las salidas, ¿cuál es tu género?", [
            ("h", "Hombre", nil), ("m", "Mujer", nil), ("x", "Prefiero no decirlo", nil)
        ]),
        ("mano", "¿Para qué lado pegás?", [
            ("d", "Diestro", nil), ("z", "Zurdo", nil)
        ])
    ]

    var body: some View {
        GScreen(id: "screen-onboarding") {
            VStack(spacing: 0) {
                topBar
                Group {
                    switch step {
                    case 0: welcome
                    case 1...8: chatStep
                    case 9: nameStep
                    case 10: hook
                    case 11: tour
                    case 12: bagStep
                    case 13: wheelStep
                    case 14: notifStep
                    default: planStep
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            }
            .padding(.horizontal, 20)
            .background(step == 10 || step == 11 ? Color(hex: 0x0B2545) : p.bg)
        }
        .accessibilityIdentifier("screen-onboarding")
        .onAppear {
            draft = model.onboarding
            wheel = draft.i7 ?? 140
            if step == 0 { pushWelcome() }
        }
    }

    private var topBar: some View {
        HStack {
            if step > 0 {
                Button {
                    withAnimation(motion) { step -= 1 }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 16, weight: .semibold))
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(p.surface))
                }
                .accessibilityIdentifier("ob-back")
            }
            Spacer()
            Button(action: finish) {
                Text("Saltar")
                    .font(GType.headline)
                    .foregroundStyle(step >= 10 && step <= 11 ? Color.white : p.ink2)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 8)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-skip")
        }
        .padding(.top, 8)
    }

    private var welcome: some View {
        VStack(spacing: 18) {
            RobertoGuide(thinking: thinking)
            Text("roberto-guide")
                .font(.system(size: 1))
                .foregroundStyle(.clear)
                .frame(width: 1, height: 1)
                .accessibilityIdentifier("roberto-guide")
            Text("Hola, soy Roberto")
                .font(GType.sheetTitle)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("ob-welcome-title")
            Text("Tu caddie en Golflet. Te voy a hacer unas preguntas y armo tu inicio.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
                .multilineTextAlignment(.center)
            Spacer()
            Button { go(1) } label: { pill("Empezar") }
                .accessibilityIdentifier("ob-start")
            Button(action: finish) {
                Text("Saltar")
                    .font(GType.headline)
                    .foregroundStyle(p.ink2)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ob-skip")
        }
        .padding(.top, 20)
    }

    private var chatStep: some View {
        let q = questions[step - 1]
        return VStack(alignment: .leading, spacing: 14) {
            RobertoGuide(small: true, thinking: thinking)
            ForEach(Array(chatLines.enumerated()), id: \.offset) { _, line in
                Text(line)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            Text(q.prompt)
                .font(GType.section)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("ob-question")
            VStack(spacing: 8) {
                ForEach(Array(q.options.enumerated()), id: \.offset) { _, opt in
                    Button {
                        apply(q.key, opt.0)
                        go(step + 1)
                    } label: {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(opt.1).font(GType.headline).foregroundStyle(p.ink)
                            if let d = opt.2 {
                                Text(d).font(GType.label).foregroundStyle(p.ink3)
                            }
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(p.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 14).stroke(p.hairline, lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("ob-opt-\(opt.0)")
                }
            }
            Spacer()
        }
        .padding(.top, 8)
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            RobertoGuide(small: true)
            Text("¿Cómo te llamás?")
                .font(GType.section)
                .foregroundStyle(p.ink)
            TextField("Tu nombre", text: $draft.name)
                .textContentType(.givenName)
                .padding(14)
                .background(p.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(p.hairline, lineWidth: 1))
                .accessibilityIdentifier("ob-name")
            Button { go(10) } label: { pill("Seguir") }
                .accessibilityIdentifier("ob-name-next")
            Button("Prefiero no decirlo") { draft.name = ""; go(10) }
                .font(GType.headline)
                .foregroundStyle(p.ink2)
                .frame(maxWidth: .infinity)
            Spacer()
        }
        .padding(.top, 8)
    }

    private var hook: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text((draft.displayName) + ", Golflet te va a ayudar a bajar golpes.")
                .font(GType.sheetTitle)
                .foregroundStyle(.white)
            Text("Hay una mala noticia y una buena.")
                .font(GType.body)
                .foregroundStyle(Color.white.opacity(0.8))
            Spacer()
            Button { go(11) } label: { pill("Contame", light: true) }
                .accessibilityIdentifier("ob-hook-next")
        }
        .padding(.top, 24)
    }

    private var tour: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("1. Marcá dónde quedó la pelota.")
                .font(GType.section)
                .foregroundStyle(.white)
                .accessibilityIdentifier("ob-tour-title")
            Text("Tocá dónde quedó. Sabés a cuánto quedaste del hoyo y qué te costó cada golpe.")
                .font(GType.body)
                .foregroundStyle(Color.white.opacity(0.8))
            RoundedRectangle(cornerRadius: 18)
                .fill(Color(hex: 0x4F8A5B))
                .frame(height: 220)
                .overlay(Text("Mapa del hoyo").foregroundStyle(.white).font(GType.headline))
            Spacer()
            Button { go(12) } label: { pill("Siguiente", light: true) }
                .accessibilityIdentifier("ob-tour-next")
        }
        .padding(.top, 16)
    }

    private var bagStep: some View {
        VStack(alignment: .leading, spacing: 10) {
            RobertoGuide(small: true)
            HStack {
                Text("Tu bolsa")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Text("\(draft.bag.count) / 14")
                    .font(GType.headline)
                    .foregroundStyle(draft.bag.count >= 14 ? Color(hex: 0xC8102E) : p.ink)
                    .tabular()
                    .accessibilityIdentifier("ob-bag-count")
            }
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(PrototypeBag.groups, id: \.0) { group in
                        Text(group.0).font(GType.overline).foregroundStyle(p.ink3)
                        FlexibleChips(codes: group.1, selected: draft.bag) { code in
                            toggleBag(code)
                        }
                    }
                }
            }
            Button { go(13) } label: { pill("Seguir") }
                .accessibilityIdentifier("ob-bag-next")
        }
        .padding(.top, 8)
    }

    private var wheelStep: some View {
        VStack(spacing: 12) {
            RobertoGuide(small: true)
            Text("¿A cuánto le pegás con el hierro 7?")
                .font(GType.section)
                .foregroundStyle(p.ink)
                .multilineTextAlignment(.center)
            Picker("Unidad", selection: $draft.unit) {
                Text("Metros").tag("m")
                Text("Yardas").tag("yd")
            }
            .pickerStyle(.segmented)
            .accessibilityIdentifier("ob-unit")
            Picker("Distancia", selection: $wheel) {
                ForEach(Array(stride(from: 90, through: 200, by: 1)), id: \.self) { v in
                    Text("\(v) \(draft.unit == "m" ? "m" : "yd")").tag(v)
                }
            }
            .pickerStyle(.wheel)
            .frame(height: 160)
            .accessibilityIdentifier("ob-i7-wheel")
            Button {
                draft.i7 = draft.unit == "yd" ? Int((Double(wheel) / 1.0936).rounded()) : wheel
                go(14)
            } label: { pill("Seguir") }
            .accessibilityIdentifier("ob-i7-next")
            Button("No sé, lo mido jugando") { draft.i7 = nil; go(14) }
                .font(GType.headline)
                .foregroundStyle(p.ink2)
        }
        .padding(.top, 8)
    }

    private var notifStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            RobertoGuide(small: true)
            Text("Te aviso cuando tus amigos salgan a la cancha y cuando sea hora de practicar el putt.")
                .font(GType.section)
                .foregroundStyle(p.ink)
            Text("Solo cosas útiles: tu próximo tee time, tus partidos y tu plan. Nada de publicidad.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
            Spacer()
            Button {
                draft.notifications = true
                UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
                go(15)
            } label: { pill("Activar avisos") }
            .accessibilityIdentifier("ob-notif-yes")
            Button("Ahora no") { draft.notifications = false; go(15) }
                .font(GType.headline)
                .foregroundStyle(p.ink2)
                .frame(maxWidth: .infinity)
                .accessibilityIdentifier("ob-notif-no")
        }
        .padding(.top, 8)
    }

    private var planStep: some View {
        VStack(alignment: .leading, spacing: 14) {
            RobertoGuide()
            Text("Estoy armando tu plan…")
                .font(GType.sheetTitle)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("ob-plan-title")
            VStack(alignment: .leading, spacing: 12) {
                planRow(1, "Encontrá dónde se te escapan los golpes.")
                planRow(2, "Practicá lo que más te cuesta esta semana.")
                planRow(3, "Jugá con tus amigos y llevá la cuenta.")
            }
            Spacer()
            Button { finish() } label: { pill("Entrar a Golflet") }
                .accessibilityIdentifier("ob-done")
        }
        .padding(.top, 16)
    }

    private func planRow(_ n: Int, _ text: String) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Text("\(n)")
                .font(GType.headline)
                .foregroundStyle(p.onPrimary)
                .frame(width: 26, height: 26)
                .background(Circle().fill(p.primary))
            Text(text).font(GType.body).foregroundStyle(p.ink)
        }
    }

    private func pill(_ title: String, light: Bool = false) -> some View {
        Text(title)
            .font(GType.headline)
            .foregroundStyle(light ? Color(hex: 0x0B2545) : p.onPrimary)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(light ? Color.white : p.primary)
            .clipShape(Capsule())
    }

    private var motion: Animation? {
        reduceMotion ? nil : .spring(response: 0.42, dampingFraction: 0.86)
    }

    private func go(_ next: Int) {
        withAnimation(motion) { step = next }
    }

    private func pushWelcome() {
        chatLines = []
    }

    private func apply(_ key: String, _ value: String) {
        switch key {
        case "score": draft.score = value
        case "meta": draft.meta = value
        case "debil": draft.debil = value
        case "frec": draft.frec = value
        case "modo":
            draft.modo = value
            if let mode = ProfileMode(rawValue: value) { model.setHomeMode(mode) }
        case "edad": draft.edad = value
        case "genero": draft.genero = value
        case "mano": draft.mano = value
        default: break
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
        draft.done = true
        if let mode = ProfileMode(rawValue: draft.modo) { model.setHomeMode(mode) }
        model.completeOnboarding(draft)
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
                        .foregroundStyle(on ? p.onPrimary : p.ink)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                        .background(on ? p.primary : p.surface2)
                        .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ob-club-\(code)")
            }
        }
    }
}
