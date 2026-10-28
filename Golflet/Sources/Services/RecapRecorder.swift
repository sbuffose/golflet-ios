import Foundation
import Observation
import AVFoundation

@MainActor
@Observable
final class RecapRecorder {
    var isRecording = false
    var elapsed: TimeInterval = 0
    var errorMessage: String?
    var lastURL: URL?

    private var recorder: AVAudioRecorder?
    private var timer: Timer?
    private let limit: TimeInterval = 240
    private let maxBytes = 4_000_000

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
    }

    func stop() -> Data? {
        timer?.invalidate()
        timer = nil
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
        recorder?.stop()
        recorder = nil
        isRecording = false
        elapsed = 0
    }

    private func tick() {
        elapsed += 0.25
        if let url = lastURL, let size = try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber, size.intValue >= maxBytes {
            _ = stop()
            return
        }
        if elapsed >= limit {
            _ = stop()
        }
    }
}
