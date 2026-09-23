import Foundation

/// A display estimate, separate from the PCM measurement and reference calibration.
struct LevelEstimate: Codable, Equatable, Sendable {
    let offset: Double
    let basis: String

    static func resolve(input: InputConditions?, calibration: CalibrationProfile?) -> LevelEstimate {
        if let input, let calibration, calibration.valid(for: input) {
            return LevelEstimate(offset: calibration.offset, basis: "reference_calibration")
        }
        // A common, deliberately approximate starting point; not an iPhone model calibration.
        return LevelEstimate(offset: 110, basis: "generic_estimate_v1")
    }

    func decibels(_ dbfs: Double) -> Double {
        guard dbfs.isFinite, offset.isFinite else { return 0 }
        // Digital silence is never presented as a positive ambient sound level.
        guard dbfs > Acoustics.floorDB else { return 0 }
        return max(0, dbfs + offset)
    }
}
