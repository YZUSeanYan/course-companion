package com.classroomradar.app.learning

import android.content.Context
import com.classroomradar.app.audio.RecorderEvent
import com.classroomradar.app.audio.RecordingBus
import com.classroomradar.app.audio.TranscriptSegment
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.CloudTaskEntity
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.AudioTranscriptionOptions
import com.classroomradar.app.learning.api.LecsyncApiClient
import com.classroomradar.app.learning.api.LecsyncResultEnvelope
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File

/**
 * 离线课堂的云端补转写（同课堂原地替换）。
 *
 * A local/offline session keeps its WAV; when the network and the audio quota allow,
 * the recording is re-transcribed by the cloud gateway and the provisional local
 * transcript rows of the SAME session are replaced in place (manual doubts survive).
 * Quota/network failures leave the file queued and retry on the next app start.
 */
class OfflineSyncManager private constructor(private val appContext: Context) {
    private val repository = ClassroomRepository.get(appContext)
    private val preferences = AppPreferences.get(appContext)
    private val api = LecsyncApiClient(appContext, AiServiceConfig(appContext))
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun schedule(sessionId: Long, audioRelativePath: String) {
        if (!preferences.autoCloudSync) return
        val file = File(appContext.filesDir, audioRelativePath)
        if (!file.isFile) return
        preferences.addPendingCloudSync(sessionId, file.absolutePath)
        retryPending()
    }

    fun retryPending() {
        if (!preferences.autoCloudSync) return
        scope.launch { drain() }
    }

    private suspend fun drain() {
        val pending = preferences.pendingCloudSync()
        for ((sessionId, path) in pending) {
            val file = File(path)
            if (!file.isFile) {
                preferences.removePendingCloudSync(sessionId)
                continue
            }
            val succeeded = runCatching { syncOne(sessionId, file) }.getOrDefault(false)
            if (succeeded) {
                preferences.removePendingCloudSync(sessionId)
                if (!preferences.saveAudioEnabled) file.delete()
            } else {
                // Keep the file and the queue entry: quota or network may recover later.
                return
            }
        }
    }

    private suspend fun syncOne(sessionId: Long, file: File): Boolean {
        val options = AudioTranscriptionOptions(
            language = preferences.cloudLanguageHints.substringBefore(',').trim().ifBlank { "auto" },
            timestamps = preferences.cloudTimestampsMode,
            diarization = preferences.cloudSpeakersEnabled,
            hotwords = preferences.cloudHotwords.lines().map(String::trim).filter(String::isNotEmpty),
        )
        var result = api.createJob(file, options)
        val jobId = result.jobId ?: result.requestId ?: return false
        saveTask(jobId, sessionId, result)
        repeat(240) {
            when (result.status) {
                "succeeded" -> return finish(jobId, sessionId, result)
                "failed", "cancelled" -> {
                    saveTask(jobId, sessionId, result)
                    return false
                }
            }
            delay(3_000)
            result = api.job(jobId)
            saveTask(jobId, sessionId, result)
        }
        return false
    }

    private suspend fun finish(jobId: String, sessionId: Long, first: LecsyncResultEnvelope): Boolean {
        // Always fetch the result pages themselves: the job status payload carries no segments.
        val pages = mutableListOf<LecsyncResultEnvelope>()
        var cursor = 0
        do {
            val page = api.jobResult(jobId, cursor)
            pages += page
            cursor = page.nextCursor ?: break
        } while (true)
        val segments = pages.flatMap { it.segments }
            .map {
                TranscriptSegment(
                    text = it.text,
                    speaker = it.speaker,
                    startMs = it.startMs,
                    endMs = it.endMs,
                )
            }
            .filter { it.text.isNotBlank() }
        if (segments.isEmpty()) return false
        withContext(Dispatchers.IO) {
            repository.replaceSessionTranscript(sessionId, segments)
            saveTask(jobId, sessionId, first.copy(status = "succeeded"))
        }
        RecordingBus.emit(RecorderEvent.CloudSyncCompleted(sessionId))
        return true
    }

    private suspend fun saveTask(taskId: String, sessionId: Long, result: LecsyncResultEnvelope) {
        val now = System.currentTimeMillis()
        val existing = repository.getCloudTask(taskId)
        repository.saveCloudTask(
            CloudTaskEntity(
                taskId = taskId,
                sessionId = sessionId,
                kind = "SYNC",
                status = result.status,
                progress = result.progress?.toInt() ?: if (result.status == "succeeded") 100 else 0,
                resultText = result.finalText,
                createdAtMillis = existing?.createdAtMillis ?: now,
                updatedAtMillis = now,
            ),
        )
    }

    companion object {
        @Volatile private var instance: OfflineSyncManager? = null

        fun get(context: Context): OfflineSyncManager = instance ?: synchronized(this) {
            instance ?: OfflineSyncManager(context.applicationContext).also { instance = it }
        }
    }
}
