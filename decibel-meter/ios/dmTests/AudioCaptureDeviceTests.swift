import AVFAudio
import Foundation
import Testing
import UIKit
@testable import dm

// These tests require a provisioned phone with microphone permission already granted.
// They exercise the real input without resetting permissions or saving a session/report.
#if !targetEnvironment(simulator)
@Suite(.serialized)
@MainActor
struct AudioCaptureDeviceTests {
    @Test(.timeLimit(.minutes(3)))
    func liveMicrophoneSurvivesSetupNotificationsAndRepeatedStarts() async throws {
        try #require(AVAudioApplication.shared.recordPermission == .granted)
        let wasIdleTimerDisabled = UIApplication.shared.isIdleTimerDisabled
        UIApplication.shared.isIdleTimerDisabled = true
        defer { UIApplication.shared.isIdleTimerDisabled = wasIdleTimerDisabled }

        let capture = AudioCapture()
        defer { capture.stop() }
        for seconds in [60, 3, 3, 3] {
            var conditions: InputConditions?
            var lastSample: Int64 = 0
            var invalidSamples = 0
            var stopReason: String?
            capture.start(weighting: .a, ready: { conditions = $0 }, window: {
                lastSample = $0.endSample
                invalidSamples += $0.invalid
            }, stopped: { stopReason = $0 })

            let deadline = ContinuousClock.now + .seconds(seconds + 10)
            var postedSetupNotifications = false
            while ContinuousClock.now < deadline {
                try #require(stopReason == nil, "Unexpected capture stop: \(stopReason ?? "")")
                if let conditions {
                    if !postedSetupNotifications, lastSample >= Int64(conditions.sampleRate) {
                        // Replay delayed setup/output notifications while the input stays unchanged.
                        for reason in [AVAudioSession.RouteChangeReason.categoryChange, .override, .routeConfigurationChange] {
                            NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification,
                                object: AVAudioSession.sharedInstance(),
                                userInfo: [AVAudioSessionRouteChangeReasonKey: reason.rawValue])
                        }
                        postedSetupNotifications = true
                    }
                    if lastSample >= Int64(seconds * conditions.sampleRate) { break }
                }
                try await Task.sleep(for: .milliseconds(100))
            }
            let input = try #require(conditions)
            #expect(lastSample >= Int64(seconds * input.sampleRate), "PCM input stalled")
            #expect(invalidSamples == 0)
            #expect(stopReason == nil)
            #expect(postedSetupNotifications)
            capture.stop()
            let stopDeadline = ContinuousClock.now + .seconds(5)
            while stopReason == nil, ContinuousClock.now < stopDeadline {
                try await Task.sleep(for: .milliseconds(100))
            }
            try #require(stopReason == "user", "The audio session must finish before restarting")
        }
    }
}
#endif
