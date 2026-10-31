package com.classroomradar.app.learning

import android.graphics.BitmapFactory
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.learning.api.DocumentAssetDto
import kotlinx.serialization.json.Json

@Composable
fun DocumentPagePreview(
    asset: DocumentAssetDto,
    onLoadImage: suspend (String, String) -> ByteArray,
) {
    val page = asset.pages.firstOrNull() ?: return
    val filename = page.imageRelativePath.substringAfterLast('/')
    val bytes by produceState<ByteArray?>(initialValue = null, page.pageId) {
        value = runCatching { onLoadImage(asset.documentId, filename) }.getOrNull()
    }
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            val bitmap = remember(bytes) {
                bytes?.takeIf { it.isNotEmpty() }?.let { BitmapFactory.decodeByteArray(it, 0, it.size)?.asImageBitmap() }
            }
            if (bitmap != null) {
                Image(
                    bitmap = bitmap,
                    contentDescription = "讲义第 ${page.pageIndex + 1} 页原图",
                    modifier = Modifier.fillMaxWidth().aspectRatio(page.widthPx.toFloat() / page.heightPx).clip(RoundedCornerShape(14.dp)),
                    contentScale = ContentScale.Fit,
                )
            } else {
                Text("正在加载第 ${page.pageIndex + 1} 页原图…", color = LiquidTextSecondary)
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
