package com.classroomradar.app.learning.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class LecsyncTerm(val source: String, val target: String)

@Serializable
data class LecsyncTranslationRequest(
    val sourceText: String,
    val targetLang: String,
    val sourceLang: String = "auto",
    val context: String = "",
    val terms: List<LecsyncTerm> = emptyList(),
    val model: String? = null,
    val lineId: Long? = null,
    val sourceHash: String? = null,
)

@Serializable
data class LecsyncResultEnvelope(
    val requestId: String? = null,
    val jobId: String? = null,
    val status: String = "succeeded",
    val result: JsonObject? = null,
    val text: String? = null,
    val raw: String? = null,
    val language: String? = null,
    val model: String? = null,
    val usedModel: Boolean? = null,
    val progress: Double? = null,
    val usage: JsonObject? = null,
    val segments: List<LecsyncTimestamp> = emptyList(),
    val words: List<LecsyncTimestamp> = emptyList(),
    val resultExpiresAt: String? = null,
    val cursor: Int? = null,
    val nextCursor: Int? = null,
    val pageCount: Int? = null,
) {
    val finalText: String get() = text ?: result?.get("text")?.jsonPrimitive?.contentOrNull.orEmpty()
}

@Serializable
data class LecsyncTimestamp(
    val text: String,
    val startMs: Long? = null,
    val endMs: Long? = null,
    val speaker: String? = null,
)

@Serializable
data class RealtimeTranscribeConfig(
    val languages: List<String>,
    val strict: Boolean? = null,
    val identifyLanguage: Boolean? = null,
    val displayMode: String? = null,
    val segmentation: String? = null,
    val speakers: Boolean? = null,
)

@Serializable
data class RealtimeTranslateConfig(val languages: List<String>)

@Serializable
data class RealtimeGlossaryConfig(
    val terms: List<String>? = null,
    val pairs: List<LecsyncTerm>? = null,
    val context: String? = null,
)

@Serializable
data class RealtimeConfig(
    val transcribe: RealtimeTranscribeConfig,
    val translate: RealtimeTranslateConfig? = null,
    val glossary: RealtimeGlossaryConfig? = null,
    val aiEnhance: Boolean = false,
    val digest: Boolean = false,
    val store: Boolean = false,
    val region: String? = null,
)

@Serializable
data class StreamConfiguration(val type: String = "configure", val config: RealtimeConfig)

@Serializable
data class StreamControl(val type: String)

@Serializable
data class VoiceTypingTerm(val term: String, val value: String)

@Serializable
data class VoiceTypingOptions(
    val language: String? = null,
    val polish: Boolean = true,
    val translateTo: String? = null,
    val app: String? = null,
    val terms: List<VoiceTypingTerm> = emptyList(),
)

@Serializable
data class AudioTranscriptionOptions(
    val model: String? = null,
    val language: String = "auto",
    val timestamps: String = "none",
    val diarization: Boolean = false,
    val hotwords: List<String> = emptyList(),
    val webhookId: String? = null,
)

@Serializable
data class AudioUrlJobRequest(val fileUrl: String, val options: AudioTranscriptionOptions)

@Serializable
data class LecsyncErrorBody(val code: String? = null, val message: String? = null, val retryAfter: Double? = null)

@Serializable
data class LecsyncApiError(val detail: LecsyncErrorBody)

data class LecsyncFile(val bytes: ByteArray, val mimeType: String)
