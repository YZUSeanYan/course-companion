package com.classroomradar.app.audio

import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okio.Buffer
import org.apache.commons.compress.archivers.tar.TarArchiveEntry
import org.apache.commons.compress.archivers.tar.TarArchiveOutputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorOutputStream
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.ByteArrayOutputStream
import java.io.File
import java.security.MessageDigest

class ModelPackageInstallerTest {
    @get:Rule
    val temp = TemporaryFolder()

    private val server = MockWebServer()

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun tamperedArchiveIsQuarantinedWithoutFallbackExtractionOrActivation() {
        val contents = fixtureContents()
        val validArchive = createArchive(contents)
        val tamperedArchive = validArchive.copyOf().also {
            it[it.lastIndex] = (it.last().toInt() xor 0x7f).toByte()
        }
        server.enqueue(MockResponse().setBody(Buffer().write(tamperedArchive)))
        server.enqueue(MockResponse().setBody(Buffer().write(validArchive)))
        server.start()
        val root = temp.newFolder("tampered-install")
        val activeDir = File(root, "model-runtime/current").apply { mkdirs() }
        File(activeDir, "old-model.txt").writeText("keep me")
        val installer = installer(
            root = root,
            contents = contents,
            expectedArchiveSha256 = validArchive.sha256(),
            sources = listOf(
                server.url("/mirror/tampered.tar.bz2").toString(),
                server.url("/official/valid.tar.bz2").toString(),
            ),
        )

        assertThrows(ModelIntegrityException::class.java) { installer.install { } }

        assertEquals(1, server.requestCount)
        assertEquals("keep me", File(activeDir, "old-model.txt").readText())
        assertFalse(ModelPackageManager.REQUIRED_FILES.any { File(activeDir, it).exists() })
        assertFalse(File(root, "model-runtime/staging").exists())
        val quarantined = File(root, "model-quarantine").listFiles()?.singleOrNull()
        assertTrue(quarantined?.isDirectory == true)
        assertArrayEquals(tamperedArchive, File(quarantined!!, "fixture.tar.bz2").readBytes())
        assertFalse(ModelPackageManager.REQUIRED_FILES.any { File(quarantined, it).exists() })
    }

    @Test
    fun validSmallArchiveActivatesAndRecyclesPreviousModel() {
        val contents = fixtureContents()
        val archive = createArchive(contents)
        server.enqueue(MockResponse().setBody(Buffer().write(archive)))
        server.start()
        val root = temp.newFolder("valid-install")
        val activeDir = File(root, "model-runtime/current").apply { mkdirs() }
        File(activeDir, "old-model.txt").writeText("previous")
        val stages = mutableListOf<ModelDownloadStage>()
        val installer = installer(
            root = root,
            contents = contents,
            expectedArchiveSha256 = archive.sha256(),
            sources = listOf(server.url("/mirror/valid.tar.bz2").toString()),
        )

        val installed = installer.install { progress -> stages += progress.stage }

        assertEquals(activeDir, installed)
        contents.forEach { (relative, expected) ->
            assertArrayEquals(expected, File(activeDir, relative).readBytes())
        }
        assertEquals(
            listOf(
                ModelDownloadStage.DOWNLOADING,
                ModelDownloadStage.EXTRACTING,
                ModelDownloadStage.VERIFYING,
                ModelDownloadStage.ACTIVATING,
            ),
            stages.distinct(),
        )
        val recycled = File(root, "model-recycle-bin").listFiles()?.singleOrNull()
        assertEquals("previous", File(recycled, "old-model.txt").readText())
    }

    private fun installer(
        root: File,
        contents: Map<String, ByteArray>,
        expectedArchiveSha256: String,
        sources: List<String>,
    ) = ModelPackageInstaller(
        storageRoot = root,
        archiveDownloader = ModelArchiveDownloader(OkHttpClient()),
        packages = listOf(
            ModelPackage(
                sources = sources,
                archive = "fixture.tar.bz2",
                label = "test archive",
                downloadSha256 = expectedArchiveSha256,
                archiveFiles = contents.keys.associate { relative -> "fixture/$relative" to relative },
            ),
        ),
        requiredHashes = contents.mapValues { (_, bytes) -> bytes.sha256() },
    )

    private fun fixtureContents(): Map<String, ByteArray> = ModelPackageManager.REQUIRED_FILES
        .associateWith { relative -> "small fixture: $relative".toByteArray() }

    private fun createArchive(contents: Map<String, ByteArray>): ByteArray {
        val output = ByteArrayOutputStream()
        TarArchiveOutputStream(BZip2CompressorOutputStream(output)).use { tar ->
            contents.forEach { (relative, bytes) ->
                val entry = TarArchiveEntry("fixture/$relative")
                entry.size = bytes.size.toLong()
                tar.putArchiveEntry(entry)
                tar.write(bytes)
                tar.closeArchiveEntry()
            }
        }
        return output.toByteArray()
    }

    private fun ByteArray.sha256(): String = MessageDigest.getInstance("SHA-256")
        .digest(this)
        .joinToString("") { "%02x".format(it) }
}
