package com.izowooi.dm.core

/** A display estimate, separate from the PCM measurement and reference calibration. */
data class LevelEstimate(val offset: Double, val basis: String) {
    fun decibels(dbfs: Double): Double {
        if (!dbfs.isFinite() || !offset.isFinite() || dbfs <= Acoustics.FLOOR_DB) return 0.0
        return (dbfs + offset).coerceAtLeast(0.0)
    }

    companion object {
        fun resolve(input: InputConditions?, calibration: CalibrationProfile?): LevelEstimate {
            if (input != null && calibration?.validFor(input) == true) {
                return LevelEstimate(calibration.offset, "reference_calibration")
            }
            // Android CDD nominal sensitivities for the built-in microphone, not device calibration.
            // UNPROCESSED: 94 dB SPL -> -36 dBFS; VOICE_RECOGNITION: 90 -> -22.35.
            if (input?.routeId?.endsWith(":15") == true) {
                if (input.source.startsWith("UNPROCESSED;")) return LevelEstimate(130.0, "android_unprocessed_nominal_v1")
                if (input.source.startsWith("VOICE_RECOGNITION;")) return LevelEstimate(112.35, "android_voice_nominal_v1")
            }
            return LevelEstimate(110.0, "generic_estimate_v1")
        }
    }
}
