package com.classroomradar.app.learning.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class HealthResponse(
    val status: String,
    val providerConfigured: Boolean,
)

@Serializable
data class DeviceRegistrationResponse(
    val deviceId: String,
    val token: String,
    val tokenType: String = "bearer",
)

@Serializable
data class GlossaryItem(
    val term: String,
    val definition: String? = null,
)

@Serializable
data class LearningChunk(
    val sourceId: String,
    val text: String,
    val page: Int? = null,
    val startMs: Long? = null,
    val endMs: Long? = null,
)

@Serializable
enum class RequestedOutput(val wireName: String) {
    @SerialName("summary")
    SUMMARY("summary"),

    @SerialName("vocabulary")
    VOCABULARY("vocabulary"),

    @SerialName("phrases")
    PHRASES("phrases"),

    @SerialName("keyPoints")
    KEY_POINTS("keyPoints"),

    @SerialName("questions")
    QUESTIONS("questions"),

    @SerialName("quizCards")
    QUIZ_CARDS("quizCards"),
}

@Serializable
data class AnalyzeRequest(
    val courseName: String,
    val language: String,
    val glossary: List<GlossaryItem> = emptyList(),
    val chunks: List<LearningChunk>,
    val requestedOutputs: List<RequestedOutput>,
)

@Serializable
data class AnalysisEnvelope(
    val analysisId: String,
    val inputSha256: String,
    val promptVersion: String,
    val schemaVersion: String,
    val model: String,
    val `package`: LearningPackage,
)

@Serializable
data class LearningPackage(
    val summary: List<SummaryItem> = emptyList(),
    val vocabulary: List<VocabularyItem> = emptyList(),
    val phrases: List<PhraseItem> = emptyList(),
    val keyPoints: List<KeyPointItem> = emptyList(),
    val questions: List<QuestionItem> = emptyList(),
    val quizCards: List<QuizCard> = emptyList(),
)

@Serializable
data class SummaryItem(
    val text: String,
    val sourceIds: List<String>,
)

@Serializable
data class VocabularyItem(
    val term: String,
    val definitionZh: String,
    val definitionEn: String,
    val example: String,
    val sourceIds: List<String>,
)

@Serializable
data class PhraseItem(
    val phrase: String,
    val definitionZh: String,
    val definitionEn: String,
    val example: String,
    val sourceIds: List<String>,
)

@Serializable
data class KeyPointItem(
    val text: String,
    val sourceIds: List<String>,
)

@Serializable
data class QuestionItem(
    val question: String,
    val answer: String,
    val sourceIds: List<String>,
)

@Serializable
data class QuizCard(
    val front: String,
    val back: String,
    val sourceIds: List<String>,
)
