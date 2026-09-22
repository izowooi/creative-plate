package com.izowooi.dm

import android.app.Application
import android.content.Context
import androidx.lifecycle.AndroidViewModel
import com.izowooi.dm.audio.MicrophoneCapture
import com.izowooi.dm.core.*
import com.izowooi.dm.data.LocalStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.time.Instant
import java.util.UUID
import kotlin.math.pow
import kotlin.math.sin

enum class CapturePhase { IDLE, STARTING, RUNNING, STOPPING }

data class MeterState(
    val phase: CapturePhase = CapturePhase.IDLE,
    val snapshot: MeterSnapshot = MeterSnapshot(),
    val conditions: InputConditions? = null,
    val sessionCalibration: CalibrationProfile? = null,
    val profiles: List<CalibrationProfile> = emptyList(),
    val selectedProfile: String = "",
    val weighting: Weighting = Weighting.A,
    val notice: String? = null,
    val lastReport: SessionReport? = null,
    val keepAwake: Boolean = true,
    val diagnostics: Boolean = false,
    val demo: Boolean = false,
) {
    val running get() = phase == CapturePhase.RUNNING
    val busy get() = phase == CapturePhase.STARTING || phase == CapturePhase.STOPPING
    val calibrated get() = conditions?.let { sessionCalibration?.validFor(it) } == true
    val offset get() = if (calibrated) sessionCalibration?.offset ?: 0.0 else 0.0
    val unit get() = if (calibrated) { if (conditions?.weighting == Weighting.A) "dBA" else "dB SPL" } else "dBFS"
    val hasMeasurement get() = snapshot.count > 0
    val profileMismatch get() = conditions?.let { input -> profiles.firstOrNull { it.id == selectedProfile }?.validFor(input) == false } ?: false
}

class MeterViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = application.getSharedPreferences("sori", Context.MODE_PRIVATE)
    private val store = LocalStore(application)
    private val capture = MicrophoneCapture(application)
    private val mutable = MutableStateFlow(MeterState(
        profiles = store.profiles(), selectedProfile = preferences.getString("profile", "") ?: "",
        weighting = runCatching { Weighting.valueOf(preferences.getString("weighting", "A")!!) }.getOrDefault(Weighting.A),
        keepAwake = preferences.getBoolean("keep_awake", true), diagnostics = preferences.getBoolean("diagnostics", false),
    ))
    val state = mutable.asStateFlow()
    private var accumulator: SessionAccumulator? = null
    private var startedAt = ""
    private var pendingProfile: CalibrationProfile? = null
    private var terminalReason: String? = null

    init {
        store.loadReport { report ->
            if (report != null && mutable.value.phase == CapturePhase.IDLE && !mutable.value.hasMeasurement && !mutable.value.demo) {
                mutable.update { it.copy(snapshot = report.snapshot, conditions = report.conditions,
                    sessionCalibration = report.calibration, lastReport = report) }
            }
        }
    }

    fun start() {
        if (mutable.value.phase != CapturePhase.IDLE) return
        mutable.update { it.copy(demo = false) }
        accumulator = null; terminalReason = null; startedAt = Instant.now().toString()
        mutable.update { it.copy(phase = CapturePhase.STARTING, snapshot = MeterSnapshot(), conditions = null, sessionCalibration = null, notice = null) }
        capture.start(mutable.value.weighting, ready = { conditions ->
            startedAt = Instant.now().toString()
            accumulator = SessionAccumulator(conditions.sampleRate)
            mutable.update { current -> current.copy(phase = if (current.phase == CapturePhase.STARTING) CapturePhase.RUNNING else current.phase, conditions = conditions,
                sessionCalibration = current.profiles.firstOrNull { it.id == current.selectedProfile && it.validFor(conditions) }) }
        }, window = { frame ->
            if (terminalReason == null) {
                try { accumulator?.add(frame)?.let { snapshot -> mutable.update { it.copy(snapshot = snapshot) } } }
                catch (_: IllegalArgumentException) { terminalReason = "invalid_signal"; stop("invalid_signal") }
            }
        }, stopped = { reason -> finish(terminalReason ?: reason) })
    }

    fun stop(reason: String = "user") {
        if (mutable.value.phase != CapturePhase.RUNNING && mutable.value.phase != CapturePhase.STARTING) return
        mutable.update { it.copy(phase = CapturePhase.STOPPING) }
        capture.stop(reason)
    }

    fun permissionDenied() { mutable.update { it.copy(notice = "permission_denied") } }
    fun exportFailed() { mutable.update { it.copy(notice = "error_export") } }

    private fun finish(reason: String) {
        val current = mutable.value
        val report = if (current.conditions != null && current.hasMeasurement) {
            SessionReport(startedAt, Instant.now().toString(), current.conditions, current.sessionCalibration,
                current.snapshot, accumulator?.finish() ?: emptyList(), reason)
        } else null
        if (report != null) store.saveReport(report)
        mutable.update { it.copy(phase = CapturePhase.IDLE, lastReport = report ?: it.lastReport, notice = reason.takeUnless { it == "user" }) }
        pendingProfile?.let { profile ->
            pendingProfile = null
            val profiles = mutable.value.profiles + profile
            store.saveProfiles(profiles)
            preferences.edit().putString("profile", profile.id).apply()
            mutable.update { it.copy(profiles = profiles, selectedProfile = profile.id, notice = "calibration_saved") }
        }
    }

    fun weighting(weighting: Weighting) {
        if (mutable.value.phase != CapturePhase.IDLE) return
        preferences.edit().putString("weighting", weighting.name).apply()
        mutable.update { it.copy(weighting = weighting) }
    }
    fun selectProfile(id: String) {
        if (mutable.value.phase != CapturePhase.IDLE) return
        preferences.edit().putString("profile", id).apply()
        mutable.update { it.copy(selectedProfile = id) }
    }
    fun saveCalibration(name: String, reference: Double, notes: String): Boolean {
        val current = mutable.value
        if (!current.running || !current.snapshot.canCalibrate || current.conditions == null || name.isBlank() || current.profiles.size >= 20) return false
        val profile = CalibrationProfile(UUID.randomUUID().toString(), name.take(60), Instant.now().toString(), reference,
            current.snapshot.calibrationLevel, notes.take(300), current.conditions)
        if (!profile.validFor(current.conditions)) return false
        pendingProfile = profile
        stop()
        return true
    }
    fun removeProfile(id: String) {
        if (mutable.value.phase != CapturePhase.IDLE) return
        val profiles = mutable.value.profiles.filterNot { it.id == id }
        store.saveProfiles(profiles)
        if (mutable.value.selectedProfile == id) selectProfile("")
        mutable.update { it.copy(profiles = profiles) }
    }
    fun resetProfiles() {
        if (mutable.value.phase != CapturePhase.IDLE) return
        store.saveProfiles(emptyList()); selectProfile("")
        mutable.update { it.copy(profiles = emptyList()) }
    }
    fun clearSession() {
        if (mutable.value.phase != CapturePhase.IDLE) return
        store.clearReport()
        mutable.update { it.copy(snapshot = MeterSnapshot(), lastReport = null, sessionCalibration = null, notice = null) }
    }
    fun keepAwake(enabled: Boolean) {
        preferences.edit().putBoolean("keep_awake", enabled).apply()
        mutable.update { it.copy(keepAwake = enabled) }
    }
    fun diagnostics(enabled: Boolean) {
        Diagnostics.setEnabled(getApplication(), enabled)
        mutable.update { it.copy(diagnostics = enabled) }
    }

    fun showDemo() {
        if (!BuildConfig.DEBUG || mutable.value.phase != CapturePhase.IDLE) return
        val input = InputConditions("Demo", "demo", "Built-in microphone", 48000, 1, "Synthetic preview", Weighting.A)
        val profile = CalibrationProfile("demo", "Demo reference", "2026-09-22T10:00:00Z", 65.0, -35.0, "Synthetic preview only", input)
        val values = SessionAccumulator(48000)
        repeat(600) { index ->
            val db = -49 + 3 * sin(index / 25.0) + 1.5 * sin(index / 7.0) + if (index > 240 && index < 350) 9 else 0
            values.add(AudioWindow((index + 1) * 4800L, 4800, 10.0.pow(db / 10) * 4800, 0.1, 0, 0))
        }
        val report = SessionReport("2026-09-22T10:00:00Z", "2026-09-22T10:01:00Z", input, profile, values.snapshot, values.finish(), "demo")
        mutable.update { it.copy(demo = true, snapshot = values.snapshot, conditions = input, sessionCalibration = profile, lastReport = report) }
    }

    override fun onCleared() { capture.close() }
}
