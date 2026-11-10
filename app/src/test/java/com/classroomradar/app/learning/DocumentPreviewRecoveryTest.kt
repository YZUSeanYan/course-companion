package com.classroomradar.app.learning

import com.classroomradar.app.learning.api.DocumentAssetDto
import com.classroomradar.app.learning.api.DocumentBlockDto
import com.classroomradar.app.learning.api.DocumentPageDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class DocumentPreviewRecoveryTest {
    private val page = DocumentPageDto(
        pageId = "doc-page-1", pageIndex = 0, textSource = "pdf_text",
        imageRelativePath = "pages/1.jpg", widthPx = 100, heightPx = 100, status = "COMPLETE",
        blocks = listOf(DocumentBlockDto("region-1", "text")),
    )
    private val asset = DocumentAssetDto(
        documentId = "doc-abc",
        // SHA-256 of the synthetic bytes "abc".
        sha256 = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
        mimeType = "application/pdf", parserVersion = "test", status = "COMPLETE", pages = listOf(page),
    )

    @Test
    fun `null bitmap decode is failed not loaded or loading`() = runTest {
        assertSame(PageImage.Failed, loadPageImage(load = { byteArrayOf(1, 2) }, decode = { null }))
    }

    @Test
    fun `empty response is failed without decoding`() = runTest {
        assertSame(PageImage.Failed, loadPageImage(load = { byteArrayOf() }, decode = { error("Must not decode") }))
    }

    @Test
    fun `successful decode provides the decoded image`() = runTest {
        assertEquals(PageImage.Loaded("image"), loadPageImage(load = { byteArrayOf(1) }, decode = { "image" }))
    }

    @Test
    fun `load and decode errors become failed and retry can succeed`() = runTest {
        assertSame(PageImage.Failed, loadPageImage<String>(load = { error("network") }, decode = { "image" }))
        assertSame(PageImage.Failed, loadPageImage<String>(load = { byteArrayOf(1) }, decode = { error("decode") }))
        assertEquals(PageImage.Loaded("retry"), loadPageImage(load = { byteArrayOf(1) }, decode = { "retry" }))
    }

    @Test
    fun `load and decode cancellations are rethrown unchanged`() = runTest {
        val cancellation = CancellationException("cancelled")
        for (cancelDuringDecode in listOf(false, true)) {
            try {
                loadPageImage<String>(
                    load = { if (cancelDuringDecode) byteArrayOf(1) else throw cancellation },
                    decode = { throw cancellation },
                )
                throw AssertionError("Cancellation was swallowed")
            } catch (actual: CancellationException) {
                assertSame(cancellation, actual)
            }
        }
    }

    @Test
    fun `same DTO restoration changes the image request and only that material revision`() {
        val tracker = PreviewRestorationTracker()
        val before = PageImageRequest(asset.documentId, page.pageId, page.imageRelativePath, 0, 0)
        assertTrue(tracker.tryStart(7))
        verifyRestoredDocument(asset, asset.copy())
        tracker.restored(7)
        tracker.finish()
        val after = before.copy(revision = tracker.state.value.revisions.getValue(7))
        assertNotEquals(before, after)
        assertEquals(mapOf(7L to 1L), tracker.state.value.revisions)
        assertTrue(tracker.tryStart(7))
        tracker.restored(7)
        tracker.finish()
        assertEquals(2L, tracker.state.value.revisions[7])
    }

    @Test
    fun `request changes when document image path or retry changes`() {
        val request = PageImageRequest("doc-a", "page-1", "pages/1.jpg", 0, 0)
        assertNotEquals(request, request.copy(documentId = "doc-b"))
        assertNotEquals(request, request.copy(imageRelativePath = "pages/new.jpg"))
        assertNotEquals(request, request.copy(attempt = 1))
    }

    @Test
    fun `concurrent clicks acquire only one restoration before launch`() = runTest {
        val tracker = PreviewRestorationTracker()
        val accepted = (1L..20L).map { id -> async(Dispatchers.Default) { tracker.tryStart(id) } }.awaitAll()
        assertEquals(1, accepted.count { it })
        assertFalse(tracker.tryStart(99))
        tracker.finish()
        assertTrue(tracker.tryStart(99))
        tracker.finish()
        assertTrue(tracker.state.value.revisions.isEmpty())
    }

    @Test
    fun `cancellation releases restoration lock without a success revision`() = runTest {
        val tracker = PreviewRestorationTracker()
        assertTrue(tracker.tryStart(7))
        val job = launch {
            try {
                throw CancellationException("cancel")
            } finally {
                tracker.finish()
            }
        }
        job.join()
        yield()
        assertTrue(job.isCancelled)
        assertTrue(tracker.tryStart(8))
        assertTrue(tracker.state.value.revisions.isEmpty())
    }

    @Test
    fun `file identity accepts exact bytes and rejects a different document`() {
        val directory = Files.createTempDirectory("preview-identity-test").toFile()
        val original = File(directory, "synthetic-original.pdf").apply { writeText("abc") }
        verifyRestoreFile(asset, original)
        verifyRestoreFile(asset.copy(sha256 = asset.sha256.uppercase()), original)
        val different = File(directory, "different.pdf").apply { writeText("different document") }
        assertThrows(IllegalArgumentException::class.java) { verifyRestoreFile(asset, different) }
        assertEquals("abc", original.readText())
        assertEquals("different document", different.readText())
    }

    @Test
    fun `missing identity fails closed before uploading`() {
        val unused = File("not-read-when-identity-is-missing")
        assertThrows(IllegalArgumentException::class.java) { verifyRestoreFile(asset.copy(sha256 = ""), unused) }
        assertThrows(IllegalArgumentException::class.java) { verifyRestoreFile(asset.copy(documentId = ""), unused) }
    }

    @Test
    fun `response cannot change document digest page or region identities`() {
        val invalid = listOf(
            asset.copy(documentId = "other"),
            asset.copy(sha256 = "0".repeat(64)),
            asset.copy(pages = emptyList()),
            asset.copy(pages = listOf(page.copy(pageId = "other-page"))),
            asset.copy(pages = listOf(page.copy(pageIndex = 1))),
            asset.copy(pages = listOf(page.copy(blocks = emptyList()))),
            asset.copy(pages = listOf(page, page)),
        )
        for (replacement in invalid) {
            assertThrows(IllegalArgumentException::class.java) { verifyRestoredDocument(asset, replacement) }
        }
    }

    @Test
    fun `parser output can improve while preserving existing source identities`() {
        verifyRestoredDocument(asset, asset.copy(
            parserVersion = "next",
            pages = listOf(page.copy(pageText = "Improved text", blocks = page.blocks + DocumentBlockDto("region-2", "text"))),
        ))
    }
}
