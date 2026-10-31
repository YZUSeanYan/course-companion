package com.classroomradar.app.learning

import android.speech.tts.TextToSpeech
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.RadarBrandDeep
import com.classroomradar.app.learning.review.ReviewScheduler
import java.text.DateFormat
import java.util.Date
import java.util.Locale

@Composable
fun ReviewSessionScreen(
    title: String,
    description: String,
    cards: List<ReviewCardEntity>,
    cardsTitle: String = "本分类卡片",
    message: String?,
    onReview: (Long, Int) -> Unit,
    onConsumeMessage: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var nowMillis by remember { mutableStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            kotlinx.coroutines.delay(1_000)
            nowMillis = System.currentTimeMillis()
        }
    }
    var ttsReady by remember { mutableStateOf(false) }
    val tts = remember {
        TextToSpeech(context) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
        }
    }
    DisposableEffect(tts) {
        onDispose {
            tts.stop()
            tts.shutdown()
        }
    }
    fun pronounce(text: String) {
        if (!ttsReady) return
        val locale = if (text.any { it in '\u4e00'..'\u9fff' }) Locale.CHINA else Locale.ENGLISH
        val availability = tts.isLanguageAvailable(locale)
        if (availability >= TextToSpeech.LANG_AVAILABLE) {
            tts.language = locale
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "learning-${System.nanoTime()}")
        }
    }

    val dueCards = cards.filter { it.dueAtMillis <= nowMillis }
    val card = dueCards.firstOrNull()
    var revealed by remember(card?.id) { mutableStateOf(false) }
    val rotation by animateFloatAsState(
        targetValue = if (revealed) 180f else 0f,
        animationSpec = tween(420),
        label = "reviewCardFlip",
    )
    val nextDueMillis = cards.filter { it.dueAtMillis > nowMillis }.minOfOrNull { it.dueAtMillis }

    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = PaddingValues(bottom = 32.dp),
    ) {
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Icon(Icons.Outlined.Style, contentDescription = null, tint = RadarBrandDeep)
                    Text(
                        "$title · 今日到期 ${dueCards.size}",
                        style = MaterialTheme.typography.titleLarge,
                        fontWeight = FontWeight.Bold,
                        color = LiquidTextPrimary,
                    )
                    Text(description, color = LiquidTextSecondary)
                    Text("共 ${cards.size} 张卡片", color = RadarBrandDeep, fontWeight = FontWeight.SemiBold)
                }
            }
        }
        message?.let {
            item { GlassTextAction(it, onConsumeMessage, Modifier.fillMaxWidth()) }
        }
        if (card == null) {
            item {
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = RadarBrandDeep)
                        Text(
                            if (cards.isEmpty()) "这个分类还没有学习卡片" else "今天的复习完成了",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = LiquidTextPrimary,
                        )
                        Text(
                            if (cards.isEmpty()) {
                                "从课程讲义生成 AI 学习包后，相关卡片会自动归档到对应分类。"
                            } else {
                                buildString {
                                    append("本分类已有 ${cards.size} 张卡片")
                                    nextDueMillis?.let {
                                        append("，下次到期 ")
                                        append(DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.CHINA).format(Date(it)))
                                    }
                                    append("。")
                                }
                            },
                            color = LiquidTextSecondary,
                        )
                    }
                }
            }
        } else {
            item {
                GlassPanel(
                    modifier = Modifier.fillMaxWidth().heightIn(min = 280.dp).graphicsLayer {
                        rotationY = rotation
                        cameraDistance = 14f * density
                    },
                    tone = if (rotation > 90f) GlassTone.Accent else GlassTone.Neutral,
                    effect = GlassEffect.Static,
                ) {
                    Column(
                        modifier = Modifier.fillMaxWidth().graphicsLayer { rotationY = if (rotation > 90f) 180f else 0f },
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text(if (rotation > 90f) "参考答案" else "先想一想", style = MaterialTheme.typography.labelLarge, color = RadarBrandDeep)
                        Text(
                            text = if (rotation > 90f) card.back else card.front,
                            style = MaterialTheme.typography.headlineSmall,
                            fontWeight = FontWeight.Bold,
                            color = LiquidTextPrimary,
                            textAlign = TextAlign.Center,
                        )
                        GlassTextAction(
                            label = if (rotation > 90f) "返回题目" else "翻面看答案",
                            onClick = { revealed = !revealed },
                            modifier = Modifier.fillMaxWidth(),
                            tone = GlassTone.Accent,
                        )
                        GlassTextAction(
                            label = if (ttsReady) {
                                if (rotation > 90f) "朗读答案" else "朗读题目"
                            } else "正在准备发音",
                            onClick = { pronounce(if (rotation > 90f) card.back else card.front) },
                            modifier = Modifier.fillMaxWidth(),
                            icon = Icons.AutoMirrored.Outlined.VolumeUp,
                            enabled = ttsReady,
                        )
                    }
                }
            }
            if (revealed) {
                item {
                    Text("这次记得怎么样？", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassTextAction("不认识", { onReview(card.id, ReviewScheduler.RATING_AGAIN) }, Modifier.weight(1f), tone = GlassTone.Danger)
                        GlassTextAction("模糊", { onReview(card.id, ReviewScheduler.RATING_HARD) }, Modifier.weight(1f))
                    }
                }
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassTextAction("认识", { onReview(card.id, ReviewScheduler.RATING_GOOD) }, Modifier.weight(1f), tone = GlassTone.Success)
                        GlassTextAction("很简单", { onReview(card.id, ReviewScheduler.RATING_EASY) }, Modifier.weight(1f))
                    }
                }
            }
            item {
                Text(
                    "本卡已复习 ${card.reps} 次 · 错题 ${card.lapses} 次" + (card.lastReviewedAtMillis?.let {
                        " · 上次 ${DateFormat.getDateInstance(DateFormat.SHORT, Locale.CHINA).format(Date(it))}"
                    } ?: ""),
                    color = LiquidTextSecondary,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
        if (cards.isNotEmpty()) {
            item {
                Text(cardsTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
            }
            items(cards, key = { "review-card-${it.id}" }) { entry ->
                ReviewCardPreview(entry)
            }
        }
        item { Spacer(Modifier.height(16.dp)) }
    }
}

@Composable
private fun ReviewCardPreview(card: ReviewCardEntity) {
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(card.front, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
            Text(
                card.back,
                color = LiquidTextSecondary,
                maxLines = 3,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "下次到期 " + DateFormat.getDateInstance(DateFormat.SHORT, Locale.CHINA).format(Date(card.dueAtMillis)),
                style = MaterialTheme.typography.labelSmall,
                color = LiquidTextSecondary,
            )
        }
    }
}
