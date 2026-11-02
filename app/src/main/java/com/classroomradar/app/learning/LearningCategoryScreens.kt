package com.classroomradar.app.learning

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.classroomradar.app.GlassConfirmDialog
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTextInput
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.LocalLiquidBackdrop
import com.classroomradar.app.RadarBrand
import com.classroomradar.app.RadarBrandDeep
import com.classroomradar.app.RadarBrandSoft

@Composable
internal fun LearningCategoryCard(
    group: LearningCategoryGroup,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassPanel(
        modifier = modifier.fillMaxWidth().clickable(onClick = onClick),
        tone = GlassTone.Neutral,
        effect = GlassEffect.Static,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier.size(46.dp).clip(CircleShape).background(RadarBrandSoft),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    group.icon,
                    contentDescription = null,
                    tint = RadarBrandDeep,
                    modifier = Modifier.size(22.dp),
                )
            }
            Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        group.title,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = LiquidTextPrimary,
                        modifier = Modifier.weight(1f),
                    )
                    Text(
                        "${group.items.size} 项",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold,
                        color = RadarBrandDeep,
                    )
                }
                Text(
                    group.description,
                    style = MaterialTheme.typography.bodySmall,
                    color = LiquidTextSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    group.items.take(2).joinToString("、") { it.title },
                    style = MaterialTheme.typography.labelSmall,
                    color = LiquidTextSecondary.copy(alpha = 0.78f),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Icon(
                Icons.Outlined.ChevronRight,
                contentDescription = null,
                tint = RadarBrand,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

@Composable
fun LearningCategoryScreen(
    courseName: String,
    type: String,
    items: List<LearningItemEntity>,
    onUpdateItem: (LearningItemEntity, String, String, String?, String?) -> Unit,
    onDeleteItem: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    val group = remember(items, type) {
        groupLearningItems(items).firstOrNull { it.type == type }
    }
    var actionItem by remember { mutableStateOf<LearningItemEntity?>(null) }
    var editingItem by remember { mutableStateOf<LearningItemEntity?>(null) }
    var deletingItem by remember { mutableStateOf<LearningItemEntity?>(null) }
    if (group == null) {
        Column(modifier = modifier.fillMaxSize().padding(20.dp)) {
            Text("这个分类暂时没有内容", color = LiquidTextSecondary)
        }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 32.dp),
    ) {
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Box(
                            modifier = Modifier.size(46.dp).clip(CircleShape).background(RadarBrandSoft),
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(
                                group.icon,
                                contentDescription = null,
                                tint = RadarBrandDeep,
                                modifier = Modifier.size(22.dp),
                            )
                        }
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(
                                group.title,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = LiquidTextPrimary,
                            )
                            Text(group.description, color = LiquidTextSecondary)
                        }
                    }
                    Text(
                        "$courseName · 共 ${group.items.size} 项",
                        color = RadarBrandDeep,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
        }
        items(group.items, key = { courseDetailItemKey("learning", it.id) }) { item ->
            LearningItemCard(
                item,
                showTypeLabel = false,
                onActions = { actionItem = item },
            )
        }
        item { Spacer(Modifier.height(16.dp)) }
    }

    actionItem?.let { item ->
        LearningItemActionDialog(
            item = item,
            onEdit = {
                actionItem = null
                editingItem = item
            },
            onDelete = {
                actionItem = null
                deletingItem = item
            },
            onDismiss = { actionItem = null },
        )
    }
    editingItem?.let { item ->
        LearningItemEditDialog(
            item = item,
            onSave = { title, content, translation, example ->
                editingItem = null
                onUpdateItem(item, title, content, translation, example)
            },
            onDismiss = { editingItem = null },
        )
    }
    deletingItem?.let { item ->
        GlassConfirmDialog(
            title = "删除「${item.title}」？",
            message = "只会删除这条学习内容和对应复习卡，不影响课程、课堂记录与其他内容；删除后无法恢复。",
            confirmLabel = "删除",
            dismissLabel = "取消",
            onConfirm = {
                deletingItem = null
                onDeleteItem(item.id)
            },
            onDismiss = { deletingItem = null },
            tone = GlassTone.Danger,
        )
    }
}

@Composable
private fun LearningItemActionDialog(
    item: LearningItemEntity,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit,
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        CompositionLocalProvider(LocalLiquidBackdrop provides null) {
            GlassPanel(
                modifier = Modifier.fillMaxWidth().widthIn(max = 480.dp).padding(horizontal = 22.dp),
                tone = GlassTone.Accent,
                effect = GlassEffect.Elevated,
                shape = RoundedCornerShape(28.dp),
                contentPadding = PaddingValues(20.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text(
                        item.title,
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = LiquidTextPrimary,
                    )
                    Text(
                        "长按或点卡片右上角 ⋮ 都可以打开这个菜单",
                        style = MaterialTheme.typography.bodySmall,
                        color = LiquidTextSecondary,
                    )
                    GlassTextAction("编辑这条内容", onEdit, Modifier.fillMaxWidth())
                    GlassTextAction("删除这条内容", onDelete, Modifier.fillMaxWidth(), tone = GlassTone.Danger)
                    GlassTextAction("取消", onDismiss, Modifier.fillMaxWidth())
                }
            }
        }
    }
}

@Composable
private fun LearningItemEditDialog(
    item: LearningItemEntity,
    onSave: (String, String, String?, String?) -> Unit,
    onDismiss: () -> Unit,
) {
    var title by remember(item.id) { mutableStateOf(item.title) }
    var content by remember(item.id) { mutableStateOf(item.content) }
    var translation by remember(item.id) { mutableStateOf(item.translation.orEmpty()) }
    var example by remember(item.id) { mutableStateOf(item.example.orEmpty()) }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        CompositionLocalProvider(LocalLiquidBackdrop provides null) {
            GlassPanel(
                modifier = Modifier.fillMaxWidth().widthIn(max = 520.dp).padding(horizontal = 22.dp),
                tone = GlassTone.Neutral,
                effect = GlassEffect.Elevated,
                shape = RoundedCornerShape(28.dp),
                contentPadding = PaddingValues(20.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("编辑学习内容", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    GlassTextInput(title, { title = it }, "标题 / 词条")
                    GlassTextInput(content, { content = it }, "正文 / 释义 / 答案", singleLine = false)
                    GlassTextInput(translation, { translation = it }, "翻译（可选）", singleLine = false)
                    GlassTextInput(example, { example = it }, "例句 / 补充（可选）", singleLine = false)
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        GlassTextAction("取消", onDismiss, Modifier.weight(1f))
                        GlassTextAction(
                            "保存",
                            {
                                if (title.isNotBlank() && content.isNotBlank()) {
                                    onSave(
                                        title,
                                        content,
                                        translation.ifBlank { null },
                                        example.ifBlank { null },
                                    )
                                }
                            },
                            Modifier.weight(1f),
                            tone = GlassTone.Success,
                            enabled = title.isNotBlank() && content.isNotBlank(),
                        )
                    }
                }
            }
        }
    }
}
