import AppKit
import ApplicationServices
import Observation
import os

/// ⌃ 두 번 탭으로 "캡처 → 대기 → → 키 → 대기" 를 정해진 횟수만큼 반복하고, 다시 두 번 탭하면 멈춘다.
@Observable
final class MacroController {
    private enum DefaultsKey {
        static let count = "count"
        static let interval = "interval"
    }

    private static let rightArrowKeyCode: CGKeyCode = 124
    // 우리가 보낸 → 키를 표시해 두 번 탭 판정에서 제외한다. 안 그러면 실행 중 → 키가 두 탭 사이에 끼어 중단이 안 된다.
    private static let syntheticEventTag: Int64 = 0x4D41_4352  // "MACR"
    private static let logger = Logger(subsystem: "com.izowooi.macroarrow", category: "macro")

    var count: Int {
        didSet { UserDefaults.standard.set(count, forKey: DefaultsKey.count) }
    }
    var interval: Double {
        didSet { UserDefaults.standard.set(interval, forKey: DefaultsKey.interval) }
    }

    private(set) var isRunning = false
    private(set) var progress = 0
    private(set) var lastFolder: URL?
    private(set) var lastError: String?

    let rootFolder = FileManager.default.homeDirectoryForCurrentUser
        .appending(path: "Pictures/MacroArrow", directoryHint: .isDirectory)

    private var detector = DoubleTapDetector()
    private var runTask: Task<Void, Never>?
    private var monitor: Any?

    init() {
        UserDefaults.standard.register(defaults: [DefaultsKey.count: 80, DefaultsKey.interval: 0.1])
        count = UserDefaults.standard.integer(forKey: DefaultsKey.count)
        interval = UserDefaults.standard.double(forKey: DefaultsKey.interval)
        startListening()
    }

    // MARK: - 권한

    var hasAccessibility: Bool { AXIsProcessTrusted() }
    var hasScreenRecording: Bool { CGPreflightScreenCaptureAccess() }

    func requestAccessibility() {
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        AXIsProcessTrustedWithOptions(options)
    }

    func requestScreenRecording() {
        CGRequestScreenCaptureAccess()
    }

    // MARK: - 실행

    func toggle() {
        if isRunning {
            runTask?.cancel()
        } else {
            start()
        }
    }

    private func start() {
        let folder = rootFolder.appending(path: Self.timestamp(), directoryHint: .isDirectory)
        isRunning = true
        progress = 0
        lastError = nil
        lastFolder = folder
        runTask = Task { await run(into: folder, count: count, interval: interval) }
    }

    private func run(into folder: URL, count: Int, interval: Double) async {
        defer { isRunning = false }
        Self.logger.info("start count=\(count) interval=\(interval) folder=\(folder.path, privacy: .public)")
        do {
            try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
            let capturer = try await ScreenCapturer.forMainDisplay()
            let width = max(3, String(count).count)
            for index in 1...count {
                try Task.checkCancellation()
                let name = "shot_" + String(repeating: "0", count: width - String(index).count) + "\(index).png"
                try await capturer.capture(to: folder.appending(path: name))
                try await Task.sleep(for: .seconds(interval))
                postRightArrow()
                try await Task.sleep(for: .seconds(interval))
                progress = index
            }
            Self.logger.info("finished shots=\(self.progress)")
        } catch is CancellationError {
            Self.logger.info("stopped shots=\(self.progress)")
        } catch {
            lastError = error.localizedDescription
            Self.logger.error("failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    private func postRightArrow() {
        // privateState 소스 + 빈 flags: 사용자가 ⌃ 를 누르고 있어도 ⌃→(Space 전환)가 되지 않게 한다.
        let source = CGEventSource(stateID: .privateState)
        for isDown in [true, false] {
            guard let event = CGEvent(keyboardEventSource: source, virtualKey: Self.rightArrowKeyCode, keyDown: isDown) else { continue }
            event.flags = []
            event.setIntegerValueField(.eventSourceUserData, value: Self.syntheticEventTag)
            event.post(tap: .cghidEventTap)
        }
    }

    // MARK: - 두 번 탭 감지

    private func startListening() {
        // 전역 모니터는 손쉬운 사용 권한만으로 동작한다(입력 모니터링 권한 불필요). 권한을 나중에 주면 앱을 다시 켜야 한다.
        monitor = NSEvent.addGlobalMonitorForEvents(matching: [.flagsChanged, .keyDown]) { [weak self] event in
            MainActor.assumeIsolated { self?.handle(event) }
        }
    }

    private func handle(_ event: NSEvent) {
        if event.cgEvent?.getIntegerValueField(.eventSourceUserData) == Self.syntheticEventTag {
            return
        }
        switch event.type {
        case .keyDown:
            detector.keyPressed()
        case .flagsChanged:
            let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
            let targetDown = flags.contains(.control)
            let othersDown = !flags.intersection([.option, .command, .shift, .function]).isEmpty
            if detector.modifiersChanged(targetDown: targetDown, othersDown: othersDown, at: event.timestamp) {
                Self.logger.info("double tap")
                toggle()
            }
        default:
            break
        }
    }

    private static func timestamp() -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd_HHmmss"
        return formatter.string(from: .now)
    }
}
