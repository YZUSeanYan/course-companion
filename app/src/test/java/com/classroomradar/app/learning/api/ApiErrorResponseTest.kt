package com.classroomradar.app.learning.api

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiErrorResponseTest {
    @Test
    fun stringDetailIsPreserved() {
        val error = Json.decodeFromString(ApiErrorResponse.serializer(), "{\"detail\":\"AI unavailable\"}")
        assertEquals("AI unavailable", error.userDetail())
    }

    @Test
    fun fastApiValidationArrayUsesReadableMessages() {
        val error = Json.decodeFromString(ApiErrorResponse.serializer(), "{\"detail\":[{\"loc\":[\"body\",\"chunks\"],\"msg\":\"Field required\",\"type\":\"missing\"}]}")
        assertEquals("Field required", error.userDetail())
    }
}
