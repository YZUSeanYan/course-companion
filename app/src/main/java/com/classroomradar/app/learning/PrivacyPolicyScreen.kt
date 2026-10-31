package com.classroomradar.app.learning

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.classroomradar.app.GlassEffect
import com.classroomradar.app.GlassPanel
import com.classroomradar.app.GlassTone
import com.classroomradar.app.LiquidTextPrimary
import com.classroomradar.app.LiquidTextSecondary

@Composable
fun PrivacyPolicyScreen(modifier: Modifier = Modifier) {
    Column(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp).verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("知习隐私政策", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
        Text("版本：2026 年 11 月版 · 生效日期：2026 年 11 月 1 日", color = LiquidTextSecondary)
        Text(
            "本政策说明「知习」如何处理课堂录音、转写、讲义、学习记录、设备凭据、试用手机号及模型文件。请在首次录音、上传讲义、开启实时翻译、激活试用额度或生成 AI 学习内容前阅读。",
            color = LiquidTextSecondary,
        )
        PrivacySection(
            "一、我们处理的信息与用途",
            "课堂音频及转写：用于实时识别、翻译、手动疑问、说话人区分与学习纪要。课程名称、项目性质、讲义、试卷、词汇和复习记录：用于文档解析、生成学习内容、来源回链和间隔复习。匿名设备标识、访问令牌及调用配额：用于服务鉴权、限流、故障恢复和云端用量对账。试用手机号：仅用于确认试用资格、绑定设备与统计每人每日额度；不用于登录、营销、通讯录匹配或课堂内容关联。手机号由管理员在运营后台添加，应用只在激活时发送一次，设备本地仅保留脱敏号码（如 138****1234）。应用不收集通讯录、短信、精确位置，不要求姓名或学号。",
        )
        PrivacySection(
            "二、本地处理与存储",
            "离线听课的语音识别在设备端完成，原始录音默认不保存。云端听课或云端音频转写经你主动开启并确认后，音频会通过我们自己的服务器转发给 Lecsync；服务端持有模型密钥，APK 不包含模型 API 密钥。转写、课程、手动疑问、复习记录和已导入文件默认存于应用私有目录。离线模型可下载到应用私有目录，你可选择卸载并移入应用内回收站，之后恢复或重新下载；此操作不删除学习数据。",
        )
        PrivacySection(
            "三、联网服务与接收方",
            "开启实时翻译后，定稿字幕可能发送给 Lecsync、DeepSeek、Kimi 或 MiMo，按可用性顺序处理。开启云端听课或导入音频后，所选音频会经我们的服务器转发给 Lecsync，用于实时转写、翻译、说话人、术语、AI 润色、实时纪要或 Voice Typing。生成学习纪要时，相关字幕、手动疑问和课程信息会发送给所选模型服务。复杂讲义经你确认后上传原文件，用于生成页图、OCR 和视觉分析，必要时将页图与 OCR 上下文发送给视觉模型。激活试用额度时，手机号只发送给我们自己的额度网关，不发送给模型提供方。Realtime 和音频转写按实际音频时长计费，文本翻译按源字符计费，Voice Typing 按最终文本字符计费；界面显示的用量以来源服务返回为准。不同提供方的隐私条款与数据所在地可能不同，请不要上传涉密或无权分享的内容。",
        )
        PrivacySection(
            "四、保留期限与删除",
            "你可在应用内删除课堂记录或卸载应用，相关本地数据库、私有录音、讲义和凭据会由系统清除。回收站中的模型文件可恢复，也可能占用空间。云端录音默认不保存；只有主动开启云端保留后，Lecsync 才将音频与转写保留 30 天，可通过云端任务删除，删除后不可恢复。文本翻译和短音频结果按提供方的有效期留存；Voice Typing 的最终文本不支持重放，应用会及时保存到本机。当前服务端保存匿名设备、配额、任务/用量元数据、脱敏统计及文档解析产生的页图和结构化结果；试用手机号以加密形式保存在额度数据库中，只有管理员可在后台查看，可通过官网渠道申请更正或删除。现阶段不提供自助云端文档删除或恢复，请勿上传需要即时远程擦除的内容。模型提供方的独立留存政策不由本应用控制。",
        )
        PrivacySection(
            "五、凭据与安全措施",
            "匿名设备令牌使用 Android Keystore 加密保存，模型密钥仅由服务端环境变量提供，不写入 APK。传输使用 HTTPS；正式发布版本禁止明文 HTTP。试用手机号在服务端使用独立密钥加密保存，查找使用不可逆摘要；应用本地只保存脱敏号码。运营后台使用单独的管理员密码与 HttpOnly 会话 cookie，普通用户无法访问。服务端限制访问地址、请求频率与重试次数，不在应用日志中记录讲义、字幕正文或手机号明文。任何系统都无法保证绝对安全，请妥善保管自己的设备与导出文件。",
        )
        PrivacySection(
            "六、权限说明",
            "麦克风用于课堂录音，通知用于前台录音状态，网络用于你主动开启的翻译、模型下载、文档解析和 AI 学习包。文件通过系统选择器导入，不申请全盘存储权限。拒绝麦克风或模型下载会限制离线听课，但不影响已有课程和复习内容查看。",
        )
        PrivacySection(
            "七、AI 内容与第三方组件",
            "AI 翻译、纪要、词汇、视觉说明和参考解答可能存在错误或遗漏，应结合原页、原文和教师说明核对，不作为考试、评分或安全操作依据。应用使用 sherpa-onnx、ML Kit、PdfBox-Android、java-fsrs、Lecsync 及其他模型服务。ML Kit 不是开源组件；各组件和模型适用其独立许可与条款。",
        )
        PrivacySection(
            "八、课堂授权与未成年人",
            "录制教师或同学声音、上传教材或分享课堂资料前，应取得必要许可并遵守学校规定；禁止录音或涉密场所请勿使用。未成年人应在监护人指导下使用，不得上传他人敏感信息。你应确保对上传内容具有合法使用权。",
        )
        PrivacySection(
            "九、你的选择与权利",
            "你可以不开通翻译、不导入讲义、不生成 AI 学习包；也可查看、复制、导出或删除本地课堂记录，卸载模型并恢复。若不再使用试用额度，可联系管理员删除你的手机号与设备绑定；删除后相关 AI/云端功能将停止，离线功能不受影响。对于本应用控制范围内的信息，可通过官网所列联系方式咨询访问、更正或删除事宜。",
        )
        PrivacySection(
            "十、政策更新与联系",
            "如功能、处理方式或提供方发生变化，我们会更新本政策并标注版本日期。重大变化将在应用内以适当方式提示。官网：https://shuike.seanyan.store；可通过官网提供的渠道联系我们。继续使用更新后的相关功能，表示你已阅读并理解相应政策。",
        )
    }
}

@Composable
private fun PrivacySection(title: String, content: String) {
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
            Text(content, color = LiquidTextSecondary)
        }
    }
}
