package com.classroomradar.app.learning.api

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Only talks to our gateway. No provider API key or upstream socket token is available here. */
class LecsyncApiClient(
    context: Context,
    private val config: AiServiceConfig,
    private val client: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(180, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build(),
) {
    private val credentials = DeviceCredentialStore(context)
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

    suspend fun translate(request: LecsyncTranslationRequest): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        val body = json.encodeToString(LecsyncTranslationRequest.serializer(), request).toRequestBody(JSON)
        val result = requestJson<LecsyncResultEnvelope>("/v2/lecsync/translate", body)
        if (result.finalText.isBlank()) throw IOException("翻译结果为空")
        result
    }

    suspend fun models(): String = withContext(Dispatchers.IO) {
        request("/v2/lecsync/models", null, "GET")
    }

    suspend fun transcribe(file: File, options: AudioTranscriptionOptions): LecsyncResultEnvelope =
        audioRequest("/v2/lecsync/audio/transcriptions", file, json.encodeToString(AudioTranscriptionOptions.serializer(), options))

    suspend fun createJob(file: File, options: AudioTranscriptionOptions): LecsyncResultEnvelope =
        audioRequest("/v2/lecsync/audio/jobs", file, json.encodeToString(AudioTranscriptionOptions.serializer(), options))

    suspend fun createJobFromUrl(url: String, options: AudioTranscriptionOptions): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        val body = json.encodeToString(AudioUrlJobRequest.serializer(), AudioUrlJobRequest(url, options)).toRequestBody(JSON)
        requestJson("/v2/lecsync/audio/jobs/url", body)
    }

    suspend fun job(jobId: String): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        requestJson("/v2/lecsync/audio/jobs/${pathPart(jobId)}", null, "GET")
    }

    suspend fun requestStatus(requestId: String): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        requestJson("/v2/lecsync/requests/${pathPart(requestId)}", null, "GET")
    }

    suspend fun voiceTypingStatus(requestId: String): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        requestJson("/v2/lecsync/voice-typing/requests/${pathPart(requestId)}", null, "GET")
    }

    suspend fun jobResult(jobId: String, cursor: Int = 0): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        requestJson("/v2/lecsync/audio/jobs/${pathPart(jobId)}/result?cursor=$cursor", null, "GET")
    }

    suspend fun cancelJob(jobId: String): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        requestJson("/v2/lecsync/audio/jobs/${pathPart(jobId)}/cancel", ByteArray(0).toRequestBody())
    }

    suspend fun deleteJob(jobId: String): String = withContext(Dispatchers.IO) {
        request("/v2/lecsync/audio/jobs/${pathPart(jobId)}", null, "DELETE")
    }

    suspend fun voiceTyping(file: File, options: VoiceTypingOptions): LecsyncResultEnvelope =
        audioRequest("/v2/lecsync/voice-typing", file, json.encodeToString(VoiceTypingOptions.serializer(), options))

    suspend fun recording(sessionId: String): String = withContext(Dispatchers.IO) {
        request("/v2/lecsync/recordings/${pathPart(sessionId)}", null, "GET")
    }

    suspend fun deleteRecording(sessionId: String): String = withContext(Dispatchers.IO) {
        request("/v2/lecsync/recordings/${pathPart(sessionId)}", null, "DELETE")
    }

    suspend fun recordingFile(sessionId: String, kind: String): LecsyncFile = withContext(Dispatchers.IO) {
        require(kind in setOf("audio", "transcript"))
        requestBytes("/v2/lecsync/recordings/${pathPart(sessionId)}/$kind")
    }

    fun openRealtime(configuration: RealtimeConfig, listener: Listener): Stream {
        return openStream("/v2/lecsync/realtime", json.encodeToString(StreamConfiguration.serializer(), StreamConfiguration(config = configuration)), listener)
    }
    fun openVoiceTyping(options: VoiceTypingOptions, listener: Listener): Stream {
        val configuration = """{"type":"configure","config":${json.encodeToString(VoiceTypingOptions.serializer(), options)}}"""
        return openStream("/v2/lecsync/voice-typing/ws", configuration, listener)
    }

    private fun openStream(path: String, configuration: String, listener: Listener, retried: Boolean = false, existingStream: Stream? = null): Stream {
        val stream = existingStream ?: Stream()
        val credential = credentials.load() ?: kotlinx.coroutines.runBlocking { registerDevice() }
        val socket = client.newWebSocket(
            Request.Builder().url(endpoint(path, websocket = true)).header("Authorization", gatewayToken(credential.token)).build(),
            object : WebSocketListener() {
                override fun onMessage(webSocket: WebSocket, text: String) = listener.onEvent(text)
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    if (response?.code == 401 && !retried) {
                        credentials.clear()
                        runCatching {
                            registerDevice()
                            openStream(path, configuration, listener, retried = true, existingStream = stream)
                        }.onFailure { listener.onError(IOException("设备凭据已过期，请重新连接", it)) }
                    } else {
                        listener.onError(IOException("云端连接中断", t))
                    }
                }
                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = listener.onClosed(code, reason)
            },
        )
        stream.attach(socket)
        if (!socket.send(configuration)) {
            socket.cancel()
            throw IOException("无法配置云端听课")
        }
        return stream
    }

    private suspend fun audioRequest(path: String, file: File, options: String): LecsyncResultEnvelope = withContext(Dispatchers.IO) {
        require(file.isFile && file.length() in 1..200 * 1024 * 1024) { "音频文件不存在或超过 200 MB" }
        val mime = when (file.extension.lowercase()) {
            "wav" -> "audio/wav"; "mp3" -> "audio/mpeg"; "aac" -> "audio/aac"
            "ogg", "opus" -> "audio/ogg"; "mp4", "m4a" -> "audio/mp4"
            else -> throw IOException("请选择 WAV、MP3、AAC、Ogg Opus 或 MP4 音频")
        }
        val body = MultipartBody.Builder().setType(MultipartBody.FORM)
            .addFormDataPart("file", file.name, file.asRequestBody(mime.toMediaType()))
            .addFormDataPart("options", options).build()
        requestJson(path, body)
    }

    private inline fun <reified T> requestJson(path: String, body: okhttp3.RequestBody?, method: String = "POST"): T {
        val response = request(path, body, method)
        return json.decodeFromString<T>(response)
    }

    private fun requestBytes(path: String, retried: Boolean = false): LecsyncFile {
        val token = credentials.load()?.token ?: registerDevice().token
        val request = Request.Builder().url(endpoint(path)).header("Authorization", gatewayToken(token)).get().build()
        client.newCall(request).execute().use { response ->
            if (response.code == 401 && !retried) {
                credentials.clear()
                return requestBytes(path, retried = true)
            }
            if (!response.isSuccessful) throw LearningApiException.Http(response.code, "文件不可用", "云端录音")
            return LecsyncFile(
                response.body?.bytes() ?: throw IOException("文件内容为空"),
                response.body?.contentType()?.toString() ?: "application/octet-stream",
            )
        }
    }

    private fun gatewayToken(token: String): String = "Bearer ".plus(token)

    private fun request(path: String, body: okhttp3.RequestBody?, method: String): String {
        try {
            return execute(path, body, method, credentials.load()?.token)
        } catch (error: LearningApiException.Http) {
            if (error.httpCode != 401) throw error
            credentials.clear()
            return execute(path, body, method, registerDevice().token)
        }
    }

    private fun execute(path: String, body: okhttp3.RequestBody?, method: String, token: String?): String {
        if (token == null) throw LearningApiException.Http(401, "请先连接 AI 服务", "云端学习")
        val builder = Request.Builder().url(endpoint(path)).header("Authorization", gatewayToken(token))
        when (method) {
            "GET" -> builder.get()
            "DELETE" -> builder.delete()
            else -> builder.post(body ?: ByteArray(0).toRequestBody())
        }
        return client.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401) {
                credentials.clear()
                throw LearningApiException.Http(401, "设备凭据已过期，请重新检查 AI 服务", "云端学习")
            }
            if (!response.isSuccessful) {
                val detail = runCatching { json.decodeFromString(LecsyncApiError.serializer(), text).detail }.getOrNull()
                throw IOException(detail?.message ?: "云端学习暂时不可用，请稍后重试")
            }
            text
        }
    }

    private fun registerDevice(): DeviceCredential {
        val response = requestRaw(
            Request.Builder().url(endpoint("/v1/devices/register")).post(ByteArray(0).toRequestBody()).build(),
        )
        val registration = json.decodeFromString(DeviceRegistration.serializer(), response)
        if (registration.token.isBlank() || registration.deviceId.isBlank()) throw IOException("设备注册失败")
        return DeviceCredential(registration.deviceId, registration.token).also(credentials::save)
    }

    private fun requestRaw(request: Request): String {
        client.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw LearningApiException.Http(response.code, "设备注册失败", "云端学习")
            return text
        }
    }

    private fun endpoint(path: String, websocket: Boolean = false): String {
        val base = config.baseUrl.trimEnd('/').let { if (websocket) it.replaceFirst(Regex("^http"), "ws") else it }
        return "$base$path"
    }

    private fun pathPart(value: String): String {
        require(Regex("[A-Za-z0-9_-]{1,256}").matches(value)) { "任务标识无效" }
        return value
    }

    class Stream internal constructor() {
        @Volatile private var socket: WebSocket? = null

        @Synchronized
        internal fun attach(newSocket: WebSocket) {
            socket?.cancel()
            socket = newSocket
        }

        fun sendPcm(bytes: ByteArray): Boolean = socket?.send(ByteString.of(*bytes)) == true
        fun control(type: String): Boolean = socket?.send("""{"type":"$type"}""") == true
        fun close() { socket?.close(1000, null) }
        fun cancel() { socket?.cancel() }
    }

    interface Listener {
        fun onEvent(text: String)
        fun onError(error: Throwable)
        fun onClosed(code: Int = 1000, reason: String = "")
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()
    }
}
