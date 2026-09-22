package com.izowooi.dm.core

import kotlin.math.*

enum class Weighting { A, FLAT }

object Acoustics {
    const val FLOOR_DB = -120.0
    const val WINDOW_MS = 100
    const val MAX_SECONDS = 4 * 60 * 60

    fun decibels(meanSquare: Double): Double =
        if (!meanSquare.isFinite() || meanSquare <= 1e-12) FLOOR_DB
        else max(FLOOR_DB, 10.0 * log10(meanSquare))

    fun rmsDb(samples: DoubleArray): Double {
        require(samples.isNotEmpty() && samples.all { it.isFinite() })
        return decibels(samples.sumOf { it * it } / samples.size)
    }

    fun energyAverage(levels: List<Pair<Double, Long>>): Double {
        require(levels.isNotEmpty() && levels.all { it.first.isFinite() && it.second > 0 })
        return decibels(levels.sumOf { 10.0.pow(it.first / 10.0) * it.second } / levels.sumOf { it.second })
    }
}

/** Stateful second-order sections, derived from the analogue A-weighting poles.
 * The digital response is normalized at 1 kHz. No microphone sensitivity is assumed.
 */
class FrequencyFilter(sampleRate: Double, weighting: Weighting) {
    private data class Section(
        val b0: Double, val b1: Double, val b2: Double,
        val a1: Double, val a2: Double,
        var z1: Double = 0.0, var z2: Double = 0.0,
    ) {
        fun apply(x: Double): Double {
            val y = b0 * x + z1
            z1 = b1 * x - a1 * y + z2
            z2 = b2 * x - a2 * y
            return y
        }
        fun magnitude(omega: Double): Double {
            val nReal = b0 + b1 * cos(omega) + b2 * cos(2 * omega)
            val nImag = -b1 * sin(omega) - b2 * sin(2 * omega)
            val dReal = 1 + a1 * cos(omega) + a2 * cos(2 * omega)
            val dImag = -a1 * sin(omega) - a2 * sin(2 * omega)
            return sqrt((nReal * nReal + nImag * nImag) / (dReal * dReal + dImag * dImag))
        }
    }

    private val sections: List<Section>
    private val gain: Double

    init {
        require(sampleRate >= 32000 && sampleRate <= 192000)
        sections = if (weighting == Weighting.FLAT) emptyList() else {
            fun pole(hz: Double): Double = (2 * sampleRate - 2 * PI * hz) / (2 * sampleRate + 2 * PI * hz)
            fun section(zero: Double, p1: Double, p2: Double) = Section(1.0, -2 * zero, 1.0, -(p1 + p2), p1 * p2)
            listOf(
                section(1.0, pole(20.598997), pole(20.598997)),
                section(1.0, pole(107.65265), pole(737.86223)),
                section(-1.0, pole(12194.217), pole(12194.217)),
            )
        }
        gain = 1.0 / sections.fold(1.0) { value, section -> value * section.magnitude(2 * PI * 1000 / sampleRate) }
    }

    fun process(sample: Double): Double {
        var value = sample * gain
        sections.forEach { value = it.apply(value) }
        return value
    }
}

data class AudioWindow(
    val endSample: Long,
    val count: Int,
    val squareSum: Double,
    val peak: Double,
    val clipped: Int,
    val invalid: Int,
) {
    val dbfs: Double get() = Acoustics.decibels(squareSum / count)
}

/** Single audio-thread owner. Emits only summaries; PCM never leaves the audio engine. */
class WindowProcessor(val sampleRate: Int, weighting: Weighting) {
    private val filter = FrequencyFilter(sampleRate.toDouble(), weighting)
    private val windowSize = sampleRate / 10
    private var count = 0
    private var squareSum = 0.0
    private var peak = 0.0
    private var clipped = 0
    private var invalid = 0
    private var totalSamples = 0L

    fun accept(sample: Double): AudioWindow? {
        val safe = if (sample.isFinite()) sample else { invalid++; 0.0 }
        if (abs(safe) >= 0.999) clipped++
        peak = max(peak, abs(safe))
        val weighted = filter.process(safe)
        squareSum += weighted * weighted
        count++
        totalSamples++
        return if (count == windowSize) flush() else null
    }

    fun flush(): AudioWindow? {
        if (count == 0) return null
        val result = AudioWindow(totalSamples, count, squareSum, peak, clipped, invalid)
        count = 0; squareSum = 0.0; peak = 0.0; clipped = 0; invalid = 0
        return result
    }
}

data class InputConditions(
    val device: String,
    val routeId: String,
    val routeName: String,
    val sampleRate: Int,
    val channels: Int,
    val source: String,
    val weighting: Weighting,
    val gain: String = "system-fixed",
    val pipeline: String = "sori-v1:pcm-normalized:100ms:a-bilinear-1khz",
) {
    fun matches(other: InputConditions): Boolean = this == other
}

data class CalibrationProfile(
    val id: String,
    val name: String,
    val createdAt: String,
    val referenceDb: Double,
    val measuredDbfs: Double,
    val notes: String,
    val conditions: InputConditions,
) {
    val offset: Double get() = referenceDb - measuredDbfs
    fun validFor(input: InputConditions): Boolean =
        conditions.matches(input) && referenceDb.isFinite() && referenceDb in 20.0..140.0 &&
            measuredDbfs.isFinite() && measuredDbfs > -100.0 && measuredDbfs < 0.0 && offset in 0.0..180.0
}

data class LevelPoint(val seconds: Double, val dbfs: Double, val count: Int, val clipped: Int = 0)

data class MeterSnapshot(
    val current: Double = Acoustics.FLOOR_DB,
    val minimum: Double = Acoustics.FLOOR_DB,
    val average: Double = Acoustics.FLOOR_DB,
    val maximum: Double = Acoustics.FLOOR_DB,
    val seconds: Double = 0.0,
    val count: Long = 0,
    val clipped: Long = 0,
    val currentClipped: Boolean = false,
    val points: List<LevelPoint> = emptyList(),
) {
    val canCalibrate: Boolean get() {
        val recent = points.takeLast(30)
        if (recent.size < 30 || recent.any { it.clipped > 0 || it.dbfs <= -100 }) return false
        val mean = recent.sumOf { it.dbfs } / recent.size
        return sqrt(recent.sumOf { (it.dbfs - mean).pow(2) } / recent.size) < 2.0
    }
    val calibrationLevel: Double get() = Acoustics.energyAverage(points.takeLast(30).map { it.dbfs to it.count.toLong() })
}

class SessionAccumulator(private val sampleRate: Int) {
    private val graph = ArrayDeque<LevelPoint>()
    private val export = ArrayList<LevelPoint>()
    private var count = 0L
    private var energy = 0.0
    private var minimum = Double.POSITIVE_INFINITY
    private var maximum = Double.NEGATIVE_INFINITY
    private var clipped = 0L
    private var secondEnergy = 0.0
    private var secondCount = 0
    private var secondClipped = 0
    var snapshot = MeterSnapshot()
        private set

    fun add(window: AudioWindow): MeterSnapshot {
        require(window.count > 0 && window.invalid == 0 && window.squareSum.isFinite())
        require(count + window.count <= sampleRate.toLong() * Acoustics.MAX_SECONDS)
        count += window.count
        energy += window.squareSum
        clipped += window.clipped
        minimum = min(minimum, window.dbfs)
        maximum = max(maximum, window.dbfs)
        val seconds = count.toDouble() / sampleRate
        graph.addLast(LevelPoint(seconds, window.dbfs, window.count, window.clipped))
        while (graph.size > 600) graph.removeFirst()
        secondEnergy += window.squareSum; secondCount += window.count; secondClipped += window.clipped
        if (secondCount >= sampleRate) flushExport(seconds)
        snapshot = MeterSnapshot(window.dbfs, minimum, Acoustics.decibels(energy / count), maximum,
            seconds, count, clipped, window.clipped > 0, graph.toList())
        return snapshot
    }

    private fun flushExport(seconds: Double) {
        if (secondCount == 0) return
        export.add(LevelPoint(seconds, Acoustics.decibels(secondEnergy / secondCount), secondCount, secondClipped))
        secondEnergy = 0.0; secondCount = 0; secondClipped = 0
    }

    fun finish(): List<LevelPoint> {
        flushExport(count.toDouble() / sampleRate)
        return export.toList()
    }
}
