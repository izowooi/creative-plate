package com.izowooi.dm.core

import java.util.Locale

data class SessionReport(
    val startedAt: String,
    val endedAt: String,
    val conditions: InputConditions,
    val calibration: CalibrationProfile?,
    val snapshot: MeterSnapshot,
    val readings: List<LevelPoint>,
    val stopReason: String,
    val savedEstimate: LevelEstimate? = null,
) {
    val estimate get() = savedEstimate ?: LevelEstimate.resolve(conditions, calibration)
    val offset: Double get() = estimate.offset
    val calibrated: Boolean get() = calibration?.validFor(conditions) == true
    val unit: String get() = if (calibrated) {
        if (conditions.weighting == Weighting.A) "dBA (estimated)" else "dB SPL (estimated, unweighted)"
    } else "dB (estimated)"

    fun csv(): String = buildString {
        fun cell(value: String): String {
            // Spreadsheet imports must not execute user-entered profile names or notes.
            val safe = if (value.trimStart().firstOrNull() in listOf('=', '+', '-', '@', '\t', '\r')) "'" + value else value
            return "\"" + safe.replace("\"", "\"\"") + "\""
        }
        fun metadata(key: String, value: String) { append("#,").append(cell(key)).append(',').append(cell(value)).append('\n') }
        fun number(value: Double) = String.format(Locale.ROOT, "%.4f", value)
        append("\uFEFF")
        metadata("app", "Sori 1.0")
        metadata("started_utc", startedAt); metadata("ended_utc", endedAt)
        metadata("unit", unit); metadata("calibrated", calibrated.toString())
        metadata("estimate_basis", estimate.basis); metadata("raw_unit", "dBFS")
        metadata("display_floor_db", "0")
        metadata("weighting", conditions.weighting.name)
        metadata("input_device", conditions.device); metadata("input_route", conditions.routeName)
        metadata("route_id", conditions.routeId); metadata("sample_rate_hz", conditions.sampleRate.toString())
        metadata("channels", conditions.channels.toString()); metadata("input_source", conditions.source)
        metadata("input_gain", conditions.gain); metadata("pipeline", conditions.pipeline)
        metadata("rms_window_ms", "100"); metadata("export_window", "1 second energy average; final row may be shorter")
        metadata("calibration_profile", calibration?.name ?: "none")
        metadata("calibration_date", calibration?.createdAt ?: "none")
        metadata("reference_level", calibration?.referenceDb?.let(::number) ?: "none")
        metadata("calibration_notes", calibration?.notes ?: "none")
        metadata("offset_db", number(offset)); metadata("stop_reason", stopReason)
        metadata("session_min", number(estimate.decibels(snapshot.minimum)))
        metadata("session_energy_average", number(estimate.decibels(snapshot.average)))
        metadata("session_max", number(estimate.decibels(snapshot.maximum)))
        metadata("clipped_samples", snapshot.clipped.toString())
        metadata("limitation", "Phone input estimate; not a certified sound level meter. Digital display floor -120 dBFS. No audio saved.")
        append("elapsed_seconds,level,unit,raw_dbfs,sample_count,clipped_samples\n")
        readings.forEach { row ->
            append(number(row.seconds)).append(',').append(number(estimate.decibels(row.dbfs))).append(',')
                .append(cell(unit)).append(',').append(number(row.dbfs)).append(',')
                .append(row.count).append(',').append(row.clipped).append('\n')
        }
    }
}
