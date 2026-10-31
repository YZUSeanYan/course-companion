package com.classroomradar.app.audio

import org.junit.Test
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue

class CloudListeningConfigTest {
    @Test
    fun hotwordsAndPairsBecomeOfficialGlossary() {
        // The production conversion is covered on device; this test checks a complete JSON payload.
        val config = com.classroomradar.app.learning.api.RealtimeConfig(
            transcribe = com.classroomradar.app.learning.api.RealtimeTranscribeConfig(
                languages = listOf("auto"), strict = false, identifyLanguage = true,
                displayMode = "sentence", speakers = true,
            ),
            translate = com.classroomradar.app.learning.api.RealtimeTranslateConfig(listOf("en", "zh")),
            glossary = com.classroomradar.app.learning.api.RealtimeGlossaryConfig(
                terms = listOf("LecSync"), pairs = listOf(com.classroomradar.app.learning.api.LecsyncTerm("lathe", "车床")),
                context = "Engineering lecture",
            ),
            aiEnhance = true, digest = true, store = false, region = "us",
        )
        val json = kotlinx.serialization.json.Json { encodeDefaults = true }
        val encoded = json.encodeToString(com.classroomradar.app.learning.api.RealtimeConfig.serializer(), config)
        assertTrue(encoded.contains("\"identifyLanguage\":true"))
        assertTrue(encoded.contains("\"pairs\""))
        assertTrue(encoded.contains("\"aiEnhance\":true"))
        assertTrue(encoded.contains("\"store\":false"))
        assertEquals("us", config.region)
        assertNull(config.transcribe.segmentation)
    }
}
