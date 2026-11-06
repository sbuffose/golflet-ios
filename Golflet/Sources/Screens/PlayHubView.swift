import MapKit
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
                        Button { model.showsPlay = true } label: {
                            liveMatchCard(round)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("jugar-partido")
                    } else {
                        MatchStartPrompt(identify: true)
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
                            NavigationLink {
                                StrategyCourseView(
                                    courseKey: CourseIdentity.key(for: model.selectedCourseName),
                                    courseName: model.selectedCourseName
                                )
                            } label: {
                                ProtoRow(title: "Estrategia", subtitle: "Dónde apuntar y qué palo usar en cada hoyo")
                                    .accessibilityIdentifier("play-estrategia")
                            }
                            NavigationLink { BanderaHoyView() } label: {
                                ProtoRow(title: "Bandera de hoy", subtitle: "Si el club las cargó")
                                    .accessibilityIdentifier("jugar-bandera")
                            }
                            NavigationLink { ClimaView() } label: {
                                ProtoRow(title: "Clima", subtitle: climaSubtitle)
                                    .accessibilityIdentifier("jugar-clima")
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

    private var climaSubtitle: String {
        guard let booking = model.nextTeeTime else { return "Sin horario reservado" }
        if booking.windKmh == nil && booking.tempC == nil && booking.rainMm == nil {
            return "Este horario no trae viento, temperatura ni lluvia"
        }
        var bits: [String] = []
        if let wind = booking.windKmh { bits.append("\(wind) km/h") }
        if let temp = booking.tempC { bits.append("\(temp)°") }
        if let rain = booking.rainMm, rain > 0 { bits.append("lluvia") }
        return bits.joined(separator: " · ")
    }

    private var liveMatch: LiveRound? {
        guard let round = model.activeLiveRound, round.endedAt == nil else { return nil }
        return round
    }

    private func liveMatchCard(_ round: LiveRound) -> some View {
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
                if !model.matchPartners.isEmpty {
                    Text(model.matchPartners.joined(separator: ", "))
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
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
                    Text("Elegí qué vas a ver en el hoyo.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
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

                    setting("Cancha", ["Azul", "Roja"], model.roundSettings.cancha) { model.roundSettings.cancha = $0 }
                    setting("Salida", ["Negras", "Azules", "Blancas", "Rojas"], model.roundSettings.tee) { model.roundSettings.tee = $0 }
                    setting("Hoyos", ["18", "Primeros 9", "Últimos 9"], model.roundSettings.hoyos) { model.roundSettings.hoyos = $0 }
                    setting("Formato", ["Medal", "Stableford", "Match play"], model.roundSettings.formato) { model.roundSettings.formato = $0 }

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
    var body: some View {
        GScreen(id: "screen-bandera") {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Bandera de hoy").font(GType.largeTitle).foregroundStyle(p.ink)
                    Text("No hay posiciones de bandera para hoy.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                        .accessibilityIdentifier("bandera-empty")
                }
                .padding(20)
            }
        }
    }
}

struct ClimaView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @State private var forecast: TeeForecast.Window?

    var body: some View {
        let booking = model.nextTeeTime
        let report = WeatherPlay.report(booking: booking, rounds: model.rounds, bag: model.bag)
        let pin = booking.flatMap { CoursePin.coordinate(club: $0.clubName, course: $0.course) }
        let live = forecast.flatMap { window in
            booking.map { TeeForecast.playText(window: window, booking: $0, rounds: model.rounds, bag: model.bag) }
        }
        GScreen(id: "screen-clima") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Clima").font(GType.largeTitle).foregroundStyle(p.ink)
                    if let pin {
                        CoursePinMap(lat: pin.lat, lng: pin.lng, title: pin.title)
                            .frame(height: 220)
                            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                            .accessibilityIdentifier("clima-map")
                        Text(pin.title)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                    }
                    let lines = live?.split(separator: "\n").map(String.init) ?? report.lines
                    ForEach(Array(lines.enumerated()), id: \.offset) { index, line in
                        Text(line)
                            .font(GType.body)
                            .foregroundStyle(p.ink)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier(index == 0 ? "clima-hour" : "clima-line-\(index)")
                    }
                    if forecast?.failed == true {
                        Text("No pude leer el pronóstico. El mapa es el del club.")
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("clima-forecast-error")
                    }
                }
                .padding(20)
            }
        }
        .accessibilityIdentifier(report.hasNumbers || (forecast?.hours.isEmpty == false) ? "clima-real" : "clima-empty")
        .task(id: booking?.id) {
            forecast = nil
            guard let booking else { return }
            forecast = await TeeForecast.load(booking: booking)
        }
    }
}

struct CoursePinMap: UIViewRepresentable {
    var lat: Double
    var lng: Double
    var title: String

    func makeUIView(context: Context) -> MKMapView {
        let map = MKMapView()
        map.isRotateEnabled = false
        map.pointOfInterestFilter = .excludingAll
        return map
    }

    func updateUIView(_ map: MKMapView, context: Context) {
        let center = CLLocationCoordinate2D(latitude: lat, longitude: lng)
        let region = MKCoordinateRegion(center: center, span: MKCoordinateSpan(latitudeDelta: 0.02, longitudeDelta: 0.02))
        map.setRegion(region, animated: false)
        map.removeAnnotations(map.annotations)
        let pin = MKPointAnnotation()
        pin.coordinate = center
        pin.title = title
        map.addAnnotation(pin)
    }
}

struct MatchStartPrompt: View {
    @Environment(\.palette) private var p
    var identify: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("No hay un partido en curso.")
                .font(GType.body)
                .foregroundStyle(p.ink2)
                .accessibilityIdentifier(identify ? "jugar-partido-empty" : "home-partido-empty")
            Text("Elegí el formato para armarlo.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    formatLink(.medal)
                    formatLink(.stableford)
                    Spacer(minLength: 0)
                }
                HStack(spacing: 8) {
                    formatLink(.match)
                    formatLink(.fourball)
                    Spacer(minLength: 0)
                }
            }
            NavigationLink {
                MatchLiveView()
            } label: {
                Text("Empezar partido")
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.primary)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier(identify ? "empezar-partido" : "home-empezar-partido")
        }
        .accessibilityIdentifier(identify ? "match-start" : "home-match-start")
    }

    private func formatLink(_ mode: PaceModality) -> some View {
        NavigationLink {
            MatchLiveView(modality: mode)
        } label: {
            Text(mode.label)
                .font(GType.label)
                .foregroundStyle(p.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(p.surface)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(p.hairline, lineWidth: 1))
        }
        .accessibilityIdentifier((identify ? "match-format-" : "home-match-format-") + mode.rawValue)
    }
}

struct MatchLiveView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    var modality: PaceModality
    @State private var chosen: PaceModality
    @State private var partners: [String] = []
    @State private var typed = ""

    init(modality: PaceModality = .medal) {
        self.modality = modality
        _chosen = State(initialValue: modality)
    }

    var body: some View {
        GScreen(id: "screen-partido") {
            VStack(spacing: 0) {
                MetricBackBar()
                ScrollView(showsIndicators: false) {
                    if let round = model.activeLiveRound, round.endedAt == nil {
                        active(round)
                    } else {
                        setup
                    }
                }
            }
        }
    }

    private func active(_ round: LiveRound) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Partido").font(GType.largeTitle).foregroundStyle(p.ink)
            Text(PaceModality.parse(round.modality).label)
                .font(GType.headline)
                .foregroundStyle(p.ink)
            Text(round.course?.isEmpty == false ? round.course! : "Ronda en curso")
                .font(GType.body)
                .foregroundStyle(p.ink2)
            Text("Hoyo \(round.currentHole)")
                .font(GType.body)
                .foregroundStyle(p.ink2)
            if !model.matchPartners.isEmpty {
                Text(model.matchPartners.joined(separator: ", "))
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
            }
            Button { model.showsPlay = true } label: {
                Text("Seguir partido")
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.primary)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("seguir-partido")
        }
        .padding(20)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var setup: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Empezar partido").font(GType.largeTitle).foregroundStyle(p.ink)
            Text("Todavía no hay un partido. Elegí formato y cancha.")
                .font(GType.body)
                .foregroundStyle(p.ink2)

            Text("Formato").font(GType.section).foregroundStyle(p.ink)
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    formatChip(.medal)
                    formatChip(.stableford)
                    Spacer(minLength: 0)
                }
                HStack(spacing: 8) {
                    formatChip(.match)
                    formatChip(.fourball)
                    Spacer(minLength: 0)
                }
            }

            Text("Compañeros").font(GType.section).foregroundStyle(p.ink)
            if choices.isEmpty {
                Text("No hay compañeros en tus grupos ni en tus reservas. Podés agregar uno.")
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(choices, id: \.self) { name in
                        Button { toggle(name) } label: {
                            HStack {
                                Text(name)
                                    .font(GType.body)
                                    .foregroundStyle(partners.contains(name) ? p.onPrimary : p.ink)
                                Spacer()
                                if partners.contains(name) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundStyle(p.onPrimary)
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 10)
                            .background(partners.contains(name) ? p.primary : p.surface)
                            .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("match-partner-\(name)")
                    }
                }
            }

            HStack(spacing: 8) {
                TextField("Nombre", text: $typed)
                    .textInputAutocapitalization(.words)
                    .font(GType.body)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(p.surface)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("match-partner-field")
                Button("Agregar") { addTyped() }
                    .font(GType.label)
                    .foregroundStyle(p.onPrimary)
                    .padding(.horizontal, 14)
                    .padding(.vertical, 10)
                    .background(partners.count >= 3 ? p.ink3 : p.primary)
                    .clipShape(Capsule())
                    .accessibilityIdentifier("match-partner-add")
            }

            if !partners.isEmpty {
                Text(partners.joined(separator: ", "))
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("match-partners-line")
            }

            Button {
                model.pendingMatch = MatchSetup(modality: chosen, partners: partners)
                model.showsPlay = true
            } label: {
                Text("Empezar partido")
                    .font(GType.headline)
                    .foregroundStyle(p.onPrimary)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(p.primary)
                    .clipShape(Capsule())
            }
            .accessibilityIdentifier("empezar-partido-confirm")
            Text("Después elegís la cancha y arranca la ronda.")
                .font(GType.label)
                .foregroundStyle(p.ink3)
        }
        .padding(20)
        .padding(.bottom, 24)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var choices: [String] {
        MatchSetup.partnerChoices(
            teeTimes: model.upcomingTeeTimes,
            groups: model.groups,
            me: [model.profile.greetingName, model.profile.displayName]
        )
    }

    private func formatChip(_ mode: PaceModality) -> some View {
        let on = chosen == mode
        return Button { chosen = mode } label: {
            Text(mode.label)
                .font(GType.label)
                .foregroundStyle(on ? p.onPrimary : p.ink)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(on ? p.primary : p.surface)
                .clipShape(Capsule())
                .overlay(Capsule().stroke(on ? p.primary : p.hairline, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("match-setup-format-\(mode.rawValue)")
    }

    private func toggle(_ name: String) {
        if let index = partners.firstIndex(of: name) {
            partners.remove(at: index)
        } else if partners.count < 3 {
            partners.append(name)
        }
    }

    private func addTyped() {
        let name = typed.trimmingCharacters(in: .whitespacesAndNewlines)
        typed = ""
        guard !name.isEmpty, partners.count < 3 else { return }
        let selfNames = [model.profile.greetingName, model.profile.displayName]
        if selfNames.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) { return }
        if partners.contains(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) { return }
        partners.append(name)
    }
}

struct CierreView: View {
    @Environment(\.palette) private var p
    var body: some View {
        GScreen(id: "screen-cierre") {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Cierre de vuelta").font(GType.largeTitle).foregroundStyle(p.ink)
                    Text("Todavía no hay una vuelta para cerrar. Jugá una con GPS.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                        .accessibilityIdentifier("cierre-empty")
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
                    Text("Elegí qué ves primero. Las tabs no cambian.")
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                    ForEach(ProfileMode.allCases) { mode in
                        Button { model.setHomeMode(mode) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(mode.title).font(GType.headline).foregroundStyle(p.ink)
                                        if mode == .clasico {
                                            Text("Recomendado")
                                                .font(GFont.ui(11.5, weight: .semibold))
                                                .foregroundStyle(p.primary2)
                                        }
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
