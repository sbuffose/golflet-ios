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

/// Tokens taken when a mark or a load is scheduled. Later code may compare them.
/// It may not replace them with whatever session or visit is current after a wait.
struct QuickWorkIdentity: Equatable {
    var session: Int
    var generation: Int
    var load: Int
}

struct QuickFinish {
    /// The request was sent and this session is still that session.
    var applyModel: Bool
    /// That same visit is still the one on screen.
    var touchScreen: Bool
}

@MainActor
enum QuickDispatch {
    /// A mark or a note may start. The visit generation is the one from scheduling.
    static func visitStill(_ id: QuickWorkIdentity, model: AppModel, visit: RoundVisit) -> Bool {
        model.sessionStill(id.session) && visit.allows(id.generation)
    }

    /// A load may start or paint. A newer load on this screen is a different load.
    static func loadStill(_ id: QuickWorkIdentity, model: AppModel, visit: RoundVisit, load: Int) -> Bool {
        id.load == load && visitStill(id, model: model, visit: visit)
    }

    /// After a request that already left. This does not cancel it.
    static func finish(_ id: QuickWorkIdentity, model: AppModel, visit: RoundVisit) -> QuickFinish {
        let session = model.sessionStill(id.session)
        return QuickFinish(applyModel: session, touchScreen: session && visit.allows(id.generation))
    }

    static func runMark<Value>(
        identity: QuickWorkIdentity,
        model: AppModel,
        visit: RoundVisit,
        send: @escaping () async -> QuickRoundResult<Value>,
        onModel: @escaping (Value) -> Void,
        onScreen: @escaping (Value) -> Void,
        onFailure: @escaping (Error) -> Void
    ) async {
        guard visitStill(identity, model: model, visit: visit) else { return }
        let attempt = await send()
        let done = finish(identity, model: model, visit: visit)
        switch attempt {
        case .notSent, .ignored:
            return
        case .failed(let error):
            guard done.touchScreen else { return }
            onFailure(error)
        case .value(let value):
            guard done.applyModel else { return }
            onModel(value)
            guard done.touchScreen else { return }
            onScreen(value)
        }
    }
}

/// The screen's save queue and load queue. Identity is an argument, never reread inside a wait.
@MainActor
final class QuickWorkQueue {
    private var saveChain: Task<Void, Never>?
    private var loadChain: Task<Void, Never>?

    func dropLoad() {
        loadChain = nil
    }

    @discardableResult
    func enqueueMark(
        identity: QuickWorkIdentity,
        model: AppModel,
        visit: RoundVisit,
        waitForAccount: @escaping @MainActor () async -> Void,
        commit: @escaping @MainActor () async -> Void
    ) -> Task<Void, Never> {
        let previous = saveChain
        let task = Task { @MainActor in
            await previous?.value
            guard QuickDispatch.visitStill(identity, model: model, visit: visit) else { return }
            await waitForAccount()
            guard QuickDispatch.visitStill(identity, model: model, visit: visit) else { return }
            await commit()
        }
        saveChain = task
        return task
    }

    @discardableResult
    func enqueueLoad(
        identity: QuickWorkIdentity,
        replace: Bool,
        model: AppModel,
        visit: RoundVisit,
        load: @escaping @MainActor () -> Int,
        read: @escaping @MainActor () async -> QuickRoundResult<[HoleMark]>,
        apply: @escaping @MainActor (QuickRoundResult<[HoleMark]>) -> Void
    ) -> Task<Void, Never> {
        if !replace, let loadChain { return loadChain }
        let job = Task { @MainActor in
            guard QuickDispatch.loadStill(identity, model: model, visit: visit, load: load()) else { return }
            let result = await read()
            guard QuickDispatch.loadStill(identity, model: model, visit: visit, load: load()) else { return }
            apply(result)
        }
        loadChain = job
        return job
    }
}
