import Foundation
import Combine
import SwiftUI
import FirebaseCore
import FirebaseCrashlytics

func tr(_ key: String) -> String { String(localized: String.LocalizationValue(key)) }

@MainActor
enum Diagnostics {
    static var available: Bool { FirebaseApp.app() != nil }
    static func configure() {
        guard Bundle.main.url(forResource: "GoogleService-Info", withExtension: "plist") != nil else { return }
        FirebaseApp.configure()
        setEnabled(UserDefaults.standard.bool(forKey: "diagnostics_enabled"))
    }
    static func setEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: "diagnostics_enabled")
        guard available else { return }
        FirebaseApp.app()?.isDataCollectionDefaultEnabled = enabled
        Crashlytics.crashlytics().setCrashlyticsCollectionEnabled(enabled)
        if !enabled { Crashlytics.crashlytics().deleteUnsentReports() }
    }
}

private enum LocalFiles {
    private static let io = DispatchQueue(label: "com.izowooi.dm.storage", qos: .utility)
    static func report() async -> SessionReport? {
        await withCheckedContinuation { continuation in
            io.async { continuation.resume(returning: load(SessionReport.self, name: "last-session.json")) }
        }
    }
    static func saveReport(_ report: SessionReport) { io.async { save(report, name: "last-session.json") } }
    static func clearReport() { io.async { try? FileManager.default.removeItem(at: url("last-session.json")) } }

    static func url(_ name: String) -> URL {
        let folder = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Sori", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        var mutable = folder
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try? mutable.setResourceValues(values)
        return folder.appendingPathComponent(name)
    }
    static func load<T: Decodable>(_ type: T.Type, name: String) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }
    static func save<T: Encodable>(_ value: T, name: String) {
        if let data = try? JSONEncoder().encode(value) { try? data.write(to: url(name), options: .atomic) }
    }
}

@MainActor
final class MeterModel: ObservableObject {
    enum Phase { case idle, starting, running, stopping }
    @Published private(set) var phase = Phase.idle
    @Published private(set) var snapshot = MeterSnapshot()
    @Published private(set) var conditions: InputConditions?
    @Published private(set) var sessionCalibration: CalibrationProfile?
    @Published private(set) var profiles: [CalibrationProfile]
    @Published var selectedProfileID: String { didSet { UserDefaults.standard.set(selectedProfileID, forKey: "selected_profile") } }
    @Published var weighting: Weighting { didSet { UserDefaults.standard.set(weighting.rawValue, forKey: "weighting") } }
    @Published var notice: String?
    @Published private(set) var lastReport: SessionReport?
    @Published var diagnosticsEnabled: Bool { didSet { Diagnostics.setEnabled(diagnosticsEnabled) } }
    @Published var keepAwake: Bool { didSet { UserDefaults.standard.set(keepAwake, forKey: "keep_awake"); refreshWakeLock() } }
    private let capture = AudioCapture()
    private var accumulator: SessionAccumulator?
    private var startedAt = ""
    private var pendingCalibration: CalibrationProfile?
    private var forceStopReason: String?
    private(set) var isDemo = false

    var running: Bool { phase == .running }
    var busy: Bool { phase == .starting || phase == .stopping }
    var hasMeasurement: Bool { snapshot.count > 0 }
    var calibrated: Bool { conditions.map { sessionCalibration?.valid(for: $0) == true } ?? false }
    var offset: Double { calibrated ? (sessionCalibration?.offset ?? 0) : 0 }
    var unit: String {
        if calibrated { return conditions?.weighting == .a ? "dBA" : "dB SPL" }
        return "dBFS"
    }
    var profileMismatch: Bool {
        guard !selectedProfileID.isEmpty, let conditions,
              let profile = profiles.first(where: { $0.id == selectedProfileID }) else { return false }
        return !profile.valid(for: conditions)
    }

    init() {
        profiles = LocalFiles.load([CalibrationProfile].self, name: "profiles.json") ?? []
        selectedProfileID = UserDefaults.standard.string(forKey: "selected_profile") ?? ""
        weighting = Weighting(rawValue: UserDefaults.standard.string(forKey: "weighting") ?? "A") ?? .a
        diagnosticsEnabled = UserDefaults.standard.bool(forKey: "diagnostics_enabled")
        keepAwake = UserDefaults.standard.object(forKey: "keep_awake") as? Bool ?? true
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--sori-demo") { showDemo(); return }
        #endif
        Task {
            let report = await LocalFiles.report()
            guard phase == .idle, !hasMeasurement else { return }
            lastReport = report
            if let report { snapshot = report.snapshot; conditions = report.conditions; sessionCalibration = report.calibration }
        }
    }

    func start() {
        guard phase == .idle else { return }
        isDemo = false
        phase = .starting; notice = nil; forceStopReason = nil
        snapshot = MeterSnapshot(); conditions = nil; sessionCalibration = nil; accumulator = nil
        startedAt = ISO8601DateFormatter().string(from: Date())
        capture.start(weighting: weighting, ready: { [weak self] input in
            guard let self else { return }
            self.startedAt = ISO8601DateFormatter().string(from: Date())
            self.conditions = input
            self.sessionCalibration = self.profiles.first { $0.id == self.selectedProfileID && $0.valid(for: input) }
            self.accumulator = SessionAccumulator(sampleRate: input.sampleRate)
            // The first PCM window, rather than session configuration, confirms capture.
        }, window: { [weak self] frame in self?.receive(frame) }, stopped: { [weak self] reason in self?.finished(reason) })
    }

    private func receive(_ frame: AudioWindow) {
        guard phase != .idle, forceStopReason == nil else { return }
        guard let result = accumulator?.add(frame) else {
            forceStopReason = "invalid_signal"; stop(reason: "invalid_signal"); return
        }
        snapshot = result
        if phase == .starting { phase = .running; refreshWakeLock() }
        if result.seconds >= Double(Acoustics.maximumSeconds) {
            forceStopReason = "limit_reached"; stop(reason: "limit_reached")
        }
    }

    func stop(reason: String = "user") {
        guard phase == .running || phase == .starting else { return }
        phase = .stopping; refreshWakeLock()
        capture.stop(reason: reason)
    }

    private func finished(_ rawReason: String) {
        let reason = forceStopReason ?? rawReason
        phase = .idle; refreshWakeLock()
        if reason != "user" { notice = reason }
        if let conditions, snapshot.count > 0 {
            let report = SessionReport(startedAt: startedAt, endedAt: ISO8601DateFormatter().string(from: Date()),
                conditions: conditions, calibration: sessionCalibration, snapshot: snapshot,
                readings: accumulator?.finish() ?? [], stopReason: reason)
            lastReport = report
            LocalFiles.saveReport(report)
        }
        if let profile = pendingCalibration {
            pendingCalibration = nil
            profiles.append(profile)
            selectedProfileID = profile.id
            LocalFiles.save(profiles, name: "profiles.json")
            notice = "calibration_saved"
        }
    }

    func saveCalibration(name: String, reference: Double, notes: String) -> Bool {
        guard profiles.count < 20, running, snapshot.canCalibrate, let measured = snapshot.calibrationLevel, let conditions,
              !name.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
        let profile = CalibrationProfile(id: UUID().uuidString, name: String(name.prefix(60)),
            createdAt: ISO8601DateFormatter().string(from: Date()), referenceDB: reference,
            measuredDBFS: measured, notes: String(notes.prefix(300)), conditions: conditions)
        guard profile.valid(for: conditions) else { return false }
        pendingCalibration = profile; stop()
        return true
    }

    func removeProfile(_ id: String) {
        guard phase == .idle else { return }
        profiles.removeAll { $0.id == id }
        if selectedProfileID == id { selectedProfileID = "" }
        LocalFiles.save(profiles, name: "profiles.json")
    }

    func resetProfiles() {
        guard phase == .idle else { return }
        profiles = []; selectedProfileID = ""
        LocalFiles.save(profiles, name: "profiles.json")
    }

    func clearSession() {
        guard phase == .idle else { return }
        snapshot = MeterSnapshot(); lastReport = nil; sessionCalibration = nil; notice = nil
        LocalFiles.clearReport()
    }

    func exportURL() async -> URL? {
        guard let report = lastReport else { return nil }
        return await Task.detached {
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("Sori-measurement.csv")
            do { try report.csv().write(to: url, atomically: true, encoding: .utf8); return url }
            catch { return nil }
        }.value
    }

    private func refreshWakeLock() { UIApplication.shared.isIdleTimerDisabled = running && keepAwake }

    #if DEBUG
    private func showDemo() {
        isDemo = true
        let input = InputConditions(device: "Demo", routeID: "demo", routeName: "Built-in microphone",
            sampleRate: 48000, channels: 1, source: "Synthetic preview", weighting: .a, gain: "1")
        conditions = input
        sessionCalibration = CalibrationProfile(id: "demo", name: "Demo reference", createdAt: "2026-09-22T10:00:00Z",
            referenceDB: 65, measuredDBFS: -35, notes: "Synthetic preview only", conditions: input)
        var values = SessionAccumulator(sampleRate: 48000)
        for index in 0..<600 {
            let db = -49 + 3 * sin(Double(index) / 25) + 1.5 * sin(Double(index) / 7)
                + (index > 240 && index < 350 ? 9 : 0)
            _ = values.add(AudioWindow(endSample: Int64((index + 1) * 4800), count: 4800,
                squareSum: pow(10, db / 10) * 4800, peak: 0.1, clipped: 0, invalid: 0))
        }
        snapshot = values.snapshot
        lastReport = SessionReport(startedAt: "2026-09-22T10:00:00Z", endedAt: "2026-09-22T10:01:00Z",
            conditions: input, calibration: sessionCalibration, snapshot: snapshot, readings: values.finish(), stopReason: "demo")
    }
    #endif
}
