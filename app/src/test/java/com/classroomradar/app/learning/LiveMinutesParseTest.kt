package com.classroomradar.app.learning

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Keeps the minutes card in step with the official digest.update section shape. */
class LiveMinutesParseTest {
    @Test
    fun `parses confirmed and in-progress sections`() {
        val raw = """
            {"sections":[
                {"title":"Machines","points":["Lathes remove material"],"confirmed":true},
                {"title":"Next topic","points":["Coming up"],"status":"pending"}
            ]}
        """.trimIndent()
        val sections = parseLiveMinutes(raw)
        assertEquals(2, sections.size)
        assertEquals("Machines", sections[0].title)
        assertTrue(sections[0].confirmed)
        assertEquals("Next topic", sections[1].title)
        assertFalse(sections[1].confirmed)
    }

    @Test
    fun `treats missing flags as confirmed and skips malformed sections`() {
        val raw = """
            {"sections":[
                {"title":"Legacy","points":["a","b"]},
                {"points":["no title"]},
                "junk"
            ]}
        """.trimIndent()
        val sections = parseLiveMinutes(raw)
        assertEquals(listOf("Legacy" to listOf("a", "b")), sections.map { it.title to it.points })
        assertTrue(sections[0].confirmed)
    }

    @Test
    fun `non digest payloads produce no sections`() {
        assertTrue(parseLiveMinutes("not json").isEmpty())
        assertTrue(parseLiveMinutes("""{"sections":"junk"}""").isEmpty())
    }
}
