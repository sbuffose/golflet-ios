import Foundation
import Observation
import AVFoundation
import Speech

@MainActor
@Observable
final class RecapRecorder {
    var isRecording = false
    var elapsed: TimeInterval = 0
    var errorMessage: String?
    var lastURL: URL?
    var spokenText = ""
    var currentHole: Int?
    /// Set when the 10-minute cap stops the recorder, so the screen can still transcribe.
    var finishedAudio: Data?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private var speechEngine: AVAudioEngine?
    private var speechRequest: SFSpeechAudioBufferRecognitionRequest?
    private var speechTask: SFSpeechRecognitionTask?
    private var speechTapInstalled = false
    static let maxDuration: TimeInterval = 10 * 60
    private let limit: TimeInterval = RecapRecorder.maxDuration
    /// 10 minutes at 40 kbps, with headroom so the file cap does not cut the timer short.
    private let maxBytes = 6_000_000

    func start() throws {
        if RuntimeFlags.isUITesting {
            isRecording = true
            elapsed = 0
            return
        }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.defaultToSpeaker])
        try session.setActive(true)
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("golflet-recap.m4a")
        try? FileManager.default.removeItem(at: url)
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 22_050,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 40_000,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.prepareToRecord()
        guard recorder.record() else { throw GolfletError.server("No se pudo empezar a grabar.") }
        self.recorder = recorder
        lastURL = url
        isRecording = true
        elapsed = 0
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tick() }
        }
        startLiveCue()
    }

    func noteSpoken(_ text: String) {
        spokenText = text
        currentHole = RecapTimeline.latestHole(in: text)
    }

    func stop() -> Data? {
        timer?.invalidate()
        timer = nil
        stopLiveCue()
        isRecording = false
        if RuntimeFlags.isUITesting {
            return Data(repeating: 1, count: 2_048)
        }
        recorder?.stop()
        recorder = nil
        guard let url = lastURL, let data = try? Data(contentsOf: url) else { return nil }
        if data.count > maxBytes { return Data(data.prefix(maxBytes)) }
        return data
    }

    func cancel() {
        timer?.invalidate()
        timer = nil
        stopLiveCue()
        recorder?.stop()
        recorder = nil
        isRecording = false
        elapsed = 0
        spokenText = ""
        currentHole = nil
        finishedAudio = nil
    }

    private func tick() {
        elapsed += 0.25
        let tooBig = lastURL.flatMap { url -> Bool in
            guard let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber else { return false }
            return size.intValue >= maxBytes
        } ?? false
        guard tooBig || elapsed >= limit else { return }
        finishedAudio = stop()
    }

    private func startLiveCue() {
        if RuntimeFlags.isUITesting { return }
        let locale = RecapSpeech.pickLocale(from: Array(SFSpeechRecognizer.supportedLocales())) ?? Locale(identifier: "es-AR")
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else { return }
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = true
        let engine = AVAudioEngine()
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else { return }
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
            request.append(buffer)
        }
        speechTapInstalled = true
        engine.prepare()
        do {
            try engine.start()
        } catch {
            if speechTapInstalled {
                input.removeTap(onBus: 0)
                speechTapInstalled = false
            }
            return
        }
        speechEngine = engine
        speechRequest = request
        speechTask = recognizer.recognitionTask(with: request) { [weak self] result, _ in
            guard let text = result?.bestTranscription.formattedString, !text.isEmpty else { return }
            Task { @MainActor in
                self?.noteSpoken(text)
            }
        }
    }

    private func stopLiveCue() {
        speechRequest?.endAudio()
        speechTask?.cancel()
        speechTask = nil
        speechRequest = nil
        if speechTapInstalled {
            speechEngine?.inputNode.removeTap(onBus: 0)
            speechTapInstalled = false
        }
        speechEngine?.stop()
        speechEngine = nil
    }
}

@MainActor
@Observable
final class RecapPlayback {
    var isPlaying = false
    private var player: AVAudioPlayer?
    private var finisher: Finish?

    func toggle(url: URL?) {
        if isPlaying {
            stop()
            return
        }
        guard let url else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio)
            try session.setActive(true)
            let player = try AVAudioPlayer(contentsOf: url)
            let finisher = Finish { [weak self] in
                Task { @MainActor in
                    self?.isPlaying = false
                }
            }
            player.delegate = finisher
            player.play()
            self.player = player
            self.finisher = finisher
            isPlaying = true
        } catch {
            isPlaying = false
        }
    }

    func stop() {
        player?.stop()
        player = nil
        finisher = nil
        isPlaying = false
    }

    private final class Finish: NSObject, AVAudioPlayerDelegate {
        var onFinish: () -> Void
        init(onFinish: @escaping () -> Void) { self.onFinish = onFinish }
        func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
            onFinish()
        }
    }
}
