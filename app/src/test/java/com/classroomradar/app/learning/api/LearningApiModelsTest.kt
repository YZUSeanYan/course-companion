package com.classroomradar.app.learning.api

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LearningApiModelsTest {
    private val json = Json { ignoreUnknownKeys = false; encodeDefaults = true }

    @Test
    fun requestUsesServerFieldNames() {
        val request = AnalysisRequest(
            courseName = "Manufacturing English",
            language = "zh-en",
            chunks = listOf(AnalysisChunkInput("page-1", "A lathe removes material.", page = 1)),
        )
        val encoded = json.encodeToString(AnalysisRequest.serializer(), request)
        assertTrue(encoded.contains("\"courseName\""))
        assertTrue(encoded.contains("\"requestedOutputs\""))
        assertTrue(encoded.contains("\"sourceId\""))
        assertTrue(encoded.contains("\"keyPoints\""))
    }

    @Test
    fun validResponsePassesSourceValidation() {
        val request = AnalysisRequest(
            courseName = "Manufacturing English",
            language = "zh-en",
            chunks = listOf(AnalysisChunkInput("page-1", "A lathe removes material.")),
        )
        val response = validResponse()
        response.validateAgainst(request)
        assertEquals("lathe", response.learningPackage.vocabulary.single().term)
    }

    @Test
    fun registrationAcceptsCompleteServerResponse() {
        val registration = json.decodeFromString(
            DeviceRegistration.serializer(),
            "{\"deviceId\":\"device-1\",\"token\":\"secret-token\",\"tokenType\":\"bearer\"}",
        )
        assertEquals("device-1", registration.deviceId)
        assertEquals("bearer", registration.tokenType)
    }

    @Test(expected = IllegalArgumentException::class)
    fun unknownSourceIsRejected() {
        val request = AnalysisRequest(
            courseName = "Manufacturing English",
            language = "zh-en",
            chunks = listOf(AnalysisChunkInput("page-2", "Different source.")),
        )
        validResponse().validateAgainst(request)
    }

    private fun validResponse() = AnalysisResultDto(
        analysisId = "analysis-1",
        inputSha256 = "a".repeat(64),
        promptVersion = "learning-pack-v1",
        schemaVersion = "1.0",
        model = "test-model",
        learningPackage = LearningPackageDto(
            summary = listOf(SummaryItemDto("Lathes remove material.", listOf("page-1"))),
            vocabulary = listOf(VocabularyItemDto("lathe", "车床", "A machine for removing material.", "Use a lathe.", listOf("page-1"))),
            phrases = listOf(PhraseItemDto("remove material", "去除材料", "Cut material from a workpiece.", "Remove material carefully.", listOf("page-1"))),
            keyPoints = listOf(KeyPointItemDto("Secure the workpiece first.", listOf("page-1"))),
            questions = listOf(QuestionItemDto("What is a lathe?", "A machine tool.", listOf("page-1"))),
            quizCards = listOf(QuizCardDto("Translate: lathe", "车床", listOf("page-1"))),
        ),
    )
}
