import Foundation
import Speech
import AVFoundation

enum RecapSpeech {
    static let preferredIdentifiers = ["es-AR", "es-ES", "es-MX"]

    static func requestAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        if RuntimeFlags.isUITesting { return .authorized }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
    }

    static func transcribe(url: URL?) async throws -> String {
        if RuntimeFlags.isUITesting {
            return "Jugué bastante bien, 79. Hice tres putts en el hoyo 3 y en el 12."
        }
        let status = await requestAuthorization()
        guard status == .authorized else {
            throw GolfletError.server("Golflet transcribe en el iPhone. Tenés que permitir el reconocimiento de voz en Ajustes.")
        }
        guard let url else {
            throw GolfletError.server("No quedó el audio para transcribir.")
        }
        if #available(iOS 26.0, *) {
            if let text = try await transcribeModern(url: url), !text.isEmpty {
                return text
            }
        }
        return try await transcribeLegacy(url: url)
    }

    static func pickLocale(from supported: [Locale]) -> Locale? {
        let normalized = supported.map { ($0, $0.identifier.replacingOccurrences(of: "_", with: "-").lowercased()) }
        for id in preferredIdentifiers {
            let key = id.lowercased()
            if let match = normalized.first(where: { $0.1 == key || $0.1.hasPrefix(key) }) {
                return match.0
            }
        }
        return normalized.first { $0.1.hasPrefix("es") }?.0
    }

    @available(iOS 26.0, *)
    private static func transcribeModern(url: URL) async throws -> String? {
        let supported = Array(await SpeechTranscriber.supportedLocales)
        var locale = pickLocale(from: supported)
        if locale == nil {
            for id in preferredIdentifiers {
                if let match = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: id)) {
                    locale = match
                    break
                }
            }
        }
        guard let locale else { return nil }

        let transcriber = SpeechTranscriber(locale: locale, preset: .transcription)
        if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
            try await request.downloadAndInstall()
        }

        let file = try AVAudioFile(forReading: url)
        let collector = Task { () -> String in
            var parts: [String] = []
            for try await result in transcriber.results {
                let piece = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
                guard !piece.isEmpty else { continue }
                if !result.isFinal { continue }
                parts.append(piece)
            }
            return parts.joined(separator: " ")
        }

        let analyzer = SpeechAnalyzer(modules: [transcriber])
        if let last = try await analyzer.analyzeSequence(from: file) {
            try await analyzer.finalizeAndFinish(through: last)
        } else {
            await analyzer.cancelAndFinishNow()
        }
        let text = try await collector.value.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    private static func transcribeLegacy(url: URL) async throws -> String {
        let supported = Array(SFSpeechRecognizer.supportedLocales())
        let locale = pickLocale(from: supported) ?? Locale(identifier: "es-ES")
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            throw GolfletError.server("Este iPhone no puede transcribir en español en el dispositivo.")
        }
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        return try await withCheckedThrowingContinuation { continuation in
            var finished = false
            recognizer.recognitionTask(with: request) { result, error in
                if finished { return }
                if let error {
                    finished = true
                    continuation.resume(throwing: error)
                    return
                }
                if let result, result.isFinal {
                    finished = true
                    continuation.resume(returning: result.bestTranscription.formattedString)
                }
            }
        }
    }
}
