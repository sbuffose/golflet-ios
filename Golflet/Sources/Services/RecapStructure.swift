import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

enum RecapOnDevice {
    static func process(url: URL?) async throws -> RecapDraft {
        if RuntimeFlags.isUITesting {
            return demo(transcript: "Jugué bastante bien, 79. Hice tres putts en el hoyo 3 y en el 12.")
        }
        let transcript = try await RecapSpeech.transcribe(url: url)
        if let structured = await structure(transcript: transcript) {
            return structured
        }
        return RecapDraft(transcript: transcript, structuredOnDevice: false)
    }

    static func structure(transcript: String) async -> RecapDraft? {
        if RuntimeFlags.isUITesting { return demo(transcript: transcript) }
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            return await generate(transcript: transcript)
        }
        #endif
        return nil
    }

    static func demo(transcript: String) -> RecapDraft {
        RecapDraft(
            transcript: transcript,
            summary: "Vuelta sólida, con problemas de putt en el 3 y el 12.",
            mistakes: [
                RecapMistake(category: "putt", hole: 3, text: "Tres putts en el hoyo 3."),
                RecapMistake(category: "putt", hole: 12, text: "Tres putts en el hoyo 12.")
            ],
            positives: [
                RecapPositive(hole: nil, text: "Jugué bastante bien, 79.")
            ],
            structuredOnDevice: true
        )
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func generate(transcript: String) async -> RecapDraft? {
        let model = SystemLanguageModel.default
        guard case .available = model.availability else { return nil }
        let session = LanguageModelSession(instructions: """
            Sos un caddie en Argentina. Del recap de golf del jugador extraé:
            un resumen corto, los errores y lo que salió bien.
            Categorías de error: salida, approach, juego_corto, bunker, putt, estrategia, otro.
            Español rioplatense. hole es 0 si no se mencionó el hoyo.
            """)
        do {
            let response = try await session.respond(
                to: "Recap del jugador:\n\(transcript)",
                generating: OnDeviceRecapStructure.self
            )
            let content = response.content
            return RecapDraft(
                transcript: transcript,
                summary: content.summary,
                mistakes: content.mistakes.compactMap { item in
                    let text = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return nil }
                    return RecapMistake(
                        category: Self.normalize(item.category),
                        hole: (1...18).contains(item.hole) ? item.hole : nil,
                        text: text
                    )
                },
                positives: content.positives.compactMap { item in
                    let text = item.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else { return nil }
                    return RecapPositive(hole: (1...18).contains(item.hole) ? item.hole : nil, text: text)
                },
                structuredOnDevice: true
            )
        } catch {
            return nil
        }
    }

    private static func normalize(_ raw: String) -> String {
        let folded = raw.folding(options: .diacriticInsensitive, locale: Locale(identifier: "es_AR")).lowercased()
        if folded.contains("salida") || folded.contains("drive") { return "salida" }
        if folded.contains("approach") { return "approach" }
        if folded.contains("corto") { return "juego_corto" }
        if folded.contains("bunker") { return "bunker" }
        if folded.contains("putt") { return "putt" }
        if folded.contains("estrateg") || folded.contains("mental") { return "estrategia" }
        return "otro"
    }
    #endif
}

#if canImport(FoundationModels)
@available(iOS 26.0, *)
@Generable
struct OnDeviceRecapStructure {
    @Guide(description: "Resumen corto en espanol rioplatense, una o dos oraciones.")
    var summary: String
    var mistakes: [OnDeviceRecapMistake]
    var positives: [OnDeviceRecapPositive]
}

@available(iOS 26.0, *)
@Generable
struct OnDeviceRecapMistake {
    @Guide(description: "salida, approach, juego_corto, bunker, putt, estrategia u otro")
    var category: String
    @Guide(description: "Hoyo del 1 al 18, o 0 si no se menciono.")
    var hole: Int
    var text: String
}

@available(iOS 26.0, *)
@Generable
struct OnDeviceRecapPositive {
    @Guide(description: "Hoyo del 1 al 18, o 0 si no se menciono.")
    var hole: Int
    var text: String
}
#endif
