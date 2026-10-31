package com.classroomradar.app.learning.api

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DocumentVisionRequirementTest {
    private fun page(status: String, source: String, text: String) = DocumentPageDto(
        pageId = "page-1",
        pageIndex = 0,
        pageText = text,
        textSource = source,
        imageRelativePath = "pages/page.jpg",
        widthPx = 100,
        heightPx = 100,
        status = status,
    )

    @Test
    fun reliableNativePdfTextDoesNotRequireVisionProvider() {
        assertFalse(page("COMPLETE", "pdf_text", "A lathe removes material.").requiresVisionForLearningPack())
    }

    @Test
    fun complexOrImageOnlyPagesStillRequireVisionProvider() {
        assertTrue(page("NEEDS_VISION_PARSER", "image", "").requiresVisionForLearningPack())
        assertTrue(page("COMPLETE", "ocr", "Recognized words only").requiresVisionForLearningPack())
    }
}
