package com.classroomradar.app.audio

/**
 * Measures cloud recognition and translation latency from the same signals the
 * official client reports on: first-word around 0.28s and a first translation
 * token roughly 88ms behind the transcript. Recognition latency is the age of
 * the newest sent audio when a partial arrives; translation latency is the gap
 * between a transcript event and the streaming translation update that follows.
 * Both are smoothed with an EMA so single spikes do not hide the steady value.
 */
internal class RealtimeLatencyTracker {
    private var lastAudioSentAtMs = 0L
    private var lastTranscriptEventAtMs = 0L
    private val finalArrivals = LinkedHashMap<String, Long>()

    var recognitionLatencyMs = 0L
        private set
    var translationLatencyMs = 0L
        private set

    /** Records that a PCM frame just left the device. */
    fun onAudioSent(nowMs: Long) {
        lastAudioSentAtMs = nowMs
    }

    /** Returns the measured recognition latency for this partial, or null when unreliable. */
    fun onPartial(nowMs: Long): Long? {
        lastTranscriptEventAtMs = nowMs
        if (lastAudioSentAtMs <= 0L) return null
        return smoothLag(nowMs - lastAudioSentAtMs, translation = false)?.also { lag ->
            recognitionLatencyMs = smooth(recognitionLatencyMs, lag)
        }
    }

    fun onFinal(segmentId: String, nowMs: Long) {
        lastTranscriptEventAtMs = nowMs
        if (finalArrivals.size >= MAX_TRACKED_FINALS) {
            finalArrivals.remove(finalArrivals.keys.first())
        }
        finalArrivals[segmentId] = nowMs
    }

    /** Returns the measured translation latency for this streaming update, or null when unreliable. */
    fun onTranslationPartial(nowMs: Long): Long? {
        if (lastTranscriptEventAtMs <= 0L) return null
        return smoothLag(nowMs - lastTranscriptEventAtMs, translation = true)
    }

    /** Returns the measured completion lag for this final translation, or null when unknown. */
    fun onTranslationFinal(segmentId: String, nowMs: Long): Long? {
        val startedAt = finalArrivals.remove(segmentId) ?: return null
        return smoothLag(nowMs - startedAt, translation = true)
    }

    /** Segment numbering restarts on every new stream, so the arrival table must too. */
    fun resetStream() {
        finalArrivals.clear()
        lastAudioSentAtMs = 0L
        lastTranscriptEventAtMs = 0L
    }

    private fun smoothLag(lagMs: Long, translation: Boolean): Long? {
        val windowMs = if (translation) TRANSLATION_WINDOW_MS else RECOGNITION_WINDOW_MS
        if (lagMs < 0L || lagMs > windowMs) return null
        if (translation) {
            translationLatencyMs = smooth(translationLatencyMs, lagMs)
        }
        return lagMs
    }

    private fun smooth(previousMs: Long, nextMs: Long): Long =
        if (previousMs <= 0L) nextMs else (previousMs * 3 + nextMs) / 4

    private companion object {
        const val MAX_TRACKED_FINALS = 64
        const val RECOGNITION_WINDOW_MS = 5_000L
        const val TRANSLATION_WINDOW_MS = 2_000L
    }
}
