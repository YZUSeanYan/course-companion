package com.classroomradar.app.audio

import com.classroomradar.app.learning.api.LecsyncTerm
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CloudGlossaryFormatTest {
    @Test
    fun hotwordsAreTrimmedDeduplicatedAndBounded() {
        val input = buildString {
            append(" PyTorch \nPyTorch\n\n位移电流\n")
            repeat(60) { append("term-$it\n") }
        }
        val parsed = parseCloudHotwords(input)
        assertEquals(listOf("PyTorch", "位移电流"), parsed.take(2))
        assertEquals(50, parsed.size)
        assertEquals(parsed, parseCloudHotwords(serializeCloudHotwords(parsed)))
    }

    @Test
    fun termPairsIgnoreInvalidRowsAndRoundTrip() {
        val parsed = parseCloudTermPairs("displacement current=位移电流\ninvalid\na＝b\na=duplicate")
        assertEquals(listOf(LecsyncTerm("displacement current", "位移电流"), LecsyncTerm("a", "b")), parsed)
        assertEquals("displacement current=位移电流\na=b", serializeCloudTermPairs(parsed))
        assertTrue(parseCloudTermPairs(serializeCloudTermPairs(parsed)).size == 2)
    }
}
