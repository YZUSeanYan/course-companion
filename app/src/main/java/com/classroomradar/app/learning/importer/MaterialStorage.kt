package com.classroomradar.app.learning.importer

import java.io.File
import java.util.UUID

internal data class MaterialFiles(
    val directory: File,
    val original: File,
    val text: File,
    val originalRelativePath: String,
    val textRelativePath: String,
)

internal class MaterialStorage(
    private val filesDir: File,
    private val idGenerator: () -> String = { UUID.randomUUID().toString() },
) {
    fun create(format: LectureFormat): MaterialFiles {
        val materialId = idGenerator()
        require(uuidPattern.matches(materialId)) { "Material ID must be a UUID" }

        val relativeDirectory = "$materialsDirectory/$materialId"
        val directory = File(filesDir, relativeDirectory)
        if (!directory.mkdirs()) {
            throw LectureImportException("无法创建讲义保存目录")
        }
        val originalName = "original.${format.originalExtension}"
        return MaterialFiles(
            directory = directory,
            original = File(directory, originalName),
            text = File(directory, textFileName),
            originalRelativePath = "$relativeDirectory/$originalName",
            textRelativePath = "$relativeDirectory/$textFileName",
        )
    }

    private companion object {
        const val materialsDirectory = "materials"
        const val textFileName = "text.txt"
        val uuidPattern = Regex(
            "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-" +
                "[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
        )
    }
}
