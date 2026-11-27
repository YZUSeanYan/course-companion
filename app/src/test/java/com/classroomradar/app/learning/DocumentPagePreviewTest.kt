package com.classroomradar.app.learning

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class DocumentPagePreviewTest {
    @Test
    fun `aspect ratio preserves ordinary page proportions`() {
        assertEquals(0.75f, documentPreviewAspectRatio(900, 1200), 0f)
        assertEquals(1.5f, documentPreviewAspectRatio(1200, 800), 0f)
    }

    @Test
    fun `aspect ratio falls back for nonpositive dimensions and bounds extreme layouts`() {
        assertEquals(0.75f, documentPreviewAspectRatio(0, 0), 0f)
        assertEquals(1.5f, documentPreviewAspectRatio(100, 0, 1200, 800), 0f)
        assertEquals(0.75f, documentPreviewAspectRatio(-100, 100, 900, 1200), 0f)
        assertEquals(0.75f, documentPreviewAspectRatio(100, -100, 1200, 0), 0f)
        assertEquals(0.2f, documentPreviewAspectRatio(1, Int.MAX_VALUE), 0f)
        assertEquals(5f, documentPreviewAspectRatio(Int.MAX_VALUE, 1), 0f)
    }

    @Test
    fun `sampling rejects invalid image bounds instead of decoding full size`() {
        assertNull(documentPreviewSampleSize(0, 100))
        assertNull(documentPreviewSampleSize(100, -1))
    }

    @Test
    fun `sampling uses the smallest power of two that caps the longest edge`() {
        assertEquals(1, documentPreviewSampleSize(800, 600))
        assertEquals(1, documentPreviewSampleSize(2048, 100))
        assertEquals(2, documentPreviewSampleSize(100, 2049))
        assertEquals(2, documentPreviewSampleSize(4096, 100))
        assertEquals(4, documentPreviewSampleSize(4097, 100))
        assertEquals(4, documentPreviewSampleSize(100, 8192))
        assertEquals(8, documentPreviewSampleSize(8193, 100))
        assertEquals(1 shl 20, documentPreviewSampleSize(Int.MAX_VALUE, 1))
    }

    @Test
    fun `preview only forwards valid endpoint path segments`() {
        val documentId = "0123456789abcdef01234567"
        assertEquals("page-0000.jpg", documentPreviewFilename(documentId, "pages/page-0000.jpg"))
        assertNull(documentPreviewFilename("../$documentId", "pages/page-0000.jpg"))
        assertNull(documentPreviewFilename(documentId, "pages/.."))
        assertNull(documentPreviewFilename(documentId, "pages/%2Fpage-0000.jpg"))
        assertNull(documentPreviewFilename(documentId, "pages/page-0000.jpg?other=true"))
    }
}
