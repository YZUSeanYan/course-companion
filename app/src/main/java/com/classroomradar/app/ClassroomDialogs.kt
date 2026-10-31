package com.classroomradar.app

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

@Composable
fun DoubtEditorDialog(
    initialSource: String,
    onConfirm: (String, String) -> Unit,
    onDismiss: () -> Unit,
) {
    var source by remember(initialSource) { mutableStateOf(initialSource) }
    var note by remember { mutableStateOf("") }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        GlassPanel(
            modifier = Modifier.fillMaxWidth().widthIn(max = 560.dp).padding(horizontal = 22.dp),
            tone = GlassTone.Neutral,
            effect = GlassEffect.Static,
            shape = androidx.compose.foundation.shape.RoundedCornerShape(30.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(22.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("标记疑问", style = MaterialTheme.typography.titleLarge, color = LiquidTextPrimary)
                Text("备注可以留空，先标记保存，之后再补充。", color = LiquidTextSecondary)
                GlassTextInput(source, { source = it }, "疑问原文", singleLine = false)
                GlassTextInput(note, { note = it }, "备注（可选，例如：这个公式怎么推导？）", singleLine = false)
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlassTextAction("取消", onDismiss, Modifier.weight(1f))
                    GlassTextAction(
                        "保存疑问",
                        { if (source.isNotBlank()) onConfirm(source, note) },
                        Modifier.weight(1f),
                        tone = GlassTone.Success,
                        enabled = source.isNotBlank(),
                    )
                }
            }
        }
    }
}
