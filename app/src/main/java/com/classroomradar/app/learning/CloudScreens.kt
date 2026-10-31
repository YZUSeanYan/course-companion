package com.classroomradar.app.learning

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTextInput
import com.classroomradar.app.GlassToggle
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.RadarBrand
import com.classroomradar.app.RadarBrandDeep
import com.classroomradar.app.audio.parseCloudHotwords
import com.classroomradar.app.audio.parseCloudTermPairs
import com.classroomradar.app.audio.serializeCloudHotwords
import com.classroomradar.app.audio.serializeCloudTermPairs
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.CloudTaskEntity
import com.classroomradar.app.learning.api.LecsyncTerm
import com.classroomradar.app.learning.api.VoiceTypingTerm

@Composable
fun CloudListeningSettingsScreen(
    preferences: AppPreferences,
    onChanged: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var advanced by remember { mutableStateOf(false) }
    var translationEnabled by remember { mutableStateOf(preferences.cloudTranslationEnabled) }
    var digestEnabled by remember { mutableStateOf(preferences.cloudDigestEnabled) }
    var speakersEnabled by remember { mutableStateOf(preferences.cloudSpeakersEnabled) }
    var enhanceEnabled by remember { mutableStateOf(preferences.cloudEnhanceEnabled) }
    var storeEnabled by remember { mutableStateOf(preferences.cloudStoreEnabled) }
    var translationPair by remember { mutableStateOf(preferences.cloudTranslationPair) }
    var displayMode by remember { mutableStateOf(preferences.cloudDisplayMode) }
    var timestampsMode by remember { mutableStateOf(preferences.cloudTimestampsMode) }
    var segmentation by remember { mutableStateOf(preferences.cloudSegmentation) }
    var region by remember { mutableStateOf(preferences.cloudRegion) }
    var voicePolish by remember { mutableStateOf(preferences.cloudVoicePolishEnabled) }
    var strictLanguages by remember { mutableStateOf(preferences.cloudStrictLanguages) }
    var identifyLanguage by remember { mutableStateOf(preferences.cloudIdentifyLanguage) }

    LazyColumn(
        modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 30.dp),
    ) {
        item {
            GlassPanel(Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("让课堂按你的方式整理", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    Text("选择需要的学习结果，再补充这门课常用的词汇与固定译法。设置从下一次云端听课开始生效。", color = LiquidTextSecondary)
                }
            }
        }
        item {
            SettingsSection("听课体验", "常用功能可以随时调整") {
                SettingCard("双语字幕", "保留原文，并显示对应译文", translationEnabled) {
                    translationEnabled = it
                    preferences.cloudTranslationEnabled = it
                    onChanged()
                }
                SettingCard("课堂纪要", "随课堂进展整理主题和要点", digestEnabled) {
                    digestEnabled = it
                    preferences.cloudDigestEnabled = it
                    onChanged()
                }
                SettingCard("区分说话人", "在定稿字幕中标注不同发言者", speakersEnabled) {
                    speakersEnabled = it
                    preferences.cloudSpeakersEnabled = it
                    onChanged()
                }
                SettingCard("译文润色", "结合上下文改进译文，需同时开启双语字幕", enhanceEnabled) {
                    enhanceEnabled = it
                    preferences.cloudEnhanceEnabled = it
                    onChanged()
                }
            }
        }
        item {
            SettingsSection("语言与术语", "让识别和翻译更贴近这门课") {
                Text("翻译方向", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary, fontWeight = FontWeight.SemiBold)
                PreferenceChoices(
                    options = listOf("en,zh" to "英 → 中", "zh,en" to "中 → 英", "en,ja" to "英 → 日"),
                    selected = translationPair,
                ) {
                    translationPair = it
                    preferences.cloudTranslationPair = it
                    preferences.cloudLanguageHints = it
                    onChanged()
                }
                HotwordEditor(
                    initial = parseCloudHotwords(preferences.cloudHotwords),
                    onSave = {
                        preferences.cloudHotwords = it
                        onChanged()
                    },
                )
                TermPairEditor(
                    initial = parseCloudTermPairs(preferences.cloudTermPairs),
                    onSave = {
                        preferences.cloudTermPairs = it
                        onChanged()
                    },
                )
                CloudInput("课程背景（可选）", preferences.cloudContext, "例如：大学工程制图，侧重专业词汇") {
                    preferences.cloudContext = it
                    onChanged()
                }
            }
        }
        item {
            GlassPanel(
                Modifier.fillMaxWidth().animateContentSize(),
                tone = GlassTone.Neutral,
                effect = GlassEffect.Static,
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    GlassTextAction(
                        if (advanced) "收起进阶设置" else "显示与识别进阶设置",
                        { advanced = !advanced },
                        Modifier.fillMaxWidth(),
                    )
                    if (advanced) {
                        Text("字幕显示", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary)
                        PreferenceChoices(listOf("sentence" to "整句阅读", "classic" to "跟随语音"), displayMode) {
                            displayMode = it
                            preferences.cloudDisplayMode = it
                            onChanged()
                        }
                        Text("时间戳", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary)
                        PreferenceChoices(listOf("none" to "不显示", "segment" to "按段落", "word" to "逐词"), timestampsMode) {
                            timestampsMode = it
                            preferences.cloudTimestampsMode = it
                            onChanged()
                        }
                        if (displayMode != "sentence") {
                            Text("分句节奏", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary)
                            PreferenceChoices(listOf("short" to "短句", "balanced" to "均衡", "complete" to "完整"), segmentation) {
                                segmentation = it
                                preferences.cloudSegmentation = it
                                onChanged()
                            }
                        }
                        Text("服务区域", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary)
                        PreferenceChoices(listOf("auto" to "自动", "us" to "美国", "uk" to "英国", "jp" to "日本"), region) {
                            region = it
                            preferences.cloudRegion = it
                            onChanged()
                        }
                        CloudInput("文本翻译模型（可选）", preferences.cloudTranslationModel, "留空使用服务默认模型") {
                            preferences.cloudTranslationModel = it
                            onChanged()
                        }
                        SettingCard("语音输入润色", "关闭后保留原始识别文字；翻译需要润色", voicePolish) {
                            voicePolish = it
                            preferences.cloudVoicePolishEnabled = it
                            onChanged()
                        }
                        SettingCard("严格限定提示语言", "关闭后允许识别其他语言并自动翻译", strictLanguages) {
                            strictLanguages = it
                            preferences.cloudStrictLanguages = it
                            onChanged()
                        }
                        SettingCard("标注识别语言", "为每段定稿显示语言信息", identifyLanguage) {
                            identifyLanguage = it
                            preferences.cloudIdentifyLanguage = it
                            onChanged()
                        }
                    }
                }
            }
        }
        item {
            SettingsSection("云端录音", "默认不上传保留；需要回放时再开启") {
                SettingCard("保留课堂录音 30 天", "开启后可在云端录音管理中下载或删除", storeEnabled) {
                    storeEnabled = it
                    preferences.cloudStoreEnabled = it
                    onChanged()
                }
            }
        }
    }
}

@Composable
private fun SettingsSection(title: String, description: String, content: @Composable () -> Unit) {
    GlassPanel(Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                Text(description, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
            }
            content()
        }
    }
}

@Composable
private fun PreferenceChoices(options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        options.forEach { (value, label) ->
            GlassTextAction(
                label = label,
                onClick = { onSelect(value) },
                modifier = Modifier.weight(1f),
                tone = if (value == selected) GlassTone.Accent else GlassTone.Neutral,
            )
        }
    }
}

@Composable
private fun HotwordEditor(initial: List<String>, onSave: (String) -> Unit) {
    var words by remember { mutableStateOf(initial) }
    var input by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    fun save(next: List<String>) {
        words = next
        onSave(serializeCloudHotwords(next))
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("识别热词", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary, fontWeight = FontWeight.SemiBold)
        Text("例如 PyTorch、位移电流；最多 50 个", style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
        words.forEachIndexed { index, word ->
            Row(
                Modifier.fillMaxWidth().background(RadarBrand.copy(alpha = 0.07f), RoundedCornerShape(16.dp)).padding(start = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(word, Modifier.weight(1f), color = LiquidTextPrimary)
                GlassTextAction("移除", {
                    save(words.filterIndexed { itemIndex, _ -> itemIndex != index })
                })
            }
        }
        GlassTextInput(input, { input = it }, "添加一个热词")
        GlassTextAction("添加热词", {
            val value = input.trim()
            when {
                value.isEmpty() -> message = "先输入要识别的词汇"
                words.any { it.equals(value, ignoreCase = true) } -> message = "这个热词已经添加过了"
                words.size >= 50 -> message = "最多添加 50 个热词"
                else -> {
                    save(words + value)
                    input = ""
                    message = null
                }
            }
        }, Modifier.fillMaxWidth(), enabled = input.isNotBlank())
        message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = RadarBrandDeep) }
    }
}

@Composable
private fun TermPairEditor(initial: List<LecsyncTerm>, onSave: (String) -> Unit) {
    var terms by remember { mutableStateOf(initial) }
    var source by remember { mutableStateOf("") }
    var target by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }

    fun save(next: List<LecsyncTerm>) {
        terms = next
        onSave(serializeCloudTermPairs(next))
    }

    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("固定译法", style = MaterialTheme.typography.labelLarge, color = LiquidTextPrimary, fontWeight = FontWeight.SemiBold)
        Text("原文与希望固定使用的译文一一对应，最多 50 组", style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
        terms.forEachIndexed { index, term ->
            Row(
                Modifier.fillMaxWidth().background(RadarBrand.copy(alpha = 0.07f), RoundedCornerShape(16.dp)).padding(start = 13.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(Modifier.weight(1f).padding(vertical = 8.dp)) {
                    Text(term.source, color = LiquidTextPrimary, fontWeight = FontWeight.SemiBold)
                    Text("→ ${term.target}", style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
                }
                GlassTextAction("移除", { save(terms.filterIndexed { itemIndex, _ -> itemIndex != index }) })
            }
        }
        GlassTextInput(source, { source = it }, "原文，例如 displacement current")
        GlassTextInput(target, { target = it }, "固定译文，例如 位移电流")
        GlassTextAction("添加固定译法", {
            val sourceValue = source.trim()
            val targetValue = target.trim()
            when {
                sourceValue.isEmpty() || targetValue.isEmpty() -> message = "原文和固定译文都需要填写"
                terms.any { it.source.equals(sourceValue, ignoreCase = true) } -> message = "这个原文已经设置过固定译法"
                terms.size >= 50 -> message = "最多添加 50 组固定译法"
                else -> {
                    save(terms + LecsyncTerm(sourceValue, targetValue))
                    source = ""
                    target = ""
                    message = null
                }
            }
        }, Modifier.fillMaxWidth(), enabled = source.isNotBlank() && target.isNotBlank())
        message?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = RadarBrandDeep) }
    }
}

@Composable
private fun CloudInput(label: String, value: String, hint: String, onValue: (String) -> Unit) {
    var edited by remember(value) { mutableStateOf(value) }
    GlassTextInput(edited, { edited = it; onValue(it) }, "$label · $hint", singleLine = false)
}

@Composable
private fun SettingCard(title: String, description: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold, color = LiquidTextPrimary)
            Text(description, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
        }
        GlassToggle(checked = checked, onCheckedChange = onChange, label = title)
    }
}

@Composable
fun CloudAudioScreen(
    tasks: List<CloudTaskEntity>,
    busy: Boolean,
    voiceListening: Boolean,
    onVoiceToggle: () -> Unit,
    message: String?,
    onImport: (CloudAudioPresenter.AudioKind) -> Unit,
    onImportUrl: (String) -> Unit,
    onCancel: (CloudTaskEntity) -> Unit,
    onDelete: (CloudTaskEntity) -> Unit,
    onDownload: (CloudTaskEntity, String) -> Unit,
    onOpenSession: (Long) -> Unit,
    onConsumeMessage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var audioUrl by remember { mutableStateOf("") }
    LazyColumn(modifier.fillMaxSize().padding(horizontal = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp), contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 30.dp)) {
        item {
            GlassPanel(Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("把音频变成学习内容", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    Text("支持课堂录音、会议音频和语音输入。长音频可在后台处理，结果会保存到课堂记录。", color = LiquidTextSecondary)
                }
            }
        }
        if (busy) item { LinearProgressIndicator(Modifier.fillMaxWidth(), color = RadarBrand) }
        message?.let { item { GlassTextAction(it, onConsumeMessage, Modifier.fillMaxWidth()) } }
        item { GlassTextAction("转写一段音频", { onImport(CloudAudioPresenter.AudioKind.SYNC) }, Modifier.fillMaxWidth(), enabled = !busy) }
        item { GlassTextAction("整理长音频", { onImport(CloudAudioPresenter.AudioKind.ASYNC) }, Modifier.fillMaxWidth(), enabled = !busy) }
        item {
            GlassPanel(Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    GlassTextInput(audioUrl, { audioUrl = it }, "音频链接（可选，https://…）")
                    GlassTextAction("从链接转写", { onImportUrl(audioUrl) }, Modifier.fillMaxWidth(), enabled = !busy && audioUrl.startsWith("https://"))
                }
            }
        }
        item { GlassTextAction("从文件润色语音", { onImport(CloudAudioPresenter.AudioKind.VOICE) }, Modifier.fillMaxWidth(), enabled = !busy) }
        item { GlassTextAction(if (voiceListening) "结束语音输入" else "开始语音输入", onVoiceToggle, Modifier.fillMaxWidth(), enabled = !busy, tone = if (voiceListening) GlassTone.Warning else GlassTone.Accent) }
        item {
            Text("音频任务", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
        }
        if (tasks.isEmpty()) {
            item { Text("还没有云端音频任务", color = LiquidTextSecondary) }
        }
        items(tasks, key = { it.taskId }) { task ->
            GlassPanel(Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(when (task.kind) {
                        "ASYNC" -> "长音频转写"
                        "VOICE" -> "语音输入"
                        "REALTIME_STORED", "REALTIME" -> "云端课堂"
                        else -> "音频转写"
                    }, fontWeight = FontWeight.SemiBold, color = LiquidTextPrimary)
                    Text(when (task.status) {
                        "accepted", "processing" -> "正在处理 ${task.progress}%"
                        "succeeded" -> "已完成"
                        "cancelled" -> "已取消"
                        "failed" -> "处理未完成"
                        else -> task.status
                    }, color = LiquidTextSecondary)
                    if (task.status in setOf("accepted", "processing")) {
                        LinearProgressIndicator(progress = { task.progress / 100f }, modifier = Modifier.fillMaxWidth(), color = RadarBrand)
                        if (task.kind == "ASYNC") GlassTextAction("取消任务", { onCancel(task) }, Modifier.fillMaxWidth())
                    }
                    if (task.resultText.isNotBlank()) Text(task.resultText, maxLines = 5, color = LiquidTextPrimary)
                    task.sessionId?.let { sessionId -> GlassTextAction("查看对应课堂", { onOpenSession(sessionId) }, Modifier.fillMaxWidth()) }
                    if (task.kind == "REALTIME_STORED") {
                        GlassTextAction("下载课堂音频", { onDownload(task, "audio") }, Modifier.fillMaxWidth())
                        GlassTextAction("下载转写文字", { onDownload(task, "transcript") }, Modifier.fillMaxWidth())
                        GlassTextAction("删除云端记录", { onDelete(task) }, Modifier.fillMaxWidth(), tone = GlassTone.Danger)
                    }
                }
            }
        }
    }
}
