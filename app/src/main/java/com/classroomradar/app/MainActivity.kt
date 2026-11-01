package com.classroomradar.app

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.compose.foundation.background
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.BatteryChargingFull
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.FileDownload
import androidx.compose.material.icons.outlined.History
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Pause
import androidx.compose.material.icons.outlined.PlayArrow
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Style
import androidx.compose.material.icons.outlined.Timeline
import androidx.compose.material.icons.outlined.Vibration
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.RippleConfiguration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.painterResource
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import com.classroomradar.app.audio.RecorderEvent
import com.classroomradar.app.audio.ModelDownloadProgress
import com.classroomradar.app.audio.ModelDownloadStage
import com.classroomradar.app.audio.ModelPackageManager
import com.classroomradar.app.audio.formatModelBytes
import com.classroomradar.app.audio.RecordingBus
import com.classroomradar.app.audio.RecordingService
import com.classroomradar.app.data.AppPreferences
import com.classroomradar.app.data.CloudTaskEntity
import com.classroomradar.app.data.ClassroomRepository
import com.classroomradar.app.data.DoubtEventEntity
import com.classroomradar.app.data.QuestionEventEntity
import com.classroomradar.app.data.SessionEntity
import com.classroomradar.app.data.SessionSummary
import com.classroomradar.app.data.TranscriptLineEntity
import com.classroomradar.app.data.TranslationEntity
import com.classroomradar.app.detection.QuestionDetector
import com.classroomradar.app.learning.CourseDetailScreen
import com.classroomradar.app.learning.CloudAudioPresenter
import com.classroomradar.app.learning.CloudAudioScreen
import com.classroomradar.app.learning.CloudListeningSettingsScreen
import com.classroomradar.app.learning.CourseEntity
import com.classroomradar.app.learning.OfflineSyncManager
import com.classroomradar.app.learning.AccountSettingsCard
import com.classroomradar.app.learning.api.AccountStatusDto
import com.classroomradar.app.learning.LiveMinutesCard
import com.classroomradar.app.learning.api.LecsyncFile
import com.classroomradar.app.learning.LearningHomeScreen
import com.classroomradar.app.learning.LearningPresenter
import com.classroomradar.app.learning.LearningCategory
import com.classroomradar.app.learning.LearningCategoryScreen
import com.classroomradar.app.learning.PrivacyPolicyScreen
import com.classroomradar.app.learning.RecordingCourseSelector
import com.classroomradar.app.learning.ReviewHomeScreen
import com.classroomradar.app.learning.ReviewSessionScreen
import com.classroomradar.app.learning.learningTypeLabel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import java.io.OutputStreamWriter
import java.io.IOException
import java.net.SocketTimeoutException
import javax.net.ssl.SSLException
import java.text.DateFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import com.kyant.backdrop.backdrops.layerBackdrop

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        RadarCrashHandler.install(this)
        // The UI intentionally stays white in either system theme; force dark system-bar
        // glyphs as well so a device-wide dark mode cannot leave light icons on white.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(RadarBg.toArgb(), RadarBg.toArgb()),
            navigationBarStyle = SystemBarStyle.light(RadarBg.toArgb(), RadarBg.toArgb()),
        )
        setContent {
            WaterClassRadarTheme {
                LiquidGlassRoot {
                val context = LocalContext.current
                val presenter = remember { ClassroomPresenter(context.applicationContext) }
                val learningPresenter = remember { LearningPresenter(context.applicationContext) }
                val cloudAudioPresenter = remember { CloudAudioPresenter(context.applicationContext) }
                DisposableEffect(presenter) {
                    onDispose { presenter.close() }
                }
                DisposableEffect(learningPresenter) {
                    onDispose { learningPresenter.close(); cloudAudioPresenter.close() }
                }
                val dashboard by rememberState(presenter.dashboard)
                val history by rememberState(presenter.history)
                val detail by rememberState(presenter.detail)
                val settings by rememberState(presenter.settings)
                val courses by rememberState(learningPresenter.courses)
                val reviewEntries by rememberState(learningPresenter.reviewEntries)
                val learningMessage by rememberState(learningPresenter.message)
                val courseDetail by rememberState(learningPresenter.courseDetail)
                val isImporting by rememberState(learningPresenter.isImporting)
                val isAnalyzing by rememberState(learningPresenter.isAnalyzing)
                val aiServiceStatus by rememberState(learningPresenter.serviceStatus)
                val aiServiceUrl by rememberState(learningPresenter.aiServiceUrl)
                val accountStatus by rememberState(learningPresenter.accountStatus)
                val accountSupported by rememberState(learningPresenter.accountSupported)
                val accountMessage by rememberState(learningPresenter.accountMessage)
                val isAccountBusy by rememberState(learningPresenter.isAccountBusy)
                val accountCodeCooldownUntilMs by rememberState(learningPresenter.codeCooldownUntilMs)
                val appConfig by rememberState(learningPresenter.appConfig)
                val cloudTasks by rememberState(cloudAudioPresenter.tasks)
                val cloudAudioBusy by rememberState(cloudAudioPresenter.busy)
                val cloudAudioMessage by rememberState(cloudAudioPresenter.message)
                val voiceListening by rememberState(cloudAudioPresenter.voiceListening)
                val appPreferences = remember { AppPreferences.get(context) }
                var page by remember { mutableStateOf(AppPage.Home) }
                var pendingAnalysisId by remember { mutableStateOf<Long?>(null) }
                var showDoubtEditor by remember { mutableStateOf(false) }
                var doubtSourceText by remember { mutableStateOf("") }
                var showTranslationNotice by remember { mutableStateOf(false) }
                var showCloudNotice by remember { mutableStateOf(false) }
                var pendingCloudKind by remember { mutableStateOf<CloudAudioPresenter.AudioKind?>(null) }
                var pendingCloudAudio by remember { mutableStateOf<Uri?>(null) }
                var pendingVoiceToggle by remember { mutableStateOf(false) }
                var showAccountNotice by remember { mutableStateOf(false) }
                var pendingAccountPhone by remember { mutableStateOf("") }
                var showAnnouncement by remember { mutableStateOf(false) }
                var selectedCourseId by remember { mutableStateOf<Long?>(null) }
                var learningCategoryType by remember { mutableStateOf<String?>(null) }
                var reviewCategoryType by remember { mutableStateOf<String?>(null) }
                var showUsageNotice by remember { mutableStateOf(!settings.usageNoticeAccepted) }
                var showNotificationSettings by remember { mutableStateOf(false) }
                var crashReport by remember { mutableStateOf(RadarCrashHandler.consumeReport(context)) }
                var pendingStart by remember { mutableStateOf(false) }
                var pendingExport by remember { mutableStateOf<ExportRequest?>(null) }
                var pendingCloudFile by remember { mutableStateOf<Pair<String, LecsyncFile>?>(null) }
                var historySelecting by remember { mutableStateOf(false) }
                var historySelectedIds by remember { mutableStateOf(setOf<Long>()) }
                var showHistoryDeleteConfirmation by remember { mutableStateOf(false) }
                val permissionRequester = rememberLauncher { permissions ->
                    if (permissions[Manifest.permission.RECORD_AUDIO] == true) {
                        if (RecordingService.isRealtimeNotificationEnabled(context)) {
                            presenter.start(selectedCourseId)
                        } else {
                            showNotificationSettings = true
                        }
                    }
                }
                val voicePermissionRequester = rememberLauncher { permissions ->
                    if (permissions[Manifest.permission.RECORD_AUDIO] == true) cloudAudioPresenter.toggleVoiceTyping()
                }
                val exportLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                    ActivityResultContracts.CreateDocument("*/*"),
                ) { uri: Uri? ->
                    pendingExport?.let { request ->
                        if (uri != null) {
                            presenter.writeExport(uri, request.content) { message ->
                                Toast.makeText(context, message, Toast.LENGTH_LONG).show()
                            }
                        }
                    }
                    pendingExport = null
                }
                val cloudExportLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                    ActivityResultContracts.CreateDocument("*/*"),
                ) { uri: Uri? ->
                    val file = pendingCloudFile?.second
                    if (uri != null && file != null) {
                        runCatching {
                            context.contentResolver.openOutputStream(uri)?.use { it.write(file.bytes) }
                                ?: error("无法打开所选文件")
                        }.onSuccess {
                            Toast.makeText(context, "已导出云端文件", Toast.LENGTH_SHORT).show()
                        }.onFailure {
                            Toast.makeText(context, it.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    pendingCloudFile = null
                }
                val materialLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument(),
                ) { uri: Uri? ->
                    if (uri != null) {
                        learningPresenter.importMaterial(
                            uri = uri,
                            displayName = queryDisplayName(context, uri),
                            mimeType = context.contentResolver.getType(uri),
                        )
                    }
                }
                val glossaryLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument(),
                ) { uri: Uri? ->
                    if (uri != null) learningPresenter.importGlossary(uri)
                }

                val audioLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
                    ActivityResultContracts.OpenDocument(),
                ) { uri: Uri? ->
                    if (uri != null && pendingCloudKind != null) {
                        pendingCloudAudio = uri
                        if (!appPreferences.cloudNoticeAccepted) showCloudNotice = true
                        else cloudAudioPresenter.importAudio(uri, pendingCloudKind!!)
                    }
                }

                LaunchedEffect(courses) {
                    if (courses.none { it.id == selectedCourseId }) {
                        selectedCourseId = courses.firstOrNull()?.id
                    }
                }

                LaunchedEffect(pendingExport?.fileName) {
                    pendingExport?.let { exportLauncher.launch(it.fileName) }
                }

                // 每次冷启动联网拉取公告与首页标语；失败静默，离线走内置默认。
                LaunchedEffect(Unit) {
                    learningPresenter.fetchAppConfig()
                }

                // 离线课堂的云端补转写：启动时重试上次因配额/网络失败的队列。
                LaunchedEffect(Unit) {
                    OfflineSyncManager.get(context.applicationContext).retryPending()
                }

                LaunchedEffect(appConfig) {
                    val announcement = appConfig?.announcement
                    if (announcement?.enabled == true && announcement.body.isNotBlank()) {
                        showAnnouncement = true
                    }
                }

                // Leaving the history page always drops the multi-selection session.
                LaunchedEffect(page) {
                    if (page != AppPage.History) {
                        historySelecting = false
                        historySelectedIds = emptySet()
                        showHistoryDeleteConfirmation = false
                    }
                    if (page == AppPage.Learning || page == AppPage.Settings) {
                        learningPresenter.refreshAccount(silent = true)
                    }
                }

                fun beginListening() {
                    if (!settings.cloudListeningEnabled && !ModelPackageManager(context).canRecognize()) {
                        page = AppPage.Settings
                        Toast.makeText(context, "请先下载或恢复离线识别模型", Toast.LENGTH_LONG).show()
                        return
                    }
                    if (!settings.usageNoticeAccepted) {
                        pendingStart = true
                        showUsageNotice = true
                    } else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                        permissionRequester.launch(requiredPermissions(context))
                    } else if (!RecordingService.isRealtimeNotificationEnabled(context)) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
                            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
                        ) {
                            permissionRequester.launch(requiredPermissions(context))
                        } else {
                            showNotificationSettings = true
                        }
                    } else {
                        presenter.start(selectedCourseId)
                    }
                }

                crashReport?.let { report ->
                    CrashReportDialog(
                        report = report,
                        onDismiss = {
                            RadarCrashHandler.dismissReport(context)
                            crashReport = null
                        },
                    )
                }

                if (showUsageNotice) {
                    UsageNotice(
                        onConfirm = {
                            presenter.acceptUsageNotice()
                            showUsageNotice = false
                            if (pendingStart) {
                                pendingStart = false
                                beginListening()
                            }
                        },
                        onDismiss = {
                            pendingStart = false
                            showUsageNotice = false
                        },
                    )
                }

                if (showNotificationSettings) {
                    RealtimeNotificationRequired(
                        onOpenSettings = {
                            openRealtimeNotificationSettings(context)
                            showNotificationSettings = false
                        },
                        onDismiss = { showNotificationSettings = false },
                    )
                }

                if (showCloudNotice) {
                    GlassConfirmDialog(
                        title = "使用云端学习服务？",
                        message = "所选音频或本节课声音会经我们的服务器转发给 Lecsync 处理，按实际用量计费。原文会保存在本机；云端录音存储默认关闭，可在进阶设置中单独开启。请确认你已获得课堂录音授权。",
                        confirmLabel = "同意并继续",
                        dismissLabel = "取消",
                        onConfirm = {
                            appPreferences.cloudNoticeAccepted = true
                            presenter.refreshSettings()
                            showCloudNotice = false
                            if (pendingCloudAudio == null && pendingVoiceToggle) {
                                pendingVoiceToggle = false
                                cloudAudioPresenter.toggleVoiceTyping()
                            } else if (pendingCloudAudio == null && !settings.cloudListeningEnabled) {
                                presenter.setCloudListeningEnabled(true)
                            }
                            pendingCloudAudio?.let { audio ->
                                pendingCloudKind?.let { kind ->
                                    if (audio.scheme in setOf("http", "https")) cloudAudioPresenter.importAudioUrl(audio.toString())
                                    else cloudAudioPresenter.importAudio(audio, kind)
                                }
                            }
                            pendingCloudAudio = null
                        },
                        onDismiss = { showCloudNotice = false; pendingCloudAudio = null },
                    )
                }

                pendingAnalysisId?.let { materialId ->
                    GlassConfirmDialog(
                        title = "生成 AI 学习包？",
                        message = "将把本节课的定稿字幕（不含原始录音）发送给 AI 服务，用于生成词汇、短语、重难点和练习题。请确认内容不含敏感信息。",
                        confirmLabel = "发送并生成",
                        dismissLabel = "取消",
                        onConfirm = {
                            pendingAnalysisId = null
                            if (page == AppPage.SessionDetail) {
                                learningPresenter.analyzeSession(materialId)
                            } else {
                                learningPresenter.analyzeMaterial(materialId)
                            }
                        },
                        onDismiss = { pendingAnalysisId = null },
                    )
                }

                if (showAccountNotice) {
                    GlassConfirmDialog(
                        title = "获取短信验证码？",
                        message = "手机号仅用于试用额度管理，不用于登录或营销。号码会发送到当前 AI 服务并由服务端加密保存；激活需要输入短信验证码。请确认管理员已经添加你的手机号。",
                        confirmLabel = "同意并发送",
                        dismissLabel = "取消",
                        onConfirm = {
                            appPreferences.accountNoticeAccepted = true
                            showAccountNotice = false
                            learningPresenter.requestCode(pendingAccountPhone)
                            pendingAccountPhone = ""
                        },
                        onDismiss = {
                            showAccountNotice = false
                            pendingAccountPhone = ""
                        },
                    )
                }

                if (showAnnouncement && !showUsageNotice) {
                    val announcement = appConfig?.announcement
                    GlassConfirmDialog(
                        title = announcement?.title?.takeIf { it.isNotBlank() } ?: "公告",
                        message = announcement?.body.orEmpty(),
                        confirmLabel = "我知道了",
                        dismissLabel = null,
                        onConfirm = { showAnnouncement = false },
                        onDismiss = { showAnnouncement = false },
                    )
                }

                if (showDoubtEditor) {
                    DoubtEditorDialog(
                        initialSource = doubtSourceText,
                        onConfirm = { source, note ->
                            if (page == AppPage.SessionDetail) {
                                detail.session?.id?.let { sessionId ->
                                    presenter.addDoubt(sessionId, detail.transcript.lastOrNull()?.id, source, note)
                                }
                            } else {
                                presenter.addDoubt(source, note)
                            }
                            showDoubtEditor = false
                        },
                        onDismiss = { showDoubtEditor = false },
                    )
                }

                if (showTranslationNotice) {
                    GlassConfirmDialog(
                        title = "开启实时翻译？",
                        message = "开启后，每段定稿字幕会发送给 AI 翻译服务。原始录音仍默认只在本机处理；网络失败不影响课堂记录。",
                        confirmLabel = "同意并开启",
                        dismissLabel = "取消",
                        onConfirm = {
                            presenter.acceptTranslationNotice()
                            showTranslationNotice = false
                        },
                        onDismiss = { showTranslationNotice = false },
                    )
                }

                if (showHistoryDeleteConfirmation) {
                    GlassConfirmDialog(
                        title = "删除 ${historySelectedIds.size} 条课堂记录？",
                        message = "所选课堂的转写、提问和私有录音都会一并删除，无法恢复；正在记录的课堂会自动跳过。",
                        confirmLabel = "删除",
                        dismissLabel = "取消",
                        onConfirm = {
                            showHistoryDeleteConfirmation = false
                            presenter.deleteSessions(historySelectedIds)
                            historySelecting = false
                            historySelectedIds = emptySet()
                        },
                        onDismiss = { showHistoryDeleteConfirmation = false },
                        tone = GlassTone.Danger,
                    )
                }

                if (page !in RootPageOrder) {
                    BackHandler { page = backTarget(page) }
                }

                val reviewCategory = reviewCategoryType?.let { LearningCategory.fromType(it) }
                val reviewTitle = reviewCategory?.label ?: "全部复习"
                val reviewDescription = reviewCategory?.description ?: "所有分类中今天到期的卡片"
                val reviewSessionCards = reviewEntries
                    .filter { reviewCategoryType == null || it.itemType == reviewCategoryType }
                    .map { it.card }
                val pageTitle = when (page) {
                    AppPage.LearningCategory -> learningCategoryType?.let { learningTypeLabel(it) } ?: "学习内容"
                    AppPage.ReviewCategory -> reviewTitle
                    else -> page.title
                }

                AppScaffold(
                    page = page,
                    title = pageTitle,
                    onPageChange = { page = it },
                    onBack = { page = backTarget(page) },
                    taglines = appConfig?.taglines.orEmpty(),
                    bottomOverlay = when {
                        page == AppPage.Home -> {
                            {
                                HomeActionDock(
                                    state = dashboard,
                                    onRecordingToggle = { if (dashboard.isRecording) presenter.stop() else beginListening() },
                                    onPauseToggle = { if (dashboard.isPaused) presenter.resume() else presenter.pause() },
                                    onMarkDoubt = {
                                        doubtSourceText = dashboard.liveTranscript.ifBlank {
                                            dashboard.transcript.lastOrNull()?.text.orEmpty()
                                        }
                                        showDoubtEditor = true
                                    },
                                )
                            }
                        }
                        page == AppPage.History && historySelecting -> {
                            {
                                GlassPanel(
                                    tone = GlassTone.Neutral,
                                    effect = GlassEffect.Elevated,
                                    shape = RoundedCornerShape(24.dp),
                                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 12.dp),
                                ) {
                                    Text(
                                        text = "删除所选（${historySelectedIds.size}）",
                                        color = if (historySelectedIds.isEmpty()) LiquidTextSecondary.copy(alpha = 0.45f) else RadarAlert,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier
                                            .clickable(enabled = historySelectedIds.isNotEmpty()) {
                                                showHistoryDeleteConfirmation = true
                                            }
                                            .padding(horizontal = 8.dp, vertical = 4.dp),
                                    )
                                }
                            }
                        }
                        else -> null
                    },
                ) { innerPadding ->
                    AnimatedContent(
                        targetState = page,
                        transitionSpec = { pageTransition() },
                        label = "pageTransition",
                    ) { targetPage ->
                    when (targetPage) {
                        AppPage.Home -> HomeScreen(
                            state = dashboard,
                            courses = courses,
                            selectedCourseId = selectedCourseId,
                            onCourseSelected = { selectedCourseId = it },
                            onOpenTimeline = {
                                dashboard.activeSessionId?.let {
                                    presenter.loadSession(it)
                                    page = AppPage.Timeline
                                }
                            },
                            modifier = Modifier.padding(innerPadding),
                            twoPane = LocalConfiguration.current.screenWidthDp >= 840,
                        )

                        AppPage.Learning -> LearningHomeScreen(
                            courses = courses,
                            message = learningMessage,
                            accountStatus = accountStatus,
                            accountSupported = accountSupported,
                            onCreateCourse = learningPresenter::createCourse,
                            onRenameCourse = { id, name, nature -> learningPresenter.renameCourse(id, name, nature) },
                            onDeleteCourse = learningPresenter::deleteCourse,
                            onOpenHistory = { page = AppPage.History },
                            onOpenCourse = { courseId ->
                                learningPresenter.loadCourse(courseId)
                                page = AppPage.CourseDetail
                            },
                            onOpenAccountSettings = { page = AppPage.Settings },
                            onConsumeMessage = learningPresenter::consumeMessage,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.Review -> ReviewHomeScreen(
                            entries = reviewEntries,
                            onReviewAll = {
                                reviewCategoryType = null
                                page = AppPage.ReviewCategory
                            },
                            onOpenCategory = { type ->
                                reviewCategoryType = type
                                page = AppPage.ReviewCategory
                            },
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.ReviewCategory -> ReviewSessionScreen(
                            title = reviewTitle,
                            description = reviewDescription,
                            cards = reviewSessionCards,
                            cardsTitle = if (reviewCategoryType == null) "全部卡片" else "本分类卡片",
                            message = learningMessage,
                            onReview = learningPresenter::reviewCard,
                            onConsumeMessage = learningPresenter::consumeMessage,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.History -> HistoryScreen(
                            sessions = history,
                            selecting = historySelecting,
                            selectedIds = historySelectedIds,
                            onSelectingChange = { selecting ->
                                historySelecting = selecting
                                if (!selecting) historySelectedIds = emptySet()
                            },
                            onSelectionChange = { historySelectedIds = it },
                            onOpenSession = { sessionId ->
                                presenter.loadSession(sessionId)
                                page = AppPage.SessionDetail
                            },
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.CourseDetail -> CourseDetailScreen(
                            state = courseDetail,
                            isImporting = isImporting,
                            isAnalyzing = isAnalyzing,
                            message = learningMessage,
                            onImportMaterial = {
                                materialLauncher.launch(
                                    arrayOf("application/pdf", "image/*", "text/plain", "text/markdown"),
                                )
                            },
                            onAnalyzeMaterial = { pendingAnalysisId = it },
                            onImportGlossary = {
                                glossaryLauncher.launch(arrayOf("text/plain", "text/csv", "text/comma-separated-values"))
                            },
                            onExport = {
                                courseDetail.course?.let { course ->
                                    learningPresenter.prepareCourseExport(course.id) { fileName, content ->
                                        pendingExport = ExportRequest(fileName, content)
                                    }
                                }
                            },
                            onOpenCategory = { type ->
                                learningCategoryType = type
                                page = AppPage.LearningCategory
                            },
                            onLoadPageImage = learningPresenter::loadPageImage,
                            onConsumeMessage = learningPresenter::consumeMessage,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.LearningCategory -> LearningCategoryScreen(
                            courseName = courseDetail.course?.name ?: "课程",
                            type = learningCategoryType.orEmpty(),
                            items = courseDetail.learningItems,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.Settings -> SettingsScreen(
                            state = settings,
                            onSaveAudioChanged = presenter::setSaveAudioEnabled,
                            onTranslationChanged = { enabled ->
                                if (enabled && !settings.translationNoticeAccepted) {
                                    showTranslationNotice = true
                                } else {
                                    presenter.setTranslationEnabled(enabled)
                                }
                            },
                            onOpenNotificationSettings = { openRealtimeNotificationSettings(context) },
                            onCloudListeningChanged = { enabled ->
                                if (enabled && !settings.cloudNoticeAccepted) showCloudNotice = true
                                else presenter.setCloudListeningEnabled(enabled)
                            },
                            onOpenBatterySettings = { openBatteryOptimizationSettings(context) },
                            onOpenPrivacyPolicy = { page = AppPage.PrivacyPolicy },
                            onOpenCloudListening = { page = AppPage.CloudListening },
                            onOpenCloudAudio = { page = AppPage.CloudAudio },
                            onForceOfflineChanged = presenter::setForceOfflineRecording,
                            onAutoOfflineChanged = presenter::setAutoOfflineOnNetworkLoss,
                            onOfflineFirstChanged = presenter::setOfflineFirstStart,
                            onAutoCloudSyncChanged = presenter::setAutoCloudSync,
                            onDownloadModels = presenter::downloadModels,
                            onRestoreModels = presenter::restoreModels,
                            onUninstallModels = presenter::uninstallModels,
                            aiServiceStatus = aiServiceStatus,
                            aiServiceUrl = aiServiceUrl,
                            onSaveAiServiceUrl = learningPresenter::saveAiServiceUrl,
                            onCheckAiService = learningPresenter::checkAiService,
                            accountStatus = accountStatus,
                            accountSupported = accountSupported,
                            accountBusy = isAccountBusy,
                            accountMessage = accountMessage,
                            accountCodeCooldownUntilMs = accountCodeCooldownUntilMs,
                            onRequestCode = { phone ->
                                if (!appPreferences.accountNoticeAccepted) {
                                    pendingAccountPhone = phone
                                    showAccountNotice = true
                                } else {
                                    learningPresenter.requestCode(phone)
                                }
                            },
                            onActivateAccount = { phone, code ->
                                learningPresenter.activateAccount(phone, code)
                            },
                            onRefreshAccount = { learningPresenter.refreshAccount() },
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.CloudAudio -> CloudAudioScreen(
                            tasks = cloudTasks,
                            busy = cloudAudioBusy,
                            voiceListening = voiceListening,
                            onVoiceToggle = {
                                if (!appPreferences.cloudNoticeAccepted) {
                                    pendingVoiceToggle = true
                                    showCloudNotice = true
                                }
                                else if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) cloudAudioPresenter.toggleVoiceTyping()
                                else voicePermissionRequester.launch(arrayOf(Manifest.permission.RECORD_AUDIO))
                            },
                            message = cloudAudioMessage,
                            onImport = { kind ->
                                pendingCloudKind = kind
                                audioLauncher.launch(arrayOf("audio/*", "video/mp4"))
                            },
                            onImportUrl = { url ->
                                pendingCloudKind = CloudAudioPresenter.AudioKind.ASYNC
                                pendingCloudAudio = Uri.parse(url)
                                if (!appPreferences.cloudNoticeAccepted) showCloudNotice = true
                                else cloudAudioPresenter.importAudioUrl(url)
                            },
                            onCancel = cloudAudioPresenter::cancel,
                            onDelete = cloudAudioPresenter::delete,
                            onDownload = { task, kind ->
                                cloudAudioPresenter.downloadRecording(task, kind) { name, file ->
                                    pendingCloudFile = name to file
                                    cloudExportLauncher.launch(name)
                                }
                            },
                            onOpenSession = { sessionId ->
                                presenter.loadSession(sessionId)
                                page = AppPage.SessionDetail
                            },
                            onConsumeMessage = cloudAudioPresenter::consumeMessage,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.CloudListening -> CloudListeningSettingsScreen(
                            preferences = appPreferences,
                            onChanged = presenter::refreshSettings,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.PrivacyPolicy -> PrivacyPolicyScreen(
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.Timeline -> TimelineScreen(
                            detail = detail,
                            modifier = Modifier.padding(innerPadding),
                        )

                        AppPage.SessionDetail -> SessionDetailScreen(
                            detail = detail,
                            isActiveRecording = dashboard.isRecording && dashboard.activeSessionId == detail.session?.id,
                            onOpenTimeline = { page = AppPage.Timeline },
                            onExportMarkdown = { detail.session?.id?.let { presenter.prepareExport(it, true) { pendingExport = it } } },
                            onExportText = { detail.session?.id?.let { presenter.prepareExport(it, false) { pendingExport = it } } },
                            onAnalyze = { detail.session?.id?.let { pendingAnalysisId = it } },
                            onMarkDoubt = {
                                doubtSourceText = detail.transcript.lastOrNull()?.text.orEmpty()
                                showDoubtEditor = true
                            },
                            analysisMessage = learningMessage,
                            onConsumeAnalysisMessage = learningPresenter::consumeMessage,
                            onRename = { title -> detail.session?.id?.let { presenter.renameSession(it, title) } },
                            onDelete = {
                                detail.session?.id?.let {
                                    if (presenter.deleteSession(it)) page = AppPage.History
                                }
                            },
                            modifier = Modifier.padding(innerPadding),
                        )
                    }
                    }
                }
                }
            }
        }
    }
}

private enum class AppPage(val title: String) {
    Home("知习"),
    Learning("学习"),
    Review("复习"),
    Settings("设置"),
    History("课堂记录"),
    Timeline("历史自动识别"),
    SessionDetail("课堂详情"),
    CourseDetail("课程详情"),
    LearningCategory("学习内容"),
    ReviewCategory("复习"),
    PrivacyPolicy("隐私说明"),
    CloudListening("云端听课"),
    CloudAudio("音频转写"),
}

private fun backTarget(page: AppPage): AppPage = when (page) {
    AppPage.CourseDetail, AppPage.History -> AppPage.Learning
    AppPage.LearningCategory -> AppPage.CourseDetail
    AppPage.ReviewCategory -> AppPage.Review
    AppPage.PrivacyPolicy, AppPage.CloudListening, AppPage.CloudAudio -> AppPage.Settings
    AppPage.SessionDetail -> AppPage.History
    AppPage.Timeline -> AppPage.SessionDetail
    else -> AppPage.Home
}

private data class RecorderDashboardMetrics(
    val recognitionLatencyMs: Long,
    val translationLatencyMs: Long? = null,
)

private data class DashboardState(
    val isRecording: Boolean = false,
    val isPaused: Boolean = false,
    val elapsedSeconds: Long = 0,
    val activeSessionId: Long? = null,
    val transcript: List<TranscriptLineEntity> = emptyList(),
    val translations: Map<Long, TranslationEntity> = emptyMap(),
    val liveTranscript: String = "",
    val liveTranslation: String? = null,
    val failureMessage: String? = null,
    val doubts: List<DoubtEventEntity> = emptyList(),
    val liveMinutes: String? = null,
    val cloudMetrics: RecorderDashboardMetrics? = null,
)

private data class SessionDetailState(
    val session: SessionEntity? = null,
    val transcript: List<TranscriptLineEntity> = emptyList(),
    val translations: Map<Long, TranslationEntity> = emptyMap(),
    val questions: List<QuestionEventEntity> = emptyList(),
    val doubts: List<DoubtEventEntity> = emptyList(),
    val liveMinutes: String? = null,
)

private data class SettingsState(
    val saveAudioEnabled: Boolean = false,
    val usageNoticeAccepted: Boolean = false,
    val translationEnabled: Boolean = false,
    val translationNoticeAccepted: Boolean = false,
    val cloudListeningEnabled: Boolean = false,
    val cloudNoticeAccepted: Boolean = false,
    val forceOfflineRecording: Boolean = false,
    val autoOfflineOnNetworkLoss: Boolean = true,
    val offlineFirstStart: Boolean = false,
    val autoCloudSync: Boolean = true,
    val modelStatusText: String = "",
    val modelCanRestore: Boolean = false,
    val modelCanUninstall: Boolean = false,
    val modelDownloadInProgress: Boolean = false,
    val modelDownloadProgress: ModelDownloadProgress? = null,
    val modelDownloadMessage: String? = null,
)

private data class ExportRequest(val fileName: String, val content: String)

private class ClassroomPresenter(private val appContext: Context) {
    private val repository = ClassroomRepository.get(appContext)
    private val modelManager = ModelPackageManager(appContext)
    private val preferences = AppPreferences.get(appContext)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private var detailJob: Job? = null
    private var minutesJob: Job? = null
    private var activeSessionJob: Job? = null
    private var liveTranslationJob: Job? = null
    private var detailTranslationJob: Job? = null

    private val _dashboard = MutableStateFlow(DashboardState())
    val dashboard: StateFlow<DashboardState> = _dashboard.asStateFlow()
    private val _history = MutableStateFlow<List<SessionSummary>>(emptyList())
    val history: StateFlow<List<SessionSummary>> = _history.asStateFlow()
    private val _detail = MutableStateFlow(SessionDetailState())
    val detail: StateFlow<SessionDetailState> = _detail.asStateFlow()
    private val _settings = MutableStateFlow(readSettings())
    val settings: StateFlow<SettingsState> = _settings.asStateFlow()

    init {
        restoreActiveRecording()
        scope.launch {
            RecordingBus.events.collect { event ->
                when (event) {
                    is RecorderEvent.SessionStarted -> observeActiveSession(event.sessionId, event.startedAtMillis)
                    is RecorderEvent.Status -> _dashboard.value = _dashboard.value.copy(
                        isRecording = event.isRecording,
                        isPaused = event.isPaused,
                        elapsedSeconds = event.elapsedSeconds,
                        liveTranscript = if (event.isRecording) _dashboard.value.liveTranscript else "",
                        liveTranslation = if (event.isRecording) _dashboard.value.liveTranslation else null,
                        cloudMetrics = if (event.isRecording) _dashboard.value.cloudMetrics else null,
                    )
                    is RecorderEvent.PartialTranscript -> _dashboard.value = _dashboard.value.copy(liveTranscript = event.text, failureMessage = null)
                    is RecorderEvent.PartialTranslation -> _dashboard.value = _dashboard.value.copy(liveTranslation = event.text?.takeIf(String::isNotBlank))
                    is RecorderEvent.Transcript -> _dashboard.value = _dashboard.value.copy(
                        liveTranscript = "",
                        liveTranslation = null,
                        failureMessage = null,
                    )
                    is RecorderEvent.LiveMinutes -> _dashboard.value = _dashboard.value.copy(liveMinutes = event.contentJson)
                    is RecorderEvent.CloudMetrics -> _dashboard.value = _dashboard.value.copy(
                        cloudMetrics = RecorderDashboardMetrics(event.recognitionLatencyMs, event.translationLatencyMs),
                    )
                    is RecorderEvent.Failure -> _dashboard.value = _dashboard.value.copy(failureMessage = event.message, liveTranscript = "", liveTranslation = null)
                    is RecorderEvent.ConnectionRestored -> _dashboard.value = _dashboard.value.copy(failureMessage = null)
                    is RecorderEvent.CloudSyncCompleted -> Unit
                }
            }
        }
        scope.launch { repository.observeSessionSummaries().collect { _history.value = it } }
    }

    private fun restoreActiveRecording() {
        RecordingService.currentRecordingSnapshot()?.let { snapshot ->
            snapshot.sessionId?.let { observeActiveSession(it, snapshot.startedAtMillis, snapshot.liveTranscript) }
        }
    }

    private fun observeActiveSession(sessionId: Long, startedAtMillis: Long, liveTranscript: String = "") {
        activeSessionJob?.cancel()
        activeSessionJob = scope.launch {
            combine(
                repository.observeTranscript(sessionId),
                repository.observeDoubts(sessionId),
            ) { transcript, doubts -> transcript to doubts }
                .collect { (transcript, doubts) ->
                val snapshot = RecordingService.currentRecordingSnapshot()
                val stillRecording = snapshot?.sessionId == sessionId
                _dashboard.value = _dashboard.value.copy(
                    isRecording = stillRecording,
                    isPaused = snapshot?.isPaused == true,
                    elapsedSeconds = if (stillRecording) _dashboard.value.elapsedSeconds else 0,
                    activeSessionId = sessionId,
                    transcript = transcript.takeLast(120),
                    liveTranscript = snapshot?.liveTranscript ?: liveTranscript,
                    doubts = doubts,
                )
            }
        }
        // flatMapLatest re-subscribes when the line set grows; a nested collect froze the
        // first (usually empty) id list and translations of later lines never arrived.
        liveTranslationJob?.cancel()
        liveTranslationJob = scope.launch {
            repository.observeTranscript(sessionId)
                .map { lines -> lines.map { it.id } }
                .distinctUntilChanged()
                .flatMapLatest { lineIds -> repository.observeTranslations(lineIds) }
                .collect { translations ->
                    _dashboard.value = _dashboard.value.copy(
                        translations = translations.associateBy { it.transcriptLineId },
                    )
                }
        }
        scope.launch {
            repository.observeLiveMinutes(sessionId).collect { minutes ->
                _dashboard.value = _dashboard.value.copy(liveMinutes = minutes?.contentJson)
            }
        }
    }

    fun close() {
        activeSessionJob?.cancel()
        minutesJob?.cancel()
        liveTranslationJob?.cancel()
        detailTranslationJob?.cancel()
        scope.cancel()
    }

    fun start(courseId: Long?) = ContextCompat.startForegroundService(
        appContext,
        Intent(appContext, RecordingService::class.java)
            .setAction(RecordingService.ACTION_START)
            .putExtra(RecordingService.EXTRA_COURSE_ID, courseId ?: -1L),
    )

    fun stop() = appContext.startService(
        Intent(appContext, RecordingService::class.java).setAction(RecordingService.ACTION_STOP),
    )

    fun pause() = appContext.startService(
        Intent(appContext, RecordingService::class.java).setAction(RecordingService.ACTION_PAUSE),
    )

    fun resume() = appContext.startService(
        Intent(appContext, RecordingService::class.java).setAction(RecordingService.ACTION_RESUME),
    )

    fun loadSession(sessionId: Long) {
        detailJob?.cancel()
        minutesJob?.cancel()
        minutesJob = scope.launch {
            repository.observeLiveMinutes(sessionId).collect { minutes ->
                _detail.value = _detail.value.copy(liveMinutes = minutes?.contentJson)
            }
        }
        detailJob = scope.launch {
            combine(
                repository.observeSession(sessionId),
                repository.observeTranscript(sessionId),
                repository.observeQuestions(sessionId),
                repository.observeDoubts(sessionId),
            ) { session, transcript, questions, doubts ->
                SessionDetailState(session, transcript, emptyMap(), questions, doubts)
            }.collect { _detail.value = it }
        }
        detailTranslationJob?.cancel()
        detailTranslationJob = scope.launch {
            repository.observeTranscript(sessionId)
                .map { lines -> lines.map { it.id } }
                .distinctUntilChanged()
                .flatMapLatest { lineIds -> repository.observeTranslations(lineIds) }
                .collect { translations ->
                    _detail.value = _detail.value.copy(
                        translations = translations.associateBy { it.transcriptLineId },
                    )
                }
        }
    }

    fun deleteSession(sessionId: Long): Boolean {
        // The detail page normally disables this action while recording, but keep the service's
        // live snapshot as the authority in case a stale UI state or an already-open confirmation
        // dialog reaches this method. Deleting the parent row would otherwise make later service
        // inserts fail their foreign-key constraint and lose the rest of the class transcript.
        if (RecordingService.currentRecordingSnapshot()?.sessionId == sessionId) {
            _dashboard.value = _dashboard.value.copy(
                failureMessage = "正在记录的课堂不能删除，请先停止录音。",
            )
            return false
        }
        scope.launch(Dispatchers.IO) {
            if (RecordingService.currentRecordingSnapshot()?.sessionId == sessionId) return@launch
            repository.deleteSession(sessionId)
            withContext(Dispatchers.Main.immediate) {
                if (_dashboard.value.activeSessionId == sessionId && !_dashboard.value.isRecording) {
                    _dashboard.value = _dashboard.value.copy(
                        activeSessionId = null,
                        transcript = emptyList(),
                        translations = emptyMap(),
                        doubts = emptyList(),
                    )
                }
            }
        }
        return true
    }

    fun deleteSessions(sessionIds: Set<Long>) {
        // Same live-snapshot authority as deleteSession: the session currently being recorded
        // is skipped so later service inserts keep their foreign-key parent.
        val recordingId = RecordingService.currentRecordingSnapshot()?.sessionId
        val deletable = sessionIds.filterTo(mutableSetOf()) { it != recordingId }
        if (deletable.size < sessionIds.size) {
            _dashboard.value = _dashboard.value.copy(
                failureMessage = "正在记录的课堂已跳过，请先停止录音再删除。",
            )
        }
        if (deletable.isEmpty()) return
        scope.launch(Dispatchers.IO) {
            val racingRecordingId = RecordingService.currentRecordingSnapshot()?.sessionId
            deletable.filter { it != racingRecordingId }.forEach { repository.deleteSession(it) }
            withContext(Dispatchers.Main.immediate) {
                val current = _dashboard.value
                val clearedActive = current.activeSessionId?.let { it in deletable } == true
                if (clearedActive && !current.isRecording) {
                    _dashboard.value = current.copy(
                        activeSessionId = null,
                        transcript = emptyList(),
                        translations = emptyMap(),
                        doubts = emptyList(),
                    )
                }
            }
        }
    }

    fun prepareExport(sessionId: Long, markdown: Boolean, onReady: (ExportRequest) -> Unit) {
        scope.launch(Dispatchers.IO) {
            val record = repository.loadExport(sessionId) ?: return@launch
            val extension = if (markdown) "md" else "txt"
            val content = if (markdown) record.toMarkdown() else record.toPlainText()
            val title = record.session.title.ifBlank { "课堂记录" }
            val fileName = "知习_${title}_${fileStamp(record.session.startedAtMillis)}.$extension"
            withContext(Dispatchers.Main.immediate) { onReady(ExportRequest(fileName, content)) }
        }
    }

    fun writeExport(uri: Uri, content: String, onMessage: (String) -> Unit) {
        scope.launch(Dispatchers.IO) {
            runCatching {
                appContext.contentResolver.openOutputStream(uri)?.use { stream ->
                    OutputStreamWriter(stream, Charsets.UTF_8).use { it.write(content) }
                } ?: error("无法打开所选文件")
            }.onSuccess {
                withContext(Dispatchers.Main.immediate) { onMessage("文件已保存到所选位置") }
            }.onFailure { error ->
                withContext(Dispatchers.Main.immediate) {
                    onMessage("导出失败：${error.message ?: "请重新选择保存位置"}")
                }
            }
        }
    }

    fun acceptUsageNotice() {
        preferences.usageNoticeAccepted = true
        refreshSettings()
    }

    fun setSaveAudioEnabled(enabled: Boolean) {
        preferences.saveAudioEnabled = enabled
        refreshSettings()
    }

    fun setTranslationEnabled(enabled: Boolean) {
        preferences.translationEnabled = enabled
        refreshSettings()
    }

    fun setCloudListeningEnabled(enabled: Boolean) {
        preferences.cloudListeningEnabled = enabled
        refreshSettings()
    }

    fun setForceOfflineRecording(enabled: Boolean) {
        preferences.forceOfflineRecording = enabled
        refreshSettings()
    }

    fun setAutoOfflineOnNetworkLoss(enabled: Boolean) {
        preferences.autoOfflineOnNetworkLoss = enabled
        refreshSettings()
    }

    fun setOfflineFirstStart(enabled: Boolean) {
        preferences.offlineFirstStart = enabled
        refreshSettings()
    }

    fun setAutoCloudSync(enabled: Boolean) {
        preferences.autoCloudSync = enabled
        refreshSettings()
    }

    fun acceptCloudNotice() {
        preferences.cloudNoticeAccepted = true
        refreshSettings()
    }

    fun acceptTranslationNotice() {
        preferences.translationNoticeAccepted = true
        preferences.translationEnabled = true
        refreshSettings()
    }

    fun downloadModels() {
        if (_settings.value.modelDownloadInProgress) return
        _settings.value = _settings.value.copy(
            modelDownloadInProgress = true,
            modelDownloadProgress = null,
            modelDownloadMessage = null,
        )
        scope.launch(Dispatchers.IO) {
            try {
                modelManager.downloadAndInstall { progress ->
                    _settings.value = _settings.value.copy(modelDownloadProgress = progress)
                }
                withContext(Dispatchers.Main.immediate) {
                    _settings.value = _settings.value.copy(
                        modelDownloadInProgress = false,
                        modelDownloadProgress = null,
                        modelDownloadMessage = "模型下载、SHA-256 校验与启用均已完成",
                    )
                    refreshSettings()
                }
            } catch (error: Exception) {
                val reason = when (error) {
                    is SocketTimeoutException -> "连接 GitHub 官方源超时"
                    is SSLException -> "GitHub HTTPS 连接失败：${error.message}"
                    is IOException -> "网络传输中断：${error.message ?: "连接被重置"}"
                    else -> error.message ?: "未知错误"
                }
                withContext(Dispatchers.Main.immediate) {
                    _settings.value = _settings.value.copy(
                        modelDownloadInProgress = false,
                        modelDownloadProgress = null,
                        modelDownloadMessage = "下载失败：$reason。下载前的可用模型未被覆盖。",
                    )
                    _dashboard.value = _dashboard.value.copy(failureMessage = "模型下载失败：$reason")
                    refreshSettings()
                }
            }
        }
    }

    fun restoreModels() {
        runCatching { modelManager.restoreLatest() }
            .onFailure { error -> _dashboard.value = _dashboard.value.copy(failureMessage = error.message) }
        refreshSettings()
    }

    fun uninstallModels() {
        runCatching { modelManager.uninstall() }
            .onFailure { error -> _dashboard.value = _dashboard.value.copy(failureMessage = error.message) }
        refreshSettings()
    }

    fun addDoubt(sourceText: String, note: String) {
        val sessionId = _dashboard.value.activeSessionId ?: run {
            _dashboard.value = _dashboard.value.copy(failureMessage = "请先开始或选择一节课堂，再标记疑问")
            return
        }
        val latestLine = _dashboard.value.transcript.lastOrNull()
        scope.launch(Dispatchers.IO) {
            runCatching { repository.addDoubt(sessionId, latestLine?.id, sourceText, note) }
                .onSuccess {
                    withContext(Dispatchers.Main.immediate) {
                        Toast.makeText(appContext, "疑问已保存", Toast.LENGTH_SHORT).show()
                    }
                }
                .onFailure { error ->
                    withContext(Dispatchers.Main.immediate) {
                        _dashboard.value = _dashboard.value.copy(failureMessage = "疑问保存失败：${error.message}")
                    }
                }
        }
    }

    fun addDoubt(sessionId: Long, lineId: Long?, sourceText: String, note: String) {
        scope.launch(Dispatchers.IO) {
            repository.addDoubt(sessionId, lineId, sourceText, note)
        }
    }

    fun addDoubt(sessionId: Long, line: TranscriptLineEntity, note: String) {
        addDoubt(sessionId, line.id, line.text, note)
    }

    fun renameSession(sessionId: Long, title: String) {
        scope.launch(Dispatchers.IO) { repository.renameSession(sessionId, title) }
    }

    fun refreshSettings() {
        val transient = _settings.value
        _settings.value = readSettings().copy(
            modelDownloadInProgress = transient.modelDownloadInProgress,
            modelDownloadProgress = transient.modelDownloadProgress,
            modelDownloadMessage = transient.modelDownloadMessage,
        )
    }

    private fun readSettings() = SettingsState(
        saveAudioEnabled = preferences.saveAudioEnabled,
        usageNoticeAccepted = preferences.usageNoticeAccepted,
        translationEnabled = preferences.translationEnabled,
        translationNoticeAccepted = preferences.translationNoticeAccepted,
        cloudListeningEnabled = preferences.cloudListeningEnabled,
        cloudNoticeAccepted = preferences.cloudNoticeAccepted,
        forceOfflineRecording = preferences.forceOfflineRecording,
        autoOfflineOnNetworkLoss = preferences.autoOfflineOnNetworkLoss,
        offlineFirstStart = preferences.offlineFirstStart,
        autoCloudSync = preferences.autoCloudSync,
        modelStatusText = modelManager.status().let { status ->
            when {
                status.managedInstalled -> "受管离线模型已安装 · ${status.bytes / 1024 / 1024} MB"
                status.corrupt -> "离线模型文件不完整，请重新下载"
                status.bundledInstalled -> "内置离线模型可用 · 无需下载"
                status.recycled -> "模型已移入回收站，可恢复或重新下载"
                else -> "未安装离线识别模型，请下载或从回收站恢复"
            }
        },
        modelCanRestore = modelManager.status().recycled,
        modelCanUninstall = modelManager.canRecognize(),
    )
}

/**
 * Layered layout: page content is recorded into the liquid-glass backdrop layer, while the
 * header, navigation bar and the home action dock float above it as siblings. The chrome
 * samples (and visibly refracts) whatever scrolls beneath; everything inside the recorded
 * layer must stay on the static renderer, or the backdrop loops and the process dies.
 */
@Composable
private fun AppScaffold(
    page: AppPage,
    title: String = page.title,
    onPageChange: (AppPage) -> Unit,
    onBack: () -> Unit,
    bottomOverlay: (@Composable () -> Unit)? = null,
    taglines: List<String> = emptyList(),
    content: @Composable (androidx.compose.foundation.layout.PaddingValues) -> Unit,
) {
    val rootPage = page in RootPageOrder
    val backdrop = LocalLiquidBackdrop.current
    val topInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
    // 金标联盟大屏适配：<600dp 用底部玻璃导航条（可拖动胶囊）；≥600dp 换侧边玻璃导航轨，
    // 内容在超宽屏限宽居中不拉伸。折叠/旋转由 manifest configChanges 保证不重建，这里
    // 直接随 LocalConfiguration 重组即完成形态切换。
    val widthDp = LocalConfiguration.current.screenWidthDp
    val useRail = widthDp >= 600
    val railInset = if (useRail) 112.dp else 0.dp
    val contentCap = if (useRail) 840.dp else Int.MAX_VALUE.dp
    val chromeCap = if (useRail) 952.dp else Int.MAX_VALUE.dp
    // 首页轮播标语：后台可远控；未配置或拉取失败回退内置默认两句。
    val mottos = taglines.filter { it.isNotBlank() }.ifEmpty { listOf("知行合一", "学而时习之，不亦说乎") }
    var mottoIndex by remember(mottos) { mutableStateOf(0) }
    LaunchedEffect(mottos) {
        while (true) {
            kotlinx.coroutines.delay(5_000)
            mottoIndex = (mottoIndex + 1) % mottos.size
        }
    }
    val subtitle = if (page == AppPage.Home) {
        mottos[mottoIndex % mottos.size]
    } else "知习"
    Box(modifier = Modifier.fillMaxSize()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .then(if (backdrop != null) Modifier.layerBackdrop(backdrop) else Modifier),
        ) {
            RadarAmbientBackground()
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.TopCenter) {
                Box(modifier = Modifier.widthIn(max = contentCap).fillMaxWidth().fillMaxHeight()) {
                    // Content starts below the floating header; the bottom stays unpadded so
                    // lists can scroll under the glass navigation/dock and be refracted by them.
                    content(
                        androidx.compose.foundation.layout.PaddingValues(
                            start = railInset,
                            top = topInset + 88.dp,
                            bottom = 0.dp,
                        ),
                    )
                }
            }
        }
        GlassPanel(
            modifier = Modifier.align(Alignment.TopCenter).widthIn(max = chromeCap).fillMaxWidth().statusBarsPadding().padding(horizontal = 16.dp, vertical = 10.dp),
            tone = GlassTone.Neutral,
            effect = GlassEffect.Elevated,
            shape = RoundedCornerShape(24.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                if (!rootPage) {
                    GlassInlineAction(
                        label = "返回",
                        onClick = onBack,
                        content = { Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, modifier = Modifier.size(18.dp), tint = LiquidCyan) },
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Column(modifier = Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                    AnimatedContent(targetState = subtitle, label = "brandMotto") { text ->
                        Text(text, style = MaterialTheme.typography.labelMedium, color = LiquidTextSecondary)
                    }
                }
                if (page == AppPage.Home) {
                    // Header uses the same peach rounded square as the launcher icon.
                    Image(
                        painter = painterResource(R.drawable.ic_brand_square),
                        contentDescription = null,
                        modifier = Modifier.size(38.dp).clip(RoundedCornerShape(11.dp)),
                    )
                }
            }
        }
        if (rootPage) {
            if (useRail) {
                GlassNavRail(
                    page = page,
                    onPageChange = onPageChange,
                    modifier = Modifier.align(Alignment.CenterStart).statusBarsPadding().navigationBarsPadding().padding(start = 16.dp),
                )
            } else {
                GlassNavBar(
                    page = page,
                    onPageChange = onPageChange,
                    modifier = Modifier.align(Alignment.BottomCenter).fillMaxWidth().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 12.dp),
                )
            }
        }
        if (bottomOverlay != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .navigationBarsPadding()
                    .padding(start = railInset, bottom = if (useRail) 36.dp else 96.dp),
            ) { bottomOverlay() }
        }
    }
}

/**
 * Static warm ambient light fields behind the page content. They never sample the backdrop
 * (safe inside the recorded layer), keep the plain background from feeling sterile, and give
 * the floating glass chrome something subtle to refract.
 */
@Composable
private fun RadarAmbientBackground() {
    Canvas(modifier = Modifier.fillMaxSize()) {
        drawRect(
            Brush.verticalGradient(listOf(Color(0xFFFFF8F3), RadarBg, RadarBg)),
        )
        drawCircle(
            Brush.radialGradient(
                colors = listOf(RadarBrand.copy(alpha = 0.09f), Color.Transparent),
                center = Offset(size.width * 0.86f, size.height * 0.1f),
                radius = size.width * 0.75f,
            ),
        )
        drawCircle(
            Brush.radialGradient(
                colors = listOf(RadarWarn.copy(alpha = 0.06f), Color.Transparent),
                center = Offset(size.width * 0.08f, size.height * 0.52f),
                radius = size.width * 0.6f,
            ),
        )
        drawCircle(
            Brush.radialGradient(
                colors = listOf(RadarBrand.copy(alpha = 0.05f), Color.Transparent),
                center = Offset(size.width * 0.72f, size.height * 0.94f),
                radius = size.width * 0.65f,
            ),
        )
    }
}

/** Emphasized-decelerate page motion in the spirit of the 金标联盟 一镜到底 guidance:
 * chrome (header/nav) stays put for continuity while content glides in with a long soft
 * settle and the outgoing page exits quickly without fighting for attention. */
private val RootPageOrder = listOf(AppPage.Home, AppPage.Learning, AppPage.Review, AppPage.Settings)

private fun rootNavLabel(page: AppPage): String = when (page) {
    AppPage.Home -> "听课"
    AppPage.Learning -> "学习"
    AppPage.Review -> "复习"
    AppPage.Settings -> "设置"
    else -> page.title
}

private fun rootNavIcon(page: AppPage): androidx.compose.ui.graphics.vector.ImageVector = when (page) {
    AppPage.Home -> Icons.Outlined.Mic
    AppPage.Learning -> Icons.Outlined.MenuBook
    AppPage.Review -> Icons.Outlined.Style
    AppPage.Settings -> Icons.Outlined.Settings
    else -> Icons.Outlined.MenuBook
}
private val PageDecelerate = CubicBezierEasing(0.05f, 0.7f, 0.1f, 1f)

private fun AnimatedContentTransitionScope<AppPage>.pageTransition(): ContentTransform {
    val fromRoot = RootPageOrder.indexOf(initialState)
    val toRoot = RootPageOrder.indexOf(targetState)
    // Between root tabs, slide with the tab order; entering a detail page pushes from the
    // right, returning slides back from the left.
    val forward = if (fromRoot >= 0 && toRoot >= 0) toRoot > fromRoot else toRoot < 0
    val enter = fadeIn(tween(400, easing = PageDecelerate)) +
        slideInHorizontally(tween(400, easing = PageDecelerate)) { fullWidth -> if (forward) fullWidth / 5 else -fullWidth / 5 } +
        scaleIn(tween(400, easing = PageDecelerate), initialScale = 0.96f)
    val exit = fadeOut(tween(160)) +
        slideOutHorizontally(tween(200)) { fullWidth -> if (forward) -fullWidth / 12 else fullWidth / 12 }
    return enter.togetherWith(exit)
}

/** Bottom navigation with one draggable selection pill and one synchronized highlighted icon. */
@Composable
private fun GlassNavBar(page: AppPage, onPageChange: (AppPage) -> Unit, modifier: Modifier = Modifier) {
    GlassPanel(
        modifier = modifier,
        tone = GlassTone.Neutral,
        effect = GlassEffect.Elevated,
        shape = RoundedCornerShape(28.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(6.dp),
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxWidth()) {
            val pages = RootPageOrder
            val slotWidth = maxWidth / pages.size
            val selectedIndex = pages.indexOf(page).coerceAtLeast(0)
            val density = LocalDensity.current
            val slotWidthPx = with(density) { slotWidth.toPx() }
            val scope = rememberCoroutineScope()
            val pillX = remember { Animatable(0f) }
            var dragging by remember { mutableStateOf(false) }
            var previewIndex by remember { mutableStateOf(selectedIndex) }

            LaunchedEffect(selectedIndex, slotWidthPx) {
                if (!dragging) {
                    previewIndex = selectedIndex
                    pillX.animateTo(
                        slotWidthPx * selectedIndex,
                        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
                    )
                }
            }
            val pillScaleX by animateFloatAsState(
                targetValue = if (dragging) 1.08f else 1f,
                animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessHigh),
                label = "navPillSquash",
            )
            Box(
                modifier = Modifier.fillMaxWidth().pointerInput(slotWidthPx) {
                    detectHorizontalDragGestures(
                        onDragStart = {
                            dragging = true
                            scope.launch { pillX.stop() }
                        },
                        onHorizontalDrag = { change, dragAmount ->
                            change.consume()
                            val next = (pillX.value + dragAmount).coerceIn(0f, slotWidthPx * pages.lastIndex)
                            previewIndex = (next / slotWidthPx).roundToInt().coerceIn(0, pages.lastIndex)
                            scope.launch { pillX.snapTo(next) }
                        },
                        onDragEnd = {
                            val nearest = previewIndex.coerceIn(0, pages.lastIndex)
                            scope.launch {
                                try {
                                    pillX.animateTo(
                                        slotWidthPx * nearest,
                                        spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMediumLow),
                                    )
                                } finally {
                                    dragging = false
                                    onPageChange(pages[nearest])
                                }
                            }
                        },
                        onDragCancel = {
                            scope.launch {
                                pillX.animateTo(slotWidthPx * selectedIndex)
                                previewIndex = selectedIndex
                                dragging = false
                            }
                        },
                    )
                },
            ) {
                // A static translucent pill avoids refracting the navigation glyph a second time.
                GlassPanel(
                    modifier = Modifier
                        .offset { IntOffset(pillX.value.roundToInt(), 0) }
                        .padding(3.dp)
                        .size(width = slotWidth - 6.dp, height = 56.dp)
                        .graphicsLayer {
                            scaleX = pillScaleX
                            transformOrigin = TransformOrigin(0.5f, 0.5f)
                        },
                    tone = GlassTone.Accent,
                    effect = GlassEffect.Static,
                    shape = RoundedCornerShape(21.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
                ) {}
                Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    pages.forEachIndexed { index, targetPage ->
                        LiquidNavItem(
                            selected = previewIndex == index,
                            label = rootNavLabel(targetPage),
                            icon = rootNavIcon(targetPage),
                        ) { onPageChange(targetPage) }
                    }
                }
            }
        }
    }
}

/** Vertical glass navigation rail for medium/expanded widths (金标大屏形态). */
@Composable
private fun GlassNavRail(page: AppPage, onPageChange: (AppPage) -> Unit, modifier: Modifier = Modifier) {
    GlassPanel(
        modifier = modifier,
        tone = GlassTone.Neutral,
        effect = GlassEffect.Elevated,
        shape = RoundedCornerShape(28.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(8.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            RootPageOrder.forEach { targetPage ->
                RailNavItem(
                    selected = page == targetPage,
                    label = rootNavLabel(targetPage),
                    icon = rootNavIcon(targetPage),
                ) { onPageChange(targetPage) }
            }
        }
    }
}

@Composable
private fun RailNavItem(selected: Boolean, label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    val tint = if (selected) RadarBrandDeep else LiquidTextSecondary
    val inner: @Composable BoxScope.() -> Unit = {
        Column(
            modifier = Modifier.align(Alignment.Center),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Icon(icon, null, modifier = Modifier.size(22.dp), tint = tint)
            Text(label, style = MaterialTheme.typography.labelSmall, color = tint)
        }
    }
    if (selected) {
        // Selected slot gets the same brand-tinted glass droplet as the bottom bar's pill.
        GlassPanel(
            modifier = Modifier.width(76.dp).height(64.dp).clickable(onClick = onClick),
            tone = GlassTone.Accent,
            effect = GlassEffect.Soft,
            shape = RoundedCornerShape(20.dp),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
            content = inner,
        )
    } else {
        Box(
            modifier = Modifier.width(76.dp).height(64.dp).clip(RoundedCornerShape(20.dp)).clickable(onClick = onClick),
            content = inner,
        )
    }
}

@Composable
private fun RowScope.LiquidNavItem(selected: Boolean, label: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    Column(
        modifier = Modifier.weight(1f).clip(RoundedCornerShape(21.dp)).clickable(onClick = onClick).padding(vertical = 8.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Icon(icon, null, modifier = Modifier.size(20.dp), tint = if (selected) RadarBrandDeep else LiquidTextSecondary)
        Text(label, style = MaterialTheme.typography.labelSmall, color = if (selected) RadarBrandDeep else LiquidTextSecondary)
    }
}

@Composable
private fun HomeScreen(
    state: DashboardState,
    courses: List<CourseEntity>,
    selectedCourseId: Long?,
    onCourseSelected: (Long?) -> Unit,
    onOpenTimeline: () -> Unit,
    modifier: Modifier = Modifier,
    twoPane: Boolean = false,
) {
    // 录音中（含暂停）收窄关联卡与状态卡，把空间让给实时课堂记录。
    val liveMode = state.isRecording || state.isPaused
    // The list itself owns the bottom padding, so transcript cards slide under the glass
    // dock and navigation bar and are refracted by them as they pass.
    val bottomPad = if (LocalConfiguration.current.screenWidthDp >= 600) 148.dp else 208.dp
    if (twoPane) {
        // ≥840dp（平板/折叠展开/横屏）：转写左栏、提问右栏，一屏同时看两块，内容不拉伸。
        Row(modifier = modifier.fillMaxSize().padding(horizontal = 20.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(
                modifier = Modifier.weight(1f).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                RecordingCourseSelector(
                    courses = courses,
                    selectedCourseId = selectedCourseId,
                    onCourseSelected = onCourseSelected,
                    compact = liveMode,
                )
                StatusCard(state.isRecording, state.elapsedSeconds, state.isPaused, compact = liveMode)
                TranscriptCard(
                    transcript = state.transcript,
                    liveTranscript = state.liveTranscript,
                    liveTranslation = state.liveTranslation,
                    failureMessage = state.failureMessage,
                    translations = state.translations,
                    cloudMetrics = state.cloudMetrics,
                    expanded = liveMode,
                )
                Spacer(Modifier.height(bottomPad))
                state.liveMinutes?.let { LiveMinutesCard(it) }
            }
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = bottomPad),
            ) {
                item { QuestionSectionHeader(state, onOpenTimeline) }
                questionItems(state)
            }
        }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = bottomPad),
    ) {
        item {
            RecordingCourseSelector(
                courses = courses,
                selectedCourseId = selectedCourseId,
                onCourseSelected = onCourseSelected,
                compact = liveMode,
            )
        }
        item { StatusCard(state.isRecording, state.elapsedSeconds, state.isPaused, compact = liveMode) }
        item {
            TranscriptCard(
                transcript = state.transcript,
                liveTranscript = state.liveTranscript,
                liveTranslation = state.liveTranslation,
                failureMessage = state.failureMessage,
                translations = state.translations,
                cloudMetrics = state.cloudMetrics,
                expanded = liveMode,
            )
        }
        item { QuestionSectionHeader(state, onOpenTimeline) }
        state.liveMinutes?.let { minutes -> item { LiveMinutesCard(minutes) } }
        questionItems(state)
    }
}

@Composable
private fun QuestionSectionHeader(state: DashboardState, onOpenTimeline: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
        Text("我的疑问", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        GlassInlineAction(
            label = "历史",
            onClick = onOpenTimeline,
            enabled = state.activeSessionId != null,
            content = {
                Icon(
                    Icons.Outlined.Timeline,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp),
                    tint = if (state.activeSessionId != null) LiquidTextPrimary else LiquidTextSecondary.copy(alpha = 0.45f),
                )
            },
        )
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.questionItems(state: DashboardState) {
    if (state.doubts.isEmpty()) {
        item { EmptyQuestionCard() }
    } else {
        items(state.doubts, key = { it.id }) { doubt ->
            Box(modifier = Modifier.animateItem()) { DoubtPreviewCard(doubt) }
        }
    }
}

/** Floating controls: stop recording, mark a doubt, or pause/resume capture. */
@Composable
private fun HomeActionDock(
    state: DashboardState,
    onRecordingToggle: () -> Unit,
    onPauseToggle: () -> Unit,
    onMarkDoubt: () -> Unit,
    modifier: Modifier = Modifier,
) {
    GlassPanel(
        modifier = modifier,
        tone = GlassTone.Neutral,
        effect = GlassEffect.Elevated,
        shape = RoundedCornerShape(36.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 18.dp, vertical = 14.dp),
    ) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(20.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            DockRecordButton(recording = state.isRecording, onClick = onRecordingToggle)
            GlassPanel(
                modifier = Modifier.clip(RoundedCornerShape(16.dp)).clickable(onClick = onMarkDoubt),
                tone = GlassTone.Accent,
                effect = GlassEffect.Static,
                shape = RoundedCornerShape(16.dp),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 10.dp),
            ) {
                Text("标记疑问", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = RadarBrandDeep)
            }
            DockPauseButton(paused = state.isPaused, onClick = onPauseToggle)
        }
    }
}

/**
 * The dock's primary action: a solid gradient mic button (no text label — the glyph carries
 * the meaning). While recording it flips to a red stop square and breathes a sonar-style
 * halo ring, echoing the radar theme.
 */
@Composable
private fun DockRecordButton(recording: Boolean, onClick: () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (pressed) 0.9f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "dockRecordPress",
    )
    Box(contentAlignment = Alignment.Center) {
        if (recording) {
            val halo = rememberInfiniteTransition(label = "recordHalo")
            val haloProgress by halo.animateFloat(
                initialValue = 0f,
                targetValue = 1f,
                animationSpec = infiniteRepeatable(tween(1400, easing = LinearEasing), RepeatMode.Restart),
                label = "recordHaloProgress",
            )
            Box(
                modifier = Modifier
                    .size(64.dp)
                    .graphicsLayer {
                        val scale = 1f + haloProgress * 0.5f
                        scaleX = scale
                        scaleY = scale
                        alpha = (1f - haloProgress) * 0.55f
                    }
                    .border(2.dp, RadarAlert, CircleShape),
            )
        }
        Box(
            modifier = Modifier
                .graphicsLayer { scaleX = pressScale; scaleY = pressScale }
                .size(64.dp)
                .clip(CircleShape)
                .background(
                    Brush.verticalGradient(
                        if (recording) listOf(Color(0xFFFF8A75), RadarAlert)
                        else listOf(RadarBrand, RadarBrandDeep),
                    ),
                )
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClickLabel = if (recording) "停止记录" else "开始记录",
                    role = Role.Button,
                    onClick = onClick,
                ),
            contentAlignment = Alignment.Center,
        ) {
            if (recording) {
                Box(modifier = Modifier.size(20.dp).clip(RoundedCornerShape(6.dp)).background(Color.White))
            } else {
                Icon(Icons.Filled.Mic, contentDescription = null, modifier = Modifier.size(28.dp), tint = Color.White)
            }
        }
    }
}

/** Secondary dock action: small glass circle, icon only. */
@Composable
private fun DockPauseButton(paused: Boolean, onClick: () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()
    val pressScale by animateFloatAsState(
        targetValue = if (pressed) 0.88f else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "dockPausePress",
    )
    GlassPanel(
        modifier = Modifier
            .graphicsLayer { scaleX = pressScale; scaleY = pressScale }
            .size(50.dp)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClickLabel = if (paused) "继续录音" else "暂停录音",
                role = Role.Button,
                onClick = onClick,
            ),
        tone = GlassTone.Neutral,
        effect = GlassEffect.Soft,
        shape = CircleShape,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(0.dp),
    ) {
        AnimatedContent(
            targetState = paused,
            modifier = Modifier.align(Alignment.Center),
            transitionSpec = {
                (fadeIn(tween(170)) + scaleIn(tween(190), initialScale = 0.62f)) togetherWith
                    (fadeOut(tween(110)) + scaleOut(tween(130), targetScale = 0.62f))
            },
            contentAlignment = Alignment.Center,
            label = "pausePlayGlyph",
        ) { isPaused ->
            Icon(
                if (isPaused) Icons.Outlined.PlayArrow else Icons.Outlined.Pause,
                contentDescription = null,
                modifier = Modifier.size(21.dp),
                tint = RadarBrandDeep,
            )
        }
    }
}

@Composable
private fun StatusCard(recording: Boolean, seconds: Long, paused: Boolean = false, compact: Boolean = false) {
    GlassPanel(
        modifier = Modifier.fillMaxWidth(),
        tone = if (recording) GlassTone.AlertSoft else GlassTone.Neutral,
        effect = GlassEffect.Static,
        shape = RoundedCornerShape(if (compact) 14.dp else 18.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            horizontal = 16.dp,
            vertical = if (compact) 7.dp else 12.dp,
        ),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val foreground = if (recording) RadarAlert else LiquidTextPrimary
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(9.dp)) {
                if (compact) {
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background(foreground))
                } else {
                    val pulse = rememberInfiniteTransition(label = "recordDot")
                    val dotAlpha by pulse.animateFloat(
                        initialValue = 1f,
                        targetValue = 0.3f,
                        animationSpec = infiniteRepeatable(tween(850), RepeatMode.Reverse),
                        label = "recordDotAlpha",
                    )
                    Box(modifier = Modifier.size(8.dp).clip(CircleShape).background((if (recording) RadarAlert else LiquidTextPrimary).copy(alpha = if (recording) dotAlpha else 1f)))
                }
                Text(
                    if (paused) "已暂停" else if (recording) "正在录音" else "准备开始",
                    style = if (compact) MaterialTheme.typography.labelLarge else MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = foreground,
                )
            }
            if (recording) {
                Text(
                    formatDuration(seconds),
                    style = if (compact) MaterialTheme.typography.labelLarge else MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = foreground,
                )
            }
        }
    }
}

@Composable
private fun PrivacyBadge() {
    GlassPanel(
        tone = GlassTone.Neutral,
        shape = RoundedCornerShape(16.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Icon(Icons.Outlined.Lock, null, modifier = Modifier.size(16.dp), tint = LiquidCyan)
            Text("设备端识别 · AI 需明确授权", style = MaterialTheme.typography.labelMedium, color = LiquidTextSecondary)
        }
    }
}

@Composable
private fun TranscriptCard(
    transcript: List<TranscriptLineEntity>,
    translations: Map<Long, TranslationEntity>,
    liveTranscript: String,
    failureMessage: String?,
    cloudMetrics: RecorderDashboardMetrics? = null,
    liveTranslation: String? = null,
    expanded: Boolean = false,
) {
    // While recording/paused the transcript owns most of the screen; idle keeps the compact card.
    val viewportHeight = if (expanded) {
        (LocalConfiguration.current.screenHeightDp * 0.48f).coerceIn(320f, 560f).dp
    } else {
        236.dp
    }
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
        Column(modifier = Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Outlined.Mic, null, modifier = Modifier.size(20.dp), tint = RadarBrand)
                Spacer(Modifier.width(8.dp))
                Text("实时课堂记录", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
                cloudMetrics?.let { metrics ->
                    Spacer(Modifier.weight(1f))
                    // Same figures the official client quotes: ~0.28s first word, ~88ms behind for translation.
                    Text(
                        buildString {
                            append("首字 ~")
                            append(String.format(java.util.Locale.US, "%.2fs", metrics.recognitionLatencyMs / 1000.0))
                            metrics.translationLatencyMs?.let {
                                append(" · 译 ~")
                                append(String.format(java.util.Locale.US, "%.2fs", it / 1000.0))
                            }
                        },
                        style = MaterialTheme.typography.labelMedium,
                        color = LiquidTextSecondary,
                    )
                }
            }
            // Fixed-height scrollable region: new text sticks to the bottom, the user can
            // scroll up to read earlier lines without the card growing taller.
            val scrollState = rememberScrollState()
            LaunchedEffect(transcript.size, liveTranscript.length) {
                scrollState.animateScrollTo(scrollState.maxValue)
            }
            Column(
                modifier = Modifier.fillMaxWidth().height(viewportHeight).verticalScroll(scrollState),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                if (transcript.isEmpty() && liveTranscript.isEmpty()) {
                    Text("转写内容会实时显示在这里", color = LiquidTextSecondary)
                } else {
                    transcript.takeLast(30).forEach { line ->
                        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) {
                            if (line.speaker != null) Text(line.speaker, style = MaterialTheme.typography.labelMedium, color = RadarBrandDeep)
                            Text(line.text, color = LiquidTextPrimary)
                            val translation = translations[line.id]
                            if (translation != null) {
                                Text(
                                    when {
                                        translation.translatedText.isNotBlank() -> translation.translatedText
                                        translation.status == TranslationEntity.STATUS_FAILED -> "翻译失败，可稍后重试"
                                        else -> "正在翻译…"
                                    },
                                    style = MaterialTheme.typography.bodySmall,
                                    color = if (translation.status == TranslationEntity.STATUS_FAILED) RadarAlert else LiquidTextSecondary,
                                )
                            }
                        }
                    }
                    if (liveTranscript.isNotEmpty()) {
                        GlassPanel(
                            modifier = Modifier.animateContentSize(),
                            tone = GlassTone.Accent,
                            effect = GlassEffect.Static,
                            shape = RoundedCornerShape(18.dp),
                            contentPadding = androidx.compose.foundation.layout.PaddingValues(12.dp),
                        ) {
                            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                                Text(
                                    "正在识别  $liveTranscript",
                                    color = LiquidTextPrimary,
                                    maxLines = 8,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                // Streaming translation preview, like the official bilingual subtitle.
                                if (!liveTranslation.isNullOrBlank()) {
                                    Text(
                                        "译  $liveTranslation",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = LiquidTextSecondary,
                                        maxLines = 4,
                                        overflow = TextOverflow.Ellipsis,
                                    )
                                }
                            }
                        }
                    }
                }
            }
            if (failureMessage != null) Text(failureMessage, color = LiquidTextPrimary, fontWeight = FontWeight.SemiBold)
        }
    }
}

/** Website-style <mark>: trigger words get a soft yellow chip with deep-brand text. */
private fun highlightTriggers(text: String, triggerWords: Set<String>): AnnotatedString {
    if (triggerWords.isEmpty() || text.isEmpty()) return AnnotatedString(text)
    val matches = mutableListOf<IntRange>()
    triggerWords.forEach { word ->
        if (word.isBlank()) return@forEach
        var index = text.indexOf(word)
        while (index >= 0) {
            matches.add(index until index + word.length)
            index = text.indexOf(word, index + word.length)
        }
    }
    if (matches.isEmpty()) return AnnotatedString(text)
    // Merge overlapping ranges so longer built-in phrases win over their own substrings.
    val merged = matches.sortedBy { it.first }.fold(mutableListOf<IntRange>()) { acc, range ->
        val last = acc.lastOrNull()
        if (last != null && range.first <= last.last) {
            acc[acc.lastIndex] = last.first..maxOf(last.last, range.last)
        } else {
            acc.add(range)
        }
        acc
    }
    return buildAnnotatedString {
        append(text)
        merged.forEach { range ->
            addStyle(
                SpanStyle(background = RadarWarnSoft, color = RadarBrandDeep, fontWeight = FontWeight.Bold),
                range.first,
                range.last + 1,
            )
        }
    }
}

@Composable
private fun DoubtPreviewCard(doubt: DoubtEventEntity) {
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text("${formatClock(doubt.timestampMillis)} · 我的疑问", fontWeight = FontWeight.Bold, color = RadarBrandDeep)
            Text(doubt.sourceText, color = LiquidTextPrimary)
            if (doubt.note.isNotBlank()) Text("备注：${doubt.note}", color = LiquidTextSecondary)
        }
    }
}

@Composable
private fun EmptyQuestionCard() {
    GlassPanel(modifier = Modifier.fillMaxWidth().heightIn(min = 84.dp), tone = GlassTone.Neutral, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
        Column(modifier = Modifier.align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(7.dp)) {
            Icon(Icons.Outlined.Timeline, null, tint = LiquidTextSecondary)
            Text("点击“标记疑问”，记录还没听懂的地方", color = LiquidTextSecondary)
        }
    }
}

@Composable
private fun QuestionPreviewCard(question: QuestionDetector.DetectionResult) {
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Icon(Icons.Outlined.WarningAmber, null, tint = RadarAlert)
                Spacer(Modifier.width(10.dp))
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("❓ ${formatClock(question.timestampMillis)} · 课堂提问", fontWeight = FontWeight.Bold, color = RadarAlert)
                    question.matchedTrigger?.let { Text("检测到“$it”", color = LiquidTextSecondary) }
                    Text("问题回溯：${question.question}", maxLines = 3, overflow = TextOverflow.Ellipsis, color = LiquidTextPrimary)
                }
            }
            QuestionAiActions(question.question)
        }
    }
}

/** AI 接力：复制问题或经透明中转直接跳豆包 / DeepSeek（未安装时 Toast 兜底）。 */
@Composable
private fun QuestionAiActions(question: String) {
    val context = LocalContext.current
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AiActionChip("复制") {
            launchQuestionAction(context, QuestionActionActivity.ACTION_COPY, question)
        }
        AiActionChip("问豆包") {
            launchQuestionAction(context, QuestionActionActivity.ACTION_OPEN_DOUBAO, question)
        }
        AiActionChip("问 DeepSeek") {
            launchQuestionAction(context, QuestionActionActivity.ACTION_OPEN_DEEPSEEK, question)
        }
    }
}

@Composable
private fun AiActionChip(label: String, onClick: () -> Unit) {
    GlassPanel(
        modifier = Modifier.clickable(onClick = onClick),
        tone = GlassTone.Accent,
        effect = GlassEffect.Static,
        shape = RoundedCornerShape(14.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 12.dp, vertical = 6.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = RadarBrandDeep)
    }
}

private fun launchQuestionAction(context: Context, action: String, question: String) {
    runCatching {
        context.startActivity(
            Intent(context, QuestionActionActivity::class.java)
                .setAction(action)
                .putExtra(QuestionActionActivity.EXTRA_QUESTION, question)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun HistoryScreen(
    sessions: List<SessionSummary>,
    selecting: Boolean,
    selectedIds: Set<Long>,
    onSelectingChange: (Boolean) -> Unit,
    onSelectionChange: (Set<Long>) -> Unit,
    onOpenSession: (Long) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (sessions.isEmpty()) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            GlassPanel(tone = GlassTone.Neutral, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
                Text("还没有已保存的课堂记录", color = LiquidTextSecondary)
            }
        }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 104.dp),
    ) {
        item {
            if (selecting) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        "已选 ${selectedIds.size} / ${sessions.size} 项",
                        color = LiquidTextPrimary,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.weight(1f),
                    )
                    val allSelected = selectedIds.size == sessions.size
                    Text(
                        text = if (allSelected) "取消全选" else "全选",
                        color = RadarBrandDeep,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier
                            .clickable {
                                onSelectionChange(if (allSelected) emptySet() else sessions.mapTo(mutableSetOf()) { it.id })
                            }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = "退出",
                        color = LiquidTextSecondary,
                        modifier = Modifier
                            .clickable { onSelectingChange(false) }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            } else {
                Text("每节课均只保存在本机，长按可批量删除。", color = LiquidTextSecondary, modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp))
            }
        }
        items(sessions, key = { it.id }) { session ->
            val selected = session.id in selectedIds
            GlassPanel(
                modifier = Modifier
                    .fillMaxWidth()
                    .combinedClickable(
                        onClick = {
                            if (selecting) {
                                onSelectionChange(if (selected) selectedIds - session.id else selectedIds + session.id)
                            } else {
                                onOpenSession(session.id)
                            }
                        },
                        onLongClick = {
                            if (!selecting) {
                                onSelectingChange(true)
                                onSelectionChange(setOf(session.id))
                            }
                        },
                    ),
                tone = if (selected) GlassTone.Accent else GlassTone.Neutral,
                effect = GlassEffect.Static,
                shape = RoundedCornerShape(24.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (selecting) {
                        Box(
                            modifier = Modifier
                                .size(24.dp)
                                .clip(CircleShape)
                                .then(
                                    if (selected) Modifier.background(RadarBrand)
                                    else Modifier.border(2.dp, LiquidTextSecondary.copy(alpha = 0.5f), CircleShape),
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            if (selected) {
                                Text("✓", color = Color.White, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold)
                            }
                        }
                        Spacer(Modifier.width(12.dp))
                    }
                    Box(
                        modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(RadarBrandSoft).padding(horizontal = 10.dp, vertical = 8.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text("${session.doubtCount}疑", fontWeight = FontWeight.Bold, color = RadarBrandDeep)
                    }
                    Spacer(Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                        Text(session.title, fontWeight = FontWeight.Bold, color = LiquidTextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Text("${formatDateTime(session.startedAtMillis)} · ${formatSessionDuration(session)}", style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
                        if (session.audioRelativePath != null) {
                            Text("已保存私有录音", style = MaterialTheme.typography.labelMedium, color = RadarBrandDeep)
                        }
                    }
                    if (!selecting) {
                        Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, modifier = Modifier.size(16.dp).rotate(180f), tint = LiquidTextSecondary)
                    }
                }
            }
        }
        item { Spacer(Modifier.height(18.dp)) }
    }
}

@Composable
private fun TimelineScreen(detail: SessionDetailState, modifier: Modifier = Modifier) {
    val session = detail.session
    if (session == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("正在加载记录…", color = LiquidTextSecondary) }
        return
    }
    if (detail.questions.isEmpty()) {
        Box(modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
            Text("这节课没有捕捉到提问", color = LiquidTextSecondary)
        }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(session.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text("${formatDateTime(session.startedAtMillis)} · 共 ${detail.questions.size} 次提问", style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
                }
                Box(
                    modifier = Modifier.clip(RoundedCornerShape(12.dp)).background(RadarBrandSoft).padding(horizontal = 10.dp, vertical = 6.dp),
                ) {
                    Text("已捕捉 ${detail.questions.size}", style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.Bold, color = RadarBrandDeep)
                }
            }
        }
        items(detail.questions.size) { index ->
            val event = detail.questions[index]
            val isLatest = index == 0
            var expanded by remember(event.id) { mutableStateOf(false) }
            GlassPanel(
                modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
                tone = if (isLatest) GlassTone.Warning else GlassTone.Neutral,
                effect = GlassEffect.Static,
                shape = RoundedCornerShape(24.dp),
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("❓ ${formatClock(event.timestampMillis)} · 问题回溯", fontWeight = FontWeight.Bold, color = RadarAlert)
                        if (isLatest) {
                            Spacer(Modifier.width(8.dp))
                            Box(
                                modifier = Modifier.clip(RoundedCornerShape(8.dp)).background(RadarBrand).padding(horizontal = 6.dp, vertical = 2.dp),
                            ) {
                                Text("最新", style = MaterialTheme.typography.labelSmall, color = Color.White)
                            }
                        }
                    }
                    event.matchedTrigger?.let { Text("预警触发词：“$it”", color = LiquidTextSecondary) }
                    Text(event.question, style = MaterialTheme.typography.titleMedium, color = LiquidTextPrimary)
                    QuestionAiActions(event.question)
                    Text(if (expanded) "收起上下文" else "点击回看上下文 ±3 句", color = RadarBrandDeep)
                    if (expanded) {
                        HorizontalDivider()
                        contextLines(detail.transcript, event).forEach { line ->
                            val highlight = line.text == event.sourceLine
                            Text(
                                text = line.text,
                                color = if (highlight) LiquidTextPrimary else LiquidTextSecondary,
                                fontWeight = if (highlight) FontWeight.SemiBold else FontWeight.Normal,
                            )
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(18.dp)) }
    }
}

@Composable
private fun SessionDetailScreen(
    detail: SessionDetailState,
    isActiveRecording: Boolean,
    onOpenTimeline: () -> Unit,
    onExportMarkdown: () -> Unit,
    onExportText: () -> Unit,
    onAnalyze: () -> Unit,
    onMarkDoubt: () -> Unit,
    analysisMessage: String?,
    onConsumeAnalysisMessage: () -> Unit,
    onRename: (String) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var showDeleteConfirmation by remember(detail.session?.id) { mutableStateOf(false) }
    var editingTitle by remember(detail.session?.id) { mutableStateOf<String?>(null) }
    if (showDeleteConfirmation) {
        GlassConfirmDialog(
            title = "删除这节课？",
            message = "转写、提问和可选的私有录音都会删除，无法恢复。",
            confirmLabel = "删除",
            dismissLabel = "取消",
            onConfirm = { showDeleteConfirmation = false; onDelete() },
            onDismiss = { showDeleteConfirmation = false },
            tone = GlassTone.Danger,
        )
    }
    val session = detail.session
    if (session == null) {
        Box(modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("正在加载记录…", color = LiquidTextSecondary) }
        return
    }
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 16.dp),
    ) {
        detail.liveMinutes?.let { minutes -> item { LiveMinutesCard(minutes) } }
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    val editing = editingTitle
                    if (editing != null) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            GlassTextInput(
                                value = editing,
                                onValueChange = { editingTitle = it },
                                label = "课程名称",
                                modifier = Modifier.weight(1f),
                            )
                            Spacer(Modifier.width(8.dp))
                            GlassRoundIconAction(
                                icon = Icons.Outlined.Add,
                                contentDescription = "保存名称",
                                onClick = { onRename(editing); editingTitle = null },
                                enabled = editing.isNotBlank(),
                            )
                        }
                    } else {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                session.title,
                                modifier = Modifier.weight(1f).clickable { editingTitle = session.title },
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = LiquidTextPrimary,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            GlassInlineAction(
                                label = "重命名",
                                onClick = { editingTitle = session.title },
                                content = {
                                    Icon(Icons.Outlined.Description, null, modifier = Modifier.size(16.dp), tint = RadarBrandDeep)
                                },
                            )
                        }
                    }
                    Text("${formatDateTime(session.startedAtMillis)} · ${formatSessionDuration(session)} · ${detail.doubts.size} 个疑问", color = LiquidTextSecondary)
                    if (session.audioRelativePath != null) Text("原始录音已保存在应用私有目录", color = LiquidTextPrimary)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                GlassTextAction("提问时间轴", onOpenTimeline, Modifier.weight(1f), Icons.Outlined.Timeline)
                GlassTextAction("导出 MD", onExportMarkdown, Modifier.weight(1f), Icons.Outlined.FileDownload)
            }
        }
        item {
            GlassTextAction("导出 TXT", onExportText, Modifier.fillMaxWidth(), Icons.Outlined.Description)
        }
        item {
            GlassTextAction("标记疑问", onMarkDoubt, Modifier.fillMaxWidth(), Icons.Outlined.Lightbulb)
        }
        item {
            GlassTextAction("生成 AI 课后学习包", onAnalyze, Modifier.fillMaxWidth(), Icons.Outlined.Lightbulb, tone = GlassTone.Success, enabled = !isActiveRecording)
        }
        analysisMessage?.let { message ->
            item { GlassTextAction(message, onConsumeAnalysisMessage, Modifier.fillMaxWidth()) }
        }
        if (detail.doubts.isNotEmpty()) {
            item { Text("我的疑问", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary) }
            items(detail.doubts, key = { "doubt-${it.id}" }) { doubt ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text(doubt.sourceText, color = LiquidTextPrimary)
                    if (doubt.note.isNotBlank()) Text("备注：${doubt.note}", color = LiquidTextSecondary)
                }
            }
        }
        item { Text("转写全文", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary) }
        if (detail.transcript.isEmpty()) {
            item { Text("本节课还没有定稿转写。", color = LiquidTextSecondary) }
        } else {
            val questionSourceLines = detail.questions.map { it.sourceLine }.toSet()
            items(detail.transcript, key = { "transcript-${it.id}" }) { line ->
                val highlighted = line.text in questionSourceLines
                Column(
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(
                        if (highlighted) RadarWarnSoft else Color.Transparent,
                    ).padding(if (highlighted) 9.dp else 4.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(line.text, color = if (highlighted) LiquidTextPrimary else LiquidTextSecondary)
                    detail.translations[line.id]?.translatedText?.takeIf { it.isNotBlank() }?.let {
                        Text(it, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
                    }
                }
            }
        }
        item {
            GlassTextAction(
                label = if (isActiveRecording) "录音中无法删除" else "删除本节记录",
                onClick = { showDeleteConfirmation = true },
                modifier = Modifier.fillMaxWidth(),
                icon = Icons.Outlined.DeleteOutline,
                tone = GlassTone.Danger,
                enabled = !isActiveRecording,
            )
            Spacer(Modifier.height(18.dp))
        }
    }
}

@Composable
private fun SettingsScreen(
    state: SettingsState,
    onSaveAudioChanged: (Boolean) -> Unit,
    onTranslationChanged: (Boolean) -> Unit,
    onCloudListeningChanged: (Boolean) -> Unit,
    onForceOfflineChanged: (Boolean) -> Unit,
    onAutoOfflineChanged: (Boolean) -> Unit,
    onOfflineFirstChanged: (Boolean) -> Unit,
    onAutoCloudSyncChanged: (Boolean) -> Unit,
    onOpenCloudListening: () -> Unit,
    onOpenCloudAudio: () -> Unit,
    onOpenBatterySettings: () -> Unit,
    onOpenNotificationSettings: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onDownloadModels: () -> Unit,
    onRestoreModels: () -> Unit,
    onUninstallModels: () -> Unit,
    aiServiceStatus: String,
    aiServiceUrl: String,
    onSaveAiServiceUrl: (String) -> Unit,
    onCheckAiService: () -> Unit,
    accountStatus: AccountStatusDto?,
    accountSupported: Boolean,
    accountBusy: Boolean,
    accountMessage: String?,
    accountCodeCooldownUntilMs: Long,
    onRequestCode: (String) -> Unit,
    onActivateAccount: (String, String?) -> Unit,
    onRefreshAccount: () -> Unit,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 104.dp),
    ) {
        // ---------- 我的：账号与额度 ----------
        item { Text("我的", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary) }
        item {
            AccountSettingsCard(
                status = accountStatus,
                supported = accountSupported,
                busy = accountBusy,
                message = accountMessage,
                codeCooldownUntilMs = accountCodeCooldownUntilMs,
                onRequestCode = onRequestCode,
                onActivate = onActivateAccount,
                onRefresh = onRefreshAccount,
            )
        }
        // 正式版地址由 BuildConfig 注入生产网关，普通用户无需也不应改地址；
        // 仅 debug 构建保留调试入口（本地假网关联调用）。
        if (BuildConfig.DEBUG) {
            item { Text("AI 服务连接", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, color = LiquidTextPrimary) }
            item {
                GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
                    var editedUrl by remember(aiServiceUrl) { mutableStateOf(aiServiceUrl) }
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        GlassTextInput(editedUrl, { editedUrl = it }, "AI 服务地址")
                        Text(
                            if (BuildConfig.DEBUG) {
                                "电脑模拟器填 http://10.0.2.2:8765；真机填电脑局域网地址或已部署的 HTTPS 地址。"
                            } else {
                                "正式版本仅允许 HTTPS。地址不能包含账号、密码或查询参数。"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = LiquidTextSecondary,
                        )
                        GlassTextAction("保存地址并检查", { onSaveAiServiceUrl(editedUrl) }, Modifier.fillMaxWidth(), Icons.Outlined.Settings)
                        GlassTextAction("重新检查后端状态", onCheckAiService, Modifier.fillMaxWidth(), Icons.Outlined.Lightbulb)
                        Text(aiServiceStatus, color = LiquidTextSecondary)
                    }
                }
            }
        }

        // ---------- 课堂与翻译 ----------
        item { Text("课堂与翻译", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = LiquidTextPrimary) }
        item {
            SettingRow(
                "实时翻译",
                "定稿字幕发送给 AI 翻译；原文和录音不受网络影响",
                state.translationEnabled,
                onTranslationChanged,
                Icons.AutoMirrored.Outlined.VolumeUp,
            )
        }
        item {
            SettingRow(
                "云端听课",
                "双语字幕、说话人与课堂纪要 · 音频按时长计费",
                state.cloudListeningEnabled,
                { enabled ->
                    if (enabled && !state.cloudNoticeAccepted) onCloudListeningChanged(true)
                    else onCloudListeningChanged(enabled)
                },
                Icons.AutoMirrored.Outlined.VolumeUp,
            )
        }
        item { GlassTextAction("双语、纪要与术语设置", onOpenCloudListening, Modifier.fillMaxWidth(), Icons.Outlined.Settings) }
        item { GlassTextAction("导入音频，整理成课堂记录", onOpenCloudAudio, Modifier.fillMaxWidth(), Icons.Outlined.FileDownload) }
        item {
            OfflineModeCard(
                state = state,
                onForceOfflineChanged = onForceOfflineChanged,
                onAutoOfflineChanged = onAutoOfflineChanged,
                onOfflineFirstChanged = onOfflineFirstChanged,
                onDownloadModels = onDownloadModels,
                onRestoreModels = onRestoreModels,
                onUninstallModels = onUninstallModels,
            )
        }
        // ---------- 使用与隐私（橙色，置底） ----------
        item { Text("使用与隐私", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = RadarBrandDeep) }
        item {
            GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Accent, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    ToggleRow("保存原始录音", "默认关闭；开启后仅保存到应用私有目录", state.saveAudioEnabled, onSaveAudioChanged)
                    ToggleRow(
                        "自动同步到云端",
                        "本地或离线课堂结束后，联网自动上传录音重新转写；按录音时长扣除音频配额，配额不足时本地保留并稍后重试",
                        state.autoCloudSync,
                        onAutoCloudSyncChanged,
                    )
                    GlassDivider()
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(Icons.Outlined.PrivacyTip, null, tint = LiquidCyan)
                        Spacer(Modifier.width(10.dp))
                        Text("录音与转写默认只保存在本机。只有主动生成 AI 学习包或开启自动同步时，才会发送你选择的讲义、字幕文本或录音；原始录音默认不上传。", color = LiquidTextSecondary)
                    }
                    PrivacyLinkRow("隐私说明", onOpenPrivacyPolicy)
                    PrivacyLinkRow("隐私政策", onOpenPrivacyPolicy)
                    GlassDivider()
                    GlassTextAction("打开系统电池优化设置", onOpenBatterySettings, Modifier.fillMaxWidth(), Icons.Outlined.BatteryChargingFull)
                    GlassTextAction("打开实时通知设置", onOpenNotificationSettings, Modifier.fillMaxWidth(), Icons.Outlined.NotificationsActive)
                    Text(
                        "录音时请保持前台服务通知可见；部分国产系统还需要在系统设置中允许自启动或取消电池限制。",
                        style = MaterialTheme.typography.bodySmall,
                        color = LiquidTextSecondary,
                    )
                }
            }
        }
        item {
            val context = LocalContext.current
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text("知习 v2.0.6 · 离线识别 + AI 学习包", color = LiquidTextSecondary)
                Text("包含 sherpa-onnx 与 Silero VAD 等开源组件，详情见应用随附的第三方声明。", color = LiquidTextSecondary)
                GlassTextAction(
                    "访问官网",
                    { openWebsite(context) },
                    Modifier.fillMaxWidth(),
                    Icons.Outlined.Description,
                )
            }
        }
        item { Spacer(Modifier.height(18.dp)) }
    }
}

@Composable
private fun SettingRow(
    title: String,
    supporting: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
) {
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static, shape = RoundedCornerShape(24.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            icon?.let {
                Icon(it, null, tint = LiquidCyan)
                Spacer(Modifier.width(12.dp))
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold, color = LiquidTextPrimary)
                Text(supporting, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
            }
            GlassToggle(
                checked = checked,
                onCheckedChange = onCheckedChange,
                label = title,
            )
        }
    }
}

@Composable
private fun GlassDivider() = Box(
    modifier = Modifier.fillMaxWidth().height(1.dp).background(LiquidTextSecondary.copy(alpha = 0.24f)),
)

/** Panel-free toggle row used inside grouped cards (offline mode / privacy board). */
@Composable
private fun ToggleRow(
    title: String,
    supporting: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    enabled: Boolean = true,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(
                title,
                fontWeight = FontWeight.SemiBold,
                color = if (enabled) LiquidTextPrimary else LiquidTextSecondary,
            )
            Text(supporting, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
        }
        Spacer(Modifier.width(10.dp))
        GlassToggle(checked = checked, onCheckedChange = onCheckedChange, label = title, enabled = enabled)
    }
}

@Composable
private fun PrivacyLinkRow(label: String, onOpen: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onOpen)
            .padding(vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.PrivacyTip, null, modifier = Modifier.size(18.dp), tint = RadarBrandDeep)
        Spacer(Modifier.width(8.dp))
        Text(label, fontWeight = FontWeight.SemiBold, color = RadarBrandDeep)
        Spacer(Modifier.weight(1f))
        Icon(Icons.AutoMirrored.Outlined.ArrowBack, null, modifier = Modifier.size(16.dp).rotate(180f), tint = RadarBrandDeep)
    }
}

/** 离线模式卡片：说明 + 三开关 + 离线模型（可展开管理）。 */
@Composable
private fun OfflineModeCard(
    state: SettingsState,
    onForceOfflineChanged: (Boolean) -> Unit,
    onAutoOfflineChanged: (Boolean) -> Unit,
    onOfflineFirstChanged: (Boolean) -> Unit,
    onDownloadModels: () -> Unit,
    onRestoreModels: () -> Unit,
    onUninstallModels: () -> Unit,
) {
    var showModels by remember { mutableStateOf(false) }
    GlassPanel(modifier = Modifier.fillMaxWidth(), tone = GlassTone.Neutral, effect = GlassEffect.Static) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Icon(Icons.Outlined.Lock, null, tint = RadarBrandDeep)
                Text("离线模式", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = LiquidTextPrimary)
            }
            Text(
                "断网时手机本地模型继续转录和翻译；联网后自动同步到云端。同步会按录音时长扣除音频配额；配额不足时本地保留，充值后自动重试。",
                style = MaterialTheme.typography.bodySmall,
                color = LiquidTextSecondary,
            )
            GlassDivider()
            ToggleRow(
                "强制离线录音",
                "开启后点击录音将全程使用本地转录，不连接云端，结束后联网自动同步。",
                state.forceOfflineRecording,
                onForceOfflineChanged,
            )
            ToggleRow(
                "断网时自动开启离线转录",
                "录音中断网后不再询问，直接用本地模型继续出字幕。本地转录更耗电、机身会发热。",
                state.autoOfflineOnNetworkLoss,
                onAutoOfflineChanged,
            )
            ToggleRow(
                "极速启动（offline-first）",
                "点击录音后立即用本地模型出字，云端连接成功后无感切换。关闭则等待云端就绪后才开始转录。",
                state.offlineFirstStart,
                onOfflineFirstChanged,
            )
            GlassDivider()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .clickable { showModels = !showModels }
                    .padding(vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("离线模型", fontWeight = FontWeight.SemiBold, color = LiquidTextPrimary)
                    Text(state.modelStatusText, style = MaterialTheme.typography.bodySmall, color = LiquidTextSecondary)
                }
                Text(if (showModels) "收起" else "管理", style = MaterialTheme.typography.labelLarge, color = RadarBrandDeep)
                Icon(
                    Icons.AutoMirrored.Outlined.ArrowBack,
                    null,
                    modifier = Modifier
                        .size(16.dp)
                        .rotate(if (showModels) 90f else 180f)
                        .padding(start = 2.dp),
                    tint = RadarBrandDeep,
                )
            }
            if (showModels) {
                Text(
                    "转录模型与翻译语言包；下载优先尝试知习国内高速镜像，网络异常时回退 sherpa-onnx 官方源，压缩包与全部模型文件均校验 SHA-256。",
                    style = MaterialTheme.typography.bodySmall,
                    color = LiquidTextSecondary,
                )
                state.modelDownloadProgress?.let { progress ->
                    Text(
                        when (progress.stage) {
                            ModelDownloadStage.DOWNLOADING -> "${progress.label} · 第 ${progress.packageIndex}/${progress.packageCount} 个"
                            ModelDownloadStage.EXTRACTING -> "正在解压 ${progress.label}…"
                            ModelDownloadStage.VERIFYING -> "正在校验模型文件与 SHA-256…"
                            ModelDownloadStage.ACTIVATING -> "正在启用已校验模型…"
                        },
                        color = RadarBrandDeep,
                    )
                    val fraction = progress.fraction
                    if (fraction != null) {
                        LinearProgressIndicator(progress = { fraction }, modifier = Modifier.fillMaxWidth(), color = RadarBrand)
                    } else {
                        LinearProgressIndicator(modifier = Modifier.fillMaxWidth(), color = RadarBrand)
                    }
                    if (progress.stage == ModelDownloadStage.DOWNLOADING) {
                        Text(
                            buildString {
                                append("已下载 ")
                                append(formatModelBytes(progress.downloadedBytes))
                                progress.totalBytes?.let { total ->
                                    append(" / ")
                                    append(formatModelBytes(total))
                                }
                                fraction?.let {
                                    append(" · ")
                                    append((it * 100).roundToInt())
                                    append('%')
                                }
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = LiquidTextSecondary,
                        )
                    }
                }
                state.modelDownloadMessage?.let { message ->
                    Text(message, color = if (message.startsWith("下载失败")) RadarAlert else RadarBrandDeep)
                }
                GlassTextAction(
                    if (state.modelDownloadInProgress) "正在下载模型" else "下载/更新模型",
                    onDownloadModels,
                    Modifier.fillMaxWidth(),
                    enabled = !state.modelDownloadInProgress,
                )
                if (state.modelCanRestore) {
                    GlassTextAction("从回收站恢复模型", onRestoreModels, Modifier.fillMaxWidth(), enabled = !state.modelDownloadInProgress)
                }
                GlassTextAction(
                    "卸载模型（移入回收站）",
                    onUninstallModels,
                    Modifier.fillMaxWidth(),
                    enabled = state.modelCanUninstall && !state.modelDownloadInProgress,
                )
                Text(
                    "卸载只处理模型文件，不删除课堂、讲义或复习数据；需要时可恢复或重新下载。",
                    style = MaterialTheme.typography.bodySmall,
                    color = LiquidTextSecondary,
                )
            }
        }
    }
}

@Composable
private fun CrashReportDialog(report: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    GlassConfirmDialog(
        title = "上次异常退出",
        message = "应用上次运行时遇到了错误并已记录到本机。如愿意排查，可将日志复制后发给开发者。",
        confirmLabel = "复制日志",
        dismissLabel = "知道了",
        onConfirm = {
            val clipboard = context.getSystemService(android.content.ClipboardManager::class.java)
            clipboard?.setPrimaryClip(android.content.ClipData.newPlainText("知习崩溃日志", report))
            android.widget.Toast.makeText(context, "日志已复制", android.widget.Toast.LENGTH_SHORT).show()
            onDismiss()
        },
        onDismiss = onDismiss,
        tone = GlassTone.Danger,
    )
}

@Composable
private fun UsageNotice(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    GlassConfirmDialog(
        title = "使用提示",
        message = "本应用仅供个人学习记录使用，请在获得许可后录音，勿传播课堂录音与转写。录音和转写默认在本机完成；主动使用 AI 学习包时，仅发送你确认的讲义或字幕文本。",
        confirmLabel = "同意并继续",
        dismissLabel = "暂不使用",
        onConfirm = onConfirm,
        onDismiss = onDismiss,
    )
}

@Composable
private fun RealtimeNotificationRequired(onOpenSettings: () -> Unit, onDismiss: () -> Unit) {
    GlassConfirmDialog(
        title = "需要开启实时通知",
        message = "录音期间需要显示前台实时通知，才能在通知栏持续显示计时、转写和停止按钮。请在系统设置中允许知习通知，并开启“课堂录音状态”通知渠道后再开始录音。安卓 16 还可在下一页开启系统“实时更新”。",
        confirmLabel = "去开启",
        dismissLabel = "暂不录音",
        onConfirm = onOpenSettings,
        onDismiss = onDismiss,
    )
}

private fun queryDisplayName(context: Context, uri: Uri): String? {
    runCatching {
        context.contentResolver.query(
            uri,
            arrayOf(OpenableColumns.DISPLAY_NAME),
            null,
            null,
            null,
        )?.use { cursor ->
            val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (index >= 0 && cursor.moveToFirst()) return cursor.getString(index)
        }
    }
    return null
}

private fun requiredPermissions(context: Context): Array<String> = buildList {
    if (ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) add(Manifest.permission.RECORD_AUDIO)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) add(Manifest.permission.POST_NOTIFICATIONS)
}.toTypedArray()

@Composable
private fun rememberLauncher(onResult: (Map<String, Boolean>) -> Unit) =
    androidx.activity.compose.rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
        onResult,
    )

private fun openWebsite(context: Context) {
    runCatching {
        context.startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse("https://shuike.seanyan.store"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }.onFailure {
        Toast.makeText(context, "请用浏览器打开 shuike.seanyan.store", Toast.LENGTH_LONG).show()
    }
}

private fun openBatteryOptimizationSettings(context: Context) {    runCatching {
        context.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }.onFailure {
        context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
}

private fun openRealtimeNotificationSettings(context: Context) {
    // The promoted-notification page only fixes Android 16 Live Updates. If normal app
    // notifications or the recording channel are blocked, send the user to the regular app
    // notification page instead so the actual blocker is visible.
    val action = if (
        Build.VERSION.SDK_INT >= 36 &&
        RecordingService.shouldOpenPromotedNotificationSettings(context)
    ) {
        promotedNotificationSettingsAction()
    } else {
        Settings.ACTION_APP_NOTIFICATION_SETTINGS
    }
    val intent = Intent(action)
        .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    runCatching { context.startActivity(intent) }
        .onFailure {
            val fallback = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            runCatching { context.startActivity(fallback) }
                .onFailure { context.startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)) }
        }
}

@RequiresApi(36)
private fun promotedNotificationSettingsAction(): String =
    Settings.ACTION_APP_NOTIFICATION_PROMOTION_SETTINGS

private fun contextLines(lines: List<TranscriptLineEntity>, event: QuestionEventEntity): List<TranscriptLineEntity> {
    if (lines.isEmpty()) return emptyList()
    val center = lines.indexOfLast { it.timestampMillis <= event.timestampMillis }.let { if (it >= 0) it else 0 }
    return lines.subList(max(0, center - 3), min(lines.size, center + 4))
}

private fun ClassroomRepository.ExportRecord.toMarkdown(): String = buildString {
    appendLine("# 知习课堂记录")
    appendLine()
    appendLine("- 课程名称：${session.title}")
    appendLine("- 开始时间：${formatDateTime(session.startedAtMillis)}")
    appendLine("- 课程时长：${formatSessionDuration(session)}")
    appendLine("- 手动疑问：${doubts.size}")
    appendLine("- 历史自动识别：${questions.size}")
    appendLine()
    if (questions.isNotEmpty()) {
        appendLine("## 历史自动识别（旧版）")
        questions.forEach { event ->
            appendLine("- ${formatClock(event.timestampMillis)} · ${event.matchedTrigger?.let { "触发词：$it；" } ?: ""}${event.question}")
        }
        appendLine()
    }
    appendLine("## 我的疑问")
    doubts.forEach { doubt ->
        appendLine("- ${doubt.sourceText}")
        if (doubt.note.isNotBlank()) appendLine("  备注：${doubt.note}")
    }
    appendLine()
    appendLine("## 转写全文")
    val translationByLine = translations.associateBy { it.transcriptLineId }
    transcript.forEach { line ->
        appendLine(line.text)
        translationByLine[line.id]?.translatedText?.takeIf { it.isNotBlank() }?.let { appendLine("译文：$it") }
    }
}

private fun ClassroomRepository.ExportRecord.toPlainText(): String = buildString {
    appendLine("知习课堂记录")
    appendLine("课程名称：${session.title}")
    appendLine("开始时间：${formatDateTime(session.startedAtMillis)}")
    appendLine("课程时长：${formatSessionDuration(session)}")
    appendLine("手动疑问：${doubts.size}")
    appendLine("历史自动识别：${questions.size}")
    appendLine()
    if (questions.isNotEmpty()) {
        appendLine("历史自动识别（旧版）")
        questions.forEach { event -> appendLine("${formatClock(event.timestampMillis)} ${event.question}") }
        appendLine()
    }
    appendLine("我的疑问")
    doubts.forEach { doubt ->
        appendLine(doubt.sourceText)
        if (doubt.note.isNotBlank()) appendLine("备注：${doubt.note}")
    }
    appendLine()
    appendLine("转写全文")
    val translationByLine = translations.associateBy { it.transcriptLineId }
    transcript.forEach { line ->
        appendLine(line.text)
        translationByLine[line.id]?.translatedText?.takeIf { it.isNotBlank() }?.let { appendLine("译文：$it") }
    }
}

private fun formatDuration(seconds: Long): String = String.format(Locale.ROOT, "%02d:%02d", seconds / 60, seconds % 60)
private fun formatDateTime(millis: Long): String = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, Locale.CHINA).format(Date(millis))
private fun formatClock(millis: Long): String = SimpleDateFormat("HH:mm:ss", Locale.CHINA).format(Date(millis))
private fun fileStamp(millis: Long): String = SimpleDateFormat("yyyyMMdd_HHmm", Locale.ROOT).format(Date(millis))
private fun formatSessionDuration(session: SessionEntity): String = formatDuration(((session.endedAtMillis ?: System.currentTimeMillis()) - session.startedAtMillis).coerceAtLeast(0) / 1_000)
private fun formatSessionDuration(session: SessionSummary): String = formatDuration(((session.endedAtMillis ?: System.currentTimeMillis()) - session.startedAtMillis).coerceAtLeast(0) / 1_000)

private val WaterClassRadarColors = lightColorScheme(
    primary = RadarBrand,
    onPrimary = Color.White,
    secondary = RadarBrandDeep,
    onSecondary = Color.White,
    background = RadarBg,
    onBackground = LiquidTextPrimary,
    surface = Color.White,
    onSurface = LiquidTextPrimary,
    surfaceVariant = RadarSection,
    onSurfaceVariant = LiquidTextSecondary,
    outline = Color(0xFFE6E5E3),
    error = RadarAlert,
)

/** 品牌橙低透明度的按压反馈，替换系统默认的灰色水波纹。 */
private val RadarRippleConfiguration = RippleConfiguration(color = RadarBrand)

@Composable
private fun WaterClassRadarTheme(content: @Composable () -> Unit) = MaterialTheme(
    colorScheme = WaterClassRadarColors,
) {
    CompositionLocalProvider(LocalRippleConfiguration provides RadarRippleConfiguration) {
        content()
    }
}

@Composable
private fun <T> rememberState(flow: StateFlow<T>): androidx.compose.runtime.State<T> {
    val state = remember { mutableStateOf(flow.value) }
    LaunchedEffect(flow) { flow.collect { state.value = it } }
    return state
}

@Preview(showBackground = true)
@Composable
private fun WaterClassRadarPreview() = WaterClassRadarTheme {
    HomeScreen(
        state = DashboardState(),
        courses = emptyList(),
        selectedCourseId = null,
        onCourseSelected = {},
        onOpenTimeline = {},
    )
}
