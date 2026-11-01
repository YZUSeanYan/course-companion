package com.classroomradar.app.audio

data class TranscriptSegment(
    val text: String,
    val segmentKey: String? = null,
    val speaker: String? = null,
    val startMs: Long? = null,
    val endMs: Long? = null,
    val language: String? = null,
)

/** Boundary for bundled offline ASR and the authenticated realtime gateway. */
interface TranscriptionEngine : AutoCloseable {
    interface Listener {
        fun onPartialText(text: String)
        /** Cloud engines stream the in-flight translation; null clears the preview. */
        fun onPartialTranslation(text: String?) = Unit
        fun onFinalText(text: String)
        fun onFinalSegment(segment: TranscriptSegment) = onFinalText(segment.text)
        fun onError(error: Throwable)
    }

    fun start(listener: Listener)
    fun acceptPcm(samples: ShortArray, count: Int)
    /** Cloud engines flush the sentence in progress; offline engines ignore this. */
    fun finalizePending() = Unit
    /** Invokes [onComplete] after all queued final recognition work has drained. */
    fun stop(onComplete: () -> Unit = {})
    override fun close() = stop()
}
