import SwiftUI
import UIKit

struct RecapTarget: Identifiable, Hashable {
    var id: String { roundId ?? liveRoundId ?? "new" }
    var roundId: String?
    var liveRoundId: String?
}

struct RecapView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.palette) private var p
    @Environment(\.dismiss) private var dismiss

    var roundId: String?
    var liveRoundId: String?

    @State private var recap: Recap?
    @State private var recorder = RecapRecorder()
    @State private var transcript = ""
    @State private var summary = ""
    @State private var message: String?
    @State private var isSaving = false
    @State private var isTranscribing = false
    @State private var showsTranscript = false
    @State private var playback = RecapPlayback()

    var body: some View {
        GScreen(id: "screen-recap") {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 20) {
                    header
                    recordCard
                    if let recap {
                        statusCard(recap)
                        if recap.status == "ready" || recap.status == "error" || recap.transcript != nil {
                            editor
                        }
                    }
                    if !holeBeats.isEmpty {
                        timeline(holeBeats)
                    }
                    if let message {
                        Text(message)
                            .font(GType.label)
                            .foregroundStyle(p.negative)
                    }
                }
                .padding(.horizontal, 20)
                .padding(.top, 8)
                .padding(.bottom, 32)
            }
        }
        .accessibilityIdentifier("screen-recap")
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
                .accessibilityIdentifier("close-recap")
            }
            .padding(.horizontal, 20)
            .padding(.top, 8)
        }
        .task {
            _ = await RecapSpeech.requestAuthorization()
            await load()
        }
        .onChange(of: recorder.isRecording) { _, _ in syncAwake() }
        .onChange(of: playback.isPlaying) { _, _ in syncAwake() }
        .onChange(of: isTranscribing) { _, _ in syncAwake() }
        .onChange(of: recorder.finishedAudio) { _, data in
            guard let data else { return }
            recorder.finishedAudio = nil
            isTranscribing = true
            syncAwake()
            Task { await finishRecording(audio: data) }
        }
        .onChange(of: transcript) { _, text in
            guard recorder.isRecording || isTranscribing else { return }
            if recorder.spokenText.isEmpty {
                recorder.noteSpoken(text)
            }
        }
        .onDisappear {
            playback.stop()
            UIApplication.shared.isIdleTimerDisabled = false
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            GOverline(text: "Última ronda")
            HStack {
                GTitle(text: "Contá cómo te fue", size: 30)
                Spacer()
                if recap?.status == "ready" {
                    Text("Guardado")
                        .font(GType.label)
                        .foregroundStyle(p.ink2)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 6)
                        .background(p.surface2)
                        .clipShape(Capsule())
                }
            }
        }
    }

    private var recordCard: some View {
        GCard(radius: 22, padding: 16) {
            VStack(alignment: .leading, spacing: 12) {
                Text(recorder.isRecording
                     ? "Grabando…"
                     : (isTranscribing ? "Transcribiendo en el dispositivo…" : "Grabá hasta 10 minutos. Lo transcribimos en el dispositivo."))
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier(isTranscribing ? "recap-transcribing" : "recap-record-hint")
                if let hole = liveHole {
                    Text("Hoyo \(hole)")
                        .font(GType.headline)
                        .foregroundStyle(p.onPrimary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(p.primary)
                        .clipShape(Capsule())
                        .accessibilityIdentifier("recap-live-hole")
                }
                HStack {
                    Text(timeLabel)
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                    Spacer()
                    if recorder.lastURL != nil, !recorder.isRecording {
                        Button {
                            playback.toggle(url: recorder.lastURL)
                            syncAwake()
                        } label: {
                            Text(playback.isPlaying ? "Pausa" : "Escuchar")
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 10)
                                .background(p.surface2)
                                .clipShape(Capsule())
                        }
                        .accessibilityIdentifier("recap-play")
                        .disabled(isTranscribing || isSaving)
                    }
                    Button {
                        toggleRecord()
                    } label: {
                        Text(recorder.isRecording ? "Parar" : "Grabar")
                            .font(GType.headline)
                            .foregroundStyle(p.onPrimary)
                            .padding(.horizontal, 18)
                            .padding(.vertical, 10)
                            .background(recorder.isRecording ? p.negative : p.primary)
                            .clipShape(Capsule())
                    }
                    .accessibilityIdentifier("recap-record")
                    .disabled(isTranscribing || isSaving)
                }
                HStack(spacing: 10) {
                    Button {
                        showsTranscript.toggle()
                    } label: {
                        Label("Editar texto", systemImage: "pencil")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(p.surface2)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("recap-edit")
                    Button {
                        playback.stop()
                        recorder.cancel()
                        recap = nil
                        syncAwake()
                    } label: {
                        Label("Grabar de nuevo", systemImage: "mic")
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(p.surface2)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("recap-rerecord")
                }
                if showsTranscript {
                    TextEditor(text: $transcript)
                        .font(GType.body)
                        .scrollContentBackground(.hidden)
                        .frame(minHeight: 88)
                        .accessibilityIdentifier("recap-transcript")
                    Button("Guardar texto") {
                        Task { await saveTyped() }
                    }
                    .font(GType.headline)
                    .foregroundStyle(p.primary)
                    .accessibilityIdentifier("recap-save-text")
                }
            }
        }
    }

    private func statusCard(_ recap: Recap) -> some View {
        Group {
            if recap.status == "pending_ai" || recap.status == "processing" {
                GCard(radius: 18, padding: 14) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(recap.error?.isEmpty == false ? recap.error! : RecapCopy.pendingAI)
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier("recap-pending")
                        Button("Reintentar") {
                            Task { await retry() }
                        }
                        .font(GType.headline)
                        .foregroundStyle(p.primary)
                        .accessibilityIdentifier("recap-retry")
                    }
                }
            }
        }
    }

    private var editor: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Resumen")
                .font(GType.section)
                .foregroundStyle(p.ink)
            GCard(radius: 18, padding: 14) {
                TextField("Qué salió", text: $summary, axis: .vertical)
                    .font(GType.body)
                    .foregroundStyle(p.ink)
                    .accessibilityIdentifier("recap-summary")
                    .onChange(of: summary) { _, _ in persistEdits() }
            }
            if !transcript.isEmpty {
                DisclosureGroup("Lo que dijiste") {
                    Text(transcript)
                        .font(GType.body)
                        .foregroundStyle(p.ink2)
                }
                .font(GType.headline)
                .foregroundStyle(p.ink)
            }
        }
    }

    private var holeBeats: [RecapHoleBeat] {
        let text: String
        let mistakes: [RecapMistake]
        let positives: [RecapPositive]
        if recorder.isRecording || (isTranscribing && transcript.isEmpty) {
            text = recorder.spokenText
            mistakes = []
            positives = []
        } else {
            text = transcript
            mistakes = recap?.mistakes ?? []
            positives = recap?.positives ?? []
        }
        return RecapTimeline.build(transcript: text, mistakes: mistakes, positives: positives, card: cardHoles)
    }

    private var cardHoles: [RecapCardHole] {
        let round = model.rounds.first { $0.roundId == roundId }
            ?? (model.presentedRound?.roundId == roundId ? model.presentedRound : nil)
            ?? (model.home.lastRound?.roundId == roundId ? model.home.lastRound : nil)
        return (round?.holes ?? []).map {
            RecapCardHole(number: $0.number, par: $0.par, strokes: $0.strokes, toPar: $0.toPar, result: $0.result)
        }
    }

    private var liveHole: Int? {
        guard recorder.isRecording || isTranscribing else { return nil }
        if !transcript.isEmpty, let hole = RecapTimeline.latestHole(in: transcript) { return hole }
        if let hole = recorder.currentHole { return hole }
        return RecapTimeline.latestHole(in: recorder.spokenText)
    }

    private func timeline(_ beats: [RecapHoleBeat]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Por hoyo")
                .font(GType.section)
                .foregroundStyle(p.ink)
                .accessibilityIdentifier("recap-timeline")
            ForEach(beats) { beat in
                holeBeat(beat)
            }
        }
    }

    private func holeBeat(_ beat: RecapHoleBeat) -> some View {
        let rail = toneColor(beat.tone)
        return HStack(alignment: .top, spacing: 12) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .fill(rail)
                .frame(width: 4)
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(beat.title)
                        .font(GType.headline)
                        .foregroundStyle(p.ink)
                    if recorder.isRecording, beat.hole == liveHole {
                        Text("Ahora")
                            .font(GType.label)
                            .foregroundStyle(p.onPrimary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(p.primary)
                            .clipShape(Capsule())
                    }
                    Spacer(minLength: 8)
                    if let score = beat.scoreLine {
                        Text(score)
                            .font(GType.label)
                            .foregroundStyle(p.ink2)
                            .accessibilityIdentifier(beat.hole.map { "recap-hole-\($0)-score" } ?? "recap-hole-general-score")
                    }
                    if let toPar = beat.toParLine {
                        Text(toPar)
                            .font(GType.headline)
                            .tabular()
                            .foregroundStyle(rail)
                    }
                }
                ForEach(beat.lines) { line in
                    HStack(alignment: .top, spacing: 8) {
                        Circle()
                            .fill(toneColor(line.kind))
                            .frame(width: 8, height: 8)
                            .padding(.top, 6)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(line.title)
                                .font(GType.headline)
                                .foregroundStyle(p.ink)
                            Text(line.text)
                                .font(GType.body)
                                .foregroundStyle(p.ink2)
                        }
                    }
                }
                if let agreement = beat.agreement {
                    Text(agreement.label)
                        .font(GType.label)
                        .foregroundStyle(agreement.coincides ? p.primary : p.negative)
                        .accessibilityIdentifier(beat.hole.map { "recap-hole-\($0)-match" } ?? "recap-hole-general-match")
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(beat.tone == .bad ? p.accentSoft : p.surface)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier(beat.hole.map { "recap-hole-\($0)" } ?? "recap-hole-general")
    }

    private func toneColor(_ tone: RecapTone) -> Color {
        switch tone {
        case .good: return p.primary
        case .bad: return p.negative
        case .even: return p.ink3
        }
    }

    private var timeLabel: String {
        let total = Int(recorder.elapsed.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func syncAwake() {
        UIApplication.shared.isIdleTimerDisabled = recorder.isRecording || playback.isPlaying || isTranscribing
    }

    private func toggleRecord() {
        playback.stop()
        if recorder.isRecording {
            if let data = recorder.stop() {
                isTranscribing = true
                syncAwake()
                Task { await finishRecording(audio: data) }
            } else {
                syncAwake()
            }
        } else {
            do {
                try recorder.start()
                syncAwake()
            } catch {
                message = error.localizedDescription
                syncAwake()
            }
        }
    }

    private func load() async {
        do {
            if let found = try await model.api.recap(roundId: roundId, liveRoundId: liveRoundId) {
                apply(found)
            }
        } catch {
            message = error.localizedDescription
        }
    }

    private func finishRecording(audio: Data) async {
        isTranscribing = true
        isSaving = true
        message = nil
        defer {
            isTranscribing = false
            isSaving = false
            syncAwake()
        }
        do {
            var draft = try await RecapOnDevice.process(url: recorder.lastURL)
            draft.durationS = recorder.elapsed
            transcript = draft.transcript
            summary = draft.summary ?? ""
            if let pending = recap, pending.status == "pending_ai" || pending.status == "processing" {
                apply(try await model.api.patchRecap(id: pending.id, body: draft.patchBody))
            } else {
                apply(try await model.api.uploadRecap(
                    audio: audio,
                    roundId: roundId,
                    liveRoundId: liveRoundId,
                    draft: draft
                ))
            }
        } catch {
            queueRecap(audio: audio, transcript: transcript, summary: summary)
            message = "Sin red. El recap quedó en cola y se manda al volver."
        }
    }

    private func saveTyped() async {
        do {
            let draft = await RecapOnDevice.structure(transcript: transcript)
                ?? RecapDraft(transcript: transcript, structuredOnDevice: false)
            if let pending = recap, pending.status == "pending_ai" || pending.status == "processing" {
                apply(try await model.api.patchRecap(id: pending.id, body: draft.patchBody))
            } else {
                apply(try await model.api.typedRecap(roundId: roundId, liveRoundId: liveRoundId, draft: draft))
            }
            showsTranscript = false
        } catch {
            queueRecap(audio: nil, transcript: transcript, summary: summary)
            message = "Sin red. El recap quedó en cola y se manda al volver."
        }
    }

    private func queueRecap(audio: Data?, transcript: String, summary: String) {
        RecapQueue.enqueue(RecapQueued(
            clientId: String(UUID().uuidString.prefix(32)),
            roundId: roundId,
            liveRoundId: liveRoundId,
            transcript: transcript,
            summary: summary.isEmpty ? nil : summary,
            source: "ios_on_device",
            model: "apple-speech-es-AR + apple-fm",
            durationS: recorder.elapsed,
            audio: audio
        ))
    }

    private func retry() async {
        isTranscribing = true
        defer { isTranscribing = false }
        do {
            if recorder.lastURL != nil || RuntimeFlags.isUITesting {
                var draft = try await RecapOnDevice.process(url: recorder.lastURL)
                draft.durationS = recorder.elapsed
                transcript = draft.transcript
                summary = draft.summary ?? ""
                if let id = recap?.id {
                    apply(try await model.api.patchRecap(id: id, body: draft.patchBody))
                } else {
                    apply(try await model.api.typedRecap(roundId: roundId, liveRoundId: liveRoundId, draft: draft))
                }
            } else {
                message = RecapCopy.pendingAI
            }
        } catch {
            message = error.localizedDescription
        }
    }

    private func persistEdits() {
        guard let id = recap?.id else { return }
        Task {
            try? await Task.sleep(nanoseconds: 700_000_000)
            _ = try? await model.api.patchRecap(id: id, body: [
                "transcript": transcript,
                "summary": summary
            ])
        }
    }

    private func apply(_ recap: Recap) {
        self.recap = recap
        transcript = recap.transcript ?? ""
        summary = recap.summary ?? ""
    }
}
