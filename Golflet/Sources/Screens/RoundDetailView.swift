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
    @State private var quickError = ""
    @State private var quickConflict = false
    @State private var markRev = 0
    @State private var revByHole: [Int: Int] = [:]
    @State private var accountReady = false
    @State private var loadGen = 0
    @State private var loadChain: Task<Void, Never>?
    @State private var saveChain: Task<Void, Never>?

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
        .onAppear {
            extras = Dictionary(uniqueKeysWithValues: model.notes.extras(for: round.roundId).map { ($0.hole, $0) })
            noteText = model.notes.note(for: round.roundId)?.text ?? round.notes ?? ""
            if let putts = round.putts {
                puttsText = String(putts)
            }
            girText = round.gir.map(String.init) ?? ""
            firText = round.fir.map(String.init) ?? ""
        }
        .task(id: round.roundId) {
            accountReady = false
            loadGen += 1
            loadChain = nil
            await ensureLoaded().value
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
            heroCell("Dif.*", differential.map(FormatAR.one) ?? "—", emphasize: false)
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
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], alignment: .leading, spacing: 8) {
                legend(.eagleOrBetter, "Águila", categoryCount(.eagleOrBetter))
                legend(.birdie, "Birdie", categoryCount(.birdie))
                legend(.par, "Par", categoryCount(.par))
                legend(.bogey, "Bogey", categoryCount(.bogey))
                legend(.doubleOrWorse, "Doble+", categoryCount(.doubleOrWorse))
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

    private func categoryCount(_ result: HoleResult) -> Int {
        let known = round.holes.filter { $0.strokes != nil && $0.result != .unknown }
        if !known.isEmpty {
            return known.filter { $0.result == result }.count
        }
        switch result {
        case .eagleOrBetter:
            return ScoreCounts.resolvedEagles(reported: round.counts.eagles, holes: round.holes)
        case .birdie: return round.counts.birdies
        case .par: return round.counts.pars
        case .bogey: return round.counts.bogeys
        case .doubleOrWorse: return round.counts.doubles + round.counts.triples + round.counts.worse
        case .unknown: return 0
        }
    }

    private func legend(_ result: HoleResult, _ label: String, _ count: Int) -> some View {
        HStack(spacing: 4) {
            ScoreMark(strokes: count, result: result, diameter: 22)
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
                .lineLimit(1)
        }
        .accessibilityLabel("\(count) \(label)")
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
            HStack(spacing: 10) {
                gameField("Putts", $puttsText)
                gameField("Greens", $girText)
                gameField("Fairways", $firText)
            }
            if !quickError.isEmpty {
                Text(quickError)
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("quick-save-error")
                if quickConflict {
                    Button("Reintentar") { Task { await reloadAccount() } }
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

    private func gameField(_ label: String, _ text: Binding<String>) -> some View {
        GCard(radius: 16, padding: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label)
                    .font(GType.label)
                    .foregroundStyle(p.ink2)
                TextField("—", text: text)
                    .font(GType.statM)
                    .tabular()
                    .keyboardType(.numberPad)
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
                        update(hole: hole.number, putts: extra?.putts == n ? nil : n, gir: extra?.gir, fairway: extra?.fairway)
                    }
                }
            }
            HStack(spacing: 6) {
                statChip("GIR sí", on: extra?.gir == true) {
                    update(hole: hole.number, putts: extra?.putts, gir: extra?.gir == true ? nil : true, fairway: extra?.fairway)
                }
                statChip("GIR no", on: extra?.gir == false) {
                    update(hole: hole.number, putts: extra?.putts, gir: extra?.gir == false ? nil : false, fairway: extra?.fairway)
                }
            }
            if hole.par != 3 {
                HStack(spacing: 6) {
                    statChip("Izquierda", on: extra?.fairway == "left") {
                        update(hole: hole.number, putts: extra?.putts, gir: extra?.gir, fairway: extra?.fairway == "left" ? nil : "left")
                    }
                    statChip("Fairway", on: extra?.fairway == "hit") {
                        update(hole: hole.number, putts: extra?.putts, gir: extra?.gir, fairway: extra?.fairway == "hit" ? nil : "hit")
                    }
                    statChip("Derecha", on: extra?.fairway == "right") {
                        update(hole: hole.number, putts: extra?.putts, gir: extra?.gir, fairway: extra?.fairway == "right" ? nil : "right")
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
        model.notes.saveNote(roundId: round.roundId, text: noteText)
        Task {
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else { return }
            await model.saveRoundNotes(
                roundId: round.roundId,
                putts: Int(puttsText),
                gir: Int(girText),
                fir: Int(firText),
                text: noteText
            )
        }
    }

    private func update(hole: Int, putts: Int?, gir: Bool?, fairway: String?) {
        if quickConflict { return }
        markRev += 1
        let generation = markRev
        let previous = saveChain
        let task = Task { @MainActor in
            await previous?.value
            await ensureLoaded().value
            guard generation == markRev else { return }
            guard accountReady, !quickConflict else {
                if !accountReady {
                    quickError = "No se pudo leer la cuenta. Los totales de la tarjeta siguen igual."
                }
                return
            }
            let holes = round.holes.map { QuickHole(hole: $0.number, par: $0.par) }
            let par = round.holes.first { $0.number == hole }?.par ?? 0
            let drive = QuickStats.driveForAccount(par: par, fairway: fairway)
            guard QuickStats.accepts(hole: hole, drive: drive, holes: holes) else {
                quickError = "Ese hoyo no está en la tarjeta."
                return
            }
            let sent = QuickStats.nextRev(stored: revByHole[hole])
            revByHole[hole] = sent
            let extra = HoleExtra(roundId: round.roundId, hole: hole, putts: putts, gir: gir, fairway: par == 3 ? nil : fairway)
            extras[hole] = extra
            model.notes.upsertExtra(extra)
            let marks = extras.values.map {
                HoleMark(hole: $0.hole, putts: $0.putts, gir: $0.gir, drive: QuickStats.accountDrive($0.fairway), rev: revByHole[$0.hole] ?? sent)
            }
            let fields = QuickStats.noteFields(marks: marks, holes: holes)
            do {
                let mark = HoleMark(hole: hole, putts: putts, gir: gir, drive: drive, rev: sent)
                let saved = try await model.api.saveHoleMark(roundId: round.roundId, mark: mark)
                guard generation == markRev else { return }
                guard QuickStats.phaseAfter(sent: sent, responseRev: saved.rev, conflict: nil) == "saved" else {
                    quickConflict = true
                    quickError = QuickStats.saveMessage("conflict")
                    return
                }
                revByHole[hole] = saved.rev
                if !fields.isEmpty {
                    try await model.api.saveNoteFields(roundId: round.roundId, fields: fields)
                    guard generation == markRev else { return }
                    if let value = fields["putts"] { puttsText = String(value) }
                    if let value = fields["gir"] { girText = String(value) }
                    if let value = fields["fir"] { firText = String(value) }
                    model.applyStatFields(roundId: round.roundId, fields: fields)
                }
                quickError = ""
                quickConflict = false
            } catch let error as GolfletError {
                guard generation == markRev else { return }
                if case .http(let status, _) = error, status == 409 {
                    quickConflict = true
                    quickError = QuickStats.saveMessage("conflict")
                    return
                }
                quickError = QuickStats.saveMessage("error")
            } catch {
                guard generation == markRev else { return }
                quickError = QuickStats.saveMessage("error")
            }
        }
        saveChain = task
    }

    private func ensureLoaded() -> Task<Void, Never> {
        if let loadChain { return loadChain }
        let gen = loadGen
        let job = Task { @MainActor in
            await loadAccountMarks(force: false, gen: gen)
        }
        loadChain = job
        return job
    }

    private func reloadAccount() async {
        markRev += 1
        loadGen += 1
        let gen = loadGen
        quickConflict = false
        accountReady = false
        let job = Task { @MainActor in
            await loadAccountMarks(force: true, gen: gen)
        }
        loadChain = job
        await job.value
    }

    private func loadAccountMarks(force: Bool, gen: Int) async {
        do {
            let marks = try await model.api.holeMarks(roundId: round.roundId)
            guard gen == loadGen else { return }
            if !force, accountReady { return }
            var next: [Int: HoleExtra] = [:]
            var revs: [Int: Int] = [:]
            for mark in marks {
                revs[mark.hole] = mark.rev
                let visible = mark.putts != nil || mark.gir != nil || mark.drive?.isEmpty == false
                if visible {
                    let extra = HoleExtra(
                        roundId: round.roundId,
                        hole: mark.hole,
                        putts: mark.putts,
                        gir: mark.gir,
                        fairway: QuickStats.localFairway(mark.drive)
                    )
                    next[mark.hole] = extra
                    model.notes.upsertExtra(extra)
                } else {
                    model.notes.clearExtra(roundId: round.roundId, hole: mark.hole)
                }
            }
            for (hole, extra) in extras where next[hole] == nil && revs[hole] == nil {
                next[hole] = extra
            }
            extras = next
            revByHole = revs
            accountReady = true
            quickError = ""
            quickConflict = false
        } catch {
            guard gen == loadGen else { return }
            if accountReady, !force { return }
            accountReady = false
            quickError = "No se pudo leer la cuenta. Los totales de la tarjeta siguen igual."
        }
    }
}
