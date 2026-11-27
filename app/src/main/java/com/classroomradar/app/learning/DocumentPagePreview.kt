package com.classroomradar.app.learning

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.learning.api.DocumentAssetDto
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

private const val PREVIEW_MAX_EDGE_PX = 2048
private val previewDocumentIdPattern = Regex("[0-9a-f]{24}")
private val previewPageFilenamePattern = Regex("page-[0-9]{4}\\.jpg")

// Only pass the gateway's expected path segments, never the DTO's full path.
internal fun documentPreviewFilename(documentId: String, relativePath: String): String? =
    relativePath.substringAfterLast('/').takeIf {
        previewDocumentIdPattern.matches(documentId) && previewPageFilenamePattern.matches(it)
    }

internal fun documentPreviewAspectRatio(
    widthPx: Int,
    heightPx: Int,
    bitmapWidth: Int = 0,
    bitmapHeight: Int = 0,
): Float {
    val ratio = when {
        widthPx > 0 && heightPx > 0 -> widthPx.toFloat() / heightPx
        bitmapWidth > 0 && bitmapHeight > 0 -> bitmapWidth.toFloat() / bitmapHeight
        else -> 3f / 4f
    }
    return ratio.coerceIn(0.2f, 5f)
}

internal fun documentPreviewSampleSize(widthPx: Int, heightPx: Int): Int? {
    if (widthPx <= 0 || heightPx <= 0) return null
    val maxEdge = maxOf(widthPx, heightPx)
    var sampleSize = 1
    // Compare before dividing so an odd source edge cannot round down to the limit.
    while (maxEdge > PREVIEW_MAX_EDGE_PX.toLong() * sampleSize) sampleSize *= 2
    return sampleSize
}

private fun decodeDocumentPreview(bytes: ByteArray): ImageBitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val sampleSize = documentPreviewSampleSize(bounds.outWidth, bounds.outHeight) ?: return null
    val options = BitmapFactory.Options().apply {
        inSampleSize = sampleSize
        inScaled = false
    }
    val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: return null
    if (maxOf(bitmap.width, bitmap.height) > PREVIEW_MAX_EDGE_PX) {
        bitmap.recycle()
        return null
    }
    return bitmap.asImageBitmap()
}

@Composable
fun DocumentPagePreview(
    asset: DocumentAssetDto,
    onLoadImage: suspend (String, String) -> ByteArray,
    previewRevision: Long = 0L,
    restoreEnabled: Boolean = true,
    onRestoreFromOriginal: (() -> Unit)? = null,
    onPickOriginalFile: (() -> Unit)? = null,
) {
    val page = asset.pages.firstOrNull() ?: return
    // 失败后必须能重试：旧版讲义会被网关回 404，网络抖动也可能失败。
    var attempt by remember(asset.documentId, page.pageId) { mutableIntStateOf(0) }
    val request = PageImageRequest(asset.documentId, page.pageId, page.imageRelativePath, previewRevision, attempt)
    val state by produceState<PageImage<ImageBitmap>>(initialValue = PageImage.Loading, request) {
        value = PageImage.Loading
        val filename = documentPreviewFilename(request.documentId, request.imageRelativePath)
        value = if (filename == null) {
            PageImage.Failed
        } else {
            withContext(Dispatchers.IO) {
                loadPageImage(
                    load = { onLoadImage(request.documentId, filename) },
                    decode = ::decodeDocumentPreview,
                )
            }
        }
    }
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val bitmap = (state as? PageImage.Loaded)?.image
            when {
                bitmap != null -> Image(
                    bitmap = bitmap,
                    contentDescription = "讲义第 ${page.pageIndex + 1} 页原图",
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(documentPreviewAspectRatio(page.widthPx, page.heightPx, bitmap.width, bitmap.height))
                        .clip(RoundedCornerShape(14.dp)),
                    contentScale = ContentScale.Fit,
                )

                state is PageImage.Failed -> {
                    // 旧版讲义上传时没有账号归属，网关按设计回 404；只能由用户重新确认原文件，
                    // 不能靠放宽服务端校验绕过。换设备或清理过缓存时本机也没有原文件。
                    Text(
                        "无法加载第 ${page.pageIndex + 1} 页原图。旧版本导入的讲义需要重新确认原文件归属，也可能是网络暂时不可用。",
                        color = LiquidTextSecondary,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassTextAction(
                            label = "重试",
                            onClick = { attempt += 1 },
                            modifier = Modifier.weight(1f),
                        )
                        if (onRestoreFromOriginal != null) {
                            GlassTextAction(
                                label = "用本机原文件恢复",
                                onClick = onRestoreFromOriginal,
                                modifier = Modifier.weight(1f),
                                tone = GlassTone.Accent,
                                enabled = restoreEnabled,
                            )
                        }
                    }
                    if (onPickOriginalFile != null) {
                        GlassTextAction(
                            label = "重新选择原文件（本机没有原文件时）",
                            onClick = onPickOriginalFile,
                            modifier = Modifier.fillMaxWidth(),
                            enabled = restoreEnabled,
                        )
                    }
                }

                else -> Text("正在加载第 ${page.pageIndex + 1} 页原图…", color = LiquidTextSecondary)
            }
            Text(
                if (page.status == "COMPLETE") "第 ${page.pageIndex + 1} 页 · 已解析，保留原图与来源" else "第 ${page.pageIndex + 1} 页 · 原图已保留，待视觉解析",
                color = LiquidTextSecondary,
            )
            if (page.blocks.isNotEmpty()) {
                Text("识别到 ${page.blocks.size} 个文本/公式/图表区域", color = LiquidTextSecondary)
            }
        }
    }
}
