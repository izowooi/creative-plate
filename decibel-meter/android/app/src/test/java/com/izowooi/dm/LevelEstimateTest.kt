package com.izowooi.dm

import com.izowooi.dm.core.*
import org.junit.Assert.*
import org.junit.Test

class LevelEstimateTest {
    private val input = InputConditions("phone", "1:15", "Built-in", 48000, 1, "UNPROCESSED;agc=off", Weighting.A)

    @Test fun androidNominalSensitivityIsSpecificToSourceAndBuiltInInput() {
        val unprocessed = LevelEstimate.resolve(input, null)
        assertEquals(94.0, unprocessed.decibels(-36.0), 1e-9)
        val voice = LevelEstimate.resolve(input.copy(source = "VOICE_RECOGNITION;agc=off"), null)
        assertEquals(90.0, voice.decibels(-22.35), 1e-9)
        val external = LevelEstimate.resolve(input.copy(routeId = "2:22"), null)
        assertEquals("generic_estimate_v1", external.basis)
        assertEquals(50.0, external.decibels(-60.0), 1e-9)
    }

    @Test fun silenceIsZeroAndInvalidValuesNeverBecomeDisplayedNumbers() {
        val estimate = LevelEstimate.resolve(input, null)
        assertEquals(0.0, estimate.decibels(Acoustics.FLOOR_DB), 0.0)
        assertEquals(0.0, estimate.decibels(Double.NaN), 0.0)
        assertEquals(0.0, estimate.decibels(Double.POSITIVE_INFINITY), 0.0)
        assertEquals(6.0206, estimate.decibels(-53.9794) - estimate.decibels(-60.0), 1e-9)
    }

    @Test fun referenceCalibrationWinsAndRouteChangesFallBackToAnEstimate() {
        val profile = CalibrationProfile("p", "Reference", "today", 70.0, -30.0, "", input)
        assertEquals(70.0, LevelEstimate.resolve(input, profile).decibels(-30.0), 0.0)
        assertEquals("reference_calibration", LevelEstimate.resolve(input, profile).basis)
        assertEquals("generic_estimate_v1", LevelEstimate.resolve(input.copy(routeId = "usb"), profile).basis)
    }

    @Test fun exportUsesSavedEstimateAndRetainsTheOriginalSignal() {
        val report = SessionReport("start", "end", input, null, MeterSnapshot(),
            listOf(LevelPoint(1.0, -40.0, 48000)), "user", LevelEstimate(113.0, "saved_test_estimate"))
        assertFalse(report.calibrated)
        assertEquals(73.0, report.estimate.decibels(-40.0), 0.0)
        assertTrue(report.csv().contains("1.0000,73.0000,\"dB (estimated)\",-40.0000"))
        assertTrue(report.csv().contains("saved_test_estimate"))
        val legacy = report.copy(savedEstimate = null)
        assertEquals(90.0, legacy.estimate.decibels(-40.0), 0.0)
    }
}
