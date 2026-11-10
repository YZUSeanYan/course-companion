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

    /** Only pass a directory allocated for this attempt by create; never an existing record's path. */
    fun quarantine(material: MaterialFiles): File? {
        val directory = material.directory
        val root = File(filesDir, materialsDirectory).canonicalFile
        require(directory.parentFile?.canonicalFile == root && uuidPattern.matches(directory.name)) {
            "只能隔离本次导入的讲义暂存目录"
        }
        require(directory.canonicalFile == File(root, directory.name)) { "不能隔离链接目录" }
        if (!directory.exists()) return null
        val quarantine = File(filesDir, "material-quarantine")
        check(quarantine.isDirectory || quarantine.mkdirs()) { "无法创建讲义隔离目录，暂存文件已保留" }
        require(quarantine.canonicalFile == File(filesDir.canonicalFile, "material-quarantine")) {
            "不能使用链接隔离目录"
        }
        val destination = File(quarantine, "${directory.name}-${UUID.randomUUID()}")
        check(!destination.exists() && directory.renameTo(destination)) { "无法隔离讲义暂存文件，文件已保留" }
        return destination
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
