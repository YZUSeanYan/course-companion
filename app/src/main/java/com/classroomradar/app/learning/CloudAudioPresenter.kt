package com.classroomradar.app.learning

import android.content.Context
import android.net.Uri
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.CloudTaskEntity
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.AudioTranscriptionOptions
import com.classroomradar.app.learning.api.LecsyncApiClient
import com.classroomradar.app.learning.api.LecsyncResultEnvelope
import com.classroomradar.app.learning.api.VoiceTypingOptions
import com.classroomradar.app.learning.api.VoiceTypingTerm
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.io.File

/** Product-level audio workflows. Provider protocol and credentials remain behind the gateway. */
class CloudAudioPresenter(private val appContext: Context) {
    private val repository = ClassroomRepository.get(appContext)
    private val api = LecsyncApiClient(appContext, AiServiceConfig(appContext))
    private val voiceCapture = com.classroomradar.app.audio.VoiceTypingCapture(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val json = Json { ignoreUnknownKeys = true }
    private val _tasks = MutableStateFlow<List<CloudTaskEntity>>(emptyList())
    val tasks = _tasks.asStateFlow()
    private val _busy = MutableStateFlow(false)
    val busy = _busy.asStateFlow()
    private val _message = MutableStateFlow<String?>(null)
    val message = _message.asStateFlow()
    private val _transcript = MutableStateFlow<LecsyncResultEnvelope?>(null)
    val transcript = _transcript.asStateFlow()
    private val _voiceOptions = MutableStateFlow(AudioOptions())
    val voiceOptions: StateFlow<AudioOptions> = _voiceOptions.asStateFlow()
    private val _voiceListening = MutableStateFlow(false)
    val voiceListening: StateFlow<Boolean> = _voiceListening.asStateFlow()
    private var selectedCourseId: Long? = null

    init {
        val preferences = AppPreferences.get(appContext)
        val terms = preferences.cloudTermPairs.lines().mapNotNull { line ->
            val parts = line.split('=', '＝', limit = 2)
            if (parts.size == 2 && parts[0].isNotBlank() && parts[1].isNotBlank()) VoiceTypingTerm(parts[0].trim(), parts[1].trim()) else null
        }
        _voiceOptions.value = AudioOptions(
            language = preferences.cloudLanguageHints.substringBefore(',').trim().ifBlank { "auto" },
            timestamps = preferences.cloudTimestampsMode,
            speakers = preferences.cloudSpeakersEnabled,
            hotwords = preferences.cloudHotwords.lines().map(String::trim).filter(String::isNotEmpty),
            polish = preferences.cloudVoicePolishEnabled,
            translateTo = if (preferences.cloudTranslationEnabled && preferences.cloudVoicePolishEnabled) "zh" else null,
            terms = terms,
        )
        scope.launch { repository.observeCloudTasks().collect { _tasks.value = it } }
    }

    fun setCourse(courseId: Long?) { selectedCourseId = courseId }

    fun updateVoiceOptions(options: AudioOptions) { _voiceOptions.value = options }

    fun toggleVoiceTyping() {
        if (_voiceListening.value) {
            voiceCapture.stop()
            _voiceListening.value = false
            _message.value = "正在整理语音内容…"
        } else {
            _voiceListening.value = true
            voiceCapture.start(
                onResult = { message -> scope.launch { _message.value = message; _voiceListening.value = false } },
                onError = { message -> scope.launch { _message.value = message; _voiceListening.value = false } },
            )
        }
    }

    fun importAudio(uri: Uri, kind: AudioKind, options: AudioOptions = _voiceOptions.value) {
        if (_busy.value) return
        _busy.value = true
        scope.launch {
            try {
                val file = withContext(Dispatchers.IO) { copyAudio(uri) }
                val result = when (kind) {
                    AudioKind.SYNC -> api.transcribe(file, options.transcription())
                    AudioKind.ASYNC -> api.createJob(file, options.transcription())
                    AudioKind.VOICE -> api.voiceTyping(file, options.voiceTyping())
                }
                val id = result.jobId ?: result.requestId ?: return@launch error("云端没有返回任务标识")
                saveTask(id, kind, result)
                _transcript.value = result
                when {
                    kind == AudioKind.ASYNC -> {
                        _message.value = "音频已提交，正在整理转写。你可以离开此页，稍后回来查看。"
                        pollJob(id)
                    }
                    result.status in setOf("accepted", "processing") -> {
                        _message.value = "音频正在处理，完成后会保存在这里"
                        result.requestId?.let { pollRequest(it, kind) }
                    }
                    else -> {
                        saveTranscript(result, id)
                        _message.value = if (kind == AudioKind.VOICE) "语音已整理成文字并保存" else "转写完成，已保存到课堂记录"
                    }
                }
            } catch (error: Exception) {
                _message.value = error.message ?: "音频处理失败，请稍后重试"
            } finally {
                _busy.value = false
            }
        }
    }

    fun importAudioUrl(url: String) {
        if (_busy.value) return
        _busy.value = true
        scope.launch {
            try {
                val result = api.createJobFromUrl(url.trim(), _voiceOptions.value.transcription())
                val id = result.jobId ?: result.requestId ?: error("云端没有返回任务标识")
                saveTask(id, AudioKind.ASYNC, result)
                _message.value = "音频链接已提交，正在整理转写"
                pollJob(id)
            } catch (error: Exception) {
                _message.value = error.message ?: "无法读取音频链接"
            } finally {
                _busy.value = false
            }
        }
    }

    private fun pollJob(id: String) {
        scope.launch(Dispatchers.IO) {
            repeat(240) {
                try {
                    val result = api.job(id)
                    saveTask(id, AudioKind.ASYNC, result)
                    when (result.status) {
                        "succeeded" -> {
                            val pages = mutableListOf<LecsyncResultEnvelope>()
                            var cursor = 0
                            do {
                                val page = api.jobResult(id, cursor)
                                pages += page
                                cursor = page.nextCursor ?: break
                            } while (true)
                            val completed = pages.last().copy(
                                status = "succeeded",
                                text = pages.joinToString("") { it.finalText },
                                result = null,
                                segments = pages.flatMap { it.segments },
                                words = pages.flatMap { it.words },
                            )
                            saveTask(id, AudioKind.ASYNC, completed)
                            saveTranscript(completed, id)
                            withContext(Dispatchers.Main.immediate) { _message.value = "音频转写已完成" }
                            return@launch
                        }
                        "failed", "cancelled" -> {
                            withContext(Dispatchers.Main.immediate) { _message.value = "音频任务已结束，未生成转写" }
                            return@launch
                        }
                    }
                } catch (error: Exception) {
                    withContext(Dispatchers.Main.immediate) { _message.value = error.message ?: "任务暂时无法更新，请稍后刷新" }
                    return@launch
                }
                delay(3000)
            }
        }
    }

    private fun pollRequest(id: String, kind: AudioKind) {
        scope.launch(Dispatchers.IO) {
            repeat(60) {
                try {
                    val result = if (kind == AudioKind.VOICE) api.voiceTypingStatus(id) else api.requestStatus(id)
                    saveTask(id, kind, result)
                    if (result.status !in setOf("accepted", "processing")) {
                        if (result.finalText.isNotBlank()) saveTranscript(result, id)
                        withContext(Dispatchers.Main.immediate) {
                            _message.value = when {
                                result.finalText.isNotBlank() -> "处理完成，已保存"
                                kind == AudioKind.VOICE && result.status == "succeeded" -> "处理已完成；语音结果不支持再次取回"
                                else -> "本次处理未生成文本"
                            }
                        }
                        return@launch
                    }
                } catch (error: Exception) {
                    withContext(Dispatchers.Main.immediate) { _message.value = error.message }
                    return@launch
                }
                delay(1500)
            }
        }
    }

    fun cancel(task: CloudTaskEntity) {
        scope.launch(Dispatchers.IO) {
            runCatching { api.cancelJob(task.taskId) }
                .onSuccess { saveTask(task.taskId, AudioKind.ASYNC, it) }
                .onFailure { withContext(Dispatchers.Main.immediate) { _message.value = it.message } }
        }
    }

    fun downloadRecording(task: CloudTaskEntity, kind: String, onReady: (String, com.classroomradar.app.learning.api.LecsyncFile) -> Unit) {
        if (task.kind != "REALTIME_STORED") return
        scope.launch(Dispatchers.IO) {
            runCatching { api.recordingFile(task.taskId, kind) }
                .onSuccess { file ->
                    val extension = if (kind == "transcript") "txt" else when {
                        file.mimeType.contains("mpeg") -> "mp3"
                        file.mimeType.contains("ogg") -> "ogg"
                        file.mimeType.contains("mp4") -> "mp4"
                        else -> "wav"
                    }
                    withContext(Dispatchers.Main.immediate) { onReady("知习-${task.taskId}.$extension", file) }
                }
                .onFailure { withContext(Dispatchers.Main.immediate) { _message.value = it.message } }
        }
    }

    fun delete(task: CloudTaskEntity) {
        scope.launch(Dispatchers.IO) {
            runCatching {
                when (task.kind) {
                    "REALTIME_STORED" -> api.deleteRecording(task.taskId)
                    "ASYNC" -> api.deleteJob(task.taskId)
                    else -> Unit
                }
            }.onSuccess {
                repository.deleteCloudTask(task.taskId)
                withContext(Dispatchers.Main.immediate) { _message.value = "已删除云端任务" }
            }.onFailure { withContext(Dispatchers.Main.immediate) { _message.value = it.message } }
        }
    }

    private suspend fun saveTask(id: String, kind: AudioKind, result: LecsyncResultEnvelope) = withContext(Dispatchers.IO) {
        val old = repository.getCloudTask(id)
        val now = System.currentTimeMillis()
        repository.saveCloudTask(
            CloudTaskEntity(
                id = old?.id ?: 0,
                taskId = id,
                sessionId = old?.sessionId,
                kind = kind.name,
                status = result.status,
                progress = result.progress?.toInt() ?: if (result.status == "succeeded") 100 else 0,
                resultText = result.finalText.ifBlank { old?.resultText.orEmpty() },
                resultJson = json.encodeToString(LecsyncResultEnvelope.serializer(), result),
                createdAtMillis = old?.createdAtMillis ?: now,
                updatedAtMillis = now,
            ),
        )
    }

    private suspend fun saveTranscript(result: LecsyncResultEnvelope, taskId: String? = null) = withContext(Dispatchers.IO) {
        val text = result.finalText.trim()
        if (text.isEmpty()) return@withContext
        val session = repository.createSession(System.currentTimeMillis(), selectedCourseId)
        repository.renameSession(session, "音频转写 · ${java.text.DateFormat.getDateTimeInstance().format(java.util.Date())}")
        if (taskId != null) {
            repository.getCloudTask(taskId)?.let { task ->
                repository.saveCloudTask(task.copy(sessionId = session, updatedAtMillis = System.currentTimeMillis()))
            }
        }
        if (result.segments.isEmpty()) {
            repository.appendTranscript(session, System.currentTimeMillis(), text)
        }
        result.segments.forEach { segment ->
            repository.appendTranscript(session, System.currentTimeMillis() + (segment.startMs ?: 0), segment.text, speaker = segment.speaker, startMs = segment.startMs, endMs = segment.endMs)
        }
    }

    private fun copyAudio(uri: Uri): File {
        val mime = appContext.contentResolver.getType(uri).orEmpty()
        val name = queryName(uri) ?: "audio.wav"
        require(Regex("(?i).*\\.(wav|mp3|aac|ogg|opus|mp4|m4a)$").matches(name) || mime.startsWith("audio/") || mime.startsWith("video/")) {
            "请选择 WAV、MP3、AAC、Ogg Opus 或 MP4 音频"
        }
        val target = File(appContext.cacheDir, "cloud-audio-${java.util.UUID.randomUUID()}-${File(name).name}")
        appContext.contentResolver.openInputStream(uri)?.use { input ->
            target.outputStream().use { output ->
                val buffer = ByteArray(64 * 1024)
                var total = 0L
                while (true) {
                    val count = input.read(buffer)
                    if (count < 0) break
                    total += count
                    require(total <= 200 * 1024 * 1024) { "音频不能超过 200 MB" }
                    output.write(buffer, 0, count)
                }
            }
        } ?: error("无法读取所选音频")
        require(target.length() > 0) { "音频文件为空" }
        return target
    }

    private fun queryName(uri: Uri): String? = appContext.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
        val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
        if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
    }

    fun consumeMessage() { _message.value = null }
    fun close() {
        voiceCapture.close()
        scope.cancel()
    }

    enum class AudioKind { SYNC, ASYNC, VOICE }
    data class AudioOptions(
        val language: String = "auto",
        val timestamps: String = "segment",
        val speakers: Boolean = false,
        val hotwords: List<String> = emptyList(),
        val polish: Boolean = true,
        val translateTo: String? = null,
        val terms: List<VoiceTypingTerm> = emptyList(),
        val model: String? = null,
        val webhookId: String? = null,
    ) {
        fun transcription() = AudioTranscriptionOptions(model, language, timestamps, speakers, hotwords, webhookId)
        fun voiceTyping() = VoiceTypingOptions(language.takeIf { it != "auto" }, polish, translateTo, "知习", terms)
    }
}
