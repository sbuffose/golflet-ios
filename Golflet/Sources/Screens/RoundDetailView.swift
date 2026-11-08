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
    @State private var needsRetry = false
    @State private var leftRound = false
    @State private var pending: [Int: PendingHole] = [:]
    @State private var markRev = 0
    @State private var revByHole: [Int: Int] = [:]
    @State private var accountReady = false
    @State private var accountMarks: [Int: HoleMark] = [:]
    @State private var loadGen = 0
    @State private var loadChain: Task<Void, Never>?
    @State private var saveChain: Task<Void, Never>?
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
            loadChain = nil
            await ensureLoaded().value
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
                gameField("Putts", $puttsText, .putts)
                gameField("Greens", $girText, .gir)
                gameField("Fairways", $firText, .fir)
            }
            if !quickError.isEmpty {
                Text(quickError)
                    .font(GType.label)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("quick-save-error")
                if quickConflict || needsRetry {
                    Button("Reintentar") { Task { await retryLoad() } }
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
            if let stamp = note.updatedAt { noteAt = stamp }
            if let value = note.putts {
                puttsText = QuickStats.visibleTotal(current: puttsText, authoritative: String(value), focused: statFocus == .putts)
            }
            if let value = note.gir {
                girText = QuickStats.visibleTotal(current: girText, authoritative: String(value), focused: statFocus == .gir)
            }
            if let value = note.fir {
                firText = QuickStats.visibleTotal(current: firText, authoritative: String(value), focused: statFocus == .fir)
            }
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
        let previous = saveChain
        let task = Task { @MainActor in
            await previous?.value
            await ensureLoaded().value
            await commit(hole: hole)
        }
        saveChain = task
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

    private func commit(hole: Int) async {
        guard !quickConflict else { return }
        guard let edit = pending[hole] else { return }
        let sent = edit
        let session = model.sessionEpoch
        let generation = visit.generation
        guard model.sessionStill(session), visit.allows(generation) else { return }
        guard QuickStats.sendDecision(accountReady: accountReady, stillHere: visit.allows(generation)) == "send" else {
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
        let attempt = await model.sendHoleMark(roundId: round.roundId, session: session, mark: mark)
        switch attempt {
        case .notSent, .ignored:
            return
        case .failed(let error):
            guard model.sessionStill(session), visit.allows(generation) else { return }
            if let golf = error as? GolfletError, case .http(let status, _) = golf, status == 409 {
                quickConflict = true
                needsRetry = true
                quickError = QuickStats.saveMessage("conflict")
                return
            }
            needsRetry = true
            quickError = QuickStats.saveMessage("error")
        case .value(let savedWrite):
            guard model.sessionStill(session) else { return }
            let saved = savedWrite.mark
            guard QuickStats.phaseAfter(sent: merged.rev, responseRev: saved.rev, conflict: nil) == "saved" else {
                guard visit.allows(generation) else { return }
                quickConflict = true
                needsRetry = true
                quickError = QuickStats.saveMessage("conflict")
                return
            }
            let stamp = savedWrite.note.updatedAt
            var fields: [String: Int] = [:]
            if let value = savedWrite.note.putts { fields["putts"] = value }
            if let value = savedWrite.note.gir { fields["gir"] = value }
            if let value = savedWrite.note.fir { fields["fir"] = value }
            let accepted = model.applyStatFields(roundId: round.roundId, fields: fields, notesAt: QuickStats.noteDate(stamp), session: session)
            guard visit.allows(generation) else { return }
            accountMarks = Dictionary(uniqueKeysWithValues: QuickStats.acceptSaved(account: Array(accountMarks.values), saved: saved).map { ($0.hole, $0) })
            revByHole = Dictionary(uniqueKeysWithValues: accountMarks.map { ($0.key, $0.value.rev) })
            if let current = pending[hole], current.touched == sent.touched, current.putts == sent.putts, current.gir == sent.gir, current.fairway == sent.fairway {
                pending[hole] = nil
            }
            showAccount(session: session)
            if accepted {
                if let stamp { noteAt = stamp }
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
    }

    private func retryLoad() async {
        if quickConflict {
            pending.removeAll()
            needsRetry = false
            await reloadAccount()
            return
        }
        needsRetry = false
        leftRound = false
        await reloadAccount()
        guard accountReady, !leftRound else {
            needsRetry = !accountReady
            return
        }
        for hole in pending.keys.sorted() {
            await commit(hole: hole)
        }
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
        let session = model.sessionEpoch
        let generation = visit.generation
        let read = await model.readHoleMarks(roundId: round.roundId, session: session)
        guard gen == loadGen, model.sessionStill(session), visit.allows(generation) else { return }
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
            showAccount(session: session)
            accountReady = true
            quickError = ""
            quickConflict = false
        }
    }
}
