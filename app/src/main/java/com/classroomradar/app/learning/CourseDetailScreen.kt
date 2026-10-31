package com.classroomradar.app.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FileUpload
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.RadarBrand
import com.classroomradar.app.RadarBrandDeep
import com.classroomradar.app.learning.api.DocumentAssetDto
import kotlinx.serialization.json.Json
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@Composable
fun CourseDetailScreen(
    state: CourseDetailState,
    isImporting: Boolean,
    isAnalyzing: Boolean,
    message: String?,
    onImportMaterial: () -> Unit,
    onAnalyzeMaterial: (Long) -> Unit,
    onImportGlossary: () -> Unit,
    onExport: () -> Unit,
    onOpenCategory: (String) -> Unit,
    onLoadPageImage: suspend (String, String) -> ByteArray,
    onConsumeMessage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val course = state.course
    if (course == null) {
        Column(modifier = modifier.fillMaxSize().padding(20.dp)) {
            Text("课程不存在或已删除", color = LiquidTextSecondary)
        }
        return
    }
    val categoryGroups = remember(state.learningItems) { groupLearningItems(state.learningItems) }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 32.dp),
    ) {
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(course.name, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    Text(
                        buildString {
                            append(course.language)
                            if (course.courseNature.isNotBlank()) append(" · ${course.courseNature}")
                            if (course.teacher.isNotBlank()) append(" · ${course.teacher}")
                        },
                        color = LiquidTextSecondary,
                    )
                    Text("讲义 ${state.materials.size} · 学习内容 ${state.learningItems.size}", color = RadarBrandDeep, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        message?.let {
            item { GlassTextAction(it, onConsumeMessage, Modifier.fillMaxWidth()) }
        }
        item {
            GlassTextAction(
                label = if (isImporting) "正在导入讲义" else "导入讲义（PDF / 图片 / TXT）",
                onClick = onImportMaterial,
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Outlined.FileUpload,
                tone = GlassTone.Success,
                enabled = !isImporting,
            )
        }
        if (isImporting || isAnalyzing) {
            item {
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            if (isAnalyzing) "AI 正在理解讲义并生成学习内容。含图示、公式的复杂讲义可能需要几分钟，请勿重复提交。" else "正在提取文字，请稍候。大文件和扫描图片需要更多时间。",
                            color = LiquidTextSecondary,
                        )
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = RadarBrand)
                    }
                }
            }
        }
        if (course.examProfile == CourseEntity.PROFILE_CET6) {
            item {
                GlassTextAction(
                    "导入 CET6 标准词表（CSV / TSV）",
                    onImportGlossary,
                    Modifier.fillMaxWidth(),
                    icon = Icons.Outlined.FileUpload,
                )
            }
        }
        item { Text("课程讲义", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary) }
        if (state.materials.isEmpty()) {
            item {
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Text("还没有讲义。导入后会先提取正文，再由你决定是否发送给 AI 生成学习包。", color = LiquidTextSecondary)
                }
            }
        } else {
            items(state.materials, key = { courseDetailItemKey("material", it.id) }) { material ->
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            Icon(Icons.Outlined.Description, contentDescription = null, tint = RadarBrandDeep)
                            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                                Text(material.title, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                                Text(
                                    "${material.pageCount} 页 · ${DateFormat.getDateInstance(DateFormat.MEDIUM, Locale.CHINA).format(Date(material.importedAtMillis))}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = LiquidTextSecondary,
                                )
                            }
                        }
                        GlassTextAction(
                            label = "生成 AI 学习包",
                            onClick = { onAnalyzeMaterial(material.id) },
                            modifier = Modifier.fillMaxWidth(),
                            icon = Icons.Outlined.AutoAwesome,
                            tone = GlassTone.Accent,
                            enabled = !isAnalyzing && !isImporting,
                        )
                        material.documentJson?.let { raw ->
                            val asset = remember(raw) {
                                runCatching { Json.decodeFromString(DocumentAssetDto.serializer(), raw) }.getOrNull()
                            }
                            if (asset != null) {
                                DocumentPagePreview(asset, onLoadPageImage)
                            }
                        }
                    }
                }
            }
        }
        item {
            GlassTextAction(
                label = "导出 AI 学习包（Markdown）",
                onClick = onExport,
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Outlined.FileDownload,
                enabled = state.learningItems.isNotEmpty() && !isAnalyzing,
            )
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = RadarBrandDeep)
                Text(
                    "  AI 学习内容",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = LiquidTextPrimary,
                    modifier = Modifier.weight(1f),
                )
                if (state.learningItems.isNotEmpty()) {
                    Text(
                        "${state.learningItems.size} 项",
                        color = RadarBrandDeep,
                        fontWeight = FontWeight.Bold,
                    )
                }
            }
        }
        if (state.learningItems.isEmpty()) {
            item {
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Text("学习包生成后，课堂纪要、词汇、短语、重难点和练习题会按类型归档在这里。", color = LiquidTextSecondary)
                }
            }
        } else {
            item {
                Text(
                    "已按类型整理成 ${categoryGroups.size} 个分类，点开查看具体内容。",
                    style = MaterialTheme.typography.bodySmall,
                    color = LiquidTextSecondary,
                )
            }
            items(categoryGroups, key = { "category-${it.type}" }) { group ->
                LearningCategoryCard(group = group, onClick = { onOpenCategory(group.type) })
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
internal fun LearningItemCard(item: LearningItemEntity, showTypeLabel: Boolean = true) {
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (showTypeLabel) {
                    Text(learningTypeLabel(item.type), color = RadarBrandDeep, fontWeight = FontWeight.Bold)
                }
                if (item.inCET6) {
                    Text("CET6", color = RadarBrandDeep, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                }
                if (item.origin == LearningItemEntity.ORIGIN_AI) {
                    Text("AI 生成", color = LiquidTextSecondary, style = MaterialTheme.typography.labelMedium)
                } else if (item.origin == LearningItemEntity.ORIGIN_AI_CACHE) {
                    Text("AI 预生成缓存", color = LiquidTextSecondary, style = MaterialTheme.typography.labelMedium)
                }
            }
            Text(item.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
            if (item.content.isNotBlank()) Text(item.content, color = LiquidTextPrimary)
            item.translation?.takeIf { it.isNotBlank() }?.let { Text(it, color = LiquidTextSecondary) }
            item.example?.takeIf { it.isNotBlank() }?.let { Text("例句：$it", color = LiquidTextSecondary) }
            if (item.sourceIdsCsv.isNotBlank()) {
                Text("来源：${item.sourceIdsCsv.replace(',', '、')}", style = MaterialTheme.typography.labelSmall, color = LiquidTextSecondary)
            }
        }
    }
}

internal fun courseDetailItemKey(kind: String, id: Long): String = "$kind-$id"
