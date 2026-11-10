package com.classroomradar.app.learning.importer

import android.content.ContentResolver
import android.content.Context
import android.net.Uri
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.util.Locale

data class ImportedLecture(
    val title: String,
    val originalRelativePath: String,
    val textRelativePath: String,
    val pageCount: Int,
    val mimeType: String,
)

class LectureImportException(message: String, cause: Throwable? = null) : Exception(message, cause)

class LectureImporter {
    /**
     * Imports a document selected through SAF. Returned paths are relative to [Context.getFilesDir].
     */
    suspend fun import(
        context: Context,
        uri: Uri,
        displayName: String?,
        mimeType: String?,
    ): ImportedLecture = withContext(Dispatchers.IO) {
        if (uri.scheme?.lowercase(Locale.ROOT) != ContentResolver.SCHEME_CONTENT) {
            throw LectureImportException("仅支持系统文件选择器返回的 content Uri，不支持网络或本地路径")
        }

        val format = LectureFormat.resolve(displayName, mimeType)
        val storage = MaterialStorage(context.filesDir)
        val material = storage.create(format)
        try {
            copyOriginal(context, uri, material.original)
            val extraction = when (format) {
                LectureFormat.PLAIN_TEXT, LectureFormat.MARKDOWN -> Extraction(
                    text = PlainTextExtractor.extract(material.original),
                    pageCount = 1,
                )

                LectureFormat.PDF -> PdfTextExtractor.extract(context, material.original).let {
                    Extraction(text = it.text, pageCount = it.pageCount)
                }

                LectureFormat.JPEG, LectureFormat.PNG -> Extraction(
                    text = ImageTextExtractor(context).extract(material.original),
                    pageCount = 1,
                )
            }
            writeExtractedText(material.text, extraction.text)
            ImportedLecture(
                title = lectureTitle(displayName),
                originalRelativePath = material.originalRelativePath,
                textRelativePath = material.textRelativePath,
                pageCount = extraction.pageCount,
                mimeType = format.mimeType,
            )
        } catch (failure: Throwable) {
            try {
                storage.quarantine(material)
            } catch (cleanup: Exception) {
                failure.addSuppressed(cleanup)
            }
            throw failure
        }
    }

    /** Restoration only needs bytes, not OCR or a replacement of the existing local source files. */
    internal suspend fun <T> withStagedOriginal(
        context: Context,
        uri: Uri,
        displayName: String?,
        mimeType: String?,
        restore: suspend (File, String) -> T,
    ) = withContext(Dispatchers.IO) {
        require(uri.scheme?.lowercase(Locale.ROOT) == ContentResolver.SCHEME_CONTENT) {
            "请通过系统文件选择器选择原文件"
        }
        val format = LectureFormat.resolve(displayName, mimeType)
        require(format == LectureFormat.PDF || format == LectureFormat.JPEG || format == LectureFormat.PNG) {
            "只有 PDF 或图片讲义才有页面预览"
        }
        val storage = MaterialStorage(context.filesDir)
        val material = storage.create(format)
        var failure: Throwable? = null
        try {
            copyOriginal(context, uri, material.original)
            restore(material.original, format.mimeType)
        } catch (error: Throwable) {
            failure = error
            throw error
        } finally {
            // Synchronous rename also runs on cancellation. Never remove existing originals.
            try {
                storage.quarantine(material)
            } catch (cleanup: Exception) {
                if (failure != null) failure.addSuppressed(cleanup) else throw cleanup
            }
        }
    }

    private fun copyOriginal(context: Context, uri: Uri, destination: File) {
        try {
            val input = context.contentResolver.openInputStream(uri)
                ?: throw LectureImportException("无法打开所选文件")
            input.use { source ->
                FileOutputStream(destination).use { output ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var totalBytes = 0L
                    while (true) {
                        val count = source.read(buffer)
                        if (count < 0) break
                        totalBytes += count
                        if (totalBytes > MAX_LECTURE_FILE_BYTES) {
                            throw LectureImportException("文件超过 20MB 限制")
                        }
                        output.write(buffer, 0, count)
                    }
                    if (totalBytes == 0L) {
                        throw LectureImportException("文件为空")
                    }
                }
            }
        } catch (failure: LectureImportException) {
            throw failure
        } catch (failure: IOException) {
            throw LectureImportException("读取所选文件失败", failure)
        } catch (failure: SecurityException) {
            throw LectureImportException("没有读取所选文件的权限，请重新通过系统文件选择器选择", failure)
        }
    }

    private fun writeExtractedText(destination: File, text: String) {
        try {
            destination.writeText(text, Charsets.UTF_8)
        } catch (failure: IOException) {
            throw LectureImportException("保存提取文本失败", failure)
        }
    }

    private data class Extraction(val text: String, val pageCount: Int)
}
