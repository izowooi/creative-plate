import AVFAudio
import Foundation
import UIKit

@MainActor
final class AudioCapture {
    private var engine: AVAudioEngine?
    private var processor: WindowProcessor?
    private var processorLock: NSLock?
    private var observers: [NSObjectProtocol] = []
    private var token = 0
    private var accepting = false
    private var tapInstalled = false
    private var activation: Task<Void, Error>?
    private var onWindow: ((AudioWindow) -> Void)?
    private var onStop: ((String) -> Void)?

    func start(weighting: Weighting, ready: @escaping (InputConditions) -> Void,
               window: @escaping (AudioWindow) -> Void, stopped: @escaping (String) -> Void) {
        guard !accepting, engine == nil else { return }
        token += 1
        let request = token
        accepting = true
        onWindow = window
        onStop = stopped
        AVAudioApplication.requestRecordPermission { [weak self] allowed in
            Task { @MainActor [weak self] in
                guard let self, self.accepting, self.token == request else { return }
                guard allowed else { self.stop(reason: "permission_denied"); return }
                do { try await self.connect(weighting: weighting, request: request, ready: ready) }
                catch { self.stop(reason: "error_microphone") }
            }
        }
    }

    private func connect(weighting: Weighting, request: Int, ready: (InputConditions) -> Void) async throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .measurement)
        try session.setPreferredSampleRate(48000)
        try session.setPreferredIOBufferDuration(0.02)
        let activation = Task.detached(priority: .userInitiated) {
            try AVAudioSession.sharedInstance().setActive(true)
        }
        self.activation = activation
        try await activation.value
        guard accepting, token == request else { return }
        if let builtIn = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
            try session.setPreferredInput(builtIn)
        }
        let audioEngine = AVAudioEngine()
        engine = audioEngine
        let input = audioEngine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard (32000...192000).contains(format.sampleRate), format.channelCount > 0,
              format.commonFormat == .pcmFormatFloat32,
              let route = session.currentRoute.inputs.first else { throw CaptureError.unsupported }
        let rate = Int(format.sampleRate.rounded())
        let inputProcessor = WindowProcessor(sampleRate: rate, weighting: weighting)
        processor = inputProcessor
        let lock = NSLock()
        processorLock = lock
        let stride = format.isInterleaved ? Int(format.channelCount) : 1
        var machine = utsname()
        uname(&machine)
        let model = withUnsafePointer(to: &machine.machine) {
            $0.withMemoryRebound(to: CChar.self, capacity: 1) { String(cString: $0) }
        }
        let conditions = InputConditions(device: "\(model) / iOS \(UIDevice.current.systemVersion)",
            routeID: "\(route.uid):\(route.selectedDataSource?.dataSourceID.stringValue ?? "default")",
            routeName: route.portName, sampleRate: rate, channels: Int(format.channelCount),
            source: "AVAudioEngine / record / measurement / channel 0", weighting: weighting,
            gain: String(format: "%.4f", locale: Locale(identifier: "en_US_POSIX"), session.inputGain))
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let samples = buffer.floatChannelData?[0] else { return }
            lock.lock()
            defer { lock.unlock() }
            for index in 0..<Int(buffer.frameLength) {
                if let frame = inputProcessor.accept(Double(samples[index * stride])) {
                    DispatchQueue.main.async { [weak self] in
                        guard let self, self.token == request else { return }
                        self.onWindow?(frame)
                    }
                }
            }
        }
        tapInstalled = true
        ready(conditions)
        audioEngine.prepare()
        try audioEngine.start()
        observe(session: session, engine: audioEngine, request: request)
    }

    private func observe(session: AVAudioSession, engine: AVAudioEngine, request: Int) {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: session, queue: .main) { [weak self] event in
            guard let raw = event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .began else { return }
            Task { @MainActor [weak self] in if self?.token == request { self?.stop(reason: "interrupted") } }
        })
        observers.append(center.addObserver(forName: AVAudioSession.routeChangeNotification, object: session, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in if self?.token == request { self?.stop(reason: "route_changed") } }
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: session, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in if self?.token == request { self?.stop(reason: "interrupted") } }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: .main) { [weak self] _ in
            Task { @MainActor [weak self] in if self?.token == request { self?.stop(reason: "route_changed") } }
        })
    }

    func stop(reason: String = "user") {
        guard accepting else { return }
        accepting = false
        observers.forEach(NotificationCenter.default.removeObserver)
        observers.removeAll()
        engine?.stop()
        if tapInstalled { engine?.inputNode.removeTap(onBus: 0); tapInstalled = false }
        engine = nil
        processorLock?.lock()
        let remainder = processor?.flush()
        processorLock?.unlock()
        processor = nil; processorLock = nil
        let request = token
        let activation = self.activation
        self.activation = nil
        Task { @MainActor [weak self] in
            // A stop requested during activation must wait for it before deactivating.
            _ = try? await activation?.value
            await Task.detached(priority: .userInitiated) {
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
            }.value
            // Preserve FIFO ordering with summaries queued by the audio callback.
            DispatchQueue.main.async { [weak self] in
                guard let self, self.token == request else { return }
                if let remainder { self.onWindow?(remainder) }
                let completion = self.onStop
                self.onWindow = nil; self.onStop = nil
                completion?(reason)
            }
        }
    }

    private enum CaptureError: Error { case unsupported }
}
