package com.classroomradar.app.learning

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTextInput
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.RadarBrand
import com.classroomradar.app.RadarBrandDeep
import com.classroomradar.app.RadarBrandSoft
import java.text.DateFormat
import java.util.Date

@Composable
fun LearningHomeScreen(
    courses: List<CourseEntity>,
    message: String?,
    onCreateCourse: (String, String) -> Unit,
    onOpenHistory: () -> Unit,
    onOpenCourse: (Long) -> Unit,
    onConsumeMessage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var courseName by remember { mutableStateOf("") }
    var courseNature by remember { mutableStateOf("") }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 112.dp),
    ) {
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = RadarBrandDeep)
                    Text(
                        "让每节课程或每份讲义学案，都变成可复习的学习包",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = LiquidTextPrimary,
                    )
                    Text(
                        "课程讲义、词汇短语、课堂重难点和复习卡片统一归档。",
                        color = LiquidTextSecondary,
                    )
                }
            }
        }
        message?.let {
            item {
                GlassTextAction(it, onConsumeMessage, Modifier.fillMaxWidth())
            }
        }
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Text("新建学习项目", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    GlassTextInput(courseName, { courseName = it }, "课程名称，例如：先进制造英语")
                    GlassTextInput(courseNature, { courseNature = it }, "课程/学习项目性质，例如：外教口语、工程制图、六级阅读")
                    GlassTextAction(
                        label = "创建课程",
                        onClick = {
                            onCreateCourse(courseName, courseNature)
                            if (courseName.isNotBlank()) {
                                courseName = ""
                                courseNature = ""
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        icon = Icons.Outlined.Add,
                        tone = GlassTone.Success,
                        enabled = courseName.isNotBlank(),
                    )
                }
            }
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Text("我的课程 · ${courses.size}", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary, modifier = Modifier.weight(1f))
                GlassTextAction("课堂记录", onOpenHistory, icon = Icons.Outlined.History)
            }
        }
        if (courses.isEmpty()) {
            item {
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Text("创建第一门课程后，就可以导入讲义并关联课堂记录。", color = LiquidTextSecondary)
                }
            }
        } else {
            items(courses, key = { it.id }) { course ->
                GlassPanel(modifier = Modifier.fillMaxWidth().clickable { onOpenCourse(course.id) }, tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier.size(46.dp).clip(CircleShape).background(RadarBrandSoft),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(course.name.take(1), fontWeight = FontWeight.Bold, color = RadarBrandDeep, style = MaterialTheme.typography.titleMedium)
                        }
                        Spacer(Modifier.width(12.dp))
                        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                            Text(course.name, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                            Text(
                                buildString {
                                    append(course.language)
                                    if (course.courseNature.isNotBlank()) append(" · ${course.courseNature}")
                                    if (course.teacher.isNotBlank()) append(" · ${course.teacher}")
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = LiquidTextSecondary,
                            )
                            Text(
                                "创建于 ${DateFormat.getDateInstance(DateFormat.MEDIUM).format(Date(course.createdAtMillis))}",
                                style = MaterialTheme.typography.labelSmall,
                                color = LiquidTextSecondary,
                            )
                        }
                        Icon(Icons.Outlined.MenuBook, contentDescription = null, tint = RadarBrand)
                    }
                }
            }
        }
    }
}

@Composable
fun ReviewHomeScreen(
    cards: List<ReviewCardEntity>,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 112.dp),
    ) {
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.Style, contentDescription = null, tint = RadarBrandDeep)
                    Text("今天也要记得复习", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    Text("AI 负责生成学习内容，FSRS 负责在合适的时间让你再见它一次。", color = LiquidTextSecondary)
                }
            }
        }
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("${cards.size}", style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Bold, color = RadarBrandDeep)
                    Text(if (cards.isEmpty()) "还没有学习卡片" else "张学习卡片已建立", color = LiquidTextSecondary)
                    if (cards.isEmpty()) {
                        Text("生成课程学习包后，词汇、短语和练习题会出现在这里。", color = LiquidTextSecondary)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
fun RecordingCourseSelector(
    courses: List<CourseEntity>,
    selectedCourseId: Long?,
    onCourseSelected: (Long?) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedCourse = courses.firstOrNull { it.id == selectedCourseId }
    Box(modifier = modifier) {
        GlassPanel(
            modifier = Modifier.fillMaxWidth().clickable { expanded = true },
            tone = GlassTone.Neutral,
            effect = GlassEffect.Static,
            shape = RoundedCornerShape(18.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.MenuBook, contentDescription = null, tint = RadarBrandDeep)
                Spacer(Modifier.width(10.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text("本节课关联", style = MaterialTheme.typography.labelMedium, color = LiquidTextSecondary)
                    Text(
                        selectedCourse?.name ?: if (courses.isEmpty()) "不关联课程（可在学习页创建）" else "不关联课程",
                        fontWeight = FontWeight.SemiBold,
                        color = LiquidTextPrimary,
                    )
                }
                Text("选择", color = RadarBrandDeep, fontWeight = FontWeight.SemiBold)
            }
        }
        androidx.compose.material3.DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false },
        ) {
            androidx.compose.material3.DropdownMenuItem(
                text = { Text("不关联课程") },
                onClick = {
                    onCourseSelected(null)
                    expanded = false
                },
            )
            courses.forEach { course ->
                androidx.compose.material3.DropdownMenuItem(
                    text = { Text(course.name) },
                    onClick = {
                        onCourseSelected(course.id)
                        expanded = false
                    },
                )
            }
        }
    }
}
