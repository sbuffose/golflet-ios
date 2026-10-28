import SwiftUI

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
                            mistakes(recap)
                            positives(recap)
                        }
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
                     : (isTranscribing ? "Transcribiendo en el iPhone…" : "Grabá hasta 4 minutos. Lo transcribimos en el iPhone."))
                    .font(GType.body)
                    .foregroundStyle(p.ink2)
                    .accessibilityIdentifier(isTranscribing ? "recap-transcribing" : "recap-record-hint")
                HStack {
                    Text(timeLabel)
                        .font(GType.headline)
                        .tabular()
                        .foregroundStyle(p.ink)
                    Spacer()
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
                        recorder.cancel()
                        recap = nil
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

    private func mistakes(_ recap: Recap) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Errores \(recap.mistakes.count)")
                .font(GType.overline)
                .foregroundStyle(p.ink3)
            ForEach(recap.mistakes) { item in
                HStack(alignment: .top, spacing: 10) {
                    Circle().fill(dot(item.category)).frame(width: 10, height: 10).padding(.top, 6)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.label + (item.hole.map { " · Hoyo \($0)" } ?? ""))
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text(item.text)
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
                .accessibilityIdentifier("recap-mistake-\(item.category)")
            }
        }
    }

    private func positives(_ recap: Recap) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Lo que salió bien")
                .font(GType.overline)
                .foregroundStyle(p.ink3)
            ForEach(recap.positives) { item in
                HStack(alignment: .top, spacing: 10) {
                    Circle().fill(p.positive).frame(width: 10, height: 10).padding(.top, 6)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Bien" + (item.hole.map { " · Hoyo \($0)" } ?? ""))
                            .font(GType.headline)
                            .foregroundStyle(p.ink)
                        Text(item.text)
                            .font(GType.body)
                            .foregroundStyle(p.ink2)
                    }
                }
                .accessibilityIdentifier("recap-positive")
            }
        }
    }

    private var timeLabel: String {
        let total = Int(recorder.elapsed.rounded())
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    private func dot(_ category: String) -> Color {
        switch category {
        case "putt": return Color(hex: 0xC8D4C4)
        case "salida": return Color(hex: 0xE8C4B8)
        case "bunker": return p.sand
        case "estrategia": return Color(hex: 0xD4C8E0)
        default: return p.accent
        }
    }

    private func toggleRecord() {
        if recorder.isRecording {
            if let data = recorder.stop() {
                Task { await finishRecording(audio: data) }
            }
        } else {
            do {
                try recorder.start()
            } catch {
                message = error.localizedDescription
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
            message = error.localizedDescription
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
            message = error.localizedDescription
        }
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
