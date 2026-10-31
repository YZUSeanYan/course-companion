package com.classroomradar.app.audio

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import androidx.core.content.ContextCompat
import androidx.annotation.RequiresPermission
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.CloudTaskEntity
import com.classroomradar.app.learning.api.AiServiceConfig
import com.classroomradar.app.learning.api.LecsyncApiClient
import com.classroomradar.app.learning.api.VoiceTypingOptions
import com.classroomradar.app.learning.api.VoiceTypingTerm
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/** Short-utterance Voice Typing over the authenticated app gateway. */
class VoiceTypingCapture(context: Context) {
    private val appContext = context.applicationContext
    private val repository = ClassroomRepository.get(appContext)
    private val api = LecsyncApiClient(appContext, AiServiceConfig(appContext))
    private val preferences = AppPreferences.get(appContext)
    private val worker = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)
    private val json = Json { ignoreUnknownKeys = true }
    private var recorder: AudioRecord? = null
    private var stream: LecsyncApiClient.Stream? = null
    @Volatile var listening = false
        private set

    fun start(onResult: (String) -> Unit, onError: (String) -> Unit) {
        if (!running.compareAndSet(false, true)) return
        if (ContextCompat.checkSelfPermission(appContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            running.set(false)
            onError("请先允许麦克风权限")
            return
        }
        worker.execute {
            try {
                val terms = preferences.cloudTermPairs.lines().mapNotNull { line ->
                    val pair = line.split('=', '＝', limit = 2)
                    if (pair.size == 2 && pair[0].isNotBlank() && pair[1].isNotBlank()) VoiceTypingTerm(pair[0].trim(), pair[1].trim()) else null
                }
                val options = VoiceTypingOptions(
                    language = preferences.cloudLanguageHints.substringBefore(',').takeIf { it.isNotBlank() && it != "auto" },
                    polish = preferences.cloudVoicePolishEnabled,
                    translateTo = if (preferences.cloudTranslationEnabled && preferences.cloudVoicePolishEnabled) "zh" else null,
                    app = "知习",
                    terms = terms,
                )
                stream = api.openVoiceTyping(options, object : LecsyncApiClient.Listener {
                    override fun onEvent(text: String) {
                        val event = json.parseToJsonElement(text) as? JsonObject ?: return
                        when (event["type"]?.jsonPrimitive?.contentOrNull) {
                            "ready" -> listening = true
                            "result" -> {
                                val result = event["text"]?.jsonPrimitive?.contentOrNull.orEmpty()
                                if (result.isNotBlank()) {
                                    val session = repository.createSession(System.currentTimeMillis())
                                    repository.renameSession(session, "语音输入")
                                    repository.appendTranscript(session, System.currentTimeMillis(), result)
                                    event["request_id"]?.jsonPrimitive?.contentOrNull?.let { id ->
                                        repository.saveCloudTask(CloudTaskEntity(taskId = id, sessionId = session, kind = "VOICE", status = "succeeded", resultText = result, resultJson = text, createdAtMillis = System.currentTimeMillis(), updatedAtMillis = System.currentTimeMillis()))
                                    }
                                }
                                onResult("语音已整理并保存")
                                stop()
                            }
                            "error" -> {
                                onError("语音输入未完成，请重试")
                                stop()
                            }
                        }
                    }

                    override fun onError(error: Throwable) {
                        onError("连接已中断，请重新进行语音输入")
                        stop()
                    }

                    override fun onClosed(code: Int, reason: String) { listening = false }
                })
                capture()
            } catch (error: Exception) {
                listening = false
                running.set(false)
                onError(error.message ?: "无法开始语音输入")
            }
        }
    }

    @RequiresPermission(Manifest.permission.RECORD_AUDIO)
    private fun capture() {
        val bufferSize = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val audio = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(bufferSize * 2, 6400))
        recorder = audio
        audio.startRecording()
        val samples = ShortArray(1600)
        val bytes = ByteArray(3200)
        while (running.get()) {
            val count = audio.read(samples, 0, samples.size)
            if (count < 0) break
            if (!listening) continue
            for (index in 0 until count) {
                bytes[index * 2] = (samples[index].toInt() and 0xff).toByte()
                bytes[index * 2 + 1] = (samples[index].toInt() shr 8 and 0xff).toByte()
            }
            stream?.sendPcm(bytes.copyOf(count * 2))
        }
    }

    fun stop() {
        if (!running.compareAndSet(true, false)) return
        listening = false
        runCatching { stream?.control("end") }
        recorder?.runCatching { stop(); release() }
        recorder = null
        stream?.close()
    }

    fun close() {
        stop()
        worker.shutdown()
    }
}
