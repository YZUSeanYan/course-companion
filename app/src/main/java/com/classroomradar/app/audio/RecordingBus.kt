package com.classroomradar.app.audio

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow

sealed interface RecorderEvent {
    data class SessionStarted(val sessionId: Long, val startedAtMillis: Long) : RecorderEvent
    data class Status(val isRecording: Boolean, val elapsedSeconds: Long, val isPaused: Boolean = false) : RecorderEvent
    data class PartialTranscript(val text: String) : RecorderEvent
    data class Transcript(val lineId: Long, val text: String, val timestampMillis: Long) : RecorderEvent
    data class LiveMinutes(val contentJson: String) : RecorderEvent
    data class Failure(val message: String) : RecorderEvent
}

object RecordingBus {
    private val _events = MutableSharedFlow<RecorderEvent>(extraBufferCapacity = 32)
    val events = _events.asSharedFlow()

    fun emit(event: RecorderEvent) {
        _events.tryEmit(event)
    }
}
