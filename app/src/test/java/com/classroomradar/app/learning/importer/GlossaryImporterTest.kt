package com.classroomradar.app.learning.importer

import org.junit.Assert.assertEquals
import org.junit.Test

class GlossaryImporterTest {
    @Test
    fun parsesCsvAndTsvAndDeduplicatesTerms() {
        val entries = GlossaryImporter.parse(
            "term,definition\nlathe,车床\nlathe,重复定义\naccuracy\t精度\n",
        )
        assertEquals(2, entries.size)
        assertEquals("lathe", entries[0].term)
        assertEquals("车床", entries[0].definition)
        assertEquals("accuracy", entries[1].term)
        assertEquals("精度", entries[1].definition)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsRowsWithoutDefinition() {
        GlossaryImporter.parse("lathe")
    }
}
