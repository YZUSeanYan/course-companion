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
    fun learningPackRefreshesExpiredDeviceTokenOnce() {
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
                runBlocking {
                    client.analyzeV2(
                        LearningPackRequestV2(
                            courseName = "Test course",
                            language = "zh-CN",
                            analysisMode = "MATERIAL",
                            chunks = listOf(AnalysisChunkInput("page-1", "Synthetic test content")),
                        ),
                    )
                }
            }.exceptionOrNull()

            assertTrue(error is LearningApiException.Http)
            assertEquals(503, (error as LearningApiException.Http).httpCode)
            assertEquals("/v2/learning-pack", server.takeRequest().path)
            assertEquals("/v1/devices/register", server.takeRequest().path)
            assertEquals("/v2/learning-pack", server.takeRequest().path)
        } finally {
            DeviceCredentialStore(context).clear()
            server.shutdown()
        }
    }
}
