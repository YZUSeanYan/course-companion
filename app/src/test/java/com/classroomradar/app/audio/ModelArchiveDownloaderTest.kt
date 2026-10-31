package com.classroomradar.app.audio

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.SocketPolicy
import okio.Buffer
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.security.MessageDigest

class ModelArchiveDownloaderTest {
    @get:Rule
    val temp = TemporaryFolder()

    private val server = MockWebServer()

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun reportsRealBytesAndTotalLength() {
        val payload = ByteArray(700 * 1024) { index -> (index % 251).toByte() }
        server.enqueue(MockResponse().setBody(Buffer().write(payload)))
        server.start()
        val destination = temp.newFile("model.bin")
        val updates = mutableListOf<Pair<Long, Long?>>()

        ModelArchiveDownloader(OkHttpClient()).download(
            server.url("/official-model").toString(),
            destination,
        ) { downloaded, total -> updates += downloaded to total }

        assertEquals(payload.size.toLong(), destination.length())
        assertEquals(0L, updates.first().first)
        assertEquals(payload.size.toLong(), updates.first().second)
        assertEquals(payload.size.toLong(), updates.last().first)
        assertTrue(updates.size >= 3)
        assertTrue(updates.zipWithNext().all { (before, after) -> after.first >= before.first })
    }

    @Test
    fun primaryNetworkFailureFallsBackToOfficialSource() {
        val payload = "verified official payload".toByteArray()
        server.enqueue(MockResponse().setSocketPolicy(SocketPolicy.DISCONNECT_AT_START))
        server.enqueue(MockResponse().setBody(Buffer().write(payload)))
        server.start()
        val destination = temp.newFile("fallback-model.bin")
        val modelPackage = ModelPackage(
            sources = listOf(
                server.url("/mirror/model.bin").toString(),
                server.url("/official/model.bin").toString(),
            ),
            archive = "model.bin",
            label = "test model",
            downloadSha256 = payload.sha256(),
        )

        ModelArchiveDownloader(OkHttpClient()).downloadVerified(modelPackage, destination) { _, _ -> }

        assertArrayEquals(payload, destination.readBytes())
        assertEquals(2, server.requestCount)
        server.takeRequest()
        assertEquals("/official/model.bin", server.takeRequest().path)
    }

    @Test
    fun httpFailureFallsBackToOfficialSource() {
        val payload = "official after HTTP failure".toByteArray()
        server.enqueue(MockResponse().setResponseCode(503))
        server.enqueue(MockResponse().setBody(Buffer().write(payload)))
        server.start()
        val destination = temp.newFile("http-fallback-model.bin")
        val modelPackage = ModelPackage(
            sources = listOf(
                server.url("/mirror/http-model.bin").toString(),
                server.url("/official/http-model.bin").toString(),
            ),
            archive = "http-model.bin",
            label = "test model",
            downloadSha256 = payload.sha256(),
        )

        ModelArchiveDownloader(OkHttpClient()).downloadVerified(modelPackage, destination) { _, _ -> }

        assertArrayEquals(payload, destination.readBytes())
        assertEquals(2, server.requestCount)
    }

    @Test
    fun progressFractionIsBounded() {
        val progress = ModelDownloadProgress(
            ModelDownloadStage.DOWNLOADING,
            packageIndex = 1,
            packageCount = 3,
            label = "test",
            downloadedBytes = 50,
            totalBytes = 100,
        )
        assertEquals(0.5f, progress.fraction)
        assertEquals("50 B", formatModelBytes(50))
        assertEquals("1.0 MB", formatModelBytes(1024 * 1024))
    }

    private fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256")
        .digest(this)
        .joinToString("") { "%02x".format(it) }
}
