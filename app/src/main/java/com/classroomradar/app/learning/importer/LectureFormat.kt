package com.classroomradar.app.learning.importer

import java.util.Locale

internal enum class LectureFormat(
    val mimeType: String,
    val originalExtension: String,
    val extensions: Set<String>,
    val mimeAliases: Set<String>,
) {
    PLAIN_TEXT("text/plain", "txt", setOf("txt"), setOf("text/plain")),
    MARKDOWN(
        "text/markdown",
        "md",
        setOf("md", "markdown"),
        setOf("text/markdown", "text/x-markdown"),
    ),
    PDF("application/pdf", "pdf", setOf("pdf"), setOf("application/pdf")),
    JPEG("image/jpeg", "jpg", setOf("jpg", "jpeg"), setOf("image/jpeg", "image/jpg")),
    PNG("image/png", "png", setOf("png"), setOf("image/png")),
    ;

    companion object {
        private val genericMimeTypes = setOf("application/octet-stream", "binary/octet-stream")

        fun resolve(displayName: String?, mimeType: String?): LectureFormat {
            val normalizedMime = mimeType
                ?.substringBefore(';')
                ?.trim()
                ?.lowercase(Locale.ROOT)
                ?.takeUnless { it.isEmpty() }
            val extension = displayName
                ?.trim()
                ?.substringAfterLast('.', "")
                ?.lowercase(Locale.ROOT)
                .orEmpty()
            val mimeFormat = normalizedMime?.let { mime ->
                entries.firstOrNull { format -> mime in format.mimeAliases }
            }
            val extensionFormat = entries.firstOrNull { format -> extension in format.extensions }

            if (normalizedMime != null && normalizedMime !in genericMimeTypes && mimeFormat == null) {
                throw LectureImportException("不支持的 MIME 类型：$normalizedMime")
            }
            if (mimeFormat != null) {
                if (extension.isNotEmpty() && extensionFormat != mimeFormat) {
                    throw LectureImportException("MIME 类型与文件扩展名不一致")
                }
                return mimeFormat
            }
            return extensionFormat
                ?: throw LectureImportException("不支持的文件类型，仅支持 TXT、Markdown、PDF、JPG 和 PNG")
        }
    }
}

internal fun lectureTitle(displayName: String?): String {
    val fileName = displayName
        ?.replace('\\', '/')
        ?.substringAfterLast('/')
        ?.trim()
    val title = fileName
        ?.substringBeforeLast('.')
        ?.trim()
        ?.takeUnless { it.isEmpty() }
        ?: fileName?.takeUnless { it.isNullOrEmpty() }
    return title?.take(200)?.trim()?.takeUnless { it.isEmpty() } ?: "未命名讲义"
}
