import Foundation

enum QuickRoundResult<Value> {
    /// The session or visit was already gone. The request was not started.
    case notSent
    /// The request had already been sent. Its completion was not applied.
    case ignored
    case value(Value)
    case failed(Error)
}

/// One open visit of a round. Leaving and entering again is a new generation.
@MainActor
final class RoundVisit {
    private(set) var generation = 0
    private(set) var left = false

    func enter() {
        left = false
        generation += 1
    }

    func leave() {
        left = true
    }

    func allows(_ generation: Int) -> Bool {
        !left && self.generation == generation
    }
}

/// Retains the note debounce so leaving or a new keystroke can cancel it before it sends.
@MainActor
final class QuickNoteSaver {
    private var task: Task<Void, Never>?

    func cancel() {
        task?.cancel()
        task = nil
    }

    func schedule(
        model: AppModel,
        roundId: String,
        text: String,
        putts: Int?,
        gir: Int?,
        fir: Int?,
        session: Int,
        visit: RoundVisit,
        generation: Int,
        delayNanoseconds: UInt64 = 600_000_000,
        onAccepted: @escaping @MainActor (QuickTotals) -> Void = { _ in }
    ) {
        task?.cancel()
        guard model.sessionStill(session), visit.allows(generation) else { return }
        model.notes.saveNote(roundId: roundId, text: text)
        task = Task {
            try? await Task.sleep(nanoseconds: delayNanoseconds)
            guard !Task.isCancelled else { return }
            guard model.sessionStill(session), visit.allows(generation) else { return }
            guard let note = await model.saveRoundNotes(
                roundId: roundId,
                putts: putts,
                gir: gir,
                fir: fir,
                text: text,
                session: session
            ) else { return }
            guard model.sessionStill(session), visit.allows(generation) else { return }
            onAccepted(note)
        }
    }
}
