package com.classroomradar.app.learning.importer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.file.Files

class MaterialStorageTest {
    @Test
    fun `creates fixed file names below a UUID material directory`() {
        val filesDir = Files.createTempDirectory("lecture-storage-test").toFile()
        val materialId = "123e4567-e89b-42d3-a456-426614174000"
        try {
            val material = MaterialStorage(filesDir) { materialId }.create(LectureFormat.PDF)

            assertEquals("materials/$materialId/original.pdf", material.originalRelativePath)
            assertEquals("materials/$materialId/text.txt", material.textRelativePath)
            assertEquals(File(filesDir, "materials/$materialId"), material.directory)
            assertEquals("original.pdf", material.original.name)
            assertEquals("text.txt", material.text.name)
            assertTrue(material.directory.isDirectory)
            assertFalse(material.originalRelativePath.startsWith('/'))
            assertFalse(material.textRelativePath.contains('\\'))
        } finally {
            filesDir.deleteRecursively()
        }
    }

    @Test
    fun `never accepts a caller controlled path as material ID`() {
        val filesDir = Files.createTempDirectory("lecture-storage-test").toFile()
        try {
            assertThrows(IllegalArgumentException::class.java) {
                MaterialStorage(filesDir) { "../../outside" }.create(LectureFormat.PLAIN_TEXT)
            }
            assertFalse(File(filesDir.parentFile, "outside").exists())
        } finally {
            filesDir.deleteRecursively()
        }
    }

    @Test
    fun `quarantines only the new attempt and preserves existing original and text`() {
        val filesDir = Files.createTempDirectory("lecture-quarantine-test").toFile()
        val storage = MaterialStorage(filesDir)
        val existing = storage.create(LectureFormat.PDF)
        existing.original.writeText("existing original")
        existing.text.writeText("existing text")
        val staged = storage.create(LectureFormat.PDF)
        staged.original.writeText("rejected replacement")

        val destination = storage.quarantine(staged)!!

        assertFalse(staged.directory.exists())
        assertEquals("material-quarantine", destination.parentFile?.name)
        assertEquals("rejected replacement", File(destination, "original.pdf").readText())
        assertEquals("existing original", existing.original.readText())
        assertEquals("existing text", existing.text.readText())
    }

    @Test
    fun `quarantine destinations are unique and do not overwrite previous attempts`() {
        val filesDir = Files.createTempDirectory("lecture-quarantine-test").toFile()
        val storage = MaterialStorage(filesDir) { "123e4567-e89b-42d3-a456-426614174000" }
        val first = storage.create(LectureFormat.PDF)
        first.original.writeText("first")
        val firstDestination = storage.quarantine(first)!!
        val second = storage.create(LectureFormat.PDF)
        second.original.writeText("second")
        val secondDestination = storage.quarantine(second)!!

        assertFalse(firstDestination == secondDestination)
        assertEquals("first", File(firstDestination, "original.pdf").readText())
        assertEquals("second", File(secondDestination, "original.pdf").readText())
    }

    @Test
    fun `failed quarantine leaves staged files and existing originals untouched`() {
        val filesDir = Files.createTempDirectory("lecture-quarantine-test").toFile()
        val storage = MaterialStorage(filesDir)
        val existing = storage.create(LectureFormat.PDF)
        existing.original.writeText("original")
        val staged = storage.create(LectureFormat.PDF)
        staged.original.writeText("staged")
        File(filesDir, "material-quarantine").writeText("blocks directory creation")

        assertThrows(IllegalStateException::class.java) { storage.quarantine(staged) }

        assertEquals("staged", staged.original.readText())
        assertEquals("original", existing.original.readText())
    }

    @Test
    fun `quarantine rejects an outside directory rather than moving it`() {
        val filesDir = Files.createTempDirectory("lecture-quarantine-test").toFile()
        val storage = MaterialStorage(filesDir)
        val staged = storage.create(LectureFormat.PDF)
        val outside = File(filesDir, "unrelated").apply { mkdirs() }
        File(outside, "keep.txt").writeText("keep")

        assertThrows(IllegalArgumentException::class.java) { storage.quarantine(staged.copy(directory = outside)) }

        assertEquals("keep", File(outside, "keep.txt").readText())
        assertTrue(staged.directory.isDirectory)
    }

    @Test
    fun `quarantine is harmless when the attempt was already moved`() {
        val filesDir = Files.createTempDirectory("lecture-quarantine-test").toFile()
        val storage = MaterialStorage(filesDir)
        val staged = storage.create(LectureFormat.PDF)
        val destination = storage.quarantine(staged)!!

        assertEquals(null, storage.quarantine(staged))
        assertTrue(destination.isDirectory)
    }

    @Test
    fun `does not overwrite an existing material directory`() {
        val filesDir = Files.createTempDirectory("lecture-storage-test").toFile()
        val materialId = "123e4567-e89b-42d3-a456-426614174000"
        try {
            MaterialStorage(filesDir) { materialId }.create(LectureFormat.PLAIN_TEXT)
            assertThrows(LectureImportException::class.java) {
                MaterialStorage(filesDir) { materialId }.create(LectureFormat.PLAIN_TEXT)
            }
        } finally {
            filesDir.deleteRecursively()
        }
    }
}
