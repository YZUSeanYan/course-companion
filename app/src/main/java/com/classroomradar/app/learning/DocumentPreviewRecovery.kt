package com.classroomradar.app.learning

import com.classroomradar.app.learning.api.DocumentAssetDto
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import java.security.MessageDigest

internal sealed interface PageImage<out T> {
    data object Loading : PageImage<Nothing>
    data class Loaded<T>(val image: T) : PageImage<T>
    data object Failed : PageImage<Nothing>
}

/** A successful HTTP response is not a loaded image until decoding succeeds. */
internal suspend fun <T : Any> loadPageImage(
    load: suspend () -> ByteArray,
    decode: (ByteArray) -> T?,
): PageImage<T> = try {
    val bytes = load()
    val image = if (bytes.isEmpty()) null else decode(bytes)
    if (image == null) PageImage.Failed else PageImage.Loaded(image)
} catch (cancelled: CancellationException) {
    throw cancelled
} catch (_: Exception) {
    PageImage.Failed
}

internal data class PageImageRequest(
    val documentId: String,
    val pageId: String,
    val imageRelativePath: String,
    val revision: Long,
    val attempt: Int,
)

data class PreviewRestorationState(
    val materialId: Long? = null,
    val revisions: Map<Long, Long> = emptyMap(),
)

/** Acquire synchronously, before launching or suspending; revisions do not depend on DTO equality. */
internal class PreviewRestorationTracker {
    private val mutableState = MutableStateFlow(PreviewRestorationState())
    val state = mutableState.asStateFlow()

    fun tryStart(materialId: Long): Boolean {
        val current = mutableState.value
        return current.materialId == null &&
            mutableState.compareAndSet(current, current.copy(materialId = materialId))
    }

    fun restored(materialId: Long) {
        val current = mutableState.value
        check(current.materialId == materialId)
        mutableState.value = current.copy(
            revisions = current.revisions + (materialId to ((current.revisions[materialId] ?: 0L) + 1L)),
        )
    }

    fun finish() {
        mutableState.value = mutableState.value.copy(materialId = null)
    }
}

/** Fail closed if legacy metadata cannot establish the identity of the original file. */
internal fun verifyRestoreFile(existing: DocumentAssetDto, original: File) {
    require(existing.documentId.isNotBlank() && Regex("[0-9a-fA-F]{64}").matches(existing.sha256)) {
        "原讲义缺少可验证的文档标识，请作为新讲义导入，不要替换现有来源"
    }
    val digest = MessageDigest.getInstance("SHA-256")
    original.inputStream().use { input ->
        val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
        while (true) {
            val count = input.read(buffer)
            if (count < 0) break
            digest.update(buffer, 0, count)
        }
    }
    val sha256 = digest.digest().joinToString("") { "%02x".format(it) }
    require(existing.sha256.equals(sha256, ignoreCase = true)) {
        "所选文件与原讲义内容不一致，未上传或替换。请重新选择原文件，或作为新讲义导入"
    }
}

internal fun verifyRestoredDocument(existing: DocumentAssetDto, restored: DocumentAssetDto) {
    require(existing.documentId == restored.documentId && existing.sha256.equals(restored.sha256, ignoreCase = true)) {
        "解析结果的文档标识与原讲义不一致，已保留原讲义和学习内容来源"
    }
    // Page/region IDs are referenced by existing learning items. A parser upgrade must not orphan them.
    require(existing.pages.isNotEmpty() &&
        existing.pages.map { it.pageIndex to it.pageId }.toSet() == restored.pages.map { it.pageIndex to it.pageId }.toSet() &&
        existing.pages.all { page ->
            val replacement = restored.pages.singleOrNull { it.pageId == page.pageId && it.pageIndex == page.pageIndex }
            replacement != null && replacement.blocks.map { it.regionId }.containsAll(page.blocks.map { it.regionId })
        }
    ) {
        "解析结果的页面来源与原讲义不一致，已保留原讲义和学习内容来源"
    }
}
