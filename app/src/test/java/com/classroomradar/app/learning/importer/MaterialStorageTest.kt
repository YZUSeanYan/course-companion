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
