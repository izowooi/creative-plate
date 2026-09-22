package com.izowooi.dm

import com.izowooi.dm.core.*
import org.junit.Assert.*
import org.junit.Test
import kotlin.math.*

class AcousticsTest {
    @Test fun halvingAmplitudeDropsSixDecibels() {
        val original = DoubleArray(4800) { 0.4 * sin(2 * PI * 1000 * it / 48000) }
        assertEquals(6.0206, Acoustics.rmsDb(original) - Acoustics.rmsDb(original.map { it / 2 }.toDoubleArray()), 0.0001)
    }

    @Test fun unequalLevelsUseEnergyAverageAndSampleCounts() {
        assertEquals(-42.9671, Acoustics.energyAverage(listOf(-40.0 to 4800L, -60.0 to 4800L)), 0.0001)
        assertEquals(10 * log10((1e-4 * 3 + 1e-6) / 4), Acoustics.energyAverage(listOf(-40.0 to 3L, -60.0 to 1L)), 1e-10)
    }

    @Test fun silenceAndInvalidSamplesAreFlaggedWithoutPoisoningTheFilter() {
        val processor = WindowProcessor(48000, Weighting.A)
        repeat(4798) { assertNull(processor.accept(0.0)) }
        assertNull(processor.accept(Double.NaN))
        val result = processor.accept(Double.POSITIVE_INFINITY)!!
        assertEquals(-120.0, result.dbfs, 0.0)
        assertEquals(2, result.invalid)
        repeat(4800) { processor.accept(0.0) }
    }

    @Test fun clippingAndPartialWindowsSurviveStop() {
        val processor = WindowProcessor(48000, Weighting.FLAT)
        processor.accept(1.0); processor.accept(-1.0); processor.accept(0.0)
        val partial = processor.flush()!!
        assertEquals(3, partial.count)
        assertEquals(2, partial.clipped)
        assertEquals(10 * log10(2.0 / 3), partial.dbfs, 1e-9)
        assertNull(processor.flush())
    }

    @Test fun aWeightingMatchesReferenceToneResponseAtSupportedRates() {
        // Reference A-weighting values rounded to 0.1 dB, independent of implementation.
        val targets = mapOf(31.5 to -39.4, 63.0 to -26.2, 125.0 to -16.1,
            250.0 to -8.6, 500.0 to -3.2, 1000.0 to 0.0, 2000.0 to 1.2,
            4000.0 to 1.0, 8000.0 to -1.1)
        for (rate in listOf(44100, 48000, 96000)) {
            for ((frequency, target) in targets) {
                val filter = FrequencyFilter(rate.toDouble(), Weighting.A)
                var inputEnergy = 0.0; var outputEnergy = 0.0
                repeat(rate * 2) { index ->
                    val sample = 0.1 * sin(2 * PI * frequency * index / rate)
                    val output = filter.process(sample)
                    if (index >= rate) { inputEnergy += sample * sample; outputEnergy += output * output }
                }
                assertEquals("$rate Hz / $frequency Hz", target, 10 * log10(outputEnergy / inputEnergy), 0.9)
            }
        }
    }

    @Test fun calibrationRequiresTheExactInputAndSettings() {
        val input = InputConditions("device", "mic:1", "Built-in", 48000, 1, "UNPROCESSED", Weighting.A)
        val calibration = CalibrationProfile("p", "reference", "2026-09-22T00:00:00Z", 70.0, -30.0, "dBA reference", input)
        assertTrue(calibration.validFor(input))
        assertFalse(calibration.validFor(input.copy(sampleRate = 44100)))
        assertFalse(calibration.validFor(input.copy(weighting = Weighting.FLAT)))
        assertFalse(calibration.validFor(input.copy(routeId = "mic:2")))
        assertFalse(calibration.validFor(input.copy(source = "VOICE_RECOGNITION")))
        assertFalse(calibration.validFor(input.copy(gain = "changed")))
    }

    @Test fun graphIsBoundedAndExportPreservesEnergyAndPartialFinalSecond() {
        val session = SessionAccumulator(48000)
        repeat(615) { index -> session.add(AudioWindow((index + 1) * 4800L, 4800, 0.48, 0.01, 0, 0)) }
        val snapshot = session.snapshot
        assertEquals(600, snapshot.points.size)
        assertEquals(61.5, snapshot.seconds, 1e-9)
        assertEquals(-40.0, snapshot.average, 1e-9)
        val exported = session.finish()
        assertEquals(62, exported.size)
        assertEquals(24000, exported.last().count)
        assertEquals(62, session.finish().size)
    }

    @Test fun csvIncludesConditionsAndEscapesUserEnteredSpreadsheetFormula() {
        val input = InputConditions("phone", "mic", "Built-in", 48000, 1, "raw", Weighting.A)
        val profile = CalibrationProfile("p", "=HYPERLINK(\"bad\")", "today", 70.0, -30.0, "line,one\nline two", input)
        val report = SessionReport("start", "end", input, profile, MeterSnapshot(count = 4800),
            listOf(LevelPoint(0.1, -30.0, 4800)), "user")
        val csv = report.csv()
        assertTrue(csv.contains("dBA (estimated)"))
        assertTrue(csv.contains("\"'=HYPERLINK(\"\"bad\"\")\""))
        assertTrue(csv.contains("sample_rate_hz"))
        assertTrue(csv.contains("0.1000,70.0000"))
        assertTrue(csv.contains("reference_level"))
    }
}
