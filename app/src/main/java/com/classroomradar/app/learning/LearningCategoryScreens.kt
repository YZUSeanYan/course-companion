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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
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
    modifier: Modifier = Modifier,
) {
    val group = remember(items, type) {
        groupLearningItems(items).firstOrNull { it.type == type }
    }
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
            LearningItemCard(item, showTypeLabel = false)
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}
