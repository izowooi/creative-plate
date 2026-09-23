import Foundation

struct SessionReport: Codable, Sendable {
    let startedAt: String
    let endedAt: String
    let conditions: InputConditions
    let calibration: CalibrationProfile?
    let snapshot: MeterSnapshot
    let readings: [LevelPoint]
    let stopReason: String
    var savedEstimate: LevelEstimate? = nil

    var estimate: LevelEstimate { savedEstimate ?? LevelEstimate.resolve(input: conditions, calibration: calibration) }
    var calibrated: Bool { calibration?.valid(for: conditions) == true }
    var offset: Double { estimate.offset }
    var unit: String {
        if calibrated {
            return conditions.weighting == .a ? "dBA (estimated)" : "dB SPL (estimated, unweighted)"
        }
        return "dB (estimated)"
    }

    func csv() -> String {
        func cell(_ text: String) -> String {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            let safe = trimmed.first.map { "=+-@".contains($0) } == true ? "'" + text : text
            return "\"" + safe.replacingOccurrences(of: "\"", with: "\"\"") + "\""
        }
        func number(_ value: Double) -> String { String(format: "%.4f", locale: Locale(identifier: "en_US_POSIX"), value) }
        var result = "\u{FEFF}"
        func metadata(_ key: String, _ value: String) { result += "#,\(cell(key)),\(cell(value))\n" }
        metadata("app", "Sori 1.0")
        metadata("started_utc", startedAt); metadata("ended_utc", endedAt)
        metadata("unit", unit); metadata("calibrated", String(calibrated))
        metadata("estimate_basis", estimate.basis); metadata("raw_unit", "dBFS")
        metadata("display_floor_db", "0")
        metadata("weighting", conditions.weighting.rawValue)
        metadata("input_device", conditions.device); metadata("input_route", conditions.routeName)
        metadata("route_id", conditions.routeID); metadata("sample_rate_hz", String(conditions.sampleRate))
        metadata("channels", String(conditions.channels)); metadata("input_source", conditions.source)
        metadata("input_gain", conditions.gain); metadata("pipeline", conditions.pipeline)
        metadata("rms_window_ms", "100"); metadata("export_window", "1 second energy average; final row may be shorter")
        metadata("calibration_profile", calibration?.name ?? "none")
        metadata("calibration_date", calibration?.createdAt ?? "none")
        metadata("reference_level", calibration.map { number($0.referenceDB) } ?? "none")
        metadata("calibration_notes", calibration?.notes ?? "none")
        metadata("offset_db", number(offset)); metadata("stop_reason", stopReason)
        metadata("session_min", number(estimate.decibels(snapshot.minimum)))
        metadata("session_energy_average", number(estimate.decibels(snapshot.average)))
        metadata("session_max", number(estimate.decibels(snapshot.maximum)))
        metadata("clipped_samples", String(snapshot.clipped))
        metadata("limitation", "Phone input estimate; not a certified sound level meter. Digital display floor -120 dBFS. No audio saved.")
        result += "elapsed_seconds,level,unit,raw_dbfs,sample_count,clipped_samples\n"
        for row in readings {
            result += "\(number(row.seconds)),\(number(estimate.decibels(row.dbfs))),\(cell(unit)),\(number(row.dbfs)),\(row.count),\(row.clipped)\n"
        }
        return result
    }
}
