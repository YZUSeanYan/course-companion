package com.classroomradar.app.learning.importer

import java.io.File
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

internal const val MAX_LECTURE_FILE_BYTES = 20L * 1024L * 1024L
internal const val MAX_EXTRACTED_TEXT_CHARS = 200_000

internal object PlainTextExtractor {
    fun extract(file: File): String {
        if (file.length() > MAX_LECTURE_FILE_BYTES) {
            throw LectureImportException("文件超过 20MB 限制")
        }
        val bytes = file.readBytes()
        if (bytes.any { it == 0.toByte() }) {
            throw LectureImportException("文本文件包含二进制内容")
        }
        val decoded = try {
            Charsets.UTF_8.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap(bytes))
                .toString()
        } catch (failure: CharacterCodingException) {
            throw LectureImportException("文本文件不是有效的 UTF-8 编码", failure)
        }
        if (decoded.any(::isDisallowedControlCharacter)) {
            throw LectureImportException("文本文件包含二进制控制字符")
        }
        return finalizeExtractedText(decoded, "文本文件没有可导入的正文")
    }

    private fun isDisallowedControlCharacter(character: Char): Boolean =
        character.isISOControl() &&
            character != '\t' &&
            character != '\n' &&
            character != '\r' &&
            character != '\u000C'
}

internal fun finalizeExtractedText(rawText: String, emptyMessage: String): String {
    val normalized = rawText.removePrefix("\uFEFF").trim()
    if (normalized.isEmpty()) {
        throw LectureImportException(emptyMessage)
    }
    if (normalized.length <= MAX_EXTRACTED_TEXT_CHARS) {
        return normalized
    }

    var end = MAX_EXTRACTED_TEXT_CHARS
    if (normalized[end - 1].isHighSurrogate() && normalized[end].isLowSurrogate()) {
        end -= 1
    }
    return normalized.substring(0, end)
}
