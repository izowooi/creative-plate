package com.izowooi.dm.audio

import android.annotation.SuppressLint
import android.content.Context
import android.media.*
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AudioEffect
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import com.izowooi.dm.core.*
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlin.math.max

/** A single owner reads PCM, computes fixed-size windows, and sends summaries to main. */
class MicrophoneCapture(context: Context) {
    private val audio = context.getSystemService(AudioManager::class.java)
    private val executor = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private val active = AtomicBoolean(false)
    private val keepReading = AtomicBoolean(false)
    private val reason = AtomicReference("user")
    @Volatile private var recorder: AudioRecord? = null

    @SuppressLint("MissingPermission")
    fun start(weighting: Weighting, ready: (InputConditions) -> Unit,
              window: (AudioWindow) -> Unit, stopped: (String) -> Unit) {
        if (!active.compareAndSet(false, true)) return
        keepReading.set(true); reason.set("user")
        executor.execute {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            var processor: WindowProcessor? = null
            val effects = mutableListOf<AudioEffect>()
            var callbackRegistered = false
            val recordingCallback = object : AudioManager.AudioRecordingCallback() {
                override fun onRecordingConfigChanged(configs: MutableList<AudioRecordingConfiguration>) {
                    if (Build.VERSION.SDK_INT >= 29 && configs.any { it.clientAudioSessionId == recorder?.audioSessionId && it.isClientSilenced }) {
                        stop("interrupted")
                    }
                }
            }
            try {
                val source = if (audio.getProperty(AudioManager.PROPERTY_SUPPORT_AUDIO_SOURCE_UNPROCESSED) == "true")
                    MediaRecorder.AudioSource.UNPROCESSED else MediaRecorder.AudioSource.VOICE_RECOGNITION
                val builtIn = audio.getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_MIC }
                var input: AudioRecord? = null
                for (rate in listOf(48000, 44100)) {
                    val minimum = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_FLOAT)
                    if (minimum <= 0) continue
                    val candidate = try {
                        AudioRecord.Builder().setAudioSource(source)
                            .setAudioFormat(AudioFormat.Builder().setSampleRate(rate).setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                                .setEncoding(AudioFormat.ENCODING_PCM_FLOAT).build())
                            .setBufferSizeInBytes(max(minimum * 2, rate / 5 * 4)).build()
                    } catch (_: IllegalArgumentException) { continue }
                    if (candidate.state == AudioRecord.STATE_INITIALIZED) { input = candidate; break }
                    candidate.release()
                }
                val record = input ?: throw IllegalStateException("Unsupported PCM input")
                recorder = record
                if (!keepReading.get()) return@execute
                if (builtIn != null) record.setPreferredDevice(builtIn)
                val effectState = mutableListOf<String>()
                fun disable(label: String, effect: AudioEffect?) {
                    if (effect == null) { effectState.add("$label=unavailable"); return }
                    effects.add(effect)
                    try { effect.setEnabled(false) } catch (_: Exception) { }
                    effectState.add("$label=${if (effect.enabled) "on" else "off"}")
                }
                try { disable("agc", if (AutomaticGainControl.isAvailable()) AutomaticGainControl.create(record.audioSessionId) else null) } catch (_: Exception) { effectState.add("agc=unknown") }
                try { disable("ns", if (NoiseSuppressor.isAvailable()) NoiseSuppressor.create(record.audioSessionId) else null) } catch (_: Exception) { effectState.add("ns=unknown") }
                try { disable("aec", if (AcousticEchoCanceler.isAvailable()) AcousticEchoCanceler.create(record.audioSessionId) else null) } catch (_: Exception) { effectState.add("aec=unknown") }
                audio.registerAudioRecordingCallback(recordingCallback, main)
                callbackRegistered = true
                record.startRecording()
                if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) throw IllegalStateException("Recording unavailable")
                processor = WindowProcessor(record.sampleRate, weighting)
                val buffer = FloatArray(1024)
                var inputConditions: InputConditions? = null
                var initialRoute: Int? = null
                var samples = 0L
                while (keepReading.get()) {
                    val read = record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
                    if (!keepReading.get()) break
                    if (read <= 0) throw IllegalStateException("Audio read failed")
                    val route = record.routedDevice
                    if (inputConditions == null) {
                        val device = route ?: builtIn
                        initialRoute = route?.id
                        inputConditions = InputConditions("${Build.MANUFACTURER} ${Build.MODEL} / Android ${Build.VERSION.RELEASE}",
                            "${device?.id ?: -1}:${device?.type ?: -1}", device?.productName?.toString() ?: "Microphone",
                            record.sampleRate, record.channelCount,
                            (if (source == MediaRecorder.AudioSource.UNPROCESSED) "UNPROCESSED" else "VOICE_RECOGNITION") + ";" + effectState.joinToString(";"), weighting)
                        val confirmed = inputConditions
                        main.post { ready(confirmed) }
                    } else if (route != null && initialRoute != null && route.id != initialRoute) {
                        reason.set("route_changed"); break
                    }
                    for (index in 0 until read) {
                        val summary = processor.accept(buffer[index].toDouble())
                        samples++
                        if (summary != null) {
                            if (summary.invalid != 0) { reason.set("invalid_signal"); keepReading.set(false); break }
                            main.post { window(summary) }
                        }
                        if (samples >= record.sampleRate.toLong() * Acoustics.MAX_SECONDS) {
                            reason.set("limit_reached"); keepReading.set(false); break
                        }
                    }
                }
            } catch (_: SecurityException) {
                reason.set("permission_denied")
            } catch (_: Exception) {
                if (keepReading.get()) reason.set("error_microphone")
            } finally {
                keepReading.set(false)
                if (callbackRegistered) audio.unregisterAudioRecordingCallback(recordingCallback)
                try { recorder?.stop() } catch (_: IllegalStateException) { }
                effects.forEach { it.release() }
                recorder?.release(); recorder = null
                processor?.flush()?.takeIf { it.invalid == 0 }?.let { remainder -> main.post { window(remainder) } }
                active.set(false)
                val result = reason.get()
                main.post { stopped(result) }
            }
        }
    }

    fun stop(why: String = "user") {
        if (!active.get()) return
        reason.compareAndSet("user", why)
        keepReading.set(false)
        try { recorder?.stop() } catch (_: IllegalStateException) { }
    }

    fun close() { stop("background_stopped"); executor.shutdown() }
}
