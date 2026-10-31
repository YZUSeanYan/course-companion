package com.classroomradar.app.learning.api

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AiServiceConfigTest {
    @Test
    fun emulatorAndLanUrlsAreAcceptedForDebug() {
        assertEquals(
            "http://10.0.2.2:8765",
            AiServiceConfig.normalize(" http://10.0.2.2:8765/ ", allowCleartext = true),
        )
        assertEquals(
            "http://192.168.1.20:8765/api",
            AiServiceConfig.normalize("http://192.168.1.20:8765/api/", allowCleartext = true),
        )
    }

    @Test
    fun releaseRequiresHttps() {
        val error = runCatching {
            AiServiceConfig.normalize("http://10.0.2.2:8765", allowCleartext = false)
        }.exceptionOrNull()
        assertTrue(error is IllegalArgumentException)
        assertEquals(
            "https://learning.example.com",
            AiServiceConfig.normalize("https://learning.example.com/", allowCleartext = false),
        )
    }

    @Test(expected = IllegalArgumentException::class)
    fun credentialsAreRejected() {
        AiServiceConfig.normalize("https://user:password@example.com", allowCleartext = false)
    }

    @Test(expected = IllegalArgumentException::class)
    fun queryParametersAreRejected() {
        AiServiceConfig.normalize("https://example.com?token=value", allowCleartext = false)
    }
}
