package com.classroomradar.app.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Badge
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTextAction
import com.classroomradar.app.GlassTextInput
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary
import com.classroomradar.app.RadarBrandDeep
import com.classroomradar.app.learning.api.AccountStatusDto
import kotlinx.coroutines.delay
import kotlin.math.roundToInt

@Composable
fun AccountSettingsCard(
    status: AccountStatusDto?,
    supported: Boolean,
    busy: Boolean,
    message: String?,
    codeCooldownUntilMs: Long,
    trialMode: Boolean,
    onRequestCode: (String) -> Unit,
    onActivate: (String, String?) -> Unit,
    onApplyTrial: (String, String, String, String) -> Unit,
    onRefresh: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val activated = status?.activated == true
    val blocked = status?.status == "disabled" || status?.status == "expired"
    var phone by remember(status?.phoneMasked) { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var realName by remember { mutableStateOf("") }
    var nickname by remember { mutableStateOf("") }
    var codeSent by remember { mutableStateOf(false) }
    var editingPhone by remember(activated, status?.status) { mutableStateOf(!activated && !blocked) }
    val normalizedPhone = phone.filter(Char::isDigit).take(11)
    val phoneValid = Regex("^1[3-9]\\d{9}$").matches(normalizedPhone)
    val normalizedCode = code.filter(Char::isDigit).take(6)
    val codeValid = normalizedCode.length == 6
    val trialValid = realName.isNotBlank() && nickname.isNotBlank()
    // 未开通手机号被识别后进入自助开通：显示姓名/昵称输入与「开通并激活」。
    LaunchedEffect(trialMode) {
        if (trialMode) codeSent = false
    }

    // 验证码发送成功（进入冷却）即推进到第二步输入验证码；激活成功后退出第二步。
    LaunchedEffect(codeCooldownUntilMs) {
        if (codeCooldownUntilMs > System.currentTimeMillis() + 900_000L) {
            // 超长冷却视作异常值，忽略。
        } else if (codeCooldownUntilMs > System.currentTimeMillis()) {
            codeSent = true
        }
    }
    LaunchedEffect(activated) {
        if (activated) {
            codeSent = false
            code = ""
        }
    }

    var cooldownNowMs by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(codeCooldownUntilMs) {
        while (System.currentTimeMillis() < codeCooldownUntilMs) {
            cooldownNowMs = System.currentTimeMillis()
            delay(500)
        }
        cooldownNowMs = System.currentTimeMillis()
    }
    val cooldownSeconds = ((codeCooldownUntilMs - cooldownNowMs) / 1000L).coerceAtLeast(0L).toInt()

    GlassPanel(
        modifier = modifier.fillMaxWidth(),
        tone = if (activated) GlassTone.Neutral else GlassTone.Accent,
        effect = GlassEffect.Static,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Badge, contentDescription = null, tint = RadarBrandDeep)
                Text(
                    when {
                        activated -> "账号与额度"
                        blocked -> "账号额度不可用"
                        else -> "账号与额度"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = LiquidTextPrimary,
                )
            }

            if (!supported) {
                Text(
                    "当前 AI 服务尚未启用手机号额度，应用会按服务端默认配额使用。更新服务端后这里会自动出现激活入口。",
                    color = LiquidTextSecondary,
                )
                return@Column
            }

            if (blocked) {
                Text(status.phoneMasked, color = RadarBrandDeep, fontWeight = FontWeight.SemiBold)
                Text(
                    if (status.status == "disabled") {
                        "试用账号已停用，请联系管理员恢复。恢复后点击「刷新额度」即可继续使用。"
                    } else {
                        "试用额度已到期（${status.validUntil ?: "已结束"}），请联系管理员续期。离线听课和本机识别不受影响。"
                    },
                    color = LiquidTextSecondary,
                )
                GlassTextAction(
                    label = if (busy) "刷新中…" else "刷新额度",
                    onClick = onRefresh,
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !busy,
                )
            } else if (activated) {
                val current = status
                Text(
                    buildString {
                        append(current.phoneMasked)
                        if (current.displayName.isNotBlank()) append(" · ${current.displayName}")
                    },
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = RadarBrandDeep,
                )
                Text(
                    "有效期至 ${current.validUntil ?: "长期"} · 额度每天按北京时间重置",
                    style = MaterialTheme.typography.bodySmall,
                    color = LiquidTextSecondary,
                )
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    UsageLine("AI 学习包", current.usage.aiPacks, current.limits.aiPacksPerDay, "次")
                    UsageLine(
                        "云端音频",
                        current.usage.audioMinutes.roundToInt(),
                        current.limits.audioMinutesPerDay,
                        "分钟",
                    )
                    UsageLine("翻译字符", current.usage.textCharacters, current.limits.textCharactersPerDay, "字符")
                    UsageLine("文档解析", current.usage.documents, current.limits.documentsPerDay, "次")
                }
                if (!editingPhone) {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassTextAction(
                            label = if (busy) "刷新中…" else "刷新额度",
                            onClick = onRefresh,
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                        )
                        GlassTextAction(
                            label = "更换手机号",
                            onClick = { editingPhone = true },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                        )
                    }
                }
            } else {
                Text(
                    if (trialMode) {
                        "该手机号尚未开通试用额度。短信验证通过后可直接自助开通，无需联系管理员；一人在多台设备上共用同一份额度。"
                    } else {
                        "AI 学习包、翻译、云端听课和文档解析需要先激活试用额度；没有账号时输入手机号获取验证码即可自助开通。一人在多台设备上共用同一份额度。"
                    },
                    color = LiquidTextSecondary,
                )
            }

            if (editingPhone && !blocked) {
                GlassTextInput(
                    value = phone,
                    onValueChange = { phone = it.filter(Char::isDigit).take(11) },
                    label = "手机号",
                    enabled = !busy,
                    keyboardType = KeyboardType.Phone,
                )
                if (!codeSent) {
                    GlassTextAction(
                        label = when {
                            busy -> "发送中…"
                            cooldownSeconds > 0 -> "获取验证码（${cooldownSeconds}s）"
                            else -> "获取验证码"
                        },
                        onClick = { onRequestCode(normalizedPhone) },
                        modifier = Modifier.fillMaxWidth(),
                        tone = GlassTone.Accent,
                        enabled = phoneValid && !busy && cooldownSeconds <= 0,
                    )
                } else {
                    GlassTextInput(
                        value = code,
                        onValueChange = { code = it.filter(Char::isDigit).take(6) },
                        label = "短信验证码",
                        enabled = !busy,
                        keyboardType = KeyboardType.NumberPassword,
                    )
                    if (trialMode) {
                        GlassTextInput(
                            value = realName,
                            onValueChange = { realName = it.take(30) },
                            label = "姓名",
                            enabled = !busy,
                        )
                        GlassTextInput(
                            value = nickname,
                            onValueChange = { nickname = it.take(30) },
                            label = "昵称",
                            enabled = !busy,
                        )
                    }
                    GlassTextAction(
                        label = when {
                            busy && trialMode -> "正在开通…"
                            busy -> "正在激活…"
                            trialMode -> "开通并激活"
                            else -> "激活试用额度"
                        },
                        onClick = {
                            if (trialMode) {
                                onApplyTrial(normalizedPhone, normalizedCode, realName, nickname)
                            } else {
                                onActivate(normalizedPhone, normalizedCode)
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        tone = GlassTone.Success,
                        enabled = phoneValid && codeValid && !busy && (!trialMode || trialValid),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        GlassTextAction(
                            label = if (cooldownSeconds > 0) "重新发送（${cooldownSeconds}s）" else "重新发送验证码",
                            onClick = { onRequestCode(normalizedPhone) },
                            modifier = Modifier.weight(1f),
                            enabled = !busy && cooldownSeconds <= 0,
                        )
                        GlassTextAction(
                            label = "更换手机号",
                            onClick = { codeSent = false; code = "" },
                            modifier = Modifier.weight(1f),
                            enabled = !busy,
                        )
                    }
                }
                Text(
                    "手机号仅用于试用额度管理，不用于登录、营销或课堂数据。服务端加密保存，可联系管理员删除。",
                    style = MaterialTheme.typography.bodySmall,
                    color = LiquidTextSecondary,
                )
                if (activated) {
                    GlassTextAction(
                        label = "取消更换",
                        onClick = { editingPhone = false; phone = ""; codeSent = false; code = "" },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                    )
                }
            }

            message?.takeIf { it.isNotBlank() }?.let {
                Text(it, color = RadarBrandDeep, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}

@Composable
private fun UsageLine(label: String, used: Int, limit: Int, unit: String) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
        Text(
            "$used / $limit $unit",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = if (limit in 1..used) RadarBrandDeep else LiquidTextPrimary,
        )
    }
}
