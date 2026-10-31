package com.classroomradar.app.learning.importer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class LectureFormatTest {
    @Test
    fun `resolves every supported extension without MIME`() {
        assertEquals(LectureFormat.PLAIN_TEXT, LectureFormat.resolve("notes.TXT", null))
        assertEquals(LectureFormat.MARKDOWN, LectureFormat.resolve("notes.markdown", null))
        assertEquals(LectureFormat.PDF, LectureFormat.resolve("slides.pdf", null))
        assertEquals(LectureFormat.JPEG, LectureFormat.resolve("photo.jpeg", null))
        assertEquals(LectureFormat.PNG, LectureFormat.resolve("photo.PNG", null))
    }

    @Test
    fun `uses canonical MIME and accepts common aliases`() {
        assertEquals(
            LectureFormat.MARKDOWN,
            LectureFormat.resolve("notes.md", "text/x-markdown; charset=utf-8"),
        )
        assertEquals(LectureFormat.JPEG, LectureFormat.resolve("photo.jpg", "IMAGE/JPG"))
        assertEquals(
            LectureFormat.PDF,
            LectureFormat.resolve("slides.pdf", "application/octet-stream"),
        )
    }

    @Test
    fun `accepts a supported MIME when display name has no extension`() {
        assertEquals(LectureFormat.PNG, LectureFormat.resolve("image", "image/png"))
    }

    @Test
    fun `rejects unsupported MIME and mismatched extension`() {
        assertThrows(LectureImportException::class.java) {
            LectureFormat.resolve("notes.txt", "application/zip")
        }
        assertThrows(LectureImportException::class.java) {
            LectureFormat.resolve("notes.txt", "application/pdf")
        }
        assertThrows(LectureImportException::class.java) {
            LectureFormat.resolve("archive.zip", null)
        }
    }

    @Test
    fun `title is derived from display name without becoming a path`() {
        assertEquals("课堂讲义", lectureTitle("folder/课堂讲义.pdf"))
        assertEquals("notes", lectureTitle("notes"))
        assertEquals("未命名讲义", lectureTitle("  "))
    }
}
