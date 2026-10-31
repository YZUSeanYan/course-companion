package com.classroomradar.app.learning.api

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

@Serializable
data class DeviceRegistration(
    @SerialName("deviceId") val deviceId: String,
    val token: String,
    val tokenType: String,
)

@Serializable
data class AccountActivateRequest(
    val phone: String,
)

@Serializable
data class AccountLimitsDto(
    val aiPacksPerDay: Int = 0,
    val audioMinutesPerDay: Int = 0,
    val textCharactersPerDay: Int = 0,
    val documentsPerDay: Int = 0,
    val maxDevices: Int = 0,
)

@Serializable
data class AccountUsageDto(
    val date: String = "",
    val aiPacks: Int = 0,
    val audioMinutes: Double = 0.0,
    val textCharacters: Int = 0,
    val documents: Int = 0,
)

@Serializable
data class AccountStatusDto(
    val activated: Boolean = false,
    val required: Boolean = true,
    val status: String = "none",
    val phoneMasked: String = "",
    val displayName: String = "",
    val validUntil: String? = null,
    val limits: AccountLimitsDto = AccountLimitsDto(),
    val usage: AccountUsageDto = AccountUsageDto(),
)

@Serializable
data class GlossaryInput(val term: String, val definition: String? = null)

@Serializable
data class AnalysisChunkInput(
    val sourceId: String,
    val text: String,
    val page: Int? = null,
    val startMs: Long? = null,
    val endMs: Long? = null,
)

@Serializable
data class AnalysisRequest(
    val courseName: String,
    val language: String,
    val glossary: List<GlossaryInput> = emptyList(),
    val chunks: List<AnalysisChunkInput>,
    val requestedOutputs: List<String> = listOf(
        "summary", "vocabulary", "phrases", "keyPoints", "questions", "quizCards",
    ),
)

@Serializable
data class TranslationRequest(
    val lineId: Long,
    val sourceText: String,
    val sourceHash: String,
    val targetLang: String,
)

@Serializable
data class TranslationResultDto(
    val lineId: Long,
    val translation: String,
    val sourceHash: String,
    val model: String,
    val schemaVersion: String,
)

@Serializable
data class SummaryItemDto(val text: String, val sourceIds: List<String>)

@Serializable
data class VocabularyItemDto(
    val term: String,
    val definitionZh: String,
    val definitionEn: String,
    val example: String,
    val sourceIds: List<String>,
)

@Serializable
data class PhraseItemDto(
    val phrase: String,
    val definitionZh: String,
    val definitionEn: String,
    val example: String,
    val sourceIds: List<String>,
)

@Serializable
data class KeyPointItemDto(val text: String, val sourceIds: List<String>)

@Serializable
data class QuestionItemDto(val question: String, val answer: String, val sourceIds: List<String>)

@Serializable
data class QuizCardDto(val front: String, val back: String, val sourceIds: List<String>)

@Serializable
data class MinuteSectionDto(
    val sectionKey: String,
    val title: String,
    val body: String,
    val order: Int,
    val sourceIds: List<String>,
)

@Serializable
data class MinutesDto(
    val title: String,
    val overview: String,
    val sections: List<MinuteSectionDto>,
)

@Serializable
data class DoubtAnswerDto(val doubtId: String, val answer: String, val sourceIds: List<String>)

@Serializable
data class VisualNoteDto(val sourceId: String, val description: String, val sourceIds: List<String>)

@Serializable
data class ManualDoubtInput(val doubtId: String, val sourceText: String, val note: String = "")

@Serializable
data class VisualBlockInput(
    val sourceId: String,
    val ocrText: String = "",
    val imageBase64: String,
    val mimeType: String,
)

@Serializable
data class LearningPackRequestV2(
    val courseName: String,
    val courseNature: String = "",
    val language: String,
    val analysisMode: String,
    val chunks: List<AnalysisChunkInput>,
    val glossary: List<GlossaryInput> = emptyList(),
    val manualDoubts: List<ManualDoubtInput> = emptyList(),
    val visualBlocks: List<VisualBlockInput> = emptyList(),
)

@Serializable
data class LearningPackageDto(
    val minutes: MinutesDto? = null,
    val doubtAnswers: List<DoubtAnswerDto> = emptyList(),
    val visualNotes: List<VisualNoteDto> = emptyList(),
    val summary: List<SummaryItemDto> = emptyList(),
    val vocabulary: List<VocabularyItemDto> = emptyList(),
    val phrases: List<PhraseItemDto> = emptyList(),
    val keyPoints: List<KeyPointItemDto> = emptyList(),
    val questions: List<QuestionItemDto> = emptyList(),
    val quizCards: List<QuizCardDto> = emptyList(),
)

@Serializable
data class AnalysisResultDto(
    val analysisId: String,
    val inputSha256: String,
    val promptVersion: String,
    val schemaVersion: String,
    val model: String,
    @SerialName("package")
    val learningPackage: LearningPackageDto,
)

@Serializable
data class ApiErrorResponse(val detail: JsonElement)

@Serializable
data class LearningJobCreatedDto(
    val jobId: String,
    val status: String,
)

@Serializable
data class LearningJobErrorDto(
    val code: String = "",
    val message: String = "",
)

@Serializable
data class LearningJobStatusDto(
    val jobId: String,
    val status: String,
    val result: AnalysisResultDto? = null,
    val error: LearningJobErrorDto? = null,
)

internal fun ApiErrorResponse.userDetail(): String = when (val value = detail) {
    is JsonPrimitive -> value.content.take(300)
    is JsonArray -> value.mapNotNull { item ->
        (item as? JsonObject)?.get("msg")?.let { (it as? JsonPrimitive)?.content }
    }.joinToString("；").ifBlank { "请求内容未通过校验" }.take(300)
    else -> "请求内容未通过校验"
}

fun AnalysisResultDto.validateV2Against(request: LearningPackRequestV2) {
    require(analysisId.isNotBlank() && Regex("[0-9a-f]{64}").matches(inputSha256)) { "AI 返回的元数据无效" }
    val validSources = request.chunks.mapTo(mutableSetOf()) { it.sourceId } + request.visualBlocks.map { it.sourceId }
    val minutes = learningPackage.minutes
    require(minutes != null && minutes.overview.isNotBlank() && minutes.sections.isNotEmpty()) { "AI 未返回学习纪要" }
    minutes.sections.forEach { section ->
        require(section.sourceIds.isNotEmpty() && section.sourceIds.all(validSources::contains)) { "纪要包含无效来源" }
    }
    val doubtIds = request.manualDoubts.mapTo(mutableSetOf()) { it.doubtId }
    learningPackage.doubtAnswers.forEach { answer ->
        require(answer.doubtId in doubtIds && answer.sourceIds.all(validSources::contains)) { "疑问解答包含无效引用" }
    }
    learningPackage.visualNotes.forEach { note ->
        require(note.sourceId in validSources && note.sourceIds.all(validSources::contains)) { "图像说明包含无效引用" }
    }
}

fun AnalysisResultDto.validateAgainst(request: AnalysisRequest) {
    require(analysisId.isNotBlank() && promptVersion.isNotBlank() && schemaVersion.isNotBlank()) {
        "AI 返回的分析元数据不完整"
    }
    require(Regex("[0-9a-f]{64}").matches(inputSha256)) { "AI 返回的输入哈希无效" }
    val sourceIds = request.chunks.mapTo(mutableSetOf()) { it.sourceId }
    require(sourceIds.size == request.chunks.size) { "输入来源 ID 必须唯一" }
    val pack = learningPackage
    val sources = buildList {
        pack.summary.forEach { add(it.sourceIds) }
        pack.vocabulary.forEach { add(it.sourceIds) }
        pack.phrases.forEach { add(it.sourceIds) }
        pack.keyPoints.forEach { add(it.sourceIds) }
        pack.questions.forEach { add(it.sourceIds) }
        pack.quizCards.forEach { add(it.sourceIds) }
    }
    require(sources.all { refs -> refs.isNotEmpty() && refs.toSet().size == refs.size && refs.all(sourceIds::contains) }) {
        "AI 学习内容包含无效来源"
    }
    val outputItems = mapOf(
        "summary" to pack.summary.size,
        "vocabulary" to pack.vocabulary.size,
        "phrases" to pack.phrases.size,
        "keyPoints" to pack.keyPoints.size,
        "questions" to pack.questions.size,
        "quizCards" to pack.quizCards.size,
    )
    require(outputItems.all { (name, count) -> (name in request.requestedOutputs) == (count > 0) }) {
        "AI 返回的学习内容与请求类型不一致"
    }
}
