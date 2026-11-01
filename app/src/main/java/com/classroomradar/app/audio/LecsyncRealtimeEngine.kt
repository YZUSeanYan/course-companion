package com.classroomradar.app.audio

import android.content.Context
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.TranslationEntity
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.LecsyncApiClient
import com.classroomradar.app.learning.api.RealtimeConfig
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import java.io.ByteArrayOutputStream
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import android.os.Handler
import android.os.Looper

/**
 * Close codes that mean "open a new stream": the official Lecsync retryable set
 * (4001 token, 4004 node, 4010 balance, 4011 concurrency, 1012 gateway restart,
 * plus 4012 max duration, 4013 idle and 4016 slow reader) merged with this
 * gateway's own contract codes (4401 auth; legacy 4408 class boundary).
 */
internal val REALTIME_RECONNECT_CLOSE_CODES = setOf(
    4001, 4004, 4010, 4011, 4012, 4013, 4016, 1012, 4401, 4408,
)

/** Device audio goes only to our gateway, which owns all upstream credentials. */
class LecsyncRealtimeEngine(
    private val appContext: Context,
    private val config: RealtimeConfig,
) : TranscriptionEngine {
    private val api = LecsyncApiClient(appContext, AiServiceConfig(appContext))
    private val repository = ClassroomRepository.get(appContext)
    private val modelManager = ModelPackageManager(appContext)
    private val json = Json { ignoreUnknownKeys = true }
    private val worker = Executors.newSingleThreadExecutor()
    private val stopped = AtomicBoolean(false)
    private val reconnecting = AtomicBoolean(false)
    private val recoveryHandler = Handler(Looper.getMainLooper())
    private val fallbackWatchdog = Runnable {
        if (!stopped.get() && offlineFallback == null && !ready) {
            val fallback = useOfflineFallback()
            if (fallback == null) listener?.onError(IllegalStateException("云端连接超时，且本机识别模型不可用"))
        }
    }
    @Volatile private var ready = false
    @Volatile private var ended = false
    @Volatile private var sessionId: Long? = null
    @Volatile private var stream: LecsyncApiClient.Stream? = null
    @Volatile private var offlineFallback: TranscriptionEngine? = null
    @Volatile private var streamId = java.util.UUID.randomUUID().toString()
    @Volatile private var streamStartedAt = System.currentTimeMillis()
    @Volatile private var streamOffsetMs = 0L
    @Volatile private var cloudTaskId: String? = null
    @Volatile private var listener: TranscriptionEngine.Listener? = null
    private var reconnectAttempts = 0
    private val pending = ByteArrayOutputStream()
    private val segmentLines = ConcurrentHashMap<String, Long>()
    private val pendingTranslations = ConcurrentHashMap<String, JsonObject>()
    private val latencyTracker = RealtimeLatencyTracker()
    private var lastMetricsEmitAtMs = 0L
    private var lastEmittedRecognitionMs = 0L
    private val lock = Any()

    override fun start(listener: TranscriptionEngine.Listener) {
        this.listener = listener
        connect()
    }

    private fun connect() {
        if (stopped.get() || offlineFallback != null) return
        try {
            stream = api.openRealtime(config, object : LecsyncApiClient.Listener {
                override fun onEvent(text: String) {
                    worker.execute { handleEvent(text, listener ?: return@execute) }
                }

                override fun onError(error: Throwable) {
                    if (!stopped.get()) recover(error)
                }

                override fun onClosed(code: Int, reason: String) {
                    ready = false
                    if (!stopped.get() && code in REALTIME_RECONNECT_CLOSE_CODES) {
                        recover(IllegalStateException("连接需要重新建立"))
                    } else if (!stopped.get()) {
                        useOfflineFallback() ?: listener?.onError(IllegalStateException("云端听课已中断；已保存内容不会丢失"))
                    }
                }
            })
        } catch (error: Exception) {
            recover(error)
        }
    }

    private fun recover(error: Throwable) {
        if (stopped.get() || !reconnecting.compareAndSet(false, true)) return
        recoveryHandler.removeCallbacks(fallbackWatchdog)
        recoveryHandler.postDelayed(fallbackWatchdog, 8_000)
        if (reconnectAttempts >= 2) {
            if (useOfflineFallback() == null) listener?.onError(error)
            return
        }
        reconnectAttempts += 1
        worker.execute {
            Thread.sleep(500L * reconnectAttempts)
            if (stopped.get()) return@execute
            ready = false
            streamOffsetMs += System.currentTimeMillis() - streamStartedAt
            streamStartedAt = System.currentTimeMillis()
            streamId = java.util.UUID.randomUUID().toString()
            latencyTracker.resetStream()
            runCatching { stream?.cancel() }
            RecordingBus.emit(RecorderEvent.Failure("连接已中断，正在恢复；已保存的课堂不会丢失"))
            connect()
            reconnecting.set(false)
        }
    }

    private fun useOfflineFallback(): TranscriptionEngine? {
        recoveryHandler.removeCallbacks(fallbackWatchdog)
        if (stopped.get() || offlineFallback != null || !modelManager.canRecognize()) return offlineFallback
        val fallback = runCatching {
            SherpaTwoPassEngine(appContext, modelManager.installedDirectory())
        }.getOrNull() ?: return null
        offlineFallback = fallback
        ready = false
        runCatching { stream?.cancel() }
        synchronized(lock) { pending.reset() }
        listener?.let { currentListener ->
            runCatching { fallback.start(currentListener) }.onFailure {
                offlineFallback = null
                return null
            }
        }
        RecordingBus.emit(RecorderEvent.Failure("云端暂不可用，已切换本机识别；课堂继续进行"))
        return fallback
    }

    override fun acceptPcm(samples: ShortArray, count: Int) {
        offlineFallback?.let { fallback ->
            if (!stopped.get()) fallback.acceptPcm(samples, count)
            return
        }
        if (stopped.get()) return
        val bytes = ByteArray(count * 2)
        for (index in 0 until count) {
            bytes[index * 2] = (samples[index].toInt() and 0xff).toByte()
            bytes[index * 2 + 1] = (samples[index].toInt() shr 8 and 0xff).toByte()
        }
        synchronized(lock) {
            pending.write(bytes)
            // Keep at most two seconds while connecting; never burst stale audio after a stall.
            if (pending.size() > 64_000) {
                val buffered = pending.toByteArray()
                pending.reset()
                pending.write(buffered, buffered.size - 64_000, 64_000)
            }
        }
        if (ready) drainAudio()
    }

    private fun drainAudio() {
        while (ready && !stopped.get()) {
            val frame = synchronized(lock) {
                if (pending.size() == 0) return
                val count = minOf(6400, pending.size())
                val all = pending.toByteArray()
                pending.reset()
                if (all.size > count) pending.write(all, count, all.size - count)
                all.copyOf(count)
            }
            if (stream?.sendPcm(frame) == true) latencyTracker.onAudioSent(System.currentTimeMillis()) else return
        }
    }

    private fun handleEvent(raw: String, listener: TranscriptionEngine.Listener) {
        val event = json.parseToJsonElement(raw) as? JsonObject ?: return
        when (event.string("type")) {
            "session.ready" -> {
                if (offlineFallback != null) {
                    stream?.cancel()
                    return
                }
                ready = true
                recoveryHandler.removeCallbacks(fallbackWatchdog)
                reconnectAttempts = 0
                val upstreamSession = event.string("sessionId")
                cloudTaskId = upstreamSession
                val currentSession = sessionId
                if (upstreamSession != null && currentSession != null) {
                    val now = System.currentTimeMillis()
                    runBlocking {
                        repository.saveCloudTask(
                            com.classroomradar.app.data.CloudTaskEntity(
                                taskId = upstreamSession,
                                sessionId = currentSession,
                                kind = if (event.bool("store") == true) "REALTIME_STORED" else "REALTIME",
                                status = "accepted",
                                resultJson = raw,
                                createdAtMillis = now,
                                updatedAtMillis = now,
                            ),
                        )
                    }
                }
                drainAudio()
            }
            "transcript.partial" -> {
                latencyTracker.onPartial(System.currentTimeMillis())?.let { publishMetrics() }
                event.string("text")?.takeIf(String::isNotBlank)?.let(listener::onPartialText)
            }
            "transcript.final" -> {
                val text = event.string("text").orEmpty().trim()
                val segment = event.string("segmentId")
                if (text.isEmpty() || segment == null) return
                latencyTracker.onFinal(segment, System.currentTimeMillis())
                listener.onFinalSegment(
                    TranscriptSegment(
                        text = text,
                        segmentKey = "$streamId:$segment",
                        speaker = event.string("speaker"),
                        startMs = event.long("startMs")?.plus(streamOffsetMs),
                        endMs = event.long("endMs")?.plus(streamOffsetMs),
                        language = event.string("language"),
                    ),
                )
            }
            "translation.partial" -> {
                latencyTracker.onTranslationPartial(System.currentTimeMillis())?.let { publishMetrics() }
            }
            "translation.final" -> {
                val segment = event.string("segmentId") ?: return
                val key = "$streamId:$segment"
                val lineId = segmentLines[key]
                latencyTracker.onTranslationFinal(segment, System.currentTimeMillis())?.let { publishMetrics() }
                if (lineId == null) {
                    pendingTranslations[key] = event
                } else {
                    saveTranslation(lineId, event)
                }
            }
            "digest.update" -> {
                val currentSession = sessionId ?: return
                runBlocking { repository.saveLiveMinutes(currentSession, raw) }
                RecordingBus.emit(RecorderEvent.LiveMinutes(raw))
            }
            "session.ended" -> {
                ended = true
                cloudTaskId?.let { id ->
                    runBlocking {
                        repository.getCloudTask(id)?.let { task ->
                            repository.saveCloudTask(task.copy(status = "succeeded", updatedAtMillis = System.currentTimeMillis()))
                        }
                    }
                }
            }
            "usage.update" -> {
                val currentSession = sessionId ?: return
                runBlocking {
                    repository.saveLiveUsage(
                        currentSession,
                        event.double("effectiveSeconds") ?: 0.0,
                        event.double("accruedCents"),
                        event.double("discardedSeconds") ?: 0.0,
                    )
                }
            }
            "session.error" -> {
                if (event.bool("retryable") == true) recover(IllegalStateException(event.string("message")))
                else useOfflineFallback() ?: listener.onError(IllegalStateException(event.string("message") ?: "云端听课暂时不可用"))
            }
        }
    }

    fun registerTranscriptLine(segmentKey: String?, lineId: Long, sourceText: String) {
        if (segmentKey == null || lineId <= 0) return
        segmentLines[segmentKey] = lineId
        pendingTranslations.remove(segmentKey)?.let { translation -> saveTranslation(lineId, translation) }
    }

    /** Publishes live latency at most twice a second and only when the value moved. */
    private fun publishMetrics() {
        val now = System.currentTimeMillis()
        val recognition = latencyTracker.recognitionLatencyMs
        if (now - lastMetricsEmitAtMs < 500 || recognition == lastEmittedRecognitionMs) return
        lastMetricsEmitAtMs = now
        lastEmittedRecognitionMs = recognition
        RecordingBus.emit(
            RecorderEvent.CloudMetrics(recognition, latencyTracker.translationLatencyMs.takeIf { it > 0 }),
        )
    }

    private fun saveTranslation(lineId: Long, event: JsonObject) {
        val translated = event.string("text").orEmpty()
        if (translated.isBlank()) return
        runBlocking {
            repository.upsertTranslation(
                TranslationEntity(
                    transcriptLineId = lineId,
                    targetLang = event.string("targetLanguage") ?: "zh",
                    sourceHash = event.string("sourceText").orEmpty().toByteArray().sha256(),
                    translatedText = translated,
                    status = TranslationEntity.STATUS_DONE,
                    updatedAtMillis = System.currentTimeMillis(),
                ),
            )
        }
    }

    override fun stop(onComplete: () -> Unit) {
        if (!stopped.compareAndSet(false, true)) {
            onComplete()
            return
        }
        ready = false
        recoveryHandler.removeCallbacks(fallbackWatchdog)
        offlineFallback?.let { fallback ->
            runCatching { stream?.cancel() }
            fallback.stop(onComplete)
            worker.shutdown()
            return
        }
        worker.execute {
            runCatching { stream?.control("session.finalize") }
            runCatching { stream?.control("session.stop") }
            val deadline = System.currentTimeMillis() + 3000
            while (!ended && System.currentTimeMillis() < deadline) Thread.sleep(50)
            runCatching { stream?.close() }
            worker.shutdown()
            runCatching { worker.awaitTermination(2, TimeUnit.SECONDS) }
            onComplete()
        }
    }

    fun attachSession(sessionId: Long) {
        this.sessionId = sessionId
    }

    /**
     * Asks the upstream to finalize the sentence in progress, mirroring the
     * official `session.finalize` control message, so pause/stop keeps the last
     * partial and its translation instead of dropping it at the idle timeout.
     */
    override fun finalizePending() {
        if (stopped.get() || offlineFallback != null || !ready) return
        worker.execute { runCatching { stream?.control("session.finalize") } }
    }

    private fun ByteArray.sha256(): String = java.security.MessageDigest.getInstance("SHA-256").digest(this).joinToString("") { "%02x".format(it) }
    private fun JsonObject.string(key: String): String? = this[key]?.jsonPrimitive?.contentOrNull
    private fun JsonObject.long(key: String): Long? = this[key]?.jsonPrimitive?.longOrNull
    private fun JsonObject.double(key: String): Double? = this[key]?.jsonPrimitive?.contentOrNull?.toDoubleOrNull()
    private fun JsonObject.bool(key: String): Boolean? = this[key]?.jsonPrimitive?.let { runCatching { it.boolean }.getOrNull() }
}
