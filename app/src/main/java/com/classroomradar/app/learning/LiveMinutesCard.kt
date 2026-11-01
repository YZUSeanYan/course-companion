package com.classroomradar.app.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
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
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive

@Composable
fun LiveMinutesCard(contentJson: String, modifier: Modifier = Modifier) {
    val sections = remember(contentJson) { parseLiveMinutes(contentJson) }
    if (sections.isEmpty()) return
    GlassPanel(modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("课堂纪要", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
            sections.forEach { section ->
                Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(section.title, fontWeight = FontWeight.SemiBold, color = LiquidTextPrimary)
                        // Official digest marks each section confirmed or still being refined.
                        if (!section.confirmed) {
                            Text(
                                "  整理中",
                                style = MaterialTheme.typography.labelMedium,
                                color = LiquidTextSecondary,
                            )
                        }
                    }
                    section.points.forEach { point -> Text("· $point", color = LiquidTextSecondary) }
                }
            }
        }
    }
}

internal data class MinuteSection(val title: String, val points: List<String>, val confirmed: Boolean)

internal fun parseLiveMinutes(raw: String): List<MinuteSection> {
    val root = runCatching { Json.parseToJsonElement(raw) as? JsonObject }.getOrNull() ?: return emptyList()
    val sections = root["sections"] as? JsonArray ?: return emptyList()
    return sections.mapNotNull { element ->
        val section = element as? JsonObject ?: return@mapNotNull null
        val title = section["title"]?.jsonPrimitive?.contentOrNull?.takeIf(String::isNotBlank) ?: return@mapNotNull null
        val points = (section["points"] as? JsonArray)?.mapNotNull { it.jsonPrimitive.contentOrNull } ?: emptyList()
        val confirmed = section["confirmed"]?.jsonPrimitive?.booleanOrNull
            ?: when (section["status"]?.jsonPrimitive?.contentOrNull) {
                "confirmed" -> true
                null -> true
                else -> false
            }
        MinuteSection(title, points, confirmed)
    }
}
