package com.classroomradar.app.learning.importer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PlainTextExtractorTest {
    @Test
    fun `reads UTF-8 Chinese English and Markdown and removes BOM`() {
        withTemporaryFile { file ->
            file.writeText("\uFEFF\n# 课堂讲义\nHello, 世界！\n", Charsets.UTF_8)

            assertEquals("# 课堂讲义\nHello, 世界！", PlainTextExtractor.extract(file))
        }
    }

    @Test
    fun `caps extracted text at 200000 characters`() {
        withTemporaryFile { file ->
            file.writeText("中".repeat(MAX_EXTRACTED_TEXT_CHARS + 1), Charsets.UTF_8)

            val text = PlainTextExtractor.extract(file)

            assertEquals(MAX_EXTRACTED_TEXT_CHARS, text.length)
            assertTrue(text.all { it == '中' })
        }
    }

    @Test
    fun `does not split a surrogate pair at the text limit`() {
        withTemporaryFile { file ->
            file.writeText(
                "a".repeat(MAX_EXTRACTED_TEXT_CHARS - 1) + "😀tail",
                Charsets.UTF_8,
            )

            val text = PlainTextExtractor.extract(file)

            assertEquals(MAX_EXTRACTED_TEXT_CHARS - 1, text.length)
            assertTrue(text.all { it == 'a' })
        }
    }

    @Test
    fun `rejects empty malformed UTF-8 and binary text`() {
        withTemporaryFile { file ->
            file.writeText(" \n\t", Charsets.UTF_8)
            assertThrows(LectureImportException::class.java) {
                PlainTextExtractor.extract(file)
            }
        }
        withTemporaryFile { file ->
            file.writeBytes(byteArrayOf(0xC3.toByte(), 0x28))
            assertThrows(LectureImportException::class.java) {
                PlainTextExtractor.extract(file)
            }
        }
        withTemporaryFile { file ->
            file.writeBytes(byteArrayOf(0x41, 0x00, 0x42))
            assertThrows(LectureImportException::class.java) {
                PlainTextExtractor.extract(file)
            }
        }
    }

    private fun withTemporaryFile(block: (File) -> Unit) {
        val file = File.createTempFile("lecture-text-test", ".txt")
        try {
            block(file)
        } finally {
            file.delete()
        }
    }
}
