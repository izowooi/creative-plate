import Foundation

enum Weighting: String, Codable, CaseIterable, Sendable { case a = "A", flat = "FLAT" }

enum Acoustics {
    static let floorDB = -120.0
    static let windowMS = 100
    static let maximumSeconds = 4 * 60 * 60

    static func decibels(_ meanSquare: Double) -> Double {
        guard meanSquare.isFinite, meanSquare > 1e-12 else { return floorDB }
        return max(floorDB, 10 * log10(meanSquare))
    }

    static func rmsDB(_ samples: [Double]) -> Double? {
        guard !samples.isEmpty, samples.allSatisfy(\.isFinite) else { return nil }
        return decibels(samples.reduce(0) { $0 + $1 * $1 } / Double(samples.count))
    }

    static func energyAverage(_ levels: [(Double, Int)]) -> Double? {
        guard !levels.isEmpty, levels.allSatisfy({ $0.0.isFinite && $0.1 > 0 }) else { return nil }
        let count = levels.reduce(0) { $0 + $1.1 }
        return decibels(levels.reduce(0) { $0 + pow(10, $1.0 / 10) * Double($1.1) } / Double(count))
    }
}

/// Analogue A-weighting poles transformed into digital second-order sections.
/// Normalizing at 1 kHz is a filter gain, never a microphone calibration offset.
struct FrequencyFilter {
    private struct Section {
        let b0: Double, b1: Double, b2: Double, a1: Double, a2: Double
        var z1 = 0.0, z2 = 0.0

        mutating func process(_ x: Double) -> Double {
            let y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }

        func magnitude(_ omega: Double) -> Double {
            let nr = b0 + b1 * cos(omega) + b2 * cos(2 * omega)
            let ni = -b1 * sin(omega) - b2 * sin(2 * omega)
            let dr = 1 + a1 * cos(omega) + a2 * cos(2 * omega)
            let di = -a1 * sin(omega) - a2 * sin(2 * omega)
            return sqrt((nr * nr + ni * ni) / (dr * dr + di * di))
        }
    }

    private var sections: [Section]
    private let gain: Double

    init(sampleRate: Double, weighting: Weighting) {
        precondition((32000...192000).contains(sampleRate))
        if weighting == .flat {
            sections = []
        } else {
            func pole(_ hz: Double) -> Double { (2 * sampleRate - 2 * .pi * hz) / (2 * sampleRate + 2 * .pi * hz) }
            func section(_ zero: Double, _ p1: Double, _ p2: Double) -> Section {
                Section(b0: 1, b1: -2 * zero, b2: 1, a1: -(p1 + p2), a2: p1 * p2)
            }
            sections = [
                section(1, pole(20.598997), pole(20.598997)),
                section(1, pole(107.65265), pole(737.86223)),
                section(-1, pole(12194.217), pole(12194.217))
            ]
        }
        gain = 1 / sections.reduce(1) { $0 * $1.magnitude(2 * .pi * 1000 / sampleRate) }
    }

    mutating func process(_ sample: Double) -> Double {
        var value = sample * gain
        for index in sections.indices { value = sections[index].process(value) }
        return value
    }
}

struct AudioWindow: Sendable {
    let endSample: Int64
    let count: Int
    let squareSum: Double
    let peak: Double
    let clipped: Int
    let invalid: Int
    var dbfs: Double { Acoustics.decibels(squareSum / Double(count)) }
}

/// Owned by the serial audio callback; raw PCM is never stored or dispatched to UI.
final class WindowProcessor {
    let sampleRate: Int
    private var filter: FrequencyFilter
    private let windowSize: Int
    private var count = 0, clipped = 0, invalid = 0
    private var squareSum = 0.0, peak = 0.0
    private var totalSamples: Int64 = 0

    init(sampleRate: Int, weighting: Weighting) {
        self.sampleRate = sampleRate
        filter = FrequencyFilter(sampleRate: Double(sampleRate), weighting: weighting)
        windowSize = sampleRate / 10
    }

    func accept(_ sample: Double) -> AudioWindow? {
        let safe: Double
        if sample.isFinite { safe = sample } else { invalid += 1; safe = 0 }
        if abs(safe) >= 0.999 { clipped += 1 }
        peak = max(peak, abs(safe))
        let weighted = filter.process(safe)
        squareSum += weighted * weighted
        count += 1
        totalSamples += 1
        return count == windowSize ? flush() : nil
    }

    func flush() -> AudioWindow? {
        guard count > 0 else { return nil }
        let result = AudioWindow(endSample: totalSamples, count: count, squareSum: squareSum,
                                 peak: peak, clipped: clipped, invalid: invalid)
        count = 0; squareSum = 0; peak = 0; clipped = 0; invalid = 0
        return result
    }
}

struct InputConditions: Codable, Equatable, Sendable {
    let device: String
    let routeID: String
    let routeName: String
    let sampleRate: Int
    let channels: Int
    let source: String
    let weighting: Weighting
    let gain: String
    var pipeline = "sori-v1:pcm-normalized:100ms:a-bilinear-1khz"
}

struct CalibrationProfile: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let createdAt: String
    let referenceDB: Double
    let measuredDBFS: Double
    let notes: String
    let conditions: InputConditions
    var offset: Double { referenceDB - measuredDBFS }

    func valid(for input: InputConditions) -> Bool {
        conditions == input && referenceDB.isFinite && (20...140).contains(referenceDB) &&
        measuredDBFS.isFinite && measuredDBFS > -100 && measuredDBFS < 0 && (0...180).contains(offset)
    }
}

struct LevelPoint: Codable, Sendable {
    let seconds: Double
    let dbfs: Double
    let count: Int
    var clipped: Int = 0
}

struct MeterSnapshot: Codable, Sendable {
    var current = Acoustics.floorDB
    var minimum = Acoustics.floorDB
    var average = Acoustics.floorDB
    var maximum = Acoustics.floorDB
    var seconds = 0.0
    var count: Int64 = 0
    var clipped: Int64 = 0
    var currentClipped = false
    var points: [LevelPoint] = []

    var canCalibrate: Bool {
        let recent = points.suffix(30)
        guard recent.count == 30, recent.allSatisfy({ $0.clipped == 0 && $0.dbfs > -100 }) else { return false }
        let mean = recent.reduce(0) { $0 + $1.dbfs } / Double(recent.count)
        return sqrt(recent.reduce(0) { $0 + pow($1.dbfs - mean, 2) } / Double(recent.count)) < 2
    }

    var calibrationLevel: Double? {
        Acoustics.energyAverage(points.suffix(30).map { ($0.dbfs, $0.count) })
    }
}

struct SessionAccumulator {
    let sampleRate: Int
    init(sampleRate: Int) { self.sampleRate = sampleRate }
    private var graph: [LevelPoint] = []
    private var export: [LevelPoint] = []
    private var count: Int64 = 0
    private var energy = 0.0
    private var minimum = Double.infinity, maximum = -Double.infinity
    private var clipped: Int64 = 0
    private var secondEnergy = 0.0
    private var secondCount = 0, secondClipped = 0
    private(set) var snapshot = MeterSnapshot()

    mutating func add(_ window: AudioWindow) -> MeterSnapshot? {
        guard window.count > 0, window.invalid == 0, window.squareSum.isFinite,
              count + Int64(window.count) <= Int64(sampleRate * Acoustics.maximumSeconds) else { return nil }
        count += Int64(window.count)
        energy += window.squareSum
        clipped += Int64(window.clipped)
        minimum = min(minimum, window.dbfs); maximum = max(maximum, window.dbfs)
        let seconds = Double(count) / Double(sampleRate)
        graph.append(LevelPoint(seconds: seconds, dbfs: window.dbfs, count: window.count, clipped: window.clipped))
        if graph.count > 600 { graph.removeFirst() }
        secondEnergy += window.squareSum; secondCount += window.count; secondClipped += window.clipped
        if secondCount >= sampleRate { flushExport(seconds) }
        snapshot = MeterSnapshot(current: window.dbfs, minimum: minimum,
            average: Acoustics.decibels(energy / Double(count)), maximum: maximum,
            seconds: seconds, count: count, clipped: clipped, currentClipped: window.clipped > 0, points: graph)
        return snapshot
    }

    private mutating func flushExport(_ seconds: Double) {
        guard secondCount > 0 else { return }
        export.append(LevelPoint(seconds: seconds, dbfs: Acoustics.decibels(secondEnergy / Double(secondCount)),
                                 count: secondCount, clipped: secondClipped))
        secondEnergy = 0; secondCount = 0; secondClipped = 0
    }

    mutating func finish() -> [LevelPoint] {
        flushExport(Double(count) / Double(sampleRate))
        return export
    }
}
