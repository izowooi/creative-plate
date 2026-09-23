//
//  dmUITests.swift
//  dmUITests
//
//  Created by izowooi on 9/22/26.
//

import XCTest

final class dmUITests: XCTestCase {

    override func setUpWithError() throws {
        // Put setup code here. This method is called before the invocation of each test method in the class.

        // In UI tests it is usually best to stop immediately when a failure occurs.
        continueAfterFailure = false

        // In UI tests it’s important to set the initial state - such as interface orientation - required for your tests before they run. The setUp method is a good place to do this.
    }

    override func tearDownWithError() throws {
        // Put teardown code here. This method is called after the invocation of each test method in the class.
    }

    @MainActor
    func testEnglishMeterSummaryAndSettings() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--sori-demo", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["summary"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Demo data"].exists)
        let main = XCTAttachment(screenshot: app.screenshot()); main.name = "Sori-English-meter"; main.lifetime = .keepAlways; add(main)
        app.buttons["summary"].tap()
        XCTAssertTrue(app.buttons["share_csv"].waitForExistence(timeout: 5))
        let summary = XCTAttachment(screenshot: app.screenshot()); summary.name = "Sori-English-summary"; summary.lifetime = .keepAlways; add(summary)
        app.buttons["Done"].tap()
        app.buttons["settings"].tap()
        XCTAssertTrue(app.switches["diagnostics"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.switches["diagnostics"].value as? String, "0")
        for _ in 0..<3 {
            if app.staticTexts["Privacy"].exists || app.buttons["Privacy"].exists { break }
            app.swipeUp()
        }
        XCTAssertTrue(app.staticTexts["Privacy"].exists || app.buttons["Privacy"].exists)
    }

    @MainActor
    func testKoreanCalibrationRequiresLiveInput() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--sori-demo", "-AppleLanguages", "(ko)", "-AppleLocale", "ko_KR"]
        app.launch()
        XCTAssertTrue(app.staticTexts["소리결"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["calibration"].exists)
        app.buttons["calibration"].tap()
        XCTAssertTrue(app.textFields["profile_name"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["save_calibration"].isEnabled)
        let image = XCTAttachment(screenshot: app.screenshot()); image.name = "Sori-Korean-calibration"; image.lifetime = .keepAlways; add(image)
    }
    @MainActor
    func testMicrophoneStartStopAndBackground() throws {
        let app = XCUIApplication()
        app.resetAuthorizationStatus(for: .microphone)
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["measure"].waitForExistence(timeout: 10))
        app.buttons["measure"].tap()
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let allow = system.alerts.buttons.matching(NSPredicate(format: "label IN %@", ["Allow", "허용", "OK", "확인"])).firstMatch
        if allow.waitForExistence(timeout: 5) { allow.tap() }
        let stop = app.buttons.matching(identifier: "measure").matching(NSPredicate(format: "label CONTAINS %@", "Stop measuring")).firstMatch
        XCTAssertTrue(stop.waitForExistence(timeout: 12))
        let duration = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@ AND label != %@", "Duration: ", "Duration: 00:00:00")).firstMatch
        XCTAssertTrue(duration.waitForExistence(timeout: 6))
        stop.tap()
        XCTAssertTrue(app.buttons["summary"].waitForExistence(timeout: 5))
        app.buttons["measure"].tap()
        XCTAssertTrue(stop.waitForExistence(timeout: 10))
        assertBackgroundStopsMeasurement(app)
    }

    @MainActor
    func testLiveMicrophoneSustainedCaptureAndRestart() throws {
        let app = XCUIApplication()
        // Keep the installed app's data and microphone authorization intact.
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let measure = app.buttons["measure"]
        XCTAssertTrue(measure.waitForExistence(timeout: 10))
        let stop = app.buttons.matching(identifier: "measure")
            .matching(NSPredicate(format: "label == %@", "Stop measuring")).firstMatch
        let duration = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Duration: ")).firstMatch
        for seconds in [60, 3, 3, 3] {
            measure.tap()
            XCTAssertTrue(stop.waitForExistence(timeout: 10), app.debugDescription)
            let target = String(format: "Duration: 00:%02d:%02d", seconds / 60, seconds % 60)
            let advanced = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label >= %@", target), object: duration)
            XCTAssertEqual(XCTWaiter.wait(for: [advanced], timeout: Double(seconds) + 10), .completed,
                           "Live PCM input must keep advancing. \(app.debugDescription)")
            XCTAssertTrue(stop.exists)
            if seconds == 60 { capture(app, name: "Sori-live-microphone-60-seconds") }
            stop.tap()
            XCTAssertTrue(app.buttons["summary"].waitForExistence(timeout: 5))
        }
        measure.tap()
        XCTAssertTrue(stop.waitForExistence(timeout: 10))
        assertBackgroundStopsMeasurement(app)
    }

    @MainActor
    func testBackgroundStopsLiveMicrophone() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["measure"].waitForExistence(timeout: 10))
        app.buttons["measure"].tap()
        let stop = app.buttons.matching(identifier: "measure")
            .matching(NSPredicate(format: "label == %@", "Stop measuring")).firstMatch
        XCTAssertTrue(stop.waitForExistence(timeout: 10))
        assertBackgroundStopsMeasurement(app)
    }

    @MainActor
    private func assertBackgroundStopsMeasurement(_ app: XCUIApplication) {
        XCUIDevice.shared.press(.home)
        if !app.wait(for: .runningBackground, timeout: 1), app.state != .runningBackgroundSuspended {
            // Some devices accept the Home event without leaving the app.
            // Explicitly activate the system Home screen in that case.
            XCUIApplication(bundleIdentifier: "com.apple.springboard").activate()
        }
        XCTAssertTrue(app.wait(for: .runningBackground, timeout: 5)
                      || app.wait(for: .runningBackgroundSuspended, timeout: 5),
                      "Home must background the app before it is reactivated (state: \(app.state.rawValue))")
        app.activate()
        XCTAssertTrue(app.staticTexts["Measurement stopped when Sori left the foreground."].waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons.matching(identifier: "measure")
            .matching(NSPredicate(format: "label == %@", "Stop measuring")).firstMatch.exists)
    }

    @MainActor
    func testPermissionDenialOffersRecoveryWithoutStarting() throws {
        let app = XCUIApplication()
        app.resetAuthorizationStatus(for: .microphone)
        app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["measure"].waitForExistence(timeout: 10))
        app.buttons["measure"].tap()
        let system = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = system.alerts.buttons.matching(NSPredicate(format: "label IN %@", ["Don’t Allow", "Don't Allow", "허용 안 함"])).firstMatch
        XCTAssertTrue(deny.waitForExistence(timeout: 6))
        deny.tap()
        XCTAssertTrue(app.buttons["Open Settings"].waitForExistence(timeout: 6))
        XCTAssertFalse(app.buttons.matching(identifier: "measure").matching(NSPredicate(format: "label CONTAINS %@", "Stop measuring")).firstMatch.exists)
    }

    @MainActor
    func testStoreScreenshots() throws {
        for (language, locale, done) in [("ko", "ko_KR", "완료"), ("en", "en_US", "Done")] {
            let app = XCUIApplication()
            app.launchArguments = ["--sori-demo", "-AppleLanguages", "(\(language))", "-AppleLocale", locale]
            app.launch()
            XCTAssertTrue(app.buttons["summary"].waitForExistence(timeout: 10))
            capture(app, name: "Sori-\(language)-01-meter-demo")
            app.buttons["summary"].tap()
            XCTAssertTrue(app.buttons["share_csv"].waitForExistence(timeout: 5))
            capture(app, name: "Sori-\(language)-02-summary-demo")
            app.buttons[done].tap()
            app.buttons["settings"].tap()
            XCTAssertTrue(app.switches["diagnostics"].waitForExistence(timeout: 5))
            capture(app, name: "Sori-\(language)-03-settings")
            app.terminate()
        }
    }

    @MainActor
    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testCsvShareSheet() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--sori-demo", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        XCTAssertTrue(app.buttons["summary"].waitForExistence(timeout: 10))
        app.buttons["summary"].tap()
        let share = app.buttons["share_csv"]
        XCTAssertTrue(share.waitForExistence(timeout: 5))
        if !share.isHittable { app.swipeUp() }
        share.tap()
        let file = app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS %@", "Sori-measurement")).firstMatch
        XCTAssertTrue(file.waitForExistence(timeout: 8))
        XCTAssertEqual(app.state, .runningForeground)
        capture(app, name: "Sori-CSV-share-sheet")
    }

}
