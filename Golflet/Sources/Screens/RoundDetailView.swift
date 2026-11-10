import SwiftUI
import SwiftData

struct RoundDetailView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss
    let round: Round
    @State private var noteText = ""
    @State private var puttsText = ""
    @State private var girText = ""
    @State private var firText = ""
    @State private var extras: [Int: HoleExtra] = [:]
    @State private var showsGameEditor = false
    @State private var showsRecap = false
    @State private var showsTrack = false
    @State private var showsWhat = false
    @State private var quickError = ""
    @State private var quickConflict = false
    @State private var needsRetry = false
    @State private var leftRound = false
    @State private var pending: [Int: PendingHole] = [:]
    @State private var markRev = 0
    @State private var revByHole: [Int: Int] = [:]
    @State private var accountReady = false
    @State private var accountMarks: [Int: HoleMark] = [:]
    @State private var loadGen = 0
    @State private var queue = QuickWorkQueue()
    @State private var visit = RoundVisit()
    @State private var noteSaver = QuickNoteSaver()
    @State private var noteAt = ""
    @FocusState private var statFocus: StatField?

    private enum StatField: Hashable { case putts, gir, fir }

    var body: some View {
        GScreen(id: "screen-ronda") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 22) {
                    header
                    scoreHero
                    recapButton
                    if round.isOtherCourse || round.holes.isEmpty {
                        otherCourseNotice
                    } else {
                        scorecard
                        gameStats
                    }
                    notes
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-ronda")
        .sheet(isPresented: $showsRecap) {
            NavigationStack {
                RecapView(roundId: round.roundId)
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: $showsTrack) {
            NavigationStack {
                ReconstructView(context: RoundTrackContext(
                    roundId: round.roundId,
                    date: round.date,
                    courseName: round.course,
                    clubCode: round.clubCode,
                    hole: 1
                ))
            }
            .golfletChrome()
            .environment(model)
        }
        .sheet(isPresented: $showsWhat) { whatSheet }
        .onAppear {
            leftRound = false
            visit.enter()
            extras = Dictionary(uniqueKeysWithValues: model.notes.extras(for: round.roundId).map { ($0.hole, $0) })
            let source = model.rounds.first { $0.roundId == round.roundId } ?? round
            noteText = model.notes.note(for: round.roundId)?.text ?? source.notes ?? ""
            puttsText = source.putts.map(String.init) ?? ""
            girText = source.gir.map(String.init) ?? ""
            firText = source.fir.map(String.init) ?? ""
            if let notesAt = source.notesAt {
                let stamp = ISO8601DateFormatter()
                stamp.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
                noteAt = stamp.string(from: notesAt)
            }
        }
        .task(id: round.roundId) {
            leftRound = false
            accountReady = false
            accountMarks = [:]
            loadGen += 1
            queue.dropLoad()
            let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
            await enqueueLoad(identity: identity, replace: true, force: false).value
        }
        .onDisappear {
            leftRound = true
            visit.leave()
            noteSaver.cancel()
        }
        .safeAreaInset(edge: .top) {
            HStack {
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(p.ink2)
                        .frame(width: 32, height: 32)
                        .background(p.surface)
                        .clipShape(Circle())
                }
                .accessibilityIdentifier("close-round")
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            GOverline(text: FormatAR.longDate(round.date).uppercased())
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if round.isCompetition {
                    Image(systemName: "trophy.fill")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(p.accentInk)
                        .accessibilityIdentifier("round-trophy")
                }
                Text(round.displayTitle)
                    .font(GType.sheetTitle)
                    .tracking(-1.2)
                    .foregroundStyle(p.ink)
            }
            Text(round.tournament)
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .lineLimit(2)
            HStack(spacing: 8) {
                Text(round.clubName)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                if !round.isOtherCourse, !round.tee.isEmpty {
                    TeeDot(name: round.tee)
                    Text("\(round.displayCourse) · Tee \(round.tee) · \(FormatAR.one(round.courseRating)) / \(Int(round.slope))")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                } else {
                    Text(round.displayCourse)
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                }
            }
        }
    }

    private var otherCourseNotice: some View {
        GCard(radius: 18, padding: 14) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Otra cancha")
                    .font(GType.headline)
                    .foregroundStyle(p.ink)
                Text("Esta tarjeta se jugó en \(round.displayCourse). El club no trae el detalle por hoyo.")
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                if let source = round.sourceClubName, !source.isEmpty {
                    Text("La listó \(source).")
                        .font(GType.label)
                        .foregroundStyle(p.ink3)
                }
            }
        }
        .accessibilityIdentifier("other-course-notice")
    }

    private var scoreHero: some View {
        HStack(spacing: 0) {
            heroCell("Gross", round.gross.map(String.init) ?? "—", emphasize: true)
            heroCell("Neto", round.net.map(String.init) ?? "—", emphasize: false)
            Button { showsWhat = true } label: {
                heroCell("Dif.*", differential.map(FormatAR.one) ?? "—", emphasize: false)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("round-what")
            .accessibilityLabel("¿Qué es esto?")
            heroCell("Puesto", position, emphasize: false)
        }
        .background(p.surface2)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private func heroCell(_ label: String, _ value: String, emphasize: Bool) -> some View {
        VStack(spacing: 6) {
            Text(label)
                .font(GType.label)
                .foregroundStyle(emphasize ? p.onPrimary.opacity(0.7) : p.ink2)
            Text(value)
                .font(GType.statM)
                .tabular()
                .foregroundStyle(emphasize ? p.onPrimary : p.ink)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 14)
        .background(emphasize ? p.primary : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    private var scorecard: some View {
        VStack(alignment: .leading, spacing: 16) {
            holeTable(Array(round.holes.prefix(9)), totalLabel: "IDA", total: round.outScore)
            holeTable(Array(round.holes.suffix(from: min(9, round.holes.count))), totalLabel: "VTA", total: round.inScore)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 112), spacing: 10)], alignment: .leading, spacing: 10) {
                ForEach(ScoreLegend.items(holes: round.holes, counts: round.counts)) { item in
                    legend(item)
                }
            }
            if !caption.isEmpty {
                Text(caption)
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
            }
        }
    }

    private func holeTable(_ holes: [HoleScore], totalLabel: String, total: Int?) -> some View {
        VStack(spacing: 8) {
            row("HOYO", holes.map { "\($0.number)" }, totalLabel)
            row("YDS", holes.map { $0.yards.map(String.init) ?? "—" }, "")
            row("PAR", holes.map { "\($0.par)" }, "\(holes.reduce(0) { $0 + $1.par })")
            HStack(alignment: .center, spacing: 0) {
                Text("")
                    .font(GType.overline)
                    .frame(width: 44, alignment: .leading)
                ForEach(holes) { hole in
                    ScoreMark(strokes: hole.strokes, result: hole.result, diameter: 26)
                        .frame(maxWidth: .infinity)
                }
                Text(total.map(String.init) ?? "—")
                    .font(GFont.ui(13, weight: .semibold))
                    .tabular()
                    .frame(width: 32)
                    .foregroundStyle(p.ink)
            }
        }
    }

    private func row(_ label: String, _ values: [String], _ total: String) -> some View {
        HStack(spacing: 0) {
            Text(label)
                .font(GType.overline)
                .foregroundStyle(p.ink3)
                .frame(width: 44, alignment: .leading)
            ForEach(Array(values.enumerated()), id: \.offset) { _, value in
                Text(value)
                    .font(GType.label)
                    .tabular()
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                    .foregroundStyle(p.ink2)
                    .frame(maxWidth: .infinity)
            }
            Text(total)
                .font(GType.label)
                .tabular()
                .foregroundStyle(p.ink2)
                .frame(width: 32)
        }
    }

    private func legend(_ item: ScoreLegend.Item) -> some View {
        HStack(spacing: 8) {
            legendMark(item.result, item.count)
            Text(item.label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(item.count) \(item.spoken)")
    }

    @ViewBuilder
    private func legendMark(_ result: HoleResult, _ count: Int) -> some View {
        let mark = Text("\(count)")
            .font(GFont.ui(13, weight: .semibold))
            .tabular()
            .foregroundStyle(legendInk(result))
            .frame(minWidth: 26, minHeight: 26)
            .padding(.horizontal, 4)
        switch result {
        case .eagleOrBetter:
            mark.background(p.primary).clipShape(Circle())
        case .birdie:
            mark.background(p.accent).clipShape(Circle())
        case .par, .unknown:
            mark
        case .bogey:
            mark.background(p.sand).clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        case .doubleOrWorse:
            mark.background(Color(red: 74 / 255, green: 81 / 255, blue: 76 / 255)).clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
    }

    private func legendInk(_ result: HoleResult) -> Color {
        switch result {
        case .eagleOrBetter: return p.accent
        case .birdie, .doubleOrWorse: return p.onPrimary
        default: return p.ink
        }
    }

    private var gameStats: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Tu juego")
                    .font(GType.section)
                    .foregroundStyle(p.ink)
                Spacer()
                Button(showsGameEditor ? "Listo" : "Cargar") { showsGameEditor.toggle() }
                    .font(GType.headline)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier("edit-game")
            }
            Button { showsTrack = true } label: {
                HStack(spacing: 12) {
                    Text("TRACK")
                        .font(GFont.ui(12, weight: .semibold))
                        .foregroundStyle(p.accent)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(p.onPrimary)
                        .clipShape(Capsule())
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Registrar mis tiros")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                        Text("Cómo fueron los golpes en el mapa de esta vuelta. Los putts, el drive y el green quedan aparte.")
                            .font(GType.label)
                            .foregroundStyle(p.onPrimary.opacity(0.72))
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(p.onPrimary.opacity(0.8))
                }
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(p.primary)
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("round-track")
            .accessibilityLabel("Registrar mis tiros")
            .accessibilityHint("Abre el mapa de golpes de esta vuelta")
            HStack(spacing: 10) {
                gameField("Putts", $puttsText, .putts)
                gameField("Greens", $girText, .gir)
                gameField("Fairways", $firText, .fir)
            }
            Text(statSources)
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .accessibilityIdentifier("round-stat-source")
            if let company = playedWith {
                Text("Jugaste con \(company)")
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("round-partners")
            }
            Text(scheduleLine)
                .font(GType.label)
                .foregroundStyle(p.ink3)
                .accessibilityIdentifier("round-schedule")
            if !quickError.isEmpty {
                Text(quickError)
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("quick-save-error")
                if quickConflict || needsRetry {
                    Button("Reintentar") {
                        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
                        Task { await retryLoad(scheduled: identity) }
                    }
                        .font(GType.headline)
                        .foregroundStyle(p.ink2)
                        .accessibilityIdentifier("quick-save-retry")
                }
            }
            if showsGameEditor {
                VStack(spacing: 8) {
                    ForEach(round.holes) { hole in
                        holeEditor(hole)
                    }
                }
            }
        }
    }

    private func gameField(_ label: String, _ text: Binding<String>, _ field: StatField) -> some View {
        GCard(radius: 16, padding: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                TextField("—", text: text)
                    .font(GType.statM)
                    .tabular()
                    .keyboardType(.numberPad)
                    .focused($statFocus, equals: field)
                    .onChange(of: text.wrappedValue) { _, _ in persistNotes() }
            }
        }
    }

    private func holeEditor(_ hole: HoleScore) -> some View {
        let extra = extras[hole.number]
        return VStack(alignment: .leading, spacing: 8) {
            Text("Hoyo \(hole.number)")
                .font(GFont.ui(14, weight: .semibold))
                .foregroundStyle(p.ink)
            HStack(spacing: 6) {
                ForEach(0...4, id: \.self) { n in
                    statChip("\(n)", on: extra?.putts == n) {
                        update(hole: hole.number, putts: extra?.putts == n ? nil : n, touch: .putts)
                    }
                }
            }
            HStack(spacing: 6) {
                statChip("GIR sí", on: extra?.gir == true) {
                    update(hole: hole.number, gir: extra?.gir == true ? nil : true, touch: .gir)
                }
                statChip("GIR no", on: extra?.gir == false) {
                    update(hole: hole.number, gir: extra?.gir == false ? nil : false, touch: .gir)
                }
            }
            if hole.par != 3 {
                HStack(spacing: 6) {
                    statChip("Izquierda", on: extra?.fairway == "left") {
                        update(hole: hole.number, fairway: extra?.fairway == "left" ? nil : "left", touch: .fairway)
                    }
                    statChip("Fairway", on: extra?.fairway == "hit") {
                        update(hole: hole.number, fairway: extra?.fairway == "hit" ? nil : "hit", touch: .fairway)
                    }
                    statChip("Derecha", on: extra?.fairway == "right") {
                        update(hole: hole.number, fairway: extra?.fairway == "right" ? nil : "right", touch: .fairway)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
    }

    private func statChip(_ title: String, on: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(GType.label)
                .foregroundStyle(on ? p.onPrimary : p.ink)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(on ? p.primary : p.surface)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
    }

    private var recapButton: some View {
        Button {
            showsRecap = true
        } label: {
            GCard(fill: p.primary, radius: 22, padding: 16) {
                HStack {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Contá cómo te fue")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                        Text(round.recapId == nil ? "Grabá un audio de la ronda" : "Ver o editar el recap")
                            .font(GType.label)
                            .foregroundStyle(p.onPrimary.opacity(0.7))
                    }
                    Spacer()
                    Image(systemName: "mic.fill")
                        .foregroundStyle(p.accentOnNavy)
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("recap-start")
    }

    private var notes: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Notas y errores")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 22, padding: 16) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("¿Cómo te fue? ¿Qué falló, en qué hoyos, con qué palo?")
                        .font(GType.body)
                        .foregroundStyle(p.ink3)
                    TextEditor(text: $noteText)
                        .font(GType.body)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 88)
                        .accessibilityIdentifier("round-notes")
                        .onChange(of: noteText) { _, _ in persistNotes() }
                    HStack(spacing: 6) {
                        Image(systemName: "pencil")
                            .font(.system(size: 11))
                        Text(noteText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "Todavía sin notas" : (model.isLive ? "Guardado en tu cuenta" : "Guardado en el teléfono"))
                    }
                    .font(GType.label)
                    .foregroundStyle(p.ink3)
                }
            }
        }
    }

    private var statSources: String {
        func tag(_ value: String, source: String?) -> String {
            if value.isEmpty { return "Sin confirmar" }
            return source == "track" ? "Desde TRACK" : "Manual"
        }
        return "Putts: \(tag(puttsText, source: round.puttsSource)). Greens: \(tag(girText, source: nil)). Fairways: \(tag(firText, source: nil))."
    }

    private var sameDayTee: TeeTime? {
        let fmt = DateFormatter()
        fmt.calendar = Calendar(identifier: .gregorian)
        fmt.timeZone = TimeZone(identifier: "America/Argentina/Buenos_Aires")
        fmt.dateFormat = "yyyy-MM-dd"
        let day = fmt.string(from: round.date)
        let same = model.teeTimes.filter { fmt.string(from: $0.startsAt) == day }
        return same.count == 1 ? same[0] : nil
    }

    private var playedWith: String? {
        let names = sameDayTee?.companions.filter { !$0.trimmingCharacters(in: .whitespaces).isEmpty } ?? []
        return names.isEmpty ? nil : names.joined(separator: ", ")
    }

    private var scheduleLine: String {
        guard let tee = sameDayTee else { return "Sin horario conocido" }
        return "Por horario · \(tee.chipWhen)"
    }

    private var whatSheet: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("¿Qué es esto?")
                        .font(GType.sheetTitle)
                        .foregroundStyle(p.ink)
                    Text("Course Rating es el score de un scratch en esa cancha y ese tee. Acá es \(FormatAR.one(round.courseRating)).")
                    Text("Slope mide cuánto más difícil es para un bogey player. El estándar es 113. Acá es \(FormatAR.int(Int(round.slope.rounded()))).")
                    Text("La cuenta es (113 / Slope) × (Adjusted Gross − Rating − PCC). Si el PCC no está, no lo pongo en cero.")
                    if let gross = round.adjustedGross, round.slope > 0 {
                        let replay = (113 / round.slope) * (Double(gross) - round.courseRating)
                        Text("(113 / \(FormatAR.int(Int(round.slope.rounded())))) × (\(gross) − \(FormatAR.one(round.courseRating))) = \(FormatAR.one((replay * 10).rounded() / 10)). Sin PCC.")
                    } else {
                        Text("El adjusted gross de esta tarjeta no está guardado. No armo el ejemplo.")
                    }
                }
                .font(GType.body)
                .foregroundStyle(p.ink2)
                .padding(20)
            }
            .navigationTitle("Diferencial")
            .toolbar { Button("Cerrar") { showsWhat = false } }
        }
        .accessibilityIdentifier("round-what-sheet")
    }

    private var differential: Double? {
        if let stored = round.differential { return stored }
        guard let gross = round.adjustedGross ?? round.gross, round.slope > 0 else { return nil }
        return HandicapMath.differential(adjustedGross: Double(gross), courseRating: round.courseRating, slope: round.slope)
    }

    private var position: String {
        if let pos = round.position { return "\(pos)°" }
        return "—"
    }

    private var caption: String {
        differential.map { "Diferencial estimado por Golflet: \(FormatAR.one($0))." } ?? ""
    }

    private func persistNotes() {
        let session = model.sessionEpoch
        let generation = visit.generation
        noteSaver.schedule(
            model: model,
            roundId: round.roundId,
            text: noteText,
            putts: Int(puttsText),
            gir: Int(girText),
            fir: Int(firText),
            session: session,
            visit: visit,
            generation: generation
        ) { note in
            var fields = QuickNoteFields(
                text: noteText,
                putts: puttsText,
                gir: girText,
                fir: firText,
                noteAt: noteAt,
                focus: noteFocus
            )
            QuickNoteSurface.absorb(note, into: &fields)
            noteAt = fields.noteAt
            puttsText = fields.putts
            girText = fields.gir
            firText = fields.fir
        }
    }

    private var noteFocus: QuickNoteFocus? {
        switch statFocus {
        case .putts: .putts
        case .gir: .gir
        case .fir: .fir
        case nil: nil
        }
    }

    private struct PendingHole {
        var putts: Int?
        var gir: Bool?
        var fairway: String?
        var touched: QuickStats.FieldTouch
    }

    private enum HoleTouch { case putts, gir, fairway }

    private func update(hole: Int, putts: Int? = nil, gir: Bool? = nil, fairway: String? = nil, touch: HoleTouch) {
        if quickConflict || needsRetry { return }
        var edit = pending[hole] ?? PendingHole(putts: nil, gir: nil, fairway: nil, touched: .init(putts: false, gir: false, drive: false))
        switch touch {
        case .putts:
            edit.putts = putts
            edit.touched.putts = true
        case .gir:
            edit.gir = gir
            edit.touched.gir = true
        case .fairway:
            edit.fairway = fairway
            edit.touched.drive = true
        }
        pending[hole] = edit
        let current = extras[hole]
        let par = round.holes.first { $0.number == hole }?.par ?? 0
        let extra = HoleExtra(
            roundId: round.roundId,
            hole: hole,
            putts: edit.touched.putts ? edit.putts : current?.putts,
            gir: edit.touched.gir ? edit.gir : current?.gir,
            fairway: par == 3 ? nil : (edit.touched.drive ? edit.fairway : current?.fairway)
        )
        extras[hole] = extra
        markRev += 1
        let identity = QuickWorkIdentity(session: model.sessionEpoch, generation: visit.generation, load: loadGen)
        queue.enqueueMark(
            identity: identity,
            model: model,
            visit: visit,
            waitForAccount: { await self.ensureLoaded(identity: identity).value },
            commit: { await self.commit(hole: hole, identity: identity) }
        )
    }

    private func pendingEdits() -> [QuickStats.HoleEdit] {
        pending.map { hole, edit in
            let par = round.holes.first { $0.number == hole }?.par ?? 0
            let local = HoleMark(hole: hole, putts: edit.putts, gir: edit.gir, drive: QuickStats.driveForAccount(par: par, fairway: edit.fairway), rev: 0)
            return QuickStats.HoleEdit(hole: hole, local: local, touched: edit.touched)
        }
    }

    private func showAccount(session: Int) {
        guard model.sessionStill(session) else { return }
        let board = QuickStats.projectBoard(account: Array(accountMarks.values), edits: pendingEdits())
        var next: [Int: HoleExtra] = [:]
        for mark in board where mark.putts != nil || mark.gir != nil || mark.drive?.isEmpty == false {
            let par = round.holes.first { $0.number == mark.hole }?.par ?? 0
            next[mark.hole] = HoleExtra(
                roundId: round.roundId,
                hole: mark.hole,
                putts: mark.putts,
                gir: mark.gir,
                fairway: par == 3 ? nil : QuickStats.localFairway(mark.drive)
            )
        }
        extras = next
        var present: [HoleExtra] = []
        var clear = Set<Int>()
        for mark in accountMarks.values {
            if mark.putts == nil && mark.gir == nil && (mark.drive ?? "").isEmpty {
                clear.insert(mark.hole)
                continue
            }
            let par = round.holes.first { $0.number == mark.hole }?.par ?? 0
            present.append(HoleExtra(
                roundId: round.roundId,
                hole: mark.hole,
                putts: mark.putts,
                gir: mark.gir,
                fairway: par == 3 ? nil : QuickStats.localFairway(mark.drive)
            ))
        }
        let keep = Set(accountMarks.keys).union(pending.keys)
        for stored in model.notes.extras(for: round.roundId) where !keep.contains(stored.hole) {
            clear.insert(stored.hole)
        }
        model.writeHoleCache(roundId: round.roundId, session: session, present: present, clear: clear)
    }

    private func commit(hole: Int, identity: QuickWorkIdentity) async {
        guard !quickConflict else { return }
        guard let edit = pending[hole] else { return }
        let sent = edit
        guard QuickDispatch.visitStill(identity, model: model, visit: visit) else { return }
        guard QuickStats.sendDecision(accountReady: accountReady, stillHere: visit.allows(identity.generation)) == "send" else {
            if !accountReady {
                needsRetry = true
                quickError = "No se pudo leer la cuenta. Los totales de la tarjeta siguen igual."
            }
            return
        }
        let holes = round.holes.map { QuickHole(hole: $0.number, par: $0.par) }
        let par = round.holes.first { $0.number == hole }?.par ?? 0
        let account = accountMarks[hole]
        let local = HoleMark(hole: hole, putts: edit.putts, gir: edit.gir, drive: QuickStats.driveForAccount(par: par, fairway: edit.fairway), rev: 0)
        let merged = QuickStats.mergeAccount(account: account, local: local, touched: edit.touched)
        let drive = par == 3 ? nil : merged.drive
        guard QuickStats.accepts(hole: hole, drive: drive, holes: holes) else {
            quickError = "Ese hoyo no está en la tarjeta."
            return
        }
        let extra = HoleExtra(roundId: round.roundId, hole: hole, putts: merged.putts, gir: merged.gir, fairway: par == 3 ? nil : QuickStats.localFairway(drive))
        extras[hole] = extra
        let mark = HoleMark(hole: hole, putts: merged.putts, gir: merged.gir, drive: drive, rev: merged.rev)
        await QuickDispatch.runMark(
            identity: identity,
            model: model,
            visit: visit,
            send: { await self.model.sendHoleMark(roundId: self.round.roundId, session: identity.session, mark: mark) },
            onModel: { savedWrite in
                self.keepMarkTotal(savedWrite, roundId: self.round.roundId, identity: identity)
            },
            onScreen: { savedWrite in
                self.showSavedMark(savedWrite, hole: hole, sent: sent, mergedRev: merged.rev, identity: identity)
            },
            onFailure: { error in
                self.showMarkFailure(error)
            }
        )
    }

    private func keepMarkTotal(_ savedWrite: HoleMarkSave, roundId: String, identity: QuickWorkIdentity) {
        var fields: [String: Int] = [:]
        if let value = savedWrite.note.putts { fields["putts"] = value }
        if let value = savedWrite.note.gir { fields["gir"] = value }
        if let value = savedWrite.note.fir { fields["fir"] = value }
        _ = model.applyStatFields(roundId: roundId, fields: fields, notesAt: QuickStats.noteDate(savedWrite.note.updatedAt), session: identity.session)
    }

    private func showSavedMark(_ savedWrite: HoleMarkSave, hole: Int, sent: PendingHole, mergedRev: Int, identity: QuickWorkIdentity) {
        let saved = savedWrite.mark
        guard QuickStats.phaseAfter(sent: mergedRev, responseRev: saved.rev, conflict: nil) == "saved" else {
            quickConflict = true
            needsRetry = true
            quickError = QuickStats.saveMessage("conflict")
            return
        }
        var fields: [String: Int] = [:]
        if let value = savedWrite.note.putts { fields["putts"] = value }
        if let value = savedWrite.note.gir { fields["gir"] = value }
        if let value = savedWrite.note.fir { fields["fir"] = value }
        let accepted = model.applyStatFields(roundId: round.roundId, fields: fields, notesAt: QuickStats.noteDate(savedWrite.note.updatedAt), session: identity.session)
        accountMarks = Dictionary(uniqueKeysWithValues: QuickStats.acceptSaved(account: Array(accountMarks.values), saved: saved).map { ($0.hole, $0) })
        revByHole = Dictionary(uniqueKeysWithValues: accountMarks.map { ($0.key, $0.value.rev) })
        if let current = pending[hole], current.touched == sent.touched, current.putts == sent.putts, current.gir == sent.gir, current.fairway == sent.fairway {
            pending[hole] = nil
        }
        showAccount(session: identity.session)
        if accepted {
            if let stamp = savedWrite.note.updatedAt { noteAt = stamp }
            if !leftRound {
                if let value = fields["putts"] {
                    puttsText = QuickStats.visibleTotal(current: puttsText, authoritative: String(value), focused: statFocus == .putts)
                }
                if let value = fields["gir"] {
                    girText = QuickStats.visibleTotal(current: girText, authoritative: String(value), focused: statFocus == .gir)
                }
                if let value = fields["fir"] {
                    firText = QuickStats.visibleTotal(current: firText, authoritative: String(value), focused: statFocus == .fir)
                }
            }
        }
        quickError = ""
        quickConflict = false
        needsRetry = false
    }

    private func showMarkFailure(_ error: Error) {
        if let golf = error as? GolfletError, case .http(let status, _) = golf, status == 409 {
            quickConflict = true
            needsRetry = true
            quickError = QuickStats.saveMessage("conflict")
            return
        }
        needsRetry = true
        quickError = QuickStats.saveMessage("error")
    }

    private func retryLoad(scheduled: QuickWorkIdentity) async {
        guard QuickDispatch.visitStill(scheduled, model: model, visit: visit) else { return }
        if quickConflict {
            pending.removeAll()
            needsRetry = false
            await reloadAccount(session: scheduled.session, generation: scheduled.generation)
            return
        }
        needsRetry = false
        leftRound = false
        await reloadAccount(session: scheduled.session, generation: scheduled.generation)
        let continued = QuickWorkIdentity(session: scheduled.session, generation: scheduled.generation, load: loadGen)
        guard accountReady, QuickDispatch.visitStill(continued, model: model, visit: visit) else {
            needsRetry = !accountReady && QuickDispatch.visitStill(continued, model: model, visit: visit)
            return
        }
        for hole in pending.keys.sorted() {
            guard QuickDispatch.visitStill(continued, model: model, visit: visit) else { return }
            await commit(hole: hole, identity: continued)
        }
    }

    private func ensureLoaded(identity: QuickWorkIdentity) -> Task<Void, Never> {
        enqueueLoad(identity: identity, replace: false, force: false)
    }

    private func enqueueLoad(identity: QuickWorkIdentity, replace: Bool, force: Bool) -> Task<Void, Never> {
        queue.enqueueLoad(
            identity: identity,
            replace: replace,
            model: model,
            visit: visit,
            load: { self.loadGen },
            read: { await self.model.readHoleMarks(roundId: self.round.roundId, session: identity.session) },
            apply: { self.absorb($0, force: force, identity: identity) }
        )
    }

    private func reloadAccount(session: Int, generation: Int) async {
        let opener = QuickWorkIdentity(session: session, generation: generation, load: loadGen)
        guard QuickDispatch.visitStill(opener, model: model, visit: visit) else { return }
        markRev += 1
        loadGen += 1
        quickConflict = false
        accountReady = false
        let identity = QuickWorkIdentity(session: session, generation: generation, load: loadGen)
        await enqueueLoad(identity: identity, replace: true, force: true).value
    }

    private func absorb(_ read: QuickRoundResult<[HoleMark]>, force: Bool, identity: QuickWorkIdentity) {
        switch read {
        case .notSent, .ignored:
            return
        case .failed:
            if accountReady, !force { return }
            accountReady = false
            needsRetry = true
            quickError = "No se pudo leer la cuenta. Los totales de la tarjeta siguen igual."
        case .value(let marks):
            if !force, accountReady { return }
            var loaded: [Int: HoleMark] = [:]
            for mark in marks {
                loaded[mark.hole] = mark
            }
            accountMarks = loaded
            revByHole = Dictionary(uniqueKeysWithValues: loaded.map { ($0.key, $0.value.rev) })
            showAccount(session: identity.session)
            accountReady = true
            quickError = ""
            quickConflict = false
        }
    }
}
