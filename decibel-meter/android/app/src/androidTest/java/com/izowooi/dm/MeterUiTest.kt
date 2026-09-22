package com.izowooi.dm

import android.Manifest
import android.content.Context
import android.media.AudioManager
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.ViewModelProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.izowooi.dm.core.Weighting
import org.junit.Assert.*
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

@RunWith(AndroidJUnit4::class)
class MeterUiTest {
    @get:Rule val compose = createAndroidComposeRule<MainActivity>()
    private lateinit var model: MeterViewModel

    @Before fun setup() {
        val instrumentation = InstrumentationRegistry.getInstrumentation()
        instrumentation.uiAutomation.executeShellCommand("pm grant com.izowooi.dm ${Manifest.permission.RECORD_AUDIO}").close()
        compose.activityRule.scenario.onActivity { model = ViewModelProvider(it)[MeterViewModel::class.java] }
    }

    private fun startAndAwaitFrames() {
        compose.onNodeWithTag("measure").performClick()
        compose.waitUntil(12000) { model.state.value.running && model.state.value.snapshot.count > 0 }
    }

    private fun stopAndAwaitReport() {
        compose.onNodeWithTag("measure").performClick()
        compose.waitUntil(5000) { model.state.value.phase == CapturePhase.IDLE && model.state.value.lastReport != null }
    }

    @Test fun realMicrophoneWindowsAndRepeatedStartStopAreConsistent() {
        startAndAwaitFrames()
        compose.runOnUiThread { model.start(); model.start() }
        assertTrue(model.state.value.running)
        assertEquals("dBFS", model.state.value.unit)
        stopAndAwaitReport()
        compose.runOnUiThread { model.stop(); model.stop() }
        assertEquals(CapturePhase.IDLE, model.state.value.phase)
        val report = model.state.value.lastReport!!
        assertTrue(report.snapshot.count > 0)
        assertTrue(report.snapshot.average.isFinite())
        assertTrue(report.readings.isNotEmpty())
        assertFalse(report.calibrated)
        startAndAwaitFrames()
        stopAndAwaitReport()
    }

    @Test fun backgroundStopsCaptureAndDoesNotAutomaticallyResume() {
        startAndAwaitFrames()
        compose.activityRule.scenario.moveToState(Lifecycle.State.CREATED)
        val deadline = System.currentTimeMillis() + 5000
        while (model.state.value.phase != CapturePhase.IDLE && System.currentTimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().waitForIdleSync()
        }
        assertEquals(CapturePhase.IDLE, model.state.value.phase)
        assertEquals("background_stopped", model.state.value.lastReport?.stopReason)
        val audio = compose.activity.getSystemService(AudioManager::class.java)
        assertTrue(audio.activeRecordingConfigurations.isEmpty())
        compose.activityRule.scenario.moveToState(Lifecycle.State.RESUMED)
        assertFalse(model.state.value.running)
    }

    @Test fun settingsUseNativeControlsAndDiagnosticsRemainOptIn() {
        compose.onNodeWithTag("settings").performClick()
        compose.onNodeWithText("Flat", substring = false).performClick()
        assertEquals(Weighting.FLAT, model.state.value.weighting)
        compose.onNodeWithTag("diagnostics").performScrollTo().assertIsOff()
        assertFalse(compose.activity.getSharedPreferences("sori", Context.MODE_PRIVATE).getBoolean("diagnostics", true))
    }

    @Test fun completedSessionExportsNumericCsvThroughTheShareSheet() {
        startAndAwaitFrames()
        compose.waitUntil(5000) { model.state.value.snapshot.seconds >= 1.1 }
        stopAndAwaitReport()
        compose.onNodeWithTag("summary").performClick()
        compose.onNodeWithTag("share_csv").performScrollTo().performClick()
        val file = File(compose.activity.cacheDir, "exports/Sori-measurement.csv")
        compose.waitUntil(5000) { file.exists() && file.length() > 0 }
        val csv = file.readText()
        assertTrue(csv.contains("elapsed_seconds,level,unit,raw_dbfs,sample_count,clipped_samples"))
        assertTrue(csv.contains("dBFS"))
        assertTrue(csv.contains("sample_rate_hz"))
        InstrumentationRegistry.getInstrumentation().uiAutomation.executeShellCommand("input keyevent 4").close()
    }
}
