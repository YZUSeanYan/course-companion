package com.classroomradar.app.learning.api

import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class LearningApiClientDeviceTest {
    @Test
    fun learningPackJobRefreshesExpiredDeviceTokenOnce() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        DeviceCredentialStore(context).clear()
        DeviceCredentialStore(context).save(DeviceCredential("stale-device", "stale-development-token"))
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(401).setBody("{\"detail\":\"expired\"}"))
        server.enqueue(
            MockResponse().setResponseCode(201).setBody(
                "{\"deviceId\":\"device-new\",\"token\":\"development-token\",\"tokenType\":\"bearer\"}",
            ),
        )
        server.enqueue(MockResponse().setResponseCode(503).setBody("{\"detail\":\"AI provider is not configured\"}"))
        server.start()
        try {
            val client = LearningApiClient(context, server.url("/").toString())
            val error = runCatching {
                runBlocking { client.analyzeV2(analysisRequest()) }
            }.exceptionOrNull()

            assertTrue(error is LearningApiException.Http)
            assertEquals(503, (error as LearningApiException.Http).httpCode)
            assertEquals("/v2/learning-pack/jobs", server.takeRequest().path)
            assertEquals("/v1/devices/register", server.takeRequest().path)
            assertEquals("/v2/learning-pack/jobs", server.takeRequest().path)
        } finally {
            DeviceCredentialStore(context).clear()
            server.shutdown()
        }
    }

    @Test
    fun learningPackPollsBackgroundJobUntilSuccess() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        DeviceCredentialStore(context).clear()
        DeviceCredentialStore(context).save(DeviceCredential("device-1", "development-token"))
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(202).setBody("{\"jobId\":\"job-1234\",\"status\":\"queued\"}"))
        server.enqueue(MockResponse().setResponseCode(200).setBody("{\"jobId\":\"job-1234\",\"status\":\"processing\"}"))
        server.enqueue(MockResponse().setResponseCode(200).setBody(SUCCESS_JOB))
        server.start()
        try {
            val client = LearningApiClient(context, server.url("/").toString())
            val result = runBlocking { client.analyzeV2(analysisRequest()) }

            assertEquals("job-analysis-1", result.analysisId)
            assertEquals("/v2/learning-pack/jobs", server.takeRequest().path)
            assertEquals("/v2/learning-pack/jobs/job-1234", server.takeRequest().path)
            assertEquals("/v2/learning-pack/jobs/job-1234", server.takeRequest().path)
        } finally {
            DeviceCredentialStore(context).clear()
            server.shutdown()
        }
    }

    @Test
    fun learningPackTranslatesFailedJobIntoFriendlyError() {
        val context = InstrumentationRegistry.getInstrumentation().targetContext
        DeviceCredentialStore(context).clear()
        DeviceCredentialStore(context).save(DeviceCredential("device-1", "development-token"))
        val server = MockWebServer()
        server.enqueue(MockResponse().setResponseCode(202).setBody("{\"jobId\":\"job-failed\",\"status\":\"queued\"}"))
        server.enqueue(
            MockResponse().setResponseCode(200).setBody(
                "{\"jobId\":\"job-failed\",\"status\":\"failed\",\"error\":{\"code\":\"quota_exceeded\",\"message\":\"Daily limit reached\"}}",
            ),
        )
        server.start()
        try {
            val client = LearningApiClient(context, server.url("/").toString())
            val error = runCatching {
                runBlocking { client.analyzeV2(analysisRequest()) }
            }.exceptionOrNull()

            assertTrue(error is LearningApiException.JobFailed)
            assertEquals("quota_exceeded", (error as LearningApiException.JobFailed).code)
        } finally {
            DeviceCredentialStore(context).clear()
            server.shutdown()
        }
    }

    private fun analysisRequest() = LearningPackRequestV2(
        courseName = "Test course",
        language = "zh-CN",
        analysisMode = "MATERIAL",
        chunks = listOf(AnalysisChunkInput("page-1", "Synthetic test content")),
    )

    private companion object {
        val SUCCESS_JOB = "{\"jobId\":\"job-1234\",\"status\":\"succeeded\",\"result\":{" +
            "\"analysisId\":\"job-analysis-1\",\"inputSha256\":\"" + "a".repeat(64) + "\"," +
            "\"promptVersion\":\"learning-minutes-v2\",\"schemaVersion\":\"2.0\",\"model\":\"mock-model\"," +
            "\"package\":{\"minutes\":{\"title\":\"Synthetic beam notes\",\"overview\":\"Synthetic lesson.\"," +
            "\"sections\":[{\"sectionKey\":\"s1\",\"title\":\"Beam\",\"body\":\"The beam supports a load.\",\"order\":1,\"sourceIds\":[\"page-1\"]}]}," +
            "\"doubtAnswers\":[],\"visualNotes\":[],\"summary\":[],\"vocabulary\":[],\"phrases\":[],\"keyPoints\":[],\"questions\":[],\"quizCards\":[]}}}"
    }
}
