import Foundation
import Testing
@testable import dm

struct AcousticsTests {
    @Test func halfAmplitudeDropsSixDecibels() throws {
        let signal = (0..<4800).map { 0.4 * sin(2 * .pi * 1000 * Double($0) / 48000) }
        let original = try #require(Acoustics.rmsDB(signal))
        let half = try #require(Acoustics.rmsDB(signal.map { $0 / 2 }))
        #expect(abs(original - half - 6.0206) < 0.0001)
    }

    @Test func energyAverageIsNotArithmeticDecibelAverage() throws {
        let value = try #require(Acoustics.energyAverage([(-40, 4800), (-60, 4800)]))
        #expect(abs(value - -42.9671) < 0.0001)
        let weighted = try #require(Acoustics.energyAverage([(-40, 3), (-60, 1)]))
        #expect(abs(weighted - 10 * log10((3e-4 + 1e-6) / 4)) < 1e-9)
        #expect(Acoustics.rmsDB([.nan]) == nil)
    }

    @Test func silenceInvalidInputAndPartialWindows() throws {
        let processor = WindowProcessor(sampleRate: 48000, weighting: .flat)
        for _ in 0..<4798 { #expect(processor.accept(0) == nil) }
        #expect(processor.accept(.nan) == nil)
        let result = try #require(processor.accept(.infinity))
        #expect(result.dbfs == -120)
        #expect(result.invalid == 2)
        #expect(processor.accept(1) == nil)
        #expect(processor.accept(-1) == nil)
        let clipped = try #require(processor.flush())
        #expect(clipped.clipped == 2)
        #expect(clipped.count == 2)
        #expect(clipped.dbfs == 0)
        #expect(processor.flush() == nil)
    }

    @Test(arguments: [44100, 48000, 96000])
    func aWeightingReferenceResponse(rate: Int) {
        let targets: [(Double, Double)] = [(31.5, -39.4), (63, -26.2), (125, -16.1), (250, -8.6),
                                          (500, -3.2), (1000, 0), (2000, 1.2), (4000, 1.0), (8000, -1.1)]
        for (frequency, reference) in targets {
            var filter = FrequencyFilter(sampleRate: Double(rate), weighting: .a)
            var inputEnergy = 0.0, outputEnergy = 0.0
            for index in 0..<(rate * 2) {
                let input = 0.1 * sin(2 * .pi * frequency * Double(index) / Double(rate))
                let output = filter.process(input)
                if index >= rate { inputEnergy += input * input; outputEnergy += output * output }
            }
            let measured = 10 * log10(outputEnergy / inputEnergy)
            #expect(abs(measured - reference) < 0.9, "\(rate) Hz / \(frequency) Hz: \(measured) dB")
        }
    }

    @Test func calibrationRequiresExactInputConditions() {
        let input = InputConditions(device: "phone", routeID: "mic1", routeName: "Built-in", sampleRate: 48000,
            channels: 1, source: "measurement", weighting: .a, gain: "1")
        let profile = CalibrationProfile(id: "p", name: "Reference", createdAt: "today", referenceDB: 70,
                                         measuredDBFS: -30, notes: "Matched reference", conditions: input)
        #expect(profile.valid(for: input))
        let changed = InputConditions(device: "phone", routeID: "mic2", routeName: "USB", sampleRate: 44100,
            channels: 1, source: "measurement", weighting: .a, gain: "1")
        #expect(!profile.valid(for: changed))
        let weightingChanged = InputConditions(device: "phone", routeID: "mic1", routeName: "Built-in", sampleRate: 48000,
            channels: 1, source: "measurement", weighting: .flat, gain: "1")
        #expect(!profile.valid(for: weightingChanged))
    }

    @Test func boundedGraphAndCompleteEnergyExport() throws {
        var accumulator = SessionAccumulator(sampleRate: 48000)
        for index in 0..<615 {
            let result = accumulator.add(AudioWindow(endSample: Int64((index + 1) * 4800), count: 4800,
                                                     squareSum: 0.48, peak: 0.01, clipped: 0, invalid: 0))
            #expect(result != nil)
        }
        #expect(accumulator.snapshot.points.count == 600)
        #expect(abs(accumulator.snapshot.seconds - 61.5) < 1e-9)
        #expect(abs(accumulator.snapshot.average - -40) < 1e-9)
        let rows = accumulator.finish()
        #expect(rows.count == 62)
        #expect(rows.last?.count == 24000)
        #expect(accumulator.finish().count == 62)
    }

    @Test func calibrationNeedsStableUnclippedSamples() {
        var snapshot = MeterSnapshot()
        #expect(!snapshot.canCalibrate)
        snapshot.points = (0..<30).map { LevelPoint(seconds: Double($0) / 10, dbfs: -30, count: 4800) }
        #expect(snapshot.canCalibrate)
        snapshot.points[29].clipped = 1
        #expect(!snapshot.canCalibrate)
    }

    @Test func csvRoundTripAndFormulaEscaping() throws {
        let input = InputConditions(device: "phone", routeID: "mic1", routeName: "Built-in", sampleRate: 48000,
            channels: 1, source: "measurement", weighting: .a, gain: "1")
        let profile = CalibrationProfile(id: "p", name: "=HYPERLINK(\"bad\")", createdAt: "today", referenceDB: 70,
                                         measuredDBFS: -30, notes: "line,one\nline two", conditions: input)
        let report = SessionReport(startedAt: "start", endedAt: "end", conditions: input, calibration: profile,
            snapshot: MeterSnapshot(), readings: [LevelPoint(seconds: 0.1, dbfs: -30, count: 4800)], stopReason: "user")
        let csv = report.csv()
        #expect(csv.contains("dBA (estimated)"))
        #expect(csv.contains("\"'=HYPERLINK(\"\"bad\"\")\""))
        #expect(csv.contains("0.1000,70.0000"))
        let decoded = try JSONDecoder().decode(SessionReport.self, from: JSONEncoder().encode(report))
        #expect(decoded.csv() == csv)
    }
}
