import SwiftUI

struct PlayHubView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-jugar") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 16) {
                    HStack {
                        GOverline(text: "Jugar")
                        Spacer()
                        Button { model.showsClubs = true } label: { AvatarCircle(initials: model.profile.initials) }
                    }
                    Text("Jugar").font(GType.largeTitle).foregroundStyle(p.ink)

                    NavigationLink { AntesDeSalirView() } label: {
                        ProtoHero {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Empezar una vuelta").font(GType.overline).opacity(0.7)
                                Text("Cancha \(model.roundSettings.cancha) · \(model.roundSettings.tee) · \(model.roundSettings.hoyos == "18" ? "18 hoyos" : model.roundSettings.hoyos)")
                                    .font(GType.section)
                                Text("GPS, palo sugerido y tu partido en vivo ›").font(GType.label).opacity(0.8)
                            }
                        }
                    }
                    .accessibilityIdentifier("jugar-empezar")

                    NavigationLink { AntesDeSalirView() } label: {
                        Text("Configurar y empezar")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(p.primary)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("jugar-ajustes")

                    Text("Partido en curso").font(GType.section).foregroundStyle(p.ink)
                    if let round = liveMatch {
                        ProtoCard {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(PaceModality.parse(round.modality).label)
                                    .font(GType.overline)
                                    .foregroundStyle(p.ink3)
                                Text(round.course?.isEmpty == false ? round.course! : "Ronda en curso")
                                    .font(GType.headline)
                                    .foregroundStyle(p.ink)
                                Text("Hoyo \(round.currentHole)")
                                    .font(GType.label)
                                    .foregroundStyle(p.ink2)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        .accessibilityIdentifier("jugar-partido")
                    } else {
                        Text("No hay un partido en curso.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("jugar-partido-empty")
                    }

                    Text("Tee times del club").font(GType.section).foregroundStyle(p.ink)
                    if model.upcomingTeeTimes.isEmpty {
                        Text("No tenés reservas próximas.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("jugar-tee-empty")
                    } else {
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(model.upcomingTeeTimes) { booking in
                                    NavigationLink {
                                        TeeTimePrepView(booking: booking)
                                    } label: {
                                        ProtoRow(title: booking.chipWhen, subtitle: playTeeSubtitle(booking))
                                    }
                                    .accessibilityIdentifier("jugar-tee-\(booking.id)")
                                }
                            }
                        }
                        .accessibilityIdentifier("jugar-tee")
                    }

                    Text("Antes de salir").font(GType.section).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 0) {
                            NavigationLink { CourseView() } label: {
                                ProtoRow(title: "Libreta de la cancha", subtitle: "Hoyo a hoyo: cómo jugarlo y tu promedio")
                                    .accessibilityIdentifier("play-libreta")
                            }
                            NavigationLink { CourseView() } label: {
                                ProtoRow(title: "Estrategia", subtitle: "Dónde apuntar y qué palo usar en cada hoyo")
                            }
                            NavigationLink { BanderaHoyView() } label: {
                                ProtoRow(title: "Bandera de hoy", subtitle: "Posiciones de ejemplo")
                                    .accessibilityIdentifier("jugar-bandera")
                            }
                            NavigationLink { ClimaView() } label: {
                                ProtoRow(title: "Clima", subtitle: "Ejemplo. No es el pronóstico del día")
                            }
                        }
                    }
                }
                .padding(20)
                .padding(.bottom, 96)
            }
        }
        .accessibilityIdentifier("screen-jugar")
        .metricDestinations()
        .task { await model.refreshTeeTimes() }
    }

    private var liveMatch: LiveRound? {
        guard let round = model.activeLiveRound, round.endedAt == nil else { return nil }
        return round
    }

    private func playTeeSubtitle(_ booking: TeeTime) -> String {
        var parts: [String] = []
        if !booking.course.isEmpty { parts.append(booking.course) }
        if booking.course.caseInsensitiveCompare(booking.clubName) != .orderedSame {
            parts.append(booking.clubName)
        }
        if let line = booking.companionsLine { parts.append(line) }
        return parts.joined(separator: " · ")
    }
}

struct AntesDeSalirView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-antes") {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Antes de salir").font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: "Ajustes de esta vuelta. Los podés cambiar durante el juego.")
                    Text("Tu modo").font(GType.headline).foregroundStyle(p.ink)
                    HStack {
                        ForEach(ProfileMode.allCases) { mode in
                            Button(mode.title) { model.setHomeMode(mode) }
                                .font(GType.label)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 8)
                                .background(model.homeMode == mode ? p.primary : p.surface)
                                .foregroundStyle(model.homeMode == mode ? p.onPrimary : p.ink2)
                                .clipShape(Capsule())
                                .accessibilityIdentifier("antes-mode-\(mode.rawValue)")
                        }
                    }
                    ExampleNote(text: "Es el mismo modo del chip de Inicio. Decide qué ves en el hoyo.")

                    Text("En el hoyo vas a ver").font(GType.headline).foregroundStyle(p.ink)
                    ProtoCard {
                        VStack(spacing: 14) {
                            ForEach(HoleFeature.allCases) { feat in
                                Toggle(isOn: featureBinding(feat)) {
                                    Text(feat.title)
                                        .font(GType.body)
                                        .foregroundStyle(p.ink)
                                        .multilineTextAlignment(.leading)
                                }
                                .toggleStyle(.switch)
                                .tint(p.primary)
                                .accessibilityIdentifier("antes-feat-\(feat.rawValue)")
                            }
                        }
                    }
                    ExampleNote(text: "Lo que apagues sigue en «Más», en el costado del mapa. Desnivel, 3D y Pendiente no se muestran: no hay datos.")

                    setting("Cancha", ["Azul", "Roja"], model.roundSettings.cancha) { model.roundSettings.cancha = $0 }
                    setting("Salida", ["Negras", "Azules", "Blancas", "Rojas"], model.roundSettings.tee) { model.roundSettings.tee = $0 }
                    setting("Hoyos", ["18", "Primeros 9", "Últimos 9"], model.roundSettings.hoyos) { model.roundSettings.hoyos = $0 }
                    setting("Formato", ["Medal", "Stableford", "Match play"], model.roundSettings.formato) { model.roundSettings.formato = $0 }

                    ProtoCard {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text("HI 12,4 · Cancha \(model.roundSettings.cancha) · \(model.roundSettings.tee)").font(GType.overline).foregroundStyle(p.ink3)
                                DemoPill()
                            }
                            Text("Recibís 14 golpes").font(GType.section).foregroundStyle(p.ink)
                            ExampleNote(text: "Calculado con slope y rating de ejemplo")
                        }
                    }

                    Button {
                        model.startLiveHole()
                    } label: {
                        Text("Empezar en el hoyo \(model.roundSettings.startHole)")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 15)
                            .background(p.accent)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("antes-start")
                }
                .padding(20)
            }
        }
        .accessibilityIdentifier("screen-antes")
        .safeAreaInset(edge: .top) { MetricBackBar() }
        .navigationBarTitleDisplayMode(.inline)
    }

    private func featureBinding(_ feature: HoleFeature) -> Binding<Bool> {
        Binding(
            get: { model.roundSettings.shows(feature, mode: model.homeMode) },
            set: { model.setFeature(feature, on: $0) }
        )
    }

    private func setting(_ title: String, _ options: [String], _ current: String, _ set: @escaping (String) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(GType.headline).foregroundStyle(p.ink)
            HStack {
                ForEach(options, id: \.self) { o in
                    Button(o) { set(o) }
                        .font(GType.label)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(current == o ? p.primary : p.surface)
                        .foregroundStyle(current == o ? p.onPrimary : p.ink2)
                        .clipShape(Capsule())
                }
            }
        }
    }
}

struct TeeTimesHubView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-tee") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Tee times del club").font(GType.largeTitle).foregroundStyle(p.ink)
                    if model.upcomingTeeTimes.isEmpty {
                        Text("No tenés reservas próximas.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    } else {
                        ProtoCard {
                            VStack(spacing: 0) {
                                ForEach(model.upcomingTeeTimes) { booking in
                                    NavigationLink {
                                        TeeTimePrepView(booking: booking)
                                    } label: {
                                        ProtoRow(title: booking.chipWhen, subtitle: booking.clubName)
                                    }
                                }
                            }
                        }
                    }
                }
                .padding(20)
            }
        }
        .task { await model.refreshTeeTimes() }
    }
}

struct BanderaHoyView: View {
    @Environment(\.palette) private var p
    private let pos = ["M","A","C","M","A","C","A","M","C","M","A","C","M","C","A","M","A","C"]
    var body: some View {
        GScreen(id: "screen-bandera") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Bandera de hoy").font(GType.largeTitle).foregroundStyle(p.ink)
                    HStack { ExampleNote(text: "Cancha Azul · posiciones de ejemplo"); DemoPill() }
                    ProtoCard {
                        VStack(spacing: 0) {
                            ForEach(Array(pos.enumerated()), id: \.offset) { i, c in
                                let label = c == "A" ? "Atrás · juega +8 m" : c == "C" ? "Adelante · juega −6 m" : "Medio"
                                ProtoRow(title: "Hoyo \(i + 1)", subtitle: label)
                            }
                        }
                    }
                }
                .padding(20)
            }
        }
    }
}

struct ClimaView: View {
    @Environment(\.palette) private var p
    var body: some View {
        GScreen(id: "screen-clima") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Clima").font(GType.largeTitle).foregroundStyle(p.ink)
                DemoPill()
                HStack {
                    tile("Viento", "14", "km/h SO")
                    tile("Temp.", "19°", "sube a 23°")
                    tile("Lluvia", "0", "mm · seco")
                }
                ExampleNote(text: "Datos de ejemplo.")
                Spacer()
            }
            .padding(20)
        }
    }
    private func tile(_ k: String, _ v: String, _ d: String) -> some View {
        VStack(alignment: .leading) {
            Text(k).font(GType.label).foregroundStyle(p.ink3)
            Text(v).font(GType.statM).foregroundStyle(p.ink).tabular()
            Text(d).font(GType.label).foregroundStyle(p.ink3)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .background(p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}

struct MatchLiveView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p

    var body: some View {
        GScreen(id: "screen-partido") {
            VStack(alignment: .leading, spacing: 14) {
                Text("Partido").font(GType.largeTitle).foregroundStyle(p.ink)
                if let round = model.activeLiveRound, round.endedAt == nil {
                    Text(PaceModality.parse(round.modality).label)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    Text("Hoyo \(round.currentHole)")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                } else {
                    Text("No hay un partido en curso.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                Spacer()
            }
            .padding(20)
        }
    }
}

struct CierreView: View {
    @Environment(\.palette) private var p
    var body: some View {
        GScreen(id: "screen-cierre") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Cierre de vuelta").font(GType.largeTitle).foregroundStyle(p.ink)
                    ProtoHero {
                        VStack(alignment: .leading) {
                            Text("Tarjeta del club").font(GType.overline).opacity(0.75)
                            Text("84").font(GType.statHero).tabular()
                            Text("neto 71 · dif. 11,6").font(GType.label).opacity(0.8)
                        }
                    }
                    DemoPill()
                    NavigationLink { SGHomeView() } label: {
                        ProtoCard { ProtoRow(title: "Strokes gained", subtitle: "Contra el PGA Tour (Broadie, 2011)") }
                    }
                }
                .padding(20)
            }
        }
    }
}

struct PerfilModoView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var body: some View {
        GScreen(id: "screen-perfil-modo") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Modo del inicio").font(GType.largeTitle).foregroundStyle(p.ink)
                    ExampleNote(text: "¿Qué buscás en el golf? Elegí qué querés ver primero. Las tabs son las mismas en todos los modos.")
                    ForEach(ProfileMode.allCases) { mode in
                        Button { model.setHomeMode(mode) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(mode.title).font(GType.headline).foregroundStyle(p.ink)
                                        if mode == .clasico { DemoPill(text: "Recomendado") }
                                    }
                                    Text(mode.blurb).font(GType.label).foregroundStyle(p.ink3)
                                }
                                Spacer()
                                Image(systemName: model.homeMode == mode ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(model.homeMode == mode ? p.primary : p.ink3)
                            }
                            .padding(14)
                            .background(model.homeMode == mode ? p.surface2 : p.surface)
                            .clipShape(RoundedRectangle(cornerRadius: 16))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("perfil-mode-\(mode.rawValue)")
                    }
                }
                .padding(20)
            }
        }
    }
}
