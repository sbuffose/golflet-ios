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
            Text(round.displayTitle)
                .font(GType.sheetTitle)
                .tracking(-1.2)
                .foregroundStyle(p.ink)
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
                Text("Esta tarjeta se jugó en \(round.displayCourse). Golfistics no trae el detalle por hoyo.")
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
            HStack(spacing: 14) {
                legend(.eagleOrBetter, "Águila")
                legend(.birdie, "Birdie")
                legend(.bogey, "Bogey")
                legend(.doubleOrWorse, "Doble+")
            }
            Text(caption)
                .font(GType.label)
                .foregroundStyle(p.ink3)
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

    private func legend(_ result: HoleResult, _ label: String) -> some View {
        HStack(spacing: 4) {
            ScoreMark(strokes: result == .eagleOrBetter ? 2 : result == .birdie ? 3 : result == .bogey ? 5 : 6, result: result, diameter: 16)
            Text(label)
                .font(GType.label)
                .foregroundStyle(p.ink2)
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
            HStack(spacing: 10) {
                gameField("Putts", $puttsText)
                gameField("Greens", $girText)
                gameField("Fairways", $firText)
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
        return HStack {
            Text("\(hole.number)")
                .font(GFont.ui(14, weight: .semibold))
                .tabular()
                .frame(width: 24)
            Stepper(value: Binding(
                get: { extra?.putts ?? 0 },
                set: { update(hole: hole.number, putts: $0, gir: extra?.gir, fairway: extra?.fairway) }
            ), in: 0...6) {
                Text("Putts \(extra?.putts.map(String.init) ?? "—")")
                    .font(GType.label)
            }
            Toggle("GIR", isOn: Binding(
                get: { extra?.gir ?? false },
                set: { update(hole: hole.number, putts: extra?.putts, gir: $0, fairway: extra?.fairway) }
            ))
            .labelsHidden()
            .tint(p.primary)
            if hole.par != 3 {
                Picker("FW", selection: Binding(
                    get: { extra?.fairway ?? "na" },
                    set: { update(hole: hole.number, putts: extra?.putts, gir: extra?.gir, fairway: $0) }
                )) {
                    Text("—").tag("na")
                    Text("Hit").tag("hit")
                    Text("Izq").tag("left")
                    Text("Der").tag("right")
                }
                .pickerStyle(.menu)
            }
        }
        .font(GType.label)
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
                        .foregroundStyle(p.accent)
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
        let b = round.counts
        let dif = differential.map { "Diferencial estimado por Golflet: \(FormatAR.one($0))." } ?? ""
        return "\(b.birdies) birdies · \(b.pars) pares · \(b.bogeys) bogeys · \(b.doubles) dobles. \(dif)"
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
        let extra = HoleExtra(roundId: round.roundId, hole: hole, putts: putts, gir: gir, fairway: fairway)
        extras[hole] = extra
        model.notes.upsertExtra(extra)
    }
}
